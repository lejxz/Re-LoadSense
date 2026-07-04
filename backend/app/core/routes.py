import json
from functools import lru_cache
from pathlib import Path
from typing import List

from backend.app.core.config import default_route, route_names, route_polylines
from backend.app.core.config import repo_path
from backend.app.core.transit import infer_city
from backend.app.db import sqlite_store


ROUTE_NAMES = route_names()
COUNTRY_DATA_DIR = repo_path("data/countries")

def get_route_stops(route: str) -> List[dict]:
    config_polylines = route_polylines()
    points = sqlite_store.load_route_polyline(route) or config_polylines.get(route) or config_polylines.get(default_route()) or [(10.3157, 123.8854), (10.3308, 123.8990)]
    if len(points) > 8:
        indexes = sorted({0, len(points) - 1, *[round((len(points) - 1) * ratio) for ratio in (0.2, 0.35, 0.5, 0.65, 0.8)]})
        points = [points[index] for index in indexes]
    return [
        {
            "stop_id": index,
            "name": f"{ROUTE_NAMES.get(route, route)} Stop {index + 1}",
            "latitude": point[0],
            "longitude": point[1],
        }
        for index, point in enumerate(points)
    ]


def list_routes() -> List[dict]:
    db_routes = sqlite_store.load_routes()
    file_routes = _country_file_routes(exclude_country="PH")
    if db_routes:
        seen = {route.get("route") for route in db_routes} | {route.get("route") for route in file_routes}
        fallback_routes = []
        _config_polylines = route_polylines()
        for route, points in _config_polylines.items():
            if route not in seen:
                stops = get_route_stops(route)
                fallback_routes.append({
                    "route": route,
                    "name": ROUTE_NAMES.get(route, route),
                    "country": "PH",
                    "stops": stops,
                    "polyline": [{"latitude": lat, "longitude": lon} for lat, lon in points],
                    "city": "Cebu City",
                    "zone": "Cebu City",
                    "type": "PUV",
                    "landmarks": [stop["name"] for stop in stops[:6]],
                    "endpoints": [stops[0]["name"], stops[-1]["name"]] if len(stops) >= 2 else [],
                })
        return db_routes + file_routes + fallback_routes
    _config_polylines = route_polylines()
    return file_routes + [
        {
            "route": route,
            "name": ROUTE_NAMES.get(route, route),
            "country": "PH",
            "stops": get_route_stops(route),
            "polyline": [{"latitude": lat, "longitude": lon} for lat, lon in points],
        }
        for route, points in _config_polylines.items()
    ]


def _country_file_routes(exclude_country: str | None = None, max_points: int = 120) -> List[dict]:
    routes: List[dict] = []
    for country, path in _country_route_files().items():
        if exclude_country and country == exclude_country:
            continue
        routes.extend(_cached_geojson_routes(str(path), country, max_points, _file_mtime(path)))
    return routes


def _country_route_files() -> dict[str, Path]:
    results = {}
    if COUNTRY_DATA_DIR.exists():
        for country_dir in COUNTRY_DATA_DIR.iterdir():
            if not country_dir.is_dir():
                continue
            code = country_dir.name.upper()
            path = country_dir / "routes" / f"{code}_routes.geojson"
            if path.exists():
                results[code] = path
    return results


def _file_mtime(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except OSError:
        return 0.0


@lru_cache(maxsize=32)
def _cached_geojson_routes(path_text: str, country: str, max_points: int, _mtime: float) -> tuple[dict, ...]:
    return tuple(_load_geojson_routes(Path(path_text), country, max_points=max_points))


def _load_geojson_routes(path: Path, country: str, max_points: int = 120) -> List[dict]:
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    routes: List[dict] = []
    for index, feature in enumerate(payload.get("features", [])):
        props = feature.get("properties", {})
        geometry = feature.get("geometry", {})
        if geometry.get("type") != "LineString":
            continue
        route_id = str(props.get("route_id") or props.get("route") or props.get("ref") or f"{country}-{index + 1}").strip()
        route_id = f"{country}-{route_id}" if not route_id.upper().startswith(f"{country}-") else route_id
        name = str(props.get("route_name") or props.get("name") or route_id).strip()
        coords = geometry.get("coordinates", [])
        points = [(float(lat), float(lon)) for lon, lat, *_ in coords]
        if len(points) > max_points:
            last = len(points) - 1
            points = [points[round((i / (max_points - 1)) * last)] for i in range(max_points)]
        points = [point for idx, point in enumerate(points) if idx == 0 or point != points[idx - 1]]
        if len(points) < 2:
            continue
        stops = [
            {"stop_id": idx, "name": label, "latitude": lat, "longitude": lon}
            for idx, (label, (lat, lon)) in enumerate([
                ("Origin", points[0]),
                ("Mid-route", points[len(points) // 2]),
                ("Terminal", points[-1]),
            ])
        ]
        city = infer_city([{"latitude": lat, "longitude": lon} for lat, lon in points], name)
        routes.append({
            "route": route_id,
            "name": name,
            "country": country,
            "tag": props.get("route_ref") or props.get("ref") or route_id,
            "route_type": props.get("route_type") or "Transit",
            "origin_name": stops[0]["name"],
            "destination_name": stops[-1]["name"],
            "stops": stops,
            "points": [
                {
                    "sequence_order": idx + 1,
                    "latitude": lat,
                    "longitude": lon,
                    "point_type": "origin" if idx == 0 else "destination" if idx == len(points) - 1 else "waypoint",
                    "label": "",
                }
                for idx, (lat, lon) in enumerate(points)
            ],
            "polyline": [{"latitude": lat, "longitude": lon} for lat, lon in points],
            "city": city,
            "zone": city,
            "type": "Transit",
            "landmarks": [stop["name"] for stop in stops],
            "endpoints": [stops[0]["name"], stops[-1]["name"]],
        })
    return routes



def nearest_stop_id(route: str, latitude: float, longitude: float) -> int:
    import math
    stops = get_route_stops(route)
    best_index = 0
    best_score = float("inf")
    for stop in stops:
        dlat = stop["latitude"] - latitude
        dlon = (stop["longitude"] - longitude) * math.cos(math.radians(latitude))
        score = dlat * dlat + dlon * dlon
        if score < best_score:
            best_index = stop["stop_id"]
            best_score = score
    return best_index
