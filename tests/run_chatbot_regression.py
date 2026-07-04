import os
import sys
from uuid import uuid4

from fastapi.testclient import TestClient

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.app.main import app


def post_vehicle(client: TestClient, route: str, occupancy: int, suffix: str) -> None:
    response = client.post(
        "/api/telemetry",
        json={
            "vehicle_id": f"{route}-{suffix}",
            "route": route,
            "latitude": 10.245,
            "longitude": 123.797,
            "occupancy": occupancy,
            "timestamp": "2026-06-08T02:30:00+00:00",
            "speed_kph": 28,
            "direction": "forward",
        },
    )
    if response.status_code != 200:
        raise SystemExit(response.text)


def assert_answer(client: TestClient, payload: dict, required: list[str]) -> None:
    response = client.post("/api/chatbot", json=payload)
    print(payload["query"], response.status_code)
    if response.status_code != 200:
        raise SystemExit(response.text)
    answer = response.json()["answer"].lower()
    print(answer.encode("ascii", "replace").decode("ascii"))
    for text in required:
        if text.lower() not in answer:
            raise SystemExit(f"expected {text!r} in answer: {answer}")


def assert_place_search(client: TestClient, query: str, expected_name: str, expected_kind: str) -> None:
    response = client.get("/api/places", params={"q": query, "limit": 5, "remote": "false"})
    print("/api/places", query, response.status_code)
    if response.status_code != 200:
        raise SystemExit(response.text)
    places = response.json()["places"]
    if not places:
        raise SystemExit(f"expected place results for {query!r}")
    first = places[0]
    print(first)
    if expected_name.lower() not in first["name"].lower() or first.get("kind") != expected_kind:
        raise SystemExit(f"expected {expected_name!r}/{expected_kind!r} first, got {first}")


def main() -> None:
    suffix = uuid4().hex[:6]
    post_vehicle(client, "44", 7, suffix)
    post_vehicle(client, "45", 16, suffix)

    assert_answer(
        client,
        {"route": "", "query": "Which PUV should I board to go from Naga to IT Park?", "country": "PH"},
        ["IT Park", "Recommended route", "PH-MJ01"],
    )
    assert_answer(
        client,
        {"route": "", "query": "What route do I take to reach Basak Cebu?"},
        ["Basak", "Recommended route"],
    )
    assert_answer(
        client,
        {
            "route": "",
            "query": "My current location is Minglanilla, what jeepney or route do I take to reach my destination Basak",
            "origin": "Minglanilla",
        },
        ["Basak", "Board near"],
    )
    assert_answer(
        client,
        {
            "route": "",
            "query": "My current location is Minglanilla, what jeepney or route do I take to reach my destination Basak",
        },
        ["Basak", "Recommended route"],
    )
    assert_answer(
        client,
        {
            "route": "",
            "query": "My current location is at Minglanilla, I need to go to Basak, which jeepney do I take?",
        },
        ["Basak", "Recommended route", "44"],
    )
    assert_answer(
        client,
        {
            "route": "",
            "query": "Im currently located at Basak, which jeepney do I take to reach SM City Cebu?",
        },
        ["SM City Cebu", "Recommended route"],
    )
    assert_answer(
        client,
        {"route": "10M", "query": "In that route which specific jeepneys do I avoid?"},
        ["Route 10M", "avoid"],
    )
    assert_answer(
        client,
        {"route": "10M", "query": "Which do I ride?"},
        ["Ride", "10M"],
    )
    assert_answer(
        client,
        {"route": "10M", "query": "explain this route?"},
        ["Route 10M", "Endpoints"],
    )
    assert_answer(
        client,
        {"route": "10M", "query": "What is this route?"},
        ["Route 10M", "Current status"],
    )
    assert_answer(
        client,
        {"route": "10M", "query": "ayala"},
        ["Ayala Center Cebu", "Recommended route"],
    )
    assert_answer(
        client,
        {"route": "10M", "query": "which jeepney is the least crowded?"},
        ["Least crowded", "seats available"],
    )
    assert_answer(
        client,
        {"route": "04L", "query": "hello?", "destination": "Manila"},
        ["Hello", "destination"],
    )
    assert_answer(
        client,
        {"route": "44", "query": "Which jeepneys should I avoid?"},
        ["avoid", "Route"],
    )
    assert_answer(
        client,
        {"route": "45", "query": "On route 45 which jeepney I should avoid?"},
        ["avoid", "45"],
    )
    assert_place_search(client, "Minglanilla", "Minglanilla", "town")
    assert_place_search(client, "Basak", "Basak Cebu", "barangay")
    assert_place_search(client, "IT Park", "IT Park", "landmark")
    print("chatbot regression ok")


client = TestClient(app)


if __name__ == "__main__":
    main()
