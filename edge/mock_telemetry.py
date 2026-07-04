import asyncio
import sys
import time
import json
import random
import argparse
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.core.config import config_value, default_route
from backend.app.db import sqlite_store


try:
    import websockets
except Exception:
    websockets = None


def make_payload(vehicle_id, route, latitude, longitude, occupancy):
    return {
        "vehicle_id": vehicle_id,
        "route": route,
        "latitude": latitude + random.uniform(-0.00008, 0.00008),
        "longitude": longitude + random.uniform(-0.00008, 0.00008),
        "occupancy": occupancy,
        "timestamp": datetime.now(UTC).isoformat(),
    }


def get_route_points(route):
    points = sqlite_store.load_route_polyline(route) or sqlite_store.load_route_polyline(default_route())
    if not points:
        return [(10.3157, 123.8854), (10.3308, 123.8990)]
    return points


def get_route_coordinate(points, index):
    point = points[index % len(points)]
    return point[0], point[1]


def run_stdout(args):
    vehicle_id = args.vehicle_id
    route = args.route
    points = get_route_points(route)
    occupancy = args.start
    sent = 0
    while args.limit == 0 or sent < args.limit:
        occupancy = max(0, occupancy + random.randint(-2, 3))
        occupancy = min(args.max, occupancy)
        latitude, longitude = get_route_coordinate(points, sent)
        payload = make_payload(vehicle_id, route, latitude, longitude, occupancy)
        print(json.dumps(payload), flush=True)
        sent += 1
        time.sleep(args.interval)


def run_http(args):
    import urllib.request

    vehicle_id = args.vehicle_id
    route = args.route
    points = get_route_points(route)
    occupancy = args.start
    url = args.url
    sent = 0
    while args.limit == 0 or sent < args.limit:
        occupancy = max(0, occupancy + random.randint(-2, 3))
        occupancy = min(args.max, occupancy)
        latitude, longitude = get_route_coordinate(points, sent)
        payload = make_payload(vehicle_id, route, latitude, longitude, occupancy)
        data = json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                print("posted", payload["vehicle_id"], "status", resp.status)
        except Exception as e:
            print("http send error:", e, file=sys.stderr)
        sent += 1
        time.sleep(args.interval)


async def run_ws_async(args):
    if websockets is None:
        print("websockets package not available", file=sys.stderr)
        return
    vehicle_id = args.vehicle_id
    route = args.route
    points = get_route_points(route)
    occupancy = args.start
    url = args.url
    async with websockets.connect(url) as ws:
        sent = 0
        while args.limit == 0 or sent < args.limit:
            occupancy = max(0, occupancy + random.randint(-2, 3))
            occupancy = min(args.max, occupancy)
            latitude, longitude = get_route_coordinate(points, sent)
            payload = make_payload(vehicle_id, route, latitude, longitude, occupancy)
            text = json.dumps(payload)
            await ws.send(text)
            try:
                resp = await ws.recv()
                print("ws ack:", resp)
            except Exception:
                pass
            sent += 1
            await asyncio.sleep(args.interval)


def run_ws(args):
    asyncio.run(run_ws_async(args))


def parse_args():
    p = argparse.ArgumentParser(description="Mock telemetry generator")
    p.add_argument("--mode", choices=["stdout", "http", "ws"], default="stdout")
    host = config_value("server", "host", default="127.0.0.1")
    port = config_value("server", "port", default=8000)
    api_prefix = config_value("server", "api_prefix", default="/api")
    p.add_argument("--url", default=f"ws://{host}:{port}{api_prefix}/ws/telemetry")
    p.add_argument("--vehicle-id", default=config_value("mock_telemetry", "vehicle_id", default="J-001"))
    p.add_argument("--route", default=default_route())
    p.add_argument("--start", type=int, default=int(config_value("mock_telemetry", "start_occupancy", default=0)))
    p.add_argument("--max", type=int, default=int(config_value("mock_telemetry", "max_occupancy", default=16)))
    p.add_argument("--interval", type=float, default=float(config_value("mock_telemetry", "interval_seconds", default=1.0)))
    p.add_argument("--limit", type=int, default=int(config_value("mock_telemetry", "stdout_limit", default=0)), help="Number of messages to send; 0 means forever")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    if args.mode == "stdout":
        run_stdout(args)
    elif args.mode == "http":
        run_http(args)
    elif args.mode == "ws":
        run_ws(args)

