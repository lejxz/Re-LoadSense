
from backend.app.core.transit import find_transit_suggestions

# Mock vehicles
mock_vehicles = [
    {
        "vehicle_id": "PUV-09G-1",
        "route": "09G",
        "latitude": 10.2964,
        "longitude": 123.8997,
        "status": "active",
        "tier": "green",
        "eta_minutes": 2.0,
        "direction": "forward",
    },
    {
        "vehicle_id": "PUV-44-07",
        "route": "44-07",
        "latitude": 10.3157,
        "longitude": 123.8854,
        "status": "active",
        "tier": "green",
        "eta_minutes": 5.0,
        "direction": "forward",
    }
]

# We need some Cebu routes to test with.
mock_routes = [
    {
        "route": "09G",
        "name": "Basak - Colon - SM City",
        "city": "Cebu City",
        "stops": [
            {"name": "Basak", "latitude": 10.2847, "longitude": 123.8647},
            {"name": "Pardo", "latitude": 10.2822, "longitude": 123.8527},
            {"name": "Colon Street", "latitude": 10.2964, "longitude": 123.8997},
            {"name": "SM City Cebu", "latitude": 10.3115, "longitude": 123.9183},
        ]
    },
    {
        "route": "44-07",
        "name": "Lahug - Ayala - SM City",
        "city": "Cebu City",
        "stops": [
            {"name": "Lahug", "latitude": 10.3370, "longitude": 123.8995},
            {"name": "Ayala Center Cebu", "latitude": 10.3173, "longitude": 123.9058},
            {"name": "SM City Cebu", "latitude": 10.3115, "longitude": 123.9183},
        ]
    },
    {
        "route": "43-01",
        "name": "Minglanilla - Tabunok",
        "city": "Cebu City",
        "stops": [
            {"name": "Minglanilla", "latitude": 10.2447, "longitude": 123.7964},
            {"name": "Tabunok", "latitude": 10.2651, "longitude": 123.8429},
        ]
    },
    {
        "route": "43-02",
        "name": "Tabunok - Ayala",
        "city": "Cebu City",
        "stops": [
            {"name": "Tabunok", "latitude": 10.2651, "longitude": 123.8429},
            {"name": "Basak", "latitude": 10.2847, "longitude": 123.8647},
            {"name": "Ayala Center Cebu", "latitude": 10.3173, "longitude": 123.9058},
        ]
    }
]

def test_route_selection_accuracy():
    # Test Colon St. to Basak
    result = find_transit_suggestions(
        routes=mock_routes,
        vehicles=mock_vehicles,
        query="from Colon Street to Basak",
        origin_text="Colon Street",
        destination_text="Basak Cebu"
    )
    
    assert len(result["matches"]) > 0
    best_match = result["matches"][0]
    assert best_match["route"] == "09G", f"Expected 09G, got {best_match['route']}"

def test_unreachable_destination():
    # Test Cebu City to Manila
    result = find_transit_suggestions(
        routes=mock_routes,
        vehicles=mock_vehicles,
        query="from Cebu City to Manila",
        origin_text="Cebu City",
        destination_text="Manila"
    )
    
    # It shouldn't suggest a random local route
    assert len(result["matches"]) == 0

def test_multi_leg_trip():
    # Test Minglanilla to Ayala
    result = find_transit_suggestions(
        routes=mock_routes,
        vehicles=[],
        query="from Minglanilla to Ayala Center Cebu",
        origin_text="Minglanilla",
        destination_text="Ayala Center Cebu"
    )
    
    assert len(result["matches"]) > 0
    # Should identify a 2-leg trip
    best_match = result["matches"][0]
    assert best_match.get("legs") is not None
    assert len(best_match["legs"]) == 2
