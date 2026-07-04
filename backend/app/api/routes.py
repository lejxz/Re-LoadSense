import json
import csv
import io
import math
import zipfile
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, validator

from backend.app.core.config import default_route, get_config
from backend.app.core.compat import model_to_dict, validate_model
from backend.app.core.phase2 import load_demand_forecast, predict_eta_details
from backend.app.core.routes import list_routes
from backend.app.core.transit import search_places
from backend.app.db import sqlite_store
from backend.app.core.state import fleet_store
from backend.app.db.models import OperatorAlert as OperatorAlertModel
from backend.app.db.models import RoutePoint, Vehicle as VehicleModel
from uuid import uuid4
from datetime import datetime, timezone

router = APIRouter()

COUNTRY_NAMES = {
    "ID": "Indonesia",
    "MY": "Malaysia",
    "PH": "Philippines",
    "TH": "Thailand",
    "VN": "Vietnam",
}
COUNTRY_NAME_VALUES = {name.upper() for name in COUNTRY_NAMES.values()} | set(COUNTRY_NAMES)


def _sanitize_route_region(route: dict[str, Any]) -> dict[str, Any]:
    item = dict(route)
    region = str(item.get("region") or "").strip()
    if region.upper() in COUNTRY_NAME_VALUES:
        item["region"] = ""
    return item


class Telemetry(BaseModel):
    vehicle_id: str
    route: str = default_route()
    latitude: float
    longitude: float
    occupancy: int
    capacity: Optional[int] = None
    timestamp: str
    speed_kph: Optional[float] = None
    heading: Optional[float] = None
    signal_quality: Optional[str] = None
    direction: Optional[str] = None
    status: str = "active"


class ChatQuery(BaseModel):
    route: str = ""
    query: str
    country: Optional[str] = None
    origin: Optional[str] = None
    origin_latitude: Optional[float] = None
    origin_longitude: Optional[float] = None
    destination: Optional[str] = None
    destination_latitude: Optional[float] = None
    destination_longitude: Optional[float] = None
    history: Optional[list[dict]] = None


class SuggestionQuery(BaseModel):
    route: str = ""
    query: str = ""
    country: Optional[str] = None
    origin: Optional[str] = None
    origin_latitude: Optional[float] = None
    origin_longitude: Optional[float] = None
    destination: Optional[str] = None
    destination_latitude: Optional[float] = None
    destination_longitude: Optional[float] = None
    limit: int = 5


@router.post("/telemetry")
def receive_telemetry(t: Telemetry):
    state = fleet_store.upsert_telemetry(t)
    return {"status": "accepted", "vehicle": model_to_dict(state), "summary": fleet_store.summary()}


@router.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            text = await websocket.receive_text()
            try:
                payload = validate_model(Telemetry, json.loads(text))
                state = fleet_store.upsert_telemetry(payload)
                await websocket.send_json({"status": "accepted", "vehicle": model_to_dict(state), "summary": fleet_store.summary()})
            except Exception as exc:
                await websocket.send_json({"status": "error", "message": str(exc)})
    except WebSocketDisconnect:
        return


@router.get("/eta/{stop_id}")
def get_eta(stop_id: int, time_of_day: float = 8.0, traffic_factor: float = 1.0, route: str = "04L"):
    eta_details = predict_eta_details(stop_id=stop_id, time_of_day=time_of_day, traffic_factor=traffic_factor, route=route)
    return {
        "stop_id": stop_id,
        "route": route,
        "time_of_day": time_of_day,
        "traffic_factor": traffic_factor,
        "eta_minutes": eta_details["eta_minutes"],
        "source": eta_details["source"],
    }


@router.get("/demand")
def get_demand(country: Optional[str] = None):
    return load_demand_forecast(country)


@router.get("/fleet")
def get_fleet(route: Optional[str] = None, country: Optional[str] = None):
    if country:
        country = sqlite_store.normalize_country(country)
    active_vehicles = {v.vehicle_id: model_to_dict(v) for v in fleet_store.fleet()}
    all_vehicles = sqlite_store.list_vehicles()
    merged = []
    for db_v in all_vehicles:
        if route and db_v["route"] != route:
            continue
        if country and db_v["country"] != country:
            continue
        vid = db_v["vehicle_id"]
        if vid in active_vehicles:
            v_data = active_vehicles[vid]
            # Merge static properties
            v_data["driver"] = db_v["driver"]
            v_data["max_occupancy"] = db_v["max_occupancy"]
            v_data["capacity"] = db_v["max_occupancy"] # override capacity
            for key in ["brand", "model", "plate_number", "vehicle_type", "year", "registration_number", "country"]:
                v_data[key] = db_v.get(key)
            merged.append(v_data)
        else:
            merged.append({
                "vehicle_id": vid,
                "country": db_v["country"],
                "route": db_v["route"],
                "driver": db_v["driver"],
                "max_occupancy": db_v["max_occupancy"],
                "capacity": db_v["max_occupancy"],
                "occupancy": 0,
                "tier": "offline",
                "status": "offline",
                "latitude": 0.0,
                "longitude": 0.0,
                "eta_minutes": 0.0
            })
    summary = {
        "vehicle_count": len(merged),
        "active_alerts": len([v for v in merged if v.get("route_deviation", {}).get("anomaly")]),
        "average_occupancy": round(
            sum(int(v.get("occupancy") or 0) for v in merged) / max(1, len(merged)),
            1,
        ),
        "overloaded": len([v for v in merged if v.get("tier") == "blinking_red"]),
    }
    return {"summary": summary, "vehicles": merged}

@router.get("/vehicles")
def get_vehicles():
    return sqlite_store.list_vehicles()

@router.post("/vehicles")
def create_vehicle(v: VehicleModel):
    route = _route_for_vehicle(v.route, v.country)
    vehicle_type = route.get("route_type") or route.get("type") or v.vehicle_type
    sqlite_store.save_vehicle(
        v.vehicle_id, v.country, v.route, v.driver, v.max_occupancy,
        v.brand, v.model, v.plate_number, vehicle_type, v.year,
        v.registration_number, v.status,
    )
    return {"status": "created"}

@router.put("/vehicles/{vehicle_id}")
def update_vehicle(vehicle_id: str, v: VehicleModel):
    route = _route_for_vehicle(v.route, v.country)
    vehicle_type = route.get("route_type") or route.get("type") or v.vehicle_type
    sqlite_store.save_vehicle(
        vehicle_id, v.country, v.route, v.driver, v.max_occupancy,
        v.brand, v.model, v.plate_number, vehicle_type, v.year,
        v.registration_number, v.status,
    )
    return {"status": "updated"}

@router.delete("/vehicles/{vehicle_id}")
def delete_vehicle(vehicle_id: str):
    sqlite_store.delete_vehicle(vehicle_id)
    return {"status": "deleted"}


def _route_for_vehicle(route_id: str, country: str) -> dict[str, Any]:
    return next(
        (
            route
            for route in list_routes()
            if route.get("route") == route_id and (not country or route.get("country") == country)
        ),
        {},
    )


@router.get("/alerts")
def get_alerts(include_acknowledged: bool = False, limit: int = Query(100, ge=1, le=100), country: Optional[str] = None):
    alerts = fleet_store.alerts(include_acknowledged=include_acknowledged)[:limit]
    if country:
        route_countries = {route["route"]: route.get("country") for route in list_routes()}
        alerts = [alert for alert in alerts if route_countries.get(alert.route) == country]
    return {"alerts": [model_to_dict(alert) for alert in alerts]}


@router.post("/alerts/{alert_id}/ack")
def acknowledge_alert(alert_id: str):
    alert = fleet_store.acknowledge_alert(alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="alert not found")
    return alert


class VerifyAlert(BaseModel):
    action: str = "verified"
    note: str = ""


@router.post("/alerts/{alert_id}/verify")
def verify_alert(alert_id: str, payload: VerifyAlert):
    if payload.action not in {"verified", "false_alarm", "escalated"}:
        raise HTTPException(status_code=400, detail="action must be verified, false_alarm, or escalated")
    alert = fleet_store.verify_alert(alert_id, action=payload.action, note=payload.note.strip())
    if alert is None:
        raise HTTPException(status_code=404, detail="alert not found")
    return alert


@router.get("/incidents")
def get_incidents(limit: int = 50, country: Optional[str] = None):
    incidents = sqlite_store.list_incidents(limit=limit, country=country)
    return {"incidents": incidents}


@router.get("/database/status")
def get_database_status(country: Optional[str] = None):
    return sqlite_store.database_status(country=country)


@router.post("/database/reset")
def reset_database(country: Optional[str] = None):
    try:
        sqlite_store.reset_database(country=country)
        # Reset the fleet store to align with empty database, otherwise state persists in memory
        fleet_store.__init__()
        return {"status": "ok", "message": "Demo data reset successfully."}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/alerts/reset")
def reset_alerts(country: Optional[str] = None):
    try:
        sqlite_store.delete_all_alerts(country=country)
        fleet_store._alerts.clear()
        return {"status": "ok", "message": "Alerts reset successfully."}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/demand/reset")
def reset_demand(country: Optional[str] = None):
    try:
        from backend.app.db.sqlite_store import COUNTRY_CODES, normalize_country
        from backend.app.core.phase2 import _demand_forecast_path
        countries = [normalize_country(country)] if country else list(COUNTRY_CODES)
        for code in countries:
            path = _demand_forecast_path(code)
            if path.exists():
                path.unlink()
        return {"status": "ok", "message": "Demand forecast reset successfully."}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/routes")
def get_routes(route: Optional[str] = None, q: Optional[str] = None, country: Optional[str] = None, active_only: bool = False):
    if country:
        country = sqlite_store.normalize_country(country)
    routes = list_routes()
    if country:
        routes = [item for item in routes if item.get("country") == country]
    routes = [_sanitize_route_region(item) for item in routes]
    if active_only:
        active_routes = {
            vehicle.get("route")
            for vehicle in sqlite_store.list_vehicles()
            if not country or vehicle.get("country") == country
        }
        routes = [item for item in routes if item.get("route") in active_routes]
    query = (route or q or "").strip().lower()
    if query:
        routes = [
            item for item in routes
            if query in item["route"].lower() or query in item["name"].lower()
        ]
    return {"routes": routes}


@router.get("/countries")
def get_countries():
    # Return countries that have a database instead of only countries with active routes
    from backend.app.db.sqlite_store import COUNTRY_CODES
    codes = sorted(COUNTRY_CODES)
    return {
        "countries": [
            {"code": code, "name": COUNTRY_NAMES.get(code, code)}
            for code in codes
        ]
    }


@router.get("/regions")
def get_regions(country: Optional[str] = None):
    """Return regions that have routes for a given country.
    Used to populate region dropdown filters dynamically."""
    if not country:
        return {"regions": [], "cities": []}
    country_routes = [item for item in list_routes() if item.get("country") == country]
    regions = {
        str(item.get("region") or item.get("zone") or item.get("city") or "").strip()
        for item in country_routes
    }
    regions.update(sqlite_store.get_regions_for_country(country))
    regions = sorted(region for region in regions if region and region.upper() not in COUNTRY_NAME_VALUES)
    return {"regions": regions}


@router.get("/locations")
def get_locations(country: Optional[str] = None):
    routes = list_routes()
    if country:
        routes = [item for item in routes if item.get("country") == country]
    names = sorted({
        str(item.get("city") or item.get("zone") or "").strip()
        for item in routes
        if str(item.get("city") or item.get("zone") or "").strip()
    })
    return {"locations": [{"value": name, "label": name} for name in names]}


@router.get("/places")
def get_places(q: Optional[str] = None, limit: int = 12, remote: bool = True, country: Optional[str] = None):
    routes = list_routes()
    if country:
        routes = [item for item in routes if item.get("country") == country]
    return {"places": search_places(routes, q or "", limit=limit, include_remote=remote, country=country)}


@router.post("/suggestions")
def get_suggestions(query: SuggestionQuery):
    route_context = (query.route or "").strip()
    if query.country:
        country_routes = {item.get("route") for item in list_routes() if item.get("country") == query.country}
        if route_context not in country_routes:
            route_context = ""
    return fleet_store.route_suggestions(
        query=query.query,
        route=route_context,
        country=query.country,
        origin_text=query.origin or "",
        origin_latitude=query.origin_latitude,
        origin_longitude=query.origin_longitude,
        destination=query.destination or "",
        destination_latitude=query.destination_latitude,
        destination_longitude=query.destination_longitude,
        limit=query.limit,
    )


class RoutePayload(BaseModel):
    route: str
    name: str
    polyline: list[list[float]]
    country: Optional[str] = None
    region: Optional[str] = None
    tag: Optional[str] = None
    route_type: Optional[str] = None
    origin_name: Optional[str] = None
    destination_name: Optional[str] = None
    distance_km: Optional[float] = None
    description: Optional[str] = None
    minimum_fare: Optional[float] = None
    fare_per_km: Optional[float] = None
    points: list[RoutePoint] = []

    @validator("route", "name")
    def required_text(cls, value: str):
        value = value.strip()
        if not value:
            raise ValueError("route and name are required")
        return value

    @validator("polyline")
    def valid_polyline(cls, value: list[list[float]]):
        validate_polyline(value)
        return value


@router.post("/routes")
def post_route(payload: RoutePayload, replace: bool = Query(False)):
    try:
        country = (payload.country or "PH").strip().upper()
        visible_tag = (payload.tag or payload.route).strip()
        storage_route = payload.route.strip()
        if country and not storage_route.upper().startswith(f"{country}-"):
            # Route tags are country-local. Prefix the stored ID only when needed
            # so large country datasets never reject another country's matching tag.
            cross_country_conflict = any(
                item.get("route") == storage_route and item.get("country") and item.get("country") != country
                for item in list_routes()
            )
            if cross_country_conflict:
                storage_route = f"{country}-{storage_route}"
        if sqlite_store.route_exists(visible_tag, country=country) and not replace:
            raise HTTPException(status_code=409, detail=f"route tag '{visible_tag}' already exists in {country}")
        if sqlite_store.route_name_exists(payload.name, exclude_route=storage_route if replace else None, country=country):
            raise HTTPException(status_code=409, detail=f"route name '{payload.name}' already exists")
        point_dicts = [model_to_dict(point) for point in payload.points]
        sqlite_store.save_route(
            storage_route,
            payload.name,
            [(lat, lon) for lat, lon in payload.polyline],
            country=country,
            region=payload.region,
            tag=visible_tag,
            route_type=payload.route_type,
            origin_name=payload.origin_name,
            destination_name=payload.destination_name,
            distance_km=payload.distance_km,
            description=payload.description,
            minimum_fare=payload.minimum_fare,
            fare_per_km=payload.fare_per_km,
            points=point_dicts,
        )
        return {"status": "ok", "route": storage_route, "tag": visible_tag}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/routes/import")
async def import_routes(
    file: UploadFile = File(...),
    commit: bool = Form(False),
    replace: bool = Form(False),
    simplify_tolerance: float = Form(0.0),
):
    content = await file.read()
    try:
        routes = parse_route_file(file.filename or "", content)
        if simplify_tolerance > 0:
            routes = [
                route | {"polyline": simplify_polyline(route["polyline"], simplify_tolerance)}
                for route in routes
            ]
        errors = validate_imported_routes(routes, replace=replace)
        if errors:
            return {"status": "invalid", "filename": file.filename, "commit": False, "routes": routes, "errors": errors}
        if commit:
            for route in routes:
                sqlite_store.save_route(
                    route["route"],
                    route["name"],
                    [(lat, lon) for lat, lon in route["polyline"]],
                    country=route.get("country"),
                    region=route.get("region"),
                    tag=route.get("tag"),
                    route_type=route.get("route_type"),
                    origin_name=route.get("origin_name"),
                    destination_name=route.get("destination_name"),
                    points=route.get("points"),
                )
        return {
            "status": "committed" if commit else "preview",
            "filename": file.filename,
            "commit": commit,
            "count": len(routes),
            "routes": routes,
            "errors": [],
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/routes/{route}")
def delete_route(route: str):
    try:
        sqlite_store.delete_route(route)
        return {"status": "deleted", "route": route}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


class CreateAlert(BaseModel):
    vehicle_id: str
    route: str
    severity: str = "medium"
    message: str


@router.post("/alerts")
def create_alert(payload: CreateAlert):
    try:
        ts = datetime.now(timezone.utc).isoformat()
        alert = OperatorAlertModel(id=str(uuid4()), severity=payload.severity, vehicle_id=payload.vehicle_id, route=payload.route, message=payload.message, timestamp=ts, acknowledged=False)
        sqlite_store.save_alert(alert)
        try:
            fleet_store._alerts.append(alert)
        except Exception:
            pass
        return {"status": "ok", "alert": model_to_dict(alert)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


class OperatorFeedback(BaseModel):
    alert_id: str
    vehicle_id: str
    route: str
    action: str


@router.post("/operator-feedback")
def create_operator_feedback(payload: OperatorFeedback):
    try:
        sqlite_store.save_operator_feedback(
            alert_id=payload.alert_id,
            vehicle_id=payload.vehicle_id,
            route=payload.route,
            action=payload.action,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
        return {"status": "ok"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/config")
def get_project_config():
    config = get_config().copy()
    return {
        "project": config.get("project", {}),
        "server": config.get("server", {}),
        "occupancy": config.get("occupancy", {}),
        "route_monitoring": config.get("route_monitoring", {}),
        "routes": config.get("routes", {}),
        "mock_telemetry": config.get("mock_telemetry", {}),
        "edge_counter": config.get("edge_counter", {}),
    }


@router.post("/chatbot")
def chatbot(query: ChatQuery):
    route_context = (query.route or "").strip()
    if query.country:
        country_routes = {item.get("route") for item in list_routes() if item.get("country") == query.country}
        if route_context not in country_routes:
            route_context = ""
    return fleet_store.recommendation(
        route=route_context,
        query=query.query,
        country=query.country,
        origin_text=query.origin or "",
        origin_latitude=query.origin_latitude,
        origin_longitude=query.origin_longitude,
        destination=query.destination or "",
        destination_latitude=query.destination_latitude,
        destination_longitude=query.destination_longitude,
        history=query.history,
    )


def validate_polyline(polyline: list[list[float]]) -> None:
    if len(polyline) < 2:
        raise ValueError("polyline must contain at least two points")
    for index, point in enumerate(polyline):
        if len(point) != 2:
            raise ValueError(f"point {index} must be [latitude, longitude]")
        lat, lon = point
        if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in [lat, lon]):
            raise ValueError(f"point {index} contains non-numeric coordinates")
        if not -90 <= float(lat) <= 90 or not -180 <= float(lon) <= 180:
            raise ValueError(f"point {index} is outside latitude/longitude bounds")


def validate_imported_routes(routes: list[dict[str, Any]], replace: bool = False) -> list[str]:
    errors: list[str] = []
    seen_routes: set[str] = set()
    seen_names: set[str] = set()
    for index, route in enumerate(routes):
        route_id = str(route.get("route", "")).strip()
        name = str(route.get("name", "")).strip()
        if not route_id or not name:
            errors.append(f"route {index + 1}: route and name are required")
            continue
        if route_id.lower() in seen_routes:
            errors.append(f"route {route_id}: duplicate route id inside import")
        if name.lower() in seen_names:
            errors.append(f"route {route_id}: duplicate route name inside import")
        seen_routes.add(route_id.lower())
        seen_names.add(name.lower())
        try:
            validate_polyline(route.get("polyline", []))
        except ValueError as exc:
            errors.append(f"route {route_id}: {exc}")
        if sqlite_store.route_exists(route_id) and not replace:
            errors.append(f"route {route_id}: route id already exists")
        if sqlite_store.route_name_exists(name, exclude_route=route_id if replace else None):
            errors.append(f"route {route_id}: route name already exists")
    if not routes:
        errors.append("no routes found in uploaded file")
    return errors


def parse_route_file(filename: str, content: bytes) -> list[dict[str, Any]]:
    suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if suffix in {"geojson", "json"}:
        return parse_geojson_routes(content)
    if suffix == "csv":
        return parse_csv_routes(content.decode("utf-8-sig"))
    if suffix == "zip":
        return parse_gtfs_routes(content)
    raise ValueError("supported route files: .geojson, .json, .csv, .zip GTFS")


def parse_geojson_routes(content: bytes) -> list[dict[str, Any]]:
    payload = json.loads(content.decode("utf-8-sig"))
    features = payload.get("features", []) if payload.get("type") == "FeatureCollection" else [payload]
    routes: list[dict[str, Any]] = []
    for index, feature in enumerate(features):
        geometry = feature.get("geometry", feature)
        props = feature.get("properties", {})
        route_id = str(props.get("route") or props.get("route_id") or props.get("id") or f"import-{index + 1}").strip()
        name = str(props.get("name") or props.get("route_name") or route_id).strip()
        coordinates = geometry.get("coordinates", [])
        if geometry.get("type") == "LineString":
            polyline = [[float(lat), float(lon)] for lon, lat, *_ in coordinates]
        elif geometry.get("type") == "MultiLineString":
            polyline = [[float(lat), float(lon)] for line in coordinates for lon, lat, *_ in line]
        else:
            continue
        routes.append({"route": route_id, "name": name, "polyline": polyline})
    return routes


def parse_csv_routes(text: str) -> list[dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return []
    grouped: dict[str, dict[str, Any]] = {}
    for row in reader:
        route_id = (row.get("route") or row.get("route_id") or row.get("id") or "").strip()
        name = (row.get("name") or row.get("route_name") or route_id).strip()
        lat_value = row.get("latitude") or row.get("lat") or row.get("shape_pt_lat")
        lon_value = row.get("longitude") or row.get("lon") or row.get("lng") or row.get("shape_pt_lon")
        if not route_id or lat_value is None or lon_value is None:
            continue
        item = grouped.setdefault(route_id, {"route": route_id, "name": name, "polyline": []})
        item["polyline"].append([float(lat_value), float(lon_value)])
    return list(grouped.values())


def parse_gtfs_routes(content: bytes) -> list[dict[str, Any]]:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        names = set(archive.namelist())
        if "shapes.txt" not in names:
            raise ValueError("GTFS zip must include shapes.txt")
        route_names: dict[str, str] = {}
        if "routes.txt" in names:
            with archive.open("routes.txt") as handle:
                for row in csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig")):
                    route_id = row.get("route_id", "")
                    route_names[route_id] = row.get("route_short_name") or row.get("route_long_name") or route_id
        shape_to_route: dict[str, str] = {}
        if "trips.txt" in names:
            with archive.open("trips.txt") as handle:
                for row in csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig")):
                    if row.get("shape_id") and row.get("route_id"):
                        shape_to_route.setdefault(row["shape_id"], row["route_id"])
        shapes: dict[str, list[tuple[int, float, float]]] = {}
        with archive.open("shapes.txt") as handle:
            for row in csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig")):
                shape_id = row["shape_id"]
                sequence = int(float(row.get("shape_pt_sequence") or len(shapes.get(shape_id, []))))
                shapes.setdefault(shape_id, []).append((sequence, float(row["shape_pt_lat"]), float(row["shape_pt_lon"])))
    routes = []
    for shape_id, points in shapes.items():
        route_id = shape_to_route.get(shape_id, shape_id)
        points = sorted(points, key=lambda item: item[0])
        routes.append({
            "route": route_id,
            "name": route_names.get(route_id, route_id),
            "polyline": [[lat, lon] for _, lat, lon in points],
        })
    return routes


def simplify_polyline(points: list[list[float]], tolerance: float) -> list[list[float]]:
    if len(points) <= 2:
        return points

    def perpendicular_distance(point: list[float], start: list[float], end: list[float]) -> float:
        if start == end:
            return math.hypot(point[0] - start[0], point[1] - start[1])
        numerator = abs((end[1] - start[1]) * point[0] - (end[0] - start[0]) * point[1] + end[0] * start[1] - end[1] * start[0])
        denominator = math.hypot(end[1] - start[1], end[0] - start[0])
        return numerator / denominator

    max_distance = 0.0
    max_index = 0
    for index in range(1, len(points) - 1):
        distance = perpendicular_distance(points[index], points[0], points[-1])
        if distance > max_distance:
            max_index = index
            max_distance = distance
    if max_distance > tolerance:
        left = simplify_polyline(points[: max_index + 1], tolerance)
        right = simplify_polyline(points[max_index:], tolerance)
        return left[:-1] + right
    return [points[0], points[-1]]
