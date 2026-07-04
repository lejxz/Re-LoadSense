import os
import sys
from uuid import uuid4

from fastapi.testclient import TestClient

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.app.main import app


def main():
    client = TestClient(app)
    suffix = uuid4().hex[:8]
    payload = {
        "vehicle_id": "J-214",
        "route": "04L",
        "latitude": 14.5992,
        "longitude": 120.9840,
        "occupancy": 9,
        "timestamp": "2026-06-03T02:30:00+00:00",
    }

    checks = [
        ("post", "/api/telemetry", payload),
        ("get", "/api/config", None),
        ("get", "/api/routes", None),
        ("get", "/api/fleet", None),
        ("get", "/api/alerts", None),
        ("get", "/api/incidents", None),
        ("get", "/api/database/status", None),
        ("get", "/api/demand", None),
        ("get", "/api/eta/1", None),
        ("post", "/api/chatbot", {"route": "04L", "query": "Which jeepney is least crowded right now?"}),
    ]

    for method, path, body in checks:
        response = getattr(client, method)(path, json=body) if body else getattr(client, method)(path)
        print(path, response.status_code)
        if response.status_code != 200:
            raise SystemExit(response.text)

    route_payload = {
        "route": f"T-{suffix}",
        "name": f"Smoke Route {suffix}",
        "polyline": [[14.5992, 120.9840], [14.6001, 120.9850]],
    }
    response = client.post("/api/routes", json=route_payload)
    print("/api/routes create", response.status_code)
    if response.status_code != 200:
        raise SystemExit(response.text)

    duplicate = client.post("/api/routes", json=route_payload)
    print("/api/routes duplicate", duplicate.status_code)
    if duplicate.status_code != 409:
        raise SystemExit(f"expected duplicate route rejection, got {duplicate.status_code}: {duplicate.text}")

    alert_payload = {
        "vehicle_id": "J-214",
        "route": "04L",
        "severity": "medium",
        "message": f"Smoke alert {suffix}",
    }
    response = client.post("/api/alerts", json=alert_payload)
    print("/api/alerts create", response.status_code)
    if response.status_code != 200:
        raise SystemExit(response.text)
    alert_id = response.json()["alert"]["id"]

    response = client.post(
        f"/api/alerts/{alert_id}/verify",
        json={"action": "false_alarm", "note": "smoke verification note"},
    )
    print("/api/alerts verify", response.status_code)
    if response.status_code != 200 or response.json()["verification_status"] != "false_alarm":
        raise SystemExit(response.text)

    geojson = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {"route_id": f"G-{suffix}", "route_name": f"GeoJSON Smoke {suffix}"},
            "geometry": {"type": "LineString", "coordinates": [[120.9840, 14.5992], [120.9850, 14.6001]]},
        }],
    }
    response = client.post(
        "/api/routes/import",
        data={"commit": "false", "replace": "false"},
        files={"file": ("routes.geojson", str(geojson).replace("'", '"'), "application/geo+json")},
    )
    print("/api/routes/import preview", response.status_code)
    if response.status_code != 200 or response.json()["status"] != "preview":
        raise SystemExit(response.text)

    print("api smoke ok")


if __name__ == "__main__":
    main()
