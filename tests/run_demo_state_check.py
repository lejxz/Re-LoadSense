import os
import sys
import time

from fastapi.testclient import TestClient

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.app.main import app


def main():
    with TestClient(app) as client:
        time.sleep(2.5)
        routes = client.get("/api/routes").json()["routes"]
        fleet = client.get("/api/fleet").json()
    first = routes[0]
    sample = fleet["vehicles"][0]
    print("routes:", len(routes), first["route"], first["name"], first["polyline"][0])
    print("vehicles:", fleet["summary"]["vehicle_count"])
    print("sample:", sample["vehicle_id"], sample["route"], sample["latitude"], sample["longitude"])


if __name__ == "__main__":
    main()
