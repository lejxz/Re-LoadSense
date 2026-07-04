import math
from typing import Dict, Tuple

from backend.app.core.config import config_value, route_polylines
from backend.app.core.routes import list_routes
from backend.app.db import sqlite_store


RoutePoint = Tuple[float, float]

# Lazy-load config polylines only when needed (not at import time)
_config_polylines: Dict[str, list[RoutePoint]] | None = None


def _get_config_polylines() -> Dict[str, list[RoutePoint]]:
    global _config_polylines
    if _config_polylines is None:
        _config_polylines = route_polylines()
    return _config_polylines


def _project(lat: float, lon: float, origin_lat: float) -> tuple[float, float]:
    meters_per_degree_lat = 111_132.0
    meters_per_degree_lon = 111_320.0 * math.cos(math.radians(origin_lat))
    x = lon * meters_per_degree_lon
    y = lat * meters_per_degree_lat
    return x, y


def _distance_point_to_segment(point: RoutePoint, start: RoutePoint, end: RoutePoint) -> float:
    px, py = _project(point[0], point[1], point[0])
    sx, sy = _project(start[0], start[1], point[0])
    ex, ey = _project(end[0], end[1], point[0])
    dx = ex - sx
    dy = ey - sy
    if dx == 0 and dy == 0:
        return math.hypot(px - sx, py - sy)

    t = ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    nearest_x = sx + t * dx
    nearest_y = sy + t * dy
    return math.hypot(px - nearest_x, py - nearest_y)


def distance_to_route_meters(latitude: float, longitude: float, route: str) -> float:
    # Use cached DB polyline first, then fall back to config
    points = sqlite_store.load_route_polyline(route) or _get_config_polylines().get(route)
    if not points:
        route_record = next((item for item in list_routes() if item.get("route") == route), None)
        points = [
            (float(point["latitude"]), float(point["longitude"]))
            for point in (route_record or {}).get("polyline", [])
            if "latitude" in point and "longitude" in point
        ]
    if not points:
        raise KeyError(f"unknown route '{route}'")

    probe = (latitude, longitude)
    distances = [
        _distance_point_to_segment(probe, start, end)
        for start, end in zip(points, points[1:])
    ]
    return min(distances)


def detect_route_deviation(latitude: float, longitude: float, route: str, threshold_meters: float | None = None) -> dict:
    if threshold_meters is None:
        threshold_meters = float(config_value("route_monitoring", "deviation_threshold_meters", default=200.0))
    try:
        deviation_meters = round(distance_to_route_meters(latitude, longitude, route), 2)
    except KeyError:
        return {
            "route": route,
            "deviation_meters": None,
            "threshold_meters": threshold_meters,
            "anomaly": False,
            "status": "unknown_route",
        }
    return {
        "route": route,
        "deviation_meters": deviation_meters,
        "threshold_meters": threshold_meters,
        "anomaly": deviation_meters > threshold_meters,
    }
