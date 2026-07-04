from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from backend.app.core.compat import model_to_dict
from backend.app.core.config import config_value
from backend.app.core.occupancy import DEFAULT_CAPACITY, get_occupancy_tier
from backend.app.core.phase2 import predict_eta_details
from backend.app.core.route_deviation import detect_route_deviation
from backend.app.core.routes import list_routes, nearest_stop_id
from backend.app.core.transit import find_transit_suggestions
from backend.app.db import sqlite_store
from backend.app.db.models import OperatorAlert, VehicleState
from backend.app.core.no_API_chatbot import get_no_api_recommendation


def parse_timestamp(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return datetime.now(UTC)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


class FleetStore:
    def __init__(self) -> None:
        sqlite_store.init_all_country_dbs()
        self._vehicles: Dict[str, VehicleState] = {
            vehicle.vehicle_id: vehicle for vehicle in sqlite_store.load_vehicle_states()
        }
        self._alerts: List[OperatorAlert] = sqlite_store.load_alerts()

    def upsert_telemetry(self, payload: Any) -> VehicleState:
        previous = self._vehicles.get(payload.vehicle_id)
        
        capacity = getattr(payload, "capacity", None)
        if capacity is None and previous:
            capacity = getattr(previous, "capacity", None)
        if capacity is None or capacity <= 0:
            capacity = DEFAULT_CAPACITY
            
        tier = get_occupancy_tier(payload.occupancy, capacity)
        deviation = detect_route_deviation(payload.latitude, payload.longitude, payload.route)
        stop_id = nearest_stop_id(payload.route, payload.latitude, payload.longitude)
        time_of_day = parse_timestamp(payload.timestamp).hour
        traffic_factor = self._traffic_factor_from_tier(tier)
        eta = predict_eta_details(
            stop_id=stop_id,
            time_of_day=float(time_of_day),
            traffic_factor=traffic_factor,
            route=payload.route,
        )
        signal_quality = self._signal_quality(payload)

        state = VehicleState(
            vehicle_id=payload.vehicle_id,
            route=payload.route,
            latitude=payload.latitude,
            longitude=payload.longitude,
            occupancy=payload.occupancy,
            capacity=capacity,
            tier=tier,
            timestamp=payload.timestamp,
            eta_minutes=eta["eta_minutes"],
            eta_source=eta["source"],
            next_stop_id=stop_id,
            route_deviation=deviation,
            signal_quality=signal_quality,
            speed_kph=getattr(payload, "speed_kph", None),
            heading=getattr(payload, "heading", None),
            direction=getattr(payload, "direction", None),
            status=getattr(payload, "status", "active"),
        )
        self._vehicles[state.vehicle_id] = state
        received_at = datetime.now(UTC).isoformat()
        sqlite_store.save_vehicle_state(state, received_at=received_at)
        self._raise_alerts(state, previous)
        return state

    def fleet(self) -> List[VehicleState]:
        return sorted(self._vehicles.values(), key=lambda item: (item.route, item.vehicle_id))

    def alerts(self, include_acknowledged: bool = False) -> List[OperatorAlert]:
        alerts = self._alerts if include_acknowledged else [a for a in self._alerts if not a.acknowledged]
        return sorted(alerts, key=lambda item: item.timestamp, reverse=True)

    def acknowledge_alert(self, alert_id: str) -> Optional[OperatorAlert]:
        return self.verify_alert(alert_id, action="verified", note="")

    def verify_alert(self, alert_id: str, action: str = "verified", note: str = "") -> Optional[OperatorAlert]:
        for alert in self._alerts:
            if alert.id == alert_id:
                verified_at = datetime.now(UTC).isoformat()
                updated = sqlite_store.verify_alert(alert_id, action, note, verified_at)
                if updated is None:
                    return None
                alert.acknowledged = updated.acknowledged
                alert.verification_status = updated.verification_status
                alert.resolution_note = updated.resolution_note
                alert.verified_at = updated.verified_at
                return alert
        return None

    def route_suggestions(
        self,
        query: str = "",
        route: str = "",
        country: str | None = None,
        origin_text: str = "",
        origin_latitude: Optional[float] = None,
        origin_longitude: Optional[float] = None,
        destination: str = "",
        destination_latitude: Optional[float] = None,
        destination_longitude: Optional[float] = None,
        limit: int = 5,
    ) -> Dict[str, Any]:
        routes = list_routes()
        vehicles = [model_to_dict(vehicle) for vehicle in self.fleet()]
        if country:
            routes = [item for item in routes if item.get("country") == country]
            route_ids = {item.get("route") for item in routes}
            vehicles = [
                vehicle for vehicle in vehicles
                if vehicle.get("country") == country or vehicle.get("route") in route_ids
            ]
        return find_transit_suggestions(
            routes=routes,
            vehicles=vehicles,
            query=query,
            selected_route=route,
            origin_text=origin_text,
            origin_latitude=origin_latitude,
            origin_longitude=origin_longitude,
            destination_text=destination,
            destination_latitude=destination_latitude,
            destination_longitude=destination_longitude,
            limit=limit,
            include_remote_places=country is None,
        )

    def recommendation(
        self,
        route: str,
        query: str = "",
        country: str | None = None,
        origin_text: str = "",
        origin_latitude: Optional[float] = None,
        origin_longitude: Optional[float] = None,
        destination: str = "",
        destination_latitude: Optional[float] = None,
        destination_longitude: Optional[float] = None,
        history: Optional[list[dict]] = None,
    ) -> Dict[str, Any]:
        # Keep commuter answers grounded in the route database and live fleet.
        # LLM chat paths are intentionally bypassed here because they can
        # hallucinate route facts or skip the local matcher.
        return get_no_api_recommendation(
            fleet_store=self,
            route=route,
            query=query,
            country=country,
            origin_text=origin_text,
            origin_latitude=origin_latitude,
            origin_longitude=origin_longitude,
            destination=destination,
            destination_latitude=destination_latitude,
            destination_longitude=destination_longitude,
        )

    def summary(self) -> Dict[str, Any]:
        vehicles = self.fleet()
        return {
            "vehicle_count": len(vehicles),
            "active_alerts": len(self.alerts()),
            "overloaded": sum(1 for vehicle in vehicles if vehicle.tier == "blinking_red"),
            "average_occupancy": round(
                sum(vehicle.occupancy for vehicle in vehicles) / len(vehicles),
                2,
            )
            if vehicles
            else 0.0,
        }

    def incidents(self, limit: int = 50) -> List[Dict[str, Any]]:
        return sqlite_store.list_incidents(limit=limit)

    def database_status(self) -> Dict[str, Any]:
        return sqlite_store.database_status()

    def _raise_alerts(self, state: VehicleState, previous: Optional[VehicleState] = None) -> None:
        if state.tier == "blinking_red" and (not previous or previous.tier != "blinking_red") and not sqlite_store.has_recent_vehicle_alert(state.vehicle_id, minutes=10):
            self._append_alert(
                "high",
                state,
                f"{state.vehicle_id} is overloaded at {state.occupancy}/{state.capacity} passengers.",
            )
        if state.route_deviation["anomaly"] and (not previous or not previous.route_deviation.get("anomaly")):
            self._append_alert(
                "high",
                state,
                f"{state.vehicle_id} deviated {state.route_deviation['deviation_meters']}m from Route {state.route}.",
            )
        if state.signal_quality != "ok" and (not previous or previous.signal_quality == "ok"):
            self._append_alert(
                "medium",
                state,
                f"{state.vehicle_id} reports {state.signal_quality.replace('_', ' ')} signal quality.",
            )
        limit = float(config_value("safety", "speed_limit_kph", default=60))
        if state.speed_kph is not None and state.speed_kph > limit and (not previous or previous.speed_kph is None or previous.speed_kph <= limit):
            self._append_alert(
                "medium",
                state,
                f"{state.vehicle_id} is overspeeding at {state.speed_kph:.1f} kph.",
            )
        if previous and previous.speed_kph is not None and state.speed_kph is not None:
            delta = previous.speed_kph - state.speed_kph
            if delta >= float(config_value("safety", "sudden_stop_delta_kph", default=25)):
                self._append_alert(
                    "medium",
                    state,
                    f"{state.vehicle_id} reports sudden deceleration of {delta:.1f} kph.",
                )

    def _append_alert(self, severity: str, state: VehicleState, message: str) -> None:
        if sqlite_store.has_open_alert(state.vehicle_id, message):
            return
        duplicate = next((alert for alert in self._alerts if not alert.acknowledged and alert.vehicle_id == state.vehicle_id and alert.message == message), None)
        if duplicate:
            return
        alert = OperatorAlert(
            id=str(uuid4()),
            severity=severity,
            vehicle_id=state.vehicle_id,
            route=state.route,
            message=message,
            timestamp=datetime.now(UTC).isoformat(),
        )
        self._alerts.append(alert)
        sqlite_store.save_alert(alert)
        self._alerts = self._alerts[-100:]

    @staticmethod
    def _traffic_factor_from_tier(tier: str) -> float:
        return {
            "green": 0.9,
            "yellow": 1.05,
            "red": 1.2,
            "blinking_red": 1.35,
        }[tier]

    @staticmethod
    def _signal_quality(payload: Any) -> str:
        quality = getattr(payload, "signal_quality", None)
        if quality:
            return quality
        if getattr(payload, "latitude", 0.0) == 0.0 and getattr(payload, "longitude", 0.0) == 0.0:
            return "gps_dropout"
        return "ok"

    def _vehicle_country(self, vehicle: VehicleState) -> str:
        route_countries = {item.get("route"): item.get("country") for item in list_routes()}
        if route_countries.get(vehicle.route):
            return str(route_countries[vehicle.route])
        static_vehicle = next((item for item in sqlite_store.list_vehicles() if item.get("vehicle_id") == vehicle.vehicle_id), None)
        return str((static_vehicle or {}).get("country") or "")


fleet_store = FleetStore()
