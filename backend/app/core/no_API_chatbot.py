import re
from datetime import UTC, datetime
from typing import Any, Dict, List, Optional

from backend.app.core.compat import model_to_dict
from backend.app.core.routes import list_routes
from backend.app.db import sqlite_store
from backend.app.db.models import VehicleState


def _tier_penalty(tier: str) -> int:
    return {
        "green": 0,
        "yellow": 1,
        "red": 2,
        "blinking_red": 3,
    }[tier]


def _avoid_reason(vehicle: VehicleState) -> str:
    if vehicle.route_deviation.get("anomaly"):
        return "off route"
    if vehicle.signal_quality != "ok":
        return vehicle.signal_quality.replace("_", " ")
    return vehicle.tier.replace("_", " ")


def _is_avoid_query(query: str) -> bool:
    text = query.lower()
    return any(word in text for word in ["avoid", "overloaded", "do not ride", "don't ride"])


def _is_least_crowded_query(query: str) -> bool:
    text = query.lower()
    return "least crowded" in text or "less crowded" in text or "most seats" in text or "available seats" in text


def _is_boarding_followup(query: str) -> bool:
    text = query.lower().strip(" ?.!")
    return text in {"which do i ride", "which should i ride", "what do i ride", "which jeepney do i ride", "which jeepney should i ride", "which puv do i ride"}


def _is_route_info_query(query: str) -> bool:
    text = query.lower()
    return any(phrase in text for phrase in ["explain this route", "explain that route", "what is this route", "what is that route", "route details"])


def _uses_route_context(query: str) -> bool:
    text = query.lower()
    return any(phrase in text for phrase in ["that route", "this route", "current route", "selected route", "in that route", "in this route"]) or _is_boarding_followup(query)


def _is_greeting_or_smalltalk(query: str) -> bool:
    text = query.strip().lower()
    normalized = "".join(ch for ch in text if ch.isalnum() or ch.isspace()).strip()
    greetings = {"hi", "hello", "hello?", "hey", "good morning", "good afternoon", "good evening", "thanks", "thank you"}
    return text in greetings or normalized in greetings


def _route_from_query(query: str) -> str:
    text = query.lower()
    for route in list_routes():
        route_id = str(route.get("route", ""))
        for code in _route_codes(route):
            if code and re.search(rf"(?<![a-z0-9]){re.escape(code.lower())}(?![a-z0-9])", text):
                return code
    return ""


def _route_codes(route: dict[str, Any]) -> list[str]:
    values = [
        str(route.get("route") or "").strip(),
        str(route.get("tag") or "").strip(),
    ]
    route_id = values[0]
    if "-" in route_id:
        values.append(route_id.split("-", 1)[1])
    return list(dict.fromkeys(value for value in values if value))


def _route_matches(value: str, route: str) -> bool:
    value_norm = value.strip().lower()
    route_norm = route.strip().lower()
    if not value_norm or not route_norm:
        return False
    return value_norm == route_norm or value_norm.endswith(f"-{route_norm}") or route_norm.endswith(f"-{value_norm}")


def _vehicle_matches_route(vehicle: VehicleState, route: str) -> bool:
    return _route_matches(vehicle.route, route)


def _find_route_info(route: str, country: str | None = None) -> Optional[dict[str, Any]]:
    return next(
        (
            item for item in list_routes()
            if (not country or item.get("country") == country)
            and any(_route_matches(code, route) for code in _route_codes(item))
        ),
        None,
    )


def _avoidance_answer(fleet_store: Any, route: str = "", country: str | None = None) -> tuple[str, List[Dict[str, Any]]]:
    route_vehicles = [
        vehicle for vehicle in fleet_store.fleet()
        if (not route or _vehicle_matches_route(vehicle, route))
        and (not country or fleet_store._vehicle_country(vehicle) == country)
    ]
    context = [model_to_dict(vehicle) for vehicle in route_vehicles]
    route_label = f"Route {route}" if route else "the live fleet"
    if not route_vehicles:
        return f"No live PUVs are reporting for {route_label} right now, so I cannot identify a vehicle to avoid yet.", context

    risky = [
        vehicle for vehicle in route_vehicles
        if vehicle.tier in {"red", "blinking_red"}
        or vehicle.route_deviation.get("anomaly")
        or vehicle.signal_quality != "ok"
    ]
    risky = sorted(risky, key=lambda vehicle: (_tier_penalty(vehicle.tier), -vehicle.occupancy), reverse=True)
    better = sorted(
        [vehicle for vehicle in route_vehicles if vehicle not in risky],
        key=lambda vehicle: (_tier_penalty(vehicle.tier), vehicle.eta_minutes),
    )
    if risky:
        avoid_list = ", ".join(
            f"{vehicle.vehicle_id} on Route {vehicle.route} ({vehicle.occupancy}/{vehicle.capacity}, {_avoid_reason(vehicle)})"
            for vehicle in risky[:3]
        )
        if better:
            best = better[0]
            return (
                f"For {route_label}, avoid {avoid_list}. Better option: {best.vehicle_id} on Route {best.route} "
                f"has {best.occupancy}/{best.capacity} riders, {best.tier.replace('_', ' ')}, "
                f"and ETA {best.eta_minutes:.1f} min.",
                [model_to_dict(best), *[model_to_dict(vehicle) for vehicle in risky]],
            )
        return f"For {route_label}, avoid {avoid_list}. All reporting PUVs in this set look crowded or need verification.", context

    best = better[0]
    return (
        f"For {route_label}, no reporting PUV needs to be avoided right now. Best current option: "
        f"{best.vehicle_id} on Route {best.route} with {best.occupancy}/{best.capacity} riders, {best.tier.replace('_', ' ')}, "
        f"ETA {best.eta_minutes:.1f} min.",
        context,
    )


def _least_crowded_answer(fleet_store: Any, route: str = "", country: str | None = None) -> tuple[str, List[Dict[str, Any]]]:
    vehicles = [
        vehicle for vehicle in fleet_store.fleet()
        if (not route or _vehicle_matches_route(vehicle, route))
        and (not country or fleet_store._vehicle_country(vehicle) == country)
        and vehicle.status != "idle"
    ]
    context = [model_to_dict(vehicle) for vehicle in vehicles]
    route_label = f"Route {route}" if route else "the live fleet"
    if not vehicles:
        return f"No live PUVs are reporting for {route_label} right now.", context
    ranked = sorted(vehicles, key=lambda vehicle: (vehicle.occupancy / max(1, vehicle.capacity), _tier_penalty(vehicle.tier), vehicle.eta_minutes))
    best = ranked[0]
    seats = max(0, best.capacity - best.occupancy)
    return (
        f"Least crowded option for {route_label}: {best.vehicle_id} on Route {best.route}. "
        f"It has {best.occupancy}/{best.capacity} riders ({seats} seats available), {best.tier.replace('_', ' ')}, "
        f"ETA {best.eta_minutes:.1f} min.",
        [model_to_dict(vehicle) for vehicle in ranked],
    )


def _best_boarding_answer(fleet_store: Any, route: str, country: str | None = None) -> tuple[str, List[Dict[str, Any]]]:
    vehicles = [
        vehicle for vehicle in fleet_store.fleet()
        if _vehicle_matches_route(vehicle, route)
        and (not country or fleet_store._vehicle_country(vehicle) == country)
        and vehicle.status != "idle"
    ]
    context = [model_to_dict(vehicle) for vehicle in vehicles]
    if not vehicles:
        return f"Ride Route {route}. No live PUVs are reporting for Route {route} right now, so wait for the next telemetry update before choosing a specific PUV.", context
    ranked = sorted(vehicles, key=lambda vehicle: (_tier_penalty(vehicle.tier), vehicle.eta_minutes, vehicle.occupancy))
    best = ranked[0]
    return (
        f"Ride {best.vehicle_id} on Route {route}. It has {best.occupancy}/{best.capacity} riders, "
        f"{best.tier.replace('_', ' ')}, and ETA {best.eta_minutes:.1f} min.",
        [model_to_dict(vehicle) for vehicle in ranked],
    )


def _route_info_answer(fleet_store: Any, route: str, country: str | None = None) -> tuple[str, List[Dict[str, Any]]]:
    if not route:
        return "Which route do you want me to explain? Ask after a recommendation or include the route code.", []
    route_info = _find_route_info(route, country=country)
    vehicles = [
        vehicle for vehicle in fleet_store.fleet()
        if _vehicle_matches_route(vehicle, route) and (not country or fleet_store._vehicle_country(vehicle) == country)
    ]
    context = [model_to_dict(vehicle) for vehicle in vehicles]
    if not route_info:
        return f"I do not have route details for Route {route} yet.", context
    endpoints = route_info.get("endpoints") or []
    landmarks = route_info.get("landmarks") or []
    live = f"{len(vehicles)} live PUVs" if vehicles else "no live PUVs reporting"
    return (
        f"Route {route}: {route_info.get('name', route)}. "
        f"Area: {route_info.get('city') or route_info.get('zone') or 'unknown'}. "
        f"Endpoints: {', '.join(endpoints[:2]) if endpoints else 'not listed'}. "
        f"Key stops: {', '.join(landmarks[:5]) if landmarks else 'not listed'}. "
        f"Current status: {live}.",
        context,
    )


def get_no_api_recommendation(
    fleet_store: Any,
    route: str,
    query: str = "",
    country: str | None = None,
    origin_text: str = "",
    origin_latitude: Optional[float] = None,
    origin_longitude: Optional[float] = None,
    destination: str = "",
    destination_latitude: Optional[float] = None,
    destination_longitude: Optional[float] = None,
) -> Dict[str, Any]:
    if _is_greeting_or_smalltalk(query):
        answer = "Hello. Tell me your current location and destination, and I can recommend the best route and PUV."
        sqlite_store.save_chat_query("chat", query, answer, datetime.now(UTC).isoformat())
        return {
            "route": route,
            "answer": answer,
            "context": [],
            "matches": [],
            "language": "en",
            "intent": "smalltalk",
            "ui_type": "message",
        }

    explicit_route = _route_from_query(query)
    context_route = explicit_route or (route if _uses_route_context(query) else "")
    if _is_route_info_query(query):
        answer, context = _route_info_answer(fleet_store, context_route, country=country)
        sqlite_store.save_chat_query(context_route or "all", query, answer, datetime.now(UTC).isoformat())
        return {
            "route": context_route or "",
            "answer": answer,
            "context": context,
            "matches": [],
            "language": "en",
            "intent": "route_info",
            "ui_type": "modal",
            "ui_details": {
                "title": "Route Information",
                "buttons": [{"label": "View Route", "action": "SHOW_ROUTE", "value": context_route or ""}]
            }
        }

    if _is_avoid_query(query):
        answer, context = _avoidance_answer(fleet_store, context_route, country=country)
        saved_route = context_route or "all"
        sqlite_store.save_chat_query(saved_route, query, answer, datetime.now(UTC).isoformat())
        return {
            "route": saved_route,
            "answer": answer,
            "context": context,
            "matches": [],
            "language": "en",
            "intent": "avoid",
            "ui_type": "modal",
            "ui_details": {
                "title": "Avoid these vehicles",
                "buttons": [{"label": "Show Alternatives", "action": "SUGGEST_ROUTE", "value": saved_route}]
            }
        }

    if _is_least_crowded_query(query):
        answer, context = _least_crowded_answer(fleet_store, context_route, country=country)
        sqlite_store.save_chat_query(context_route or "all", query, answer, datetime.now(UTC).isoformat())
        return {
            "route": context_route or "all",
            "answer": answer,
            "context": context,
            "matches": [],
            "language": "en",
            "intent": "least_crowded",
            "ui_type": "modal",
            "ui_details": {
                "title": "Least Crowded Option",
                "buttons": [{"label": "View Route", "action": "SHOW_ROUTE", "value": context_route or "all"}]
            }
        }

    if _is_boarding_followup(query) and context_route:
        answer, context = _best_boarding_answer(fleet_store, context_route, country=country)
        sqlite_store.save_chat_query(context_route, query, answer, datetime.now(UTC).isoformat())
        return {
            "route": context_route,
            "answer": answer,
            "context": context,
            "matches": [],
            "language": "en",
            "intent": "boarding",
            "ui_type": "modal",
            "ui_details": {
                "title": "Boarding Recommendation",
                "buttons": [{"label": "View Vehicle", "action": "ZOOM_VEHICLE", "value": context[0].get("vehicle_id") if context else ""}]
            }
        }

    suggestion_result = fleet_store.route_suggestions(
        query=query,
        route=route,
        country=country,
        origin_text=origin_text,
        origin_latitude=origin_latitude,
        origin_longitude=origin_longitude,
        destination=destination,
        destination_latitude=destination_latitude,
        destination_longitude=destination_longitude,
    )
    if suggestion_result["destination"] or suggestion_result["suggestions"]:
        answer = suggestion_result["answer"]
        sqlite_store.save_chat_query(route, query, answer, datetime.now(UTC).isoformat())
        return {
            "route": route,
            "answer": answer,
            "context": suggestion_result["suggestions"],
            "origin": suggestion_result["origin"],
            "destination": suggestion_result["destination"],
            "matches": suggestion_result["matches"],
            "language": suggestion_result["language"],
            "intent": "trip_recommendation",
            "ui_type": "modal",
            "ui_details": {
                "title": "Trip Recommendation",
                "buttons": [{"label": "View Route", "action": "SHOW_ROUTE", "value": route}]
            }
        }

    if not route:
        answer = suggestion_result["answer"]
        sqlite_store.save_chat_query("all", query, answer, datetime.now(UTC).isoformat())
        return {
            "route": "",
            "answer": answer,
            "context": [],
            "origin": suggestion_result["origin"],
            "destination": suggestion_result["destination"],
            "matches": [],
            "language": suggestion_result["language"],
            "ui_type": "message"
        }

    route_vehicles = [
        vehicle for vehicle in fleet_store.fleet()
        if _vehicle_matches_route(vehicle, route) and (not country or fleet_store._vehicle_country(vehicle) == country)
    ]
    if not route_vehicles:
        return {
            "route": route,
            "answer": f"Ride Route {route}. No live vehicles are reporting for Route {route} yet, so wait for the next telemetry update before choosing a specific PUV.",
            "context": [],
            "ui_type": "message"
        }

    ranked = sorted(route_vehicles, key=lambda vehicle: (_tier_penalty(vehicle.tier), vehicle.eta_minutes))
    best = ranked[0]
    action = "board" if best.tier in {"green", "yellow"} else "wait"
    answer = (
        f"For Route {route}, {action} Vehicle {best.vehicle_id}. "
        f"It is {best.tier.replace('_', ' ')} with {best.occupancy}/{best.capacity} passengers "
        f"and an ETA of {best.eta_minutes:.1f} minutes."
    )
    if best.route_deviation.get("anomaly"):
        answer += " Operator verification is needed because the vehicle is off-route."
    if "least" in query.lower() or "crowd" in query.lower():
        answer += " This is currently the least crowded option in the live fleet."

    sqlite_store.save_chat_query(route, query, answer, datetime.now(UTC).isoformat())
    return {
        "route": route,
        "answer": answer,
        "context": [model_to_dict(vehicle) for vehicle in ranked],
        "ui_type": "modal",
        "ui_details": {
            "title": "Route Suggestion",
            "buttons": [{"label": "View Route", "action": "SHOW_ROUTE", "value": route}]
        }
    }
