from __future__ import annotations

import math
import random
import threading
import time
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

from backend.app.db import sqlite_store


class SyntheticFleetSimulator:
    def __init__(self, fleet_store: Any, vehicles_per_route: int = 3, interval_seconds: float = 3.0) -> None:
        self.fleet_store = fleet_store
        self.vehicles_per_route = vehicles_per_route
        self.interval_seconds = interval_seconds
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, name="loadsense-synthetic-fleet", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _run(self) -> None:
        random.seed(2026)
        tick = 0
        # Cache routes and vehicles — only reload every 30 ticks (~90s)
        cached_routes = None
        cached_vehicles = None
        cache_tick = -30
        while not self._stop.is_set():
            if tick - cache_tick >= 30 or cached_routes is None:
                cached_routes = [route for route in sqlite_store.load_routes() if len(route.get("polyline", [])) >= 2]
                cached_vehicles = sqlite_store.list_vehicles()
                cache_tick = tick
            route_vehicles = {}
            for v in cached_vehicles:
                if v["status"] == "active":
                    route_vehicles.setdefault(v["route"], []).append(v)

            for route_index, route in enumerate(cached_routes):
                points = route["polyline"]
                vehicles_for_route = route_vehicles.get(route["route"], [])
                count = len(vehicles_for_route)
                
                for vehicle_index, v in enumerate(vehicles_for_route):
                    direction = "forward" if (route_index + vehicle_index) % 2 == 0 else "backward"
                    speed_kph = 20 + ((tick + vehicle_index * 7 + route_index * 3) % 21)
                    progress = ((tick * (0.0045 + vehicle_index * 0.0008)) + vehicle_index / max(1, count) + route_index * 0.017) % 1.0
                    position = progress if direction == "forward" else 1.0 - progress
                    lat, lon = _point_at(points, position)
                    
                    wave = math.sin((tick + route_index * 3 + vehicle_index * 5) / 7)
                    max_occ = v.get("max_occupancy", 20)
                    occupancy = max(0, min(max_occ, int(max_occ * 0.4 + wave * max_occ * 0.3)))
                    
                    status = _status_for(tick, occupancy, max_occ, route_index, vehicle_index)
                    payload = SimpleNamespace(
                        vehicle_id=v["vehicle_id"],
                        route=route["route"],
                        latitude=lat,
                        longitude=lon,
                        occupancy=occupancy,
                        capacity=max_occ,
                        timestamp=datetime.now(UTC).isoformat(),
                        speed_kph=0 if status == "idle" else speed_kph,
                        heading=_heading_at(points, position, direction),
                        direction=direction,
                        status=status,
                        signal_quality="ok",
                    )
                    self.fleet_store.upsert_telemetry(payload)
            tick += 1
            self._stop.wait(self.interval_seconds)


def _get_segment(points: list[dict[str, float]], ratio: float) -> tuple[dict[str, float], dict[str, float], float]:
    if len(points) <= 1:
        return points[0], points[0], 0.0

    dists = [0.0]
    for i in range(1, len(points)):
        p1 = points[i - 1]
        p2 = points[i]
        dx = float(p2["longitude"]) - float(p1["longitude"])
        dy = float(p2["latitude"]) - float(p1["latitude"])
        dist = math.hypot(dx, dy)
        dists.append(dists[-1] + dist)

    total_dist = dists[-1]
    if total_dist == 0:
        return points[0], points[0], 0.0

    target_dist = total_dist * ratio
    for i in range(1, len(dists)):
        if dists[i] >= target_dist:
            segment_dist = dists[i] - dists[i - 1]
            blend = 0.0 if segment_dist == 0 else (target_dist - dists[i - 1]) / segment_dist
            return points[i - 1], points[i], blend

    return points[-2], points[-1], 1.0


def _point_at(points: list[dict[str, float]], ratio: float) -> tuple[float, float]:
    a, b, blend = _get_segment(points, ratio)
    lat = float(a["latitude"]) + (float(b["latitude"]) - float(a["latitude"])) * blend
    lon = float(a["longitude"]) + (float(b["longitude"]) - float(a["longitude"])) * blend
    return lat, lon





def _status_for(tick: int, occupancy: int, max_occupancy: int, route_index: int, vehicle_index: int) -> str:
    if (tick + route_index * 2 + vehicle_index) % 401 == 0:
        return "idle"
    if occupancy >= max_occupancy:
        return "full"
    return "active"


def _heading_at(points: list[dict[str, float]], ratio: float, direction: str) -> float | None:
    if len(points) < 2:
        return None
    a, b, _ = _get_segment(points, ratio)
    if direction == "backward":
        a, b = b, a
    lat1 = math.radians(float(a["latitude"]))
    lat2 = math.radians(float(b["latitude"]))
    d_lon = math.radians(float(b["longitude"]) - float(a["longitude"]))
    y = math.sin(d_lon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(d_lon)
    return round((math.degrees(math.atan2(y, x)) + 360) % 360, 1)
