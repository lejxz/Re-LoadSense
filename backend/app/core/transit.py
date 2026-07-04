from __future__ import annotations

import math
import re
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Iterable, Optional


WALKING_RADIUS_METERS = 500.0
RELAXED_RADIUS_METERS = 1500.0
BOARDING_SEARCH_RADIUS_METERS = 5000.0
DESTINATION_ROUTE_RADIUS_METERS = 5000.0
DEFAULT_SPEED_KPH = 30.0
# Maximum perpendicular distance from a route segment for the origin to be
# considered "along" the route corridor.
ORIGIN_CORRIDOR_METERS = 800.0
# Reject a route if its total length exceeds the direct O→D distance by this
# factor – prevents long-haul routes from outranking short direct ones.
MAX_ROUTE_DISTANCE_RATIO = 2.5
PHOTON_SEARCH_URL = "https://photon.komoot.io/api/"
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
REMOTE_CONTEXT_RADIUS_METERS = 80_000.0
PHOTON_CACHE_TTL_SECONDS = 300.0
_PHOTON_CACHE: dict[tuple[Any, ...], tuple[float, list[dict[str, Any]]]] = {}
COUNTRY_SEARCH_NAMES = {
    "ID": "Indonesia",
    "MY": "Malaysia",
    "PH": "Philippines",
    "TH": "Thailand",
    "VN": "Vietnam",
}


def _stop(name: str, latitude: float, longitude: float) -> dict[str, Any]:
    return {"name": name, "latitude": latitude, "longitude": longitude}


ROUTE_METADATA: dict[str, dict[str, Any]] = {}


LANGUAGE_KEYWORDS = {
    "ceb": ["asa", "paingon", "padung", "gikan", "unsa", "sakay", "dyip", "diri", "jeep"],
    "tl": ["saan", "papunta", "pumunta", "daan", "byahe", "sakay", "dito", "dyip", "jeep"],
    "ilo": ["diin", "pakadto", "sakyan", "jeep"],
    "ilocano": ["sadino", "mapan", "lugan"],
    "es": ["donde", "como", "tomar", "ruta", "autobus", "llegar", "hacia"],
    "ja": ["eki", "densha", "basu", "doko", "made", "iku"],
}


DESTINATION_PATTERNS = [
    r"(?:destination is|destination|destinasyon|padulngan|adtoan)\s+(.+)",
    r"(?:need to go to|i need to go to|i want to go to|going to)\s+(.+)",
    r"(?:which .*? should i take to reach|which .*? should i take to get to|what .*? should i take to reach)\s+(.+)",
    r"(?:how do i get to|how to get to|which .*? to|what .*? goes to|route to|going to|go to|reach|towards?|to)\s+(.+)",
    r"(?:saan .*? papunta sa|paano pumunta sa|papunta sa|papuntang|punta sa|daan sa|byahe sa)\s+(.+)",
    r"(?:asa .*? paingon sa|unsa .*? paingon sa|paingon sa|padung sa|punta sa)\s+(.+)",
    r"(?:diin .*? pakadto sa|pakadto sa)\s+(.+)",
    r"(?:sadino .*? mapan iti|mapan iti)\s+(.+)",
]


ORIGIN_PATTERNS = [
    r"(?:my current location is at|my current location is|current location is at|current location is|i am at|im at|i'm at|from|gikan sa|gikan)\s+(.+?)(?:\s+i need|\s+i want|\s+what|\s+which|\s+how|\s+to reach|\s+going to|$)",
]


def route_metadata(route_id: str) -> dict[str, Any]:
    return ROUTE_METADATA.get(route_id, {})


def route_distance_km(route: dict[str, Any]) -> float:
    distance = route.get("distance_km")
    if isinstance(distance, (int, float)) and distance > 0:
        return float(distance)
    points = route_points(route, prefer_stops=False)
    if len(points) < 2:
        return 0.0
    total = 0.0
    for left, right in zip(points, points[1:]):
        total += haversine_meters(left["latitude"], left["longitude"], right["latitude"], right["longitude"])
    return round(total / 1000.0, 2)


def _route_point_category(point: dict[str, Any], index: int, total: int) -> str:
    point_type = str(point.get("point_type") or "").strip().lower()
    if point_type in {"origin", "alight_or_board_stop", "end", "turn"}:
        return point_type
    if index == 0:
        return "origin"
    if index == total - 1:
        return "end"
    return "turn"


def _route_point_label(point: dict[str, Any], index: int, total: int) -> str:
    label = str(point.get("label") or "").strip()
    if label:
      return label
    category = _route_point_category(point, index, total)
    if category == "origin":
        return "Origin"
    if category == "end":
        return "End of Route"
    if category == "alight_or_board_stop":
        return "Alight or Board Stop"
    return f"Turn {index + 1}"


def _format_route_coord(point: dict[str, Any]) -> str:
    return f"{float(point['latitude']):.5f}, {float(point['longitude']):.5f}"


def _route_point_kind_score(point: dict[str, Any], index: int, total: int) -> float:
    category = _route_point_category(point, index, total)
    if category == "alight_or_board_stop":
        return -150.0
    if category == "origin":
        return -80.0
    if category == "turn":
        return -40.0
    return 20.0


def haversine_meters(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    radius = 6_371_000.0
    d_lat = math.radians(b_lat - a_lat)
    d_lon = math.radians(b_lon - a_lon)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(a_lat))
        * math.cos(math.radians(b_lat))
        * math.sin(d_lon / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def calculate_eta_minutes(distance_meters: float, speed_kph: Optional[float]) -> float:
    speed = max(5.0, float(speed_kph or DEFAULT_SPEED_KPH))
    return round((distance_meters / 1000.0) / speed * 60.0, 1)


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", value.lower())).strip()


def detect_language(query: str) -> str:
    normalized = f" {normalize_text(query)} "
    scores = {
        language: sum(1 for word in words if f" {word} " in normalized)
        for language, words in LANGUAGE_KEYWORDS.items()
    }
    language, score = max(scores.items(), key=lambda item: item[1])
    return language if score else "en"


def infer_city(points: Iterable[dict[str, Any]], route_name: str = "") -> str:
    name = route_name.lower()
    if "davao" in name:
        return "Davao City"
    if "iloilo" in name:
        return "Iloilo City"
    if "metro manila" in name or "manila" in name:
        return "Metro Manila"
    if "singapore" in name:
        return "Singapore"
    if "hong kong" in name:
        return "Hong Kong"
    if "tokyo" in name:
        return "Tokyo"
    latitudes = [float(point["latitude"]) for point in points if _valid_coord(point)]
    longitudes = [float(point["longitude"]) for point in points if _valid_coord(point)]
    if not latitudes or not longitudes:
        return "Unknown"
    lat = sum(latitudes) / len(latitudes)
    lon = sum(longitudes) / len(longitudes)
    if 14.3 <= lat <= 14.9 and 120.8 <= lon <= 121.2:
        return "Metro Manila"
    if 6.9 <= lat <= 7.2 and 125.4 <= lon <= 125.8:
        return "Davao Region"
    if 10.6 <= lat <= 10.8 and 122.45 <= lon <= 122.65:
        return "Western Visayas"
    if 10.15 <= lat <= 10.55 and 123.65 <= lon <= 124.10:
        return "Cebu"
    if 13.45 <= lat <= 14.15 and 100.25 <= lon <= 100.95:
        return "Bangkok"
    if 1.2 <= lat <= 1.45 and 103.6 <= lon <= 104.1:
        return "Singapore"
    if 22.15 <= lat <= 22.45 and 113.9 <= lon <= 114.35:
        return "Hong Kong"
    if 35.55 <= lat <= 35.85 and 139.55 <= lon <= 139.9:
        return "Tokyo"
    if 2.8 <= lat <= 3.4 and 101.4 <= lon <= 101.9:
        return "Klang Valley"
    if -6.4 <= lat <= -6.1 and 106.7 <= lon <= 107.0:
        return "Jakarta"
    if 10.5 <= lat <= 10.9 and 106.5 <= lon <= 106.9:
        return "Ho Chi Minh City"
    if 20.8 <= lat <= 21.2 and 105.6 <= lon <= 106.0:
        return "Hanoi"
    return "Unknown Region"


def search_places(
    routes: list[dict[str, Any]],
    query: str = "",
    limit: int = 12,
    include_remote: bool = True,
    context_latitude: Optional[float] = None,
    context_longitude: Optional[float] = None,
    context_text: str = "",
    country: Optional[str] = None,
) -> list[dict[str, Any]]:
    needle = normalize_text(query or "")
    if not needle:
        return []
    local_results = [
        place
        for place in _local_places(routes)
        if _place_alias_matches(place, needle)
    ]
    local_results.sort(key=lambda place: _place_result_rank(place, needle))
    remote_results = search_remote_places(
        query,
        limit=limit,
        context_latitude=context_latitude,
        context_longitude=context_longitude,
        context_text=context_text,
        country=country,
    ) if include_remote else []
    if country:
        target = _country_search_name(country).lower()
        target_code = country.lower()
        remote_results = [
            p for p in remote_results 
            if (
                not p.get("country")
                or target in str(p.get("country")).lower()
                or str((p.get("address") or {}).get("countrycode") or "").lower() == target_code
            )
        ]
    return _attach_place_labels(_dedupe_places(local_results + remote_results))[:limit]


def _local_places(routes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    places: list[dict[str, Any]] = []
    for route in routes:
        route_id = str(route.get("route") or "")
        route_name = str(route.get("name") or route_id)
        city = str(route.get("city") or route.get("zone") or infer_city(route.get("polyline", []), route_name))
        country = str(route.get("country") or "PH")
        for point in route_points(route, prefer_stops=True):
            name = str(point.get("name") or "").strip()
            if not name or not _valid_coord(point):
                continue
            
            lower_name = name.lower()
            if lower_name in ["origin", "end", "end of route", "waypoint", "turn", "destination"] or \
               lower_name.startswith("stop ") or \
               lower_name.startswith("checkpoint ") or \
               lower_name.startswith("point "):
                continue

            display_name = _local_place_display_name(name, city)
            aliases = [route_id, route_name, city]
            if display_name != name:
                aliases.append(name)

            places.append({
                "name": display_name,
                "city": city,
                "country": country,
                "latitude": float(point["latitude"]),
                "longitude": float(point["longitude"]),
                "aliases": aliases,
                "kind": _infer_local_place_kind(name),
                "route": route_id,
                "route_name": route_name,
                "source": "route_stop",
            })
    return places


def _place_alias_matches(place: dict[str, Any], needle: str) -> bool:
    terms = [place.get("name", ""), *(place.get("aliases") or [])]
    if any(normalize_text(term) == needle or needle in normalize_text(term) for term in terms):
        return True
    haystack = normalize_text(" ".join([place.get("name", ""), place.get("city", ""), *(place.get("aliases") or [])]))
    return _text_match_score(needle, haystack) >= 100


def _infer_local_place_kind(name: str) -> str:
    normalized = normalize_text(name)
    if any(token in normalized for token in ["minglanilla", "talisay", "mandaue"]):
        return "town" if "minglanilla" in normalized else "city"
    if normalized.endswith(" city"):
        return "city"
    if any(token in normalized for token in ["terminal", "station"]):
        return "terminal"
    if any(token in normalized for token in ["ayala", "sm ", "mall", "church", "park"]):
        return "landmark"
    return "barangay"


def _local_place_display_name(name: str, city: str) -> str:
    normalized = normalize_text(name)
    city_normalized = normalize_text(city)
    if city_normalized == "cebu" and normalized == "ayala":
        return "Ayala Center Cebu"
    if city_normalized == "cebu" and normalized in {"basak", "sm city"}:
        return f"{name} Cebu"
    return name


def search_remote_places(
    query: str,
    limit: int = 8,
    context_latitude: Optional[float] = None,
    context_longitude: Optional[float] = None,
    context_text: str = "",
    country: Optional[str] = None,
) -> list[dict[str, Any]]:
    if limit <= 0:
        return []
    country_name = _country_search_name(country)
    if country_name and country_name.lower() not in query.lower():
        query = f"{query} {country_name}"
    return _search_photon_places(query, limit, context_latitude, context_longitude, context_text)


def _country_search_name(country: Optional[str]) -> str:
    raw = str(country or "").strip()
    if not raw:
        return ""
    return COUNTRY_SEARCH_NAMES.get(raw.upper(), raw)


def _search_photon_places(
    query: str,
    limit: int,
    context_latitude: Optional[float],
    context_longitude: Optional[float],
    context_text: str,
) -> list[dict[str, Any]]:
    cache_key = (
        normalize_text(query),
        int(limit),
        round(float(context_latitude), 5) if context_latitude is not None else None,
        round(float(context_longitude), 5) if context_longitude is not None else None,
        normalize_text(context_text),
    )
    cached = _PHOTON_CACHE.get(cache_key)
    now = time.monotonic()
    if cached and now - cached[0] < PHOTON_CACHE_TTL_SECONDS:
        return list(cached[1])
    params_dict: dict[str, Any] = {"q": _contextual_query(query, context_text), "limit": min(limit, 12), "lang": "en"}
    if context_latitude is not None and context_longitude is not None:
        params_dict["lat"] = context_latitude
        params_dict["lon"] = context_longitude
    params = urllib.parse.urlencode(params_dict)
    request = urllib.request.Request(
        f"{PHOTON_SEARCH_URL}?{params}",
        headers={
            "User-Agent": "LoadSense/1.0 student-demo location search",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=1.8) as response:
            payload = response.read().decode("utf-8")
    except (OSError, urllib.error.URLError, TimeoutError, ValueError):
        return []
    try:
        features = json.loads(payload).get("features", [])
    except Exception:
        return []
    places = []
    for feature in features:
        properties = feature.get("properties") or {}
        geometry = feature.get("geometry") or {}
        coordinates = geometry.get("coordinates") or []
        if len(coordinates) < 2:
            continue
        osm_key = str(properties.get("osm_key") or "").lower()
        osm_value = str(properties.get("osm_value") or "").lower()
        if osm_value == "route" or osm_key == "route" or osm_key == "highway":
            continue
        name = properties.get("name") or properties.get("street") or properties.get("city")
        if not name:
            continue
        city = properties.get("city") or properties.get("town") or properties.get("village") or properties.get("county") or properties.get("country") or ""
        country = properties.get("country") or ""
        kind = _photon_kind(properties)
        aliases = [
            value for value in [
                properties.get("city"),
                properties.get("town"),
                properties.get("village"),
                properties.get("state"),
                properties.get("country"),
                properties.get("postcode"),
            ]
            if value and value != name
        ]
        places.append({
            "name": name,
            "city": city or country or "OpenStreetMap",
            "country": country,
            "address": properties,
            "latitude": float(coordinates[1]),
            "longitude": float(coordinates[0]),
            "aliases": aliases,
            "kind": kind,
            "source": "photon_osm",
            "osm_id": properties.get("osm_id"),
            "osm_type": properties.get("osm_type"),
            "osm_value": properties.get("osm_value"),
        })
    _PHOTON_CACHE[cache_key] = (now, places)
    return list(places)


def _attach_place_labels(places: list[dict[str, Any]]) -> list[dict[str, Any]]:
    labeled: list[dict[str, Any]] = []
    seen = set()
    for place in places:
        if not place:
            continue
        item = dict(place)
        if "subtitle" not in item:
            item["subtitle"] = _place_subtitle(item)
        
        display_key = (item.get("name", ""), item["subtitle"])
        if display_key in seen:
            continue
        seen.add(display_key)
        labeled.append(item)
    return labeled


def _search_nominatim_places(
    query: str,
    limit: int,
    context_latitude: Optional[float],
    context_longitude: Optional[float],
    context_text: str,
) -> list[dict[str, Any]]:
    params_dict: dict[str, Any] = {
        "q": _contextual_query(query, context_text),
        "format": "jsonv2",
        "addressdetails": 1,
        "namedetails": 1,
        "limit": min(limit, 10),
    }
    if context_latitude is not None and context_longitude is not None:
        lat = float(context_latitude)
        lon = float(context_longitude)
        delta = 0.75
        params_dict.update({
            "viewbox": f"{lon - delta},{lat + delta},{lon + delta},{lat - delta}",
            "bounded": 1,
        })
    request = urllib.request.Request(
        f"{NOMINATIM_SEARCH_URL}?{urllib.parse.urlencode(params_dict)}",
        headers={
            "User-Agent": "LoadSense/1.0 student-demo location search",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=1.8) as response:
            payload = response.read().decode("utf-8")
        rows = json.loads(payload)
    except (OSError, urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError):
        return []
    places = []
    for row in rows:
        try:
            lat = float(row.get("lat"))
            lon = float(row.get("lon"))
        except (TypeError, ValueError):
            continue
        address = row.get("address") or {}
        namedetails = row.get("namedetails") or {}
        name = row.get("name") or namedetails.get("name") or str(row.get("display_name", "")).split(",")[0]
        if not name:
            continue
        place_class = str(row.get("category") or row.get("class") or "").lower()
        place_type = str(row.get("type") or "").lower()
        city = (
            address.get("city")
            or address.get("municipality")
            or address.get("town")
            or address.get("village")
            or address.get("suburb")
            or address.get("county")
            or address.get("state")
            or address.get("country")
            or ""
        )
        aliases = [value for value in [address.get("suburb"), address.get("road"), address.get("postcode"), address.get("state"), address.get("country")] if value and value != name]
        places.append({
            "name": name,
            "city": city or "OpenStreetMap",
            "country": address.get("country") or "",
            "latitude": lat,
            "longitude": lon,
            "aliases": aliases,
            "kind": _nominatim_kind(place_class, place_type),
            "source": "nominatim_osm",
            "osm_id": row.get("osm_id"),
            "osm_type": row.get("osm_type"),
            "osm_class": place_class,
            "osm_value": place_type,
            "address": address,
            "subtitle": _place_subtitle({
                "kind": _nominatim_kind(place_class, place_type),
                "city": city or "OpenStreetMap",
                "country": address.get("country") or "",
                "address": address,
            }),
        })
    return places


def _place_subtitle(place: dict[str, Any]) -> str:
    address = place.get("address") or {}
    city = str(place.get("city") or "").strip()
    country = str(place.get("country") or "").strip()
    kind = str(place.get("kind") or "").lower()
    
    osm_val = str(place.get("osm_value") or address.get("osm_value") or "").strip()
    
    if kind in {"city", "town", "barangay", "terminal"}:
        parts = [
            osm_val if osm_val not in {"yes", "unclassified"} else "",
            str(address.get("suburb") or "").strip(),
            str(address.get("city") or "").strip(),
            str(address.get("town") or "").strip(),
            str(address.get("village") or "").strip(),
            str(address.get("municipality") or "").strip(),
            str(address.get("county") or "").strip(),
            str(address.get("state") or "").strip(),
            str(address.get("postcode") or "").strip(),
            str(address.get("country") or "").strip(),
        ]
    else:
        parts = [
            osm_val if osm_val not in {"yes", "unclassified"} else "",
            str(address.get("house_number") or "").strip(),
            str(address.get("road") or "").strip(),
            str(address.get("suburb") or "").strip(),
            str(address.get("city") or "").strip(),
            str(address.get("town") or "").strip(),
            str(address.get("village") or "").strip(),
            str(address.get("municipality") or "").strip(),
            str(address.get("county") or "").strip(),
            str(address.get("state") or "").strip(),
            str(address.get("postcode") or "").strip(),
            str(address.get("country") or "").strip(),
        ]
        
    parts = [part for part in parts if part]
    return ", ".join(dict.fromkeys(parts)) or ", ".join([p for p in [city, country] if p]) or city or "OpenStreetMap"


def extract_destination(query: str, routes: list[dict[str, Any]], explicit_destination: str = "") -> str:
    if explicit_destination.strip():
        return explicit_destination.strip()
    _, paired_destination = _extract_origin_destination_pair(query)
    if paired_destination:
        return paired_destination
    normalized = normalize_text(query)
    for pattern in DESTINATION_PATTERNS:
        match = re.search(pattern, normalized)
        if match:
            candidate = _clean_destination(match.group(1))
            if candidate:
                return candidate
    if 1 <= len(normalized.split()) <= 4:
        local_matches = search_places(routes, normalized, limit=1, include_remote=False)
        if local_matches:
            return local_matches[0]["name"]
    return ""


def extract_origin(query: str, explicit_origin: str = "") -> str:
    if explicit_origin.strip() and normalize_text(explicit_origin) not in {"current location", "my location", "here"}:
        return explicit_origin.strip()
    paired_origin, _ = _extract_origin_destination_pair(query)
    if paired_origin:
        return paired_origin
    normalized = normalize_text(query)
    for pattern in ORIGIN_PATTERNS:
        match = re.search(pattern, normalized)
        if match:
            return _clean_place_phrase(match.group(1))
    return explicit_origin.strip()


def resolve_place(
    text: str,
    routes: list[dict[str, Any]],
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    default_name: str = "Current location",
    include_remote: bool = True,
) -> Optional[dict[str, Any]]:
    if latitude is not None and longitude is not None:
        return {"name": text.strip() or default_name, "latitude": float(latitude), "longitude": float(longitude), "kind": "coordinate"}
    raw = (text or "").strip()
    normalized = normalize_text(raw)
    if not raw:
        return None
    coord_match = re.search(r"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)", raw)
    if coord_match:
        return {
            "name": raw,
            "latitude": float(coord_match.group(1)),
            "longitude": float(coord_match.group(2)),
            "kind": "coordinate",
        }
    if normalized in {"current location", "my location", "here", "dito", "diri"}:
        return None
    local_matches = search_places(routes, raw, limit=1, include_remote=False)
    if local_matches:
        return local_matches[0]
    if not include_remote:
        return None
    remote_matches = search_places(routes, raw, limit=1, include_remote=True)
    if remote_matches:
        return remote_matches[0]
    return None


def find_transit_suggestions(
    routes: list[dict[str, Any]],
    vehicles: list[dict[str, Any]],
    query: str = "",
    selected_route: str = "",
    origin_text: str = "",
    origin_latitude: Optional[float] = None,
    origin_longitude: Optional[float] = None,
    destination_text: str = "",
    destination_latitude: Optional[float] = None,
    destination_longitude: Optional[float] = None,
    limit: int = 5,
    include_remote_places: bool = True,
) -> dict[str, Any]:
    language = detect_language(query or destination_text)
    extracted_destination = extract_destination(query, routes, destination_text)
    extracted_origin = extract_origin(query, origin_text)
    origin = resolve_place(extracted_origin, routes, origin_latitude, origin_longitude, "Current location", include_remote=include_remote_places)
    destination = resolve_place(extracted_destination, routes, destination_latitude, destination_longitude, extracted_destination or "Destination", include_remote=include_remote_places)

    if destination is None and selected_route:
        return _selected_route_fallback(routes, vehicles, selected_route, query, language, limit)

    # --- Strategy 1: single-leg direct matches ---
    matches = find_matching_routes(origin, destination, routes)

    # --- Strategy 2: multi-leg transfer routes ---
    if not matches and origin and destination:
        matches = find_multi_leg_routes(origin, destination, routes)

    # --- Strategy 3: relaxed – destination-only match with boarding approximation ---
    if not matches and origin and destination:
        matches = _destination_matches_with_origin_boarding(origin, destination, routes)

    # --- No route found after all strategies ---
    no_route_found = not matches and destination is not None

    suggestions = _rank_vehicles_for_matches(matches, vehicles, origin, limit)
    answer = format_suggestion_answer(
        language, origin, destination, suggestions, matches,
        no_route_found=no_route_found,
        extracted_destination_text=extracted_destination,
    )
    return {
        "language": language,
        "origin": origin,
        "destination": destination,
        "matches": matches[:limit],
        "suggestions": suggestions[:limit],
        "answer": answer,
        "no_route_found": no_route_found,
    }


def _destination_matches_with_origin_boarding(
    origin: dict[str, Any],
    destination: dict[str, Any],
    routes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Relaxed fallback: find routes that reach the destination then snap the
    nearest route point to the user's origin (ignores corridor applicability)."""
    matches = find_matching_routes(None, destination, routes)
    route_lookup = {route.get("route"): route for route in routes}
    adjusted: list[dict[str, Any]] = []
    for match in matches:
        route = route_lookup.get(match.get("route"))
        if not route:
            continue
        points = route_points(route, prefer_stops=True)
        board = _nearest_point(origin, points)
        if not board:
            continue
        alight = match["alighting_stop"]
        direction = "forward" if board["index"] <= alight["index"] else "backward"
        score = float(match["score"]) + board["distance_meters"] + 3000
        adjusted.append({
            **match,
            "direction": direction,
            "strict": False,
            "score": round(score, 1),
            "boarding_stop": board,
            "walking_distance_meters": round(board["distance_meters"], 0),
            "fare_pesos": estimate_fare(points, board["index"], alight["index"], route.get("minimum_fare"), route.get("fare_per_km")),
        })
    adjusted.sort(key=lambda item: (item["score"], item["route_name"] or ""))
    return adjusted[:12]


def _point_to_segment_distance(
    px: float, py: float,
    ax: float, ay: float,
    bx: float, by: float,
) -> float:
    """Return the minimum great-circle distance (metres) from point P to line
    segment AB.  Inputs are in degrees (lat, lon mapped to x, y)."""
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        # Segment is a single point
        return haversine_meters(px, py, ax, ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    proj_x = ax + t * dx
    proj_y = ay + t * dy
    return haversine_meters(px, py, proj_x, proj_y)


def _is_origin_along_route(
    origin: dict[str, Any],
    points: list[dict[str, Any]],
    corridor_meters: float = ORIGIN_CORRIDOR_METERS,
) -> bool:
    """Return True if the origin is within *corridor_meters* of any segment of
    the route polyline.  This ensures the user is actually *along* the route
    and not just near a detached endpoint."""
    if not origin or not _valid_coord(origin):
        return True  # No origin supplied – don't filter
    olat = float(origin["latitude"])
    olon = float(origin["longitude"])
    for a, b in zip(points, points[1:]):
        if not _valid_coord(a) or not _valid_coord(b):
            continue
        dist = _point_to_segment_distance(
            olat, olon,
            float(a["latitude"]), float(a["longitude"]),
            float(b["latitude"]), float(b["longitude"]),
        )
        if dist <= corridor_meters:
            return True
    return False


def find_matching_routes(
    origin: Optional[dict[str, Any]],
    destination: Optional[dict[str, Any]],
    routes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Find routes that serve both origin and destination with improved applicability
    checks:
    - Origin must lie along the route corridor (≤ ORIGIN_CORRIDOR_METERS from any segment)
    - Route must travel from origin-side toward destination (direction enforcement)
    - Route's total length must not exceed MAX_ROUTE_DISTANCE_RATIO × the direct trip distance
    """
    if destination is None:
        return []

    matches: list[dict[str, Any]] = []
    for route in routes:
        points = route_points(route, prefer_stops=True)
        if len(points) < 2:
            continue
        route_km = float(route_distance_km(route))

        # --- Origin corridor applicability check ---
        # If origin coords are provided, the user must lie along the route path.
        if origin and _valid_coord(origin):
            if not _is_origin_along_route(origin, points):
                continue

        board = _nearest_applicable_point(origin, points, prefer_types={"origin", "alight_or_board_stop", "turn"}) if origin else None
        alight = _nearest_applicable_point(destination, points, prefer_types={"alight_or_board_stop", "end", "turn"})
        if not alight:
            continue
        if board is None:
            board = _nearest_applicable_point(points[0], points, prefer_types={"origin"})
        if not board:
            continue

        boarding_limit = BOARDING_SEARCH_RADIUS_METERS if origin else RELAXED_RADIUS_METERS
        if board["distance_meters"] > boarding_limit or alight["distance_meters"] > DESTINATION_ROUTE_RADIUS_METERS:
            continue

        # --- Direction enforcement ---
        # For non-loop routes the boarding stop must come before the alighting
        # stop in the sequence order (forward travel). Backward indicates the
        # route is heading the wrong way for this trip.
        is_loop = route.get("is_loop", False)
        board_idx = int(board.get("index", board.get("stop_id", 0)))
        alight_idx = int(alight.get("index", alight.get("stop_id", 0)))
        direction = "forward" if board_idx <= alight_idx else "backward"
        if not is_loop and direction == "backward":
            # The route runs the wrong way for this origin→destination pair.
            continue

        # --- Route distance gate ---
        # Reject long-haul routes where the total route length greatly exceeds
        # the direct trip distance – prefer shorter/more direct options.
        direct_trip_distance = haversine_meters(
            float(origin["latitude"]),
            float(origin["longitude"]),
            float(destination["latitude"]),
            float(destination["longitude"]),
        ) if origin and _valid_coord(origin) else route_km * 1000.0

        if origin and route_km > 0 and direct_trip_distance > 0:
            if route_km * 1000.0 > direct_trip_distance * MAX_ROUTE_DISTANCE_RATIO:
                continue

        route_span_km = haversine_meters(
            float(points[0]["latitude"]),
            float(points[0]["longitude"]),
            float(points[-1]["latitude"]),
            float(points[-1]["longitude"]),
        ) / 1000.0
        coverage_ratio = min(1.0, direct_trip_distance / max(1.0, route_km * 1000.0))

        strict = board["distance_meters"] <= WALKING_RADIUS_METERS and alight["distance_meters"] <= WALKING_RADIUS_METERS
        route_shape_bias = min(1200.0, abs(route_km * 1000.0 - direct_trip_distance) * 0.22)
        score = (
            board["distance_meters"] * 0.9
            + alight["distance_meters"] * 1.15
            + route_shape_bias
            + (0 if strict else 600)
            + max(0.0, route_span_km * 60.0)
        )
        matches.append({
            "route": route.get("route"),
            "route_name": route.get("name"),
            "route_type": route.get("route_type") or route.get("type") or "PUV",
            "city": route.get("city") or infer_city(route.get("polyline", []), route.get("name", "")),
            "zone": route.get("zone", ""),
            "direction": direction,
            "strict": strict,
            "score": round(score, 1),
            "boarding_stop": board,
            "alighting_stop": alight,
            "walking_distance_meters": round(board["distance_meters"], 0),
            "destination_walk_meters": round(alight["distance_meters"], 0),
            "route_distance_km": round(route_km, 2),
            "direct_distance_km": round((direct_trip_distance or 0.0) / 1000.0, 2),
            "route_applicability": round(
                max(0.0, 1.0 - min(1.0, abs(route_km * 1000.0 - direct_trip_distance) / max(1.0, direct_trip_distance)))
                * coverage_ratio,
                3,
            ),
            "fare_pesos": estimate_fare(points, board_idx, alight_idx, route.get("minimum_fare"), route.get("fare_per_km")),
        })
    matches.sort(key=lambda item: (
        item["score"],
        -float(item.get("route_applicability") or 0.0),
        not item["strict"],
        item["route_name"] or "",
    ))
    return matches[:12]


def _display_stop_name(name: str) -> str:
    name = str(name).strip()
    lower_name = name.lower()
    if not name or lower_name in ["origin", "end", "end of route", "waypoint", "turn", "destination"]:
        return "Intersection"
    if lower_name.startswith("stop "):
        return "Street corner"
    return name


def find_multi_leg_routes(
    origin: Optional[dict[str, Any]],
    destination: Optional[dict[str, Any]],
    routes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not origin or not destination:
        return []
    
    leg1_candidates = []
    leg2_candidates = []
    
    for route in routes:
        points = route_points(route, prefer_stops=True)
        if len(points) < 2:
            continue
            
        board = _nearest_point(origin, points)
        if board and board["distance_meters"] <= BOARDING_SEARCH_RADIUS_METERS:
            leg1_candidates.append((route, points, board))
            
        alight = _nearest_point(destination, points)
        if alight and alight["distance_meters"] <= DESTINATION_ROUTE_RADIUS_METERS:
            leg2_candidates.append((route, points, alight))
            
    matches = []
    
    for r1, pts1, board1 in leg1_candidates:
        for r2, pts2, alight2 in leg2_candidates:
            if r1.get("route") == r2.get("route"):
                continue
                
            best_transfer = None
            best_transfer_dist = float('inf')
            
            for p1 in pts1:
                for p2 in pts2:
                    dist = haversine_meters(p1["latitude"], p1["longitude"], p2["latitude"], p2["longitude"])
                    if dist < 500 and dist < best_transfer_dist:
                        best_transfer_dist = dist
                        best_transfer = (p1, p2)
                        
            if best_transfer:
                p1, p2 = best_transfer
                direction1 = "forward" if board1["index"] <= p1["index"] else "backward"
                direction2 = "forward" if p2["index"] <= alight2["index"] else "backward"
                
                score = board1["distance_meters"] + alight2["distance_meters"] + best_transfer_dist + 2000
                matches.append({
                    "legs": [
                        {
                            "route": r1.get("route"),
                            "route_name": r1.get("name"),
                            "direction": direction1,
                            "boarding_stop": board1,
                            "alighting_stop": p1,
                        },
                        {
                            "route": r2.get("route"),
                            "route_name": r2.get("name"),
                            "direction": direction2,
                            "boarding_stop": p2,
                            "alighting_stop": alight2,
                        }
                    ],
                    "route": f"{r1.get('route')} to {r2.get('route')}",
                    "route_name": f"Transfer at {_display_stop_name(p1.get('name', ''))}",
                    "city": r1.get("city") or infer_city(r1.get("polyline", []), r1.get("name", "")),
                    "zone": r1.get("zone", ""),
                    "direction": "multi",
                    "strict": False,
                    "score": round(score, 1),
                    "boarding_stop": board1,
                    "alighting_stop": alight2,
                    "transfer_stop": p1,
                    "walking_distance_meters": round(board1["distance_meters"], 0),
                    "destination_walk_meters": round(alight2["distance_meters"], 0),
                    "transfer_walk_meters": round(best_transfer_dist, 0),
                    "fare_pesos": estimate_fare(pts1, board1["index"], p1["index"], r1.get("minimum_fare"), r1.get("fare_per_km")) + estimate_fare(pts2, p2["index"], alight2["index"], r2.get("minimum_fare"), r2.get("fare_per_km")),
                })
                
    matches.sort(key=lambda item: item["score"])
    return matches[:12]


def route_points(route: dict[str, Any], prefer_stops: bool = False) -> list[dict[str, Any]]:
    meta = route_metadata(str(route.get("route", "")))
    stops = meta.get("stops") if prefer_stops else None
    stops = stops or route.get("stops") or []
    points = stops if stops else route.get("polyline") or []
    result = []
    for index, point in enumerate(points):
        if not _valid_coord(point):
            continue
        result.append({
            "index": int(point.get("stop_id", index)) if isinstance(point, dict) else index,
            "name": point.get("name", f"Stop {index + 1}") if isinstance(point, dict) else f"Stop {index + 1}",
            "latitude": float(point["latitude"] if isinstance(point, dict) else point[0]),
            "longitude": float(point["longitude"] if isinstance(point, dict) else point[1]),
            "point_type": point.get("point_type", "") if isinstance(point, dict) else "",
            "label": point.get("label", "") if isinstance(point, dict) else "",
        })
    return result


def estimate_fare(points: list[dict[str, Any]], board_index: int, alight_index: int, minimum_fare: float = None, fare_per_km: float = None) -> int:
    start = min(board_index, alight_index)
    end = max(board_index, alight_index)
    distance = 0.0
    for left, right in zip(points[start:end], points[start + 1:end + 1]):
        distance += haversine_meters(left["latitude"], left["longitude"], right["latitude"], right["longitude"])
    km = distance / 1000.0
    
    min_fare = float(minimum_fare) if minimum_fare is not None else 13.0
    per_km = float(fare_per_km) if fare_per_km is not None else 2.25
    
    return int(round(max(min_fare, min_fare + max(0.0, km - 4.0) * per_km)))


def format_suggestion_answer(
    language: str,
    origin: Optional[dict[str, Any]],
    destination: Optional[dict[str, Any]],
    suggestions: list[dict[str, Any]],
    matches: list[dict[str, Any]],
    no_route_found: bool = False,
    extracted_destination_text: str = "",
) -> str:
    if not destination:
        if extracted_destination_text:
            if language == "tl":
                return f"Hindi ko mahanap ang lokasyon na '{extracted_destination_text}'. Pakisubukang gumamit ng mas kilalang lugar o landmark."
            if language == "ceb":
                return f"Wala nako makit-i ang lokasyon nga '{extracted_destination_text}'. Palihug gamit og mas ilado nga lugar o landmark."
            return f"I couldn't find the location '{extracted_destination_text}'. Please try using a more well-known place or landmark."
        
        if language == "tl":
            return "Sabihin mo ang destinasyon mo para mahanap ko ang tamang ruta."
        if language == "ceb":
            return "Isulti ang imong destinasyon para pangitaon nako ang sakto nga ruta."
        if language == "ilo":
            return "Isugid ang destinasyon mo para mapangita ko ang maayo nga ruta."
        if language == "ilocano":
            return "Ibagam ti papanam tapno mabirok ko ti umiso a ruta."
        return "Please tell me your destination so I can search every route."

    # --- Clear no-route-found message (all strategies exhausted) ---
    if no_route_found or not matches:
        origin_label = origin.get("name") or "your location" if origin else "your location"
        dest_label = destination["name"]
        if language == "tl":
            return (
                f"Walang ruta ang dumadaan sa iyong lokasyon ({origin_label}) "
                f"patungong {dest_label}. "
                f"Subukan ang paglipat sa mas malapit na pangunahing daan o "
                f"i-verify ang iyong pinasok na lokasyon."
            )
        if language == "ceb":
            return (
                f"Walay ruta nga moagi sa imong lokasyon ({origin_label}) "
                f"paingon sa {dest_label}. "
                f"Sulayi ang pagbalhin sa mas duol nga dako nga dalan o "
                f"i-verify ang imong gi-input nga lokasyon."
            )
        if language == "ilo":
            return (
                f"Wala sang ruta nga nagaagi sa imo nga lokasyon ({origin_label}) "
                f"pakadto sa {dest_label}. "
                f"Tilawi ang pagbalhin sa mas malapit nga pangunahing dalan o "
                f"i-verify ang imo nga ginbutang nga lokasyon."
            )
        if language == "ilocano":
            return (
                f"Awan ti ruta nga agtaray iti lokasyon mo ({origin_label}) "
                f"agturong iti {dest_label}. "
                f"Padasem ti panagbalhin iti asideg a nangato a dalan wenno "
                f"i-verify ti naited mo a lokasyon."
            )
        return (
            f"\u26a0\ufe0f No route found that passes through your location "
            f"({origin_label}) going to {dest_label}. "
            f"Your origin may not be along any registered route corridor. "
            f"Try moving to a nearby main road or verify your origin input."
        )

    if not suggestions:
        route_names = ", ".join(
            f"{match['route']} ({match.get('route_type', 'PUV')} {match['route_name']})"
            for match in matches[:3]
        )
        if language == "en":
            best_match = matches[0]
            return (
                f"Destination: {destination['name']}\n"
                f"Recommended route: {best_match['route']} ({best_match.get('route_type', 'PUV')}) - {best_match['route_name']}\n"
                f"Matching routes found near {destination['name']}: {route_names}. "
                "No active PUVs are reporting on them right now - check back shortly."
            )
        if language == "tl":
            return f"May nahanap akong ruta malapit sa {destination['name']} ({route_names}), pero wala pang active na PUV na nagre-report ngayon."
        if language == "ceb":
            return f"Nakita nako ang mga ruta duol sa {destination['name']} ({route_names}), pero walay active nga PUV nga nag-report karon."
        if language == "ilo":
            return f"May nakita ako nga mga ruta malapit sa {destination['name']} ({route_names}), pero wala pa sang active nga PUV subong."
        if language == "ilocano":
            return f"Adda dagiti ruta nga asideg iti {destination['name']} ({route_names}), ngem awan pay active nga PUV ita."
        return (
            f"Matching routes found near {destination['name']}: {route_names}. "
            f"No active PUVs are reporting on them right now — check back shortly."
        )

    best = suggestions[0]
    # Build alternative note listing distinct routes beyond the best one
    alt_routes = []
    seen_routes: set[str] = {str(best.get("route", ""))}
    for s in suggestions[1:]:
        r = str(s.get("route", ""))
        if r and r not in seen_routes:
            alt_routes.append(f"{r} ({s.get('route_type', 'PUV')} – {s.get('route_name', '')})") 
            seen_routes.add(r)
    crowd_note = ""
    if best.get("tier") in {"red", "blinking_red"}:
        crowd_note = " This PUV is crowded; wait for a less-crowded option if possible."
    if alt_routes:
        crowd_note += f" Alternative route(s): {', '.join(alt_routes[:2])}."

    if language == "tl":
        return (
            f"Pinakamagandang sakyan: Ruta {best['route']} ({best['route_name']}), PUV {best['vehicle_id']}. "
            f"Sumakay malapit sa {_display_stop_name(best['boarding_stop']['name'])} at bumaba malapit sa {_display_stop_name(best['alighting_stop']['name'])}. "
            f"Nasa {best['distance_km']:.1f} km ito mula sa iyo at darating sa ~{best['eta_minutes']:.0f} minuto. "
            f"Tantyang pamasahe: PHP {best['fare_pesos']}.{crowd_note}"
        )
    if language == "ceb":
        return (
            f"Pinakamaayong sakyan: Ruta {best['route']} ({best['route_name']}), PUV {best['vehicle_id']}. "
            f"Sakay duol sa {_display_stop_name(best['boarding_stop']['name'])} ug naog duol sa {_display_stop_name(best['alighting_stop']['name'])}. "
            f"Mga {best['distance_km']:.1f} km kini gikan nimo ug moabot sa ~{best['eta_minutes']:.0f} minuto. "
            f"Banabana nga plete: PHP {best['fare_pesos']}.{crowd_note}"
        )
    if language == "ilo":
        return (
            f"Pinakamaayo nga sakyan: Ruta {best['route']} ({best['route_name']}), PUV {best['vehicle_id']}. "
            f"Sakay malapit sa {_display_stop_name(best['boarding_stop']['name'])} kag naog malapit sa {_display_stop_name(best['alighting_stop']['name'])}. "
            f"Mga {best['distance_km']:.1f} km ini halin sa imo kag maabot sa ~{best['eta_minutes']:.0f} minuto. "
            f"Ginalantaw nga plete: PHP {best['fare_pesos']}.{crowd_note}"
        )
    if language == "ilocano":
        return (
            f"Nasayaat a pagpilian: Ruta {best['route']} ({best['route_name']}), PUV {best['vehicle_id']}. "
            f"Sakay iti asideg ti {_display_stop_name(best['boarding_stop']['name'])} ket bumaba iti asideg ti {_display_stop_name(best['alighting_stop']['name'])}. "
            f"Agarup {best['distance_km']:.1f} km manipud kenka ken umay iti ~{best['eta_minutes']:.0f} minuto. "
            f"Karkulo a bayad: PHP {best['fare_pesos']}.{crowd_note}"
        )
    base = (
        f"Destination: {destination['name']}\n"
        f"Recommended route: {best['route']} ({best.get('route_type', 'PUV')}) - {best['route_name']}\n"
        f"PUV to board: {best['vehicle_id']} ({best.get('tier', 'active').replace('_', ' ')})\n"
        f"Board near: {_display_stop_name(best['boarding_stop']['name'])}\n"
        f"Alight near: {_display_stop_name(best['alighting_stop']['name'])}\n"
        f"Arrival: ~{best['eta_minutes']:.0f} min ({best['distance_km']:.1f} km from you)\n"
        f"Estimated fare: PHP {best['fare_pesos']}.{crowd_note}"
    )
    return base


def _selected_route_fallback(
    routes: list[dict[str, Any]],
    vehicles: list[dict[str, Any]],
    selected_route: str,
    query: str,
    language: str,
    limit: int,
) -> dict[str, Any]:
    route = next((item for item in routes if item.get("route") == selected_route), None)
    route_vehicles = [vehicle for vehicle in vehicles if vehicle.get("route") == selected_route]
    route_vehicles.sort(key=lambda vehicle: (_tier_penalty(vehicle.get("tier")), float(vehicle.get("eta_minutes") or 999)))
    suggestions = []
    for vehicle in route_vehicles[:limit]:
        suggestions.append({
            "vehicle_id": vehicle.get("vehicle_id"),
            "route": selected_route,
            "route_name": route.get("name") if route else selected_route,
            "city": route.get("city") if route else "",
            "eta_minutes": round(float(vehicle.get("eta_minutes") or 0), 1),
            "distance_meters": None,
            "distance_km": 0.0,
            "fare_pesos": 13,
            "occupancy": vehicle.get("occupancy"),
            "capacity": vehicle.get("capacity"),
            "tier": vehicle.get("tier"),
            "status": vehicle.get("status", "active"),
            "direction": vehicle.get("direction"),
            "boarding_stop": {"name": f"Route {selected_route} next stop"},
            "alighting_stop": {"name": "selected corridor"},
        })
    if suggestions:
        best = suggestions[0]
        action = "board" if best["tier"] in {"green", "yellow"} else "wait for the next less crowded PUV"
        answer = _translate(language, f"For Route {selected_route}, {action}: Vehicle {best['vehicle_id']} has ETA {best['eta_minutes']} minutes and {best['occupancy']}/{best['capacity']} riders.")
    else:
        if route:
            answer = _translate(
                language,
                f"Ride Route {selected_route} ({route.get('name') or selected_route}). "
                f"No live PUV is reporting on Route {selected_route} yet, so use the route corridor and wait for the next reporting vehicle.",
            )
        else:
            answer = _translate(language, f"Ride Route {selected_route}. No live PUV is reporting on Route {selected_route} yet.")
    return {
        "language": language,
        "origin": None,
        "destination": None,
        "matches": [],
        "suggestions": suggestions,
        "answer": answer,
    }


def _rank_vehicles_for_matches(
    matches: list[dict[str, Any]],
    vehicles: list[dict[str, Any]],
    origin: Optional[dict[str, Any]],
    limit: int,
) -> list[dict[str, Any]]:
    """Rank live vehicles for each matching route and return the top *limit*
    suggestions.  The key improvement over the previous version is that we
    guarantee **at least one suggestion per distinct matching route** so that
    multiple PUV types (jeepney, bus, etc.) are all surfaced to the user."""
    # Step 1 – score every candidate vehicle for every matching route
    all_candidates: list[dict[str, Any]] = []
    seen_routes_no_vehicle: set[str] = set()

    for match in matches:
        route_id = match["legs"][0]["route"] if "legs" in match else match["route"]
        boarding_stop = match["legs"][0]["boarding_stop"] if "legs" in match else match["boarding_stop"]
        alighting_stop = match["legs"][-1]["alighting_stop"] if "legs" in match else match["alighting_stop"]
        route_name = match.get("route_name") or route_id
        route_type = match.get("route_type") or "PUV"

        route_vehicles = [
            vehicle for vehicle in vehicles
            if vehicle.get("route") == route_id and vehicle.get("status", "active") != "idle"
        ]
        strict_vehicles = [
            vehicle for vehicle in route_vehicles
            if _vehicle_can_reach_boarding_stop(vehicle, match)
        ]
        candidates = strict_vehicles or route_vehicles

        # Multi-leg placeholder when no live vehicle is available
        if not candidates and "legs" in match and route_id not in seen_routes_no_vehicle:
            seen_routes_no_vehicle.add(str(route_id))
            all_candidates.append({
                "vehicle_id": "Any PUV",
                "route": match["route"],
                "route_name": route_name,
                "route_type": route_type,
                "city": match["city"],
                "zone": match.get("zone", ""),
                "eta_minutes": 0,
                "distance_meters": 0,
                "distance_km": 0.0,
                "fare_pesos": match["fare_pesos"],
                "occupancy": 0,
                "capacity": 0,
                "tier": "active",
                "status": "active",
                "direction": match["direction"],
                "speed_kph": DEFAULT_SPEED_KPH,
                "boarding_stop": boarding_stop,
                "alighting_stop": alighting_stop,
                "walking_distance_meters": match["walking_distance_meters"],
                "destination_walk_meters": match["destination_walk_meters"],
                "match_score": match["score"],
                "route_applicability": float(match.get("route_applicability") or 0.0),
                "suitability_score": 0.0,
                "legs": match.get("legs"),
            })
            continue

        for vehicle in candidates:
            if not _valid_coord(vehicle):
                continue
            target = origin or boarding_stop
            distance = haversine_meters(
                float(vehicle["latitude"]),
                float(vehicle["longitude"]),
                float(target["latitude"]),
                float(target["longitude"]),
            )
            eta = calculate_eta_minutes(distance, vehicle.get("speed_kph"))
            capacity = int(vehicle.get("capacity") or 0)
            occupancy = int(vehicle.get("occupancy") or 0)
            crowd_ratio = (occupancy / capacity) if capacity > 0 else 0.0
            safety_penalty = 1.0 if vehicle.get("route_deviation", {}).get("anomaly") else 0.0
            direction_score = _direction_alignment_score(vehicle, match)
            route_applicability = float(match.get("route_applicability") or 0.0)
            route_distance_km = float(match.get("route_distance_km") or 0.0)
            destination_walk_meters = float(match.get("destination_walk_meters") or 0.0)
            walking_distance_meters = float(match.get("walking_distance_meters") or 0.0)
            # Suitability: higher is better
            suitability = (
                route_applicability * 1200.0         # prefer routes that closely fit the trip
                + direction_score * 300.0             # strong bonus for correct direction
                + max(0.0, 160.0 - eta * 12.0)       # prefer nearby vehicles (ETA)
                + max(0.0, 120.0 - crowd_ratio * 120.0)  # prefer less-crowded
                - safety_penalty * 900.0             # heavy penalty for deviated vehicles
                - destination_walk_meters * 0.18      # do not trade a bad alighting point for a live PUV
                - walking_distance_meters * 0.05      # prefer realistic boarding points
                - route_distance_km * 30.0           # prefer shorter routes for short trips
            )
            all_candidates.append({
                "vehicle_id": vehicle.get("vehicle_id"),
                "route": match["route"],
                "route_name": route_name,
                "route_type": route_type,
                "city": match["city"],
                "zone": match.get("zone", ""),
                "eta_minutes": eta,
                "distance_meters": round(distance, 0),
                "distance_km": round(distance / 1000.0, 2),
                "fare_pesos": match["fare_pesos"],
                "occupancy": vehicle.get("occupancy"),
                "capacity": vehicle.get("capacity"),
                "tier": vehicle.get("tier"),
                "status": vehicle.get("status", "active"),
                "direction": vehicle.get("direction"),
                "speed_kph": vehicle.get("speed_kph") or DEFAULT_SPEED_KPH,
                "boarding_stop": boarding_stop,
                "alighting_stop": alighting_stop,
                "walking_distance_meters": match["walking_distance_meters"],
                "destination_walk_meters": match["destination_walk_meters"],
                "match_score": match["score"],
                "route_applicability": route_applicability,
                "suitability_score": round(suitability, 1),
                "legs": match.get("legs"),
            })

    # Step 2 – sort all candidates globally by suitability
    all_candidates.sort(key=lambda item: (
        -float(item.get("suitability_score") or 0.0),
        float(item.get("match_score") or 0.0),
        _tier_penalty(item.get("tier")),
        float(item.get("eta_minutes") or 0.0),
        float(item.get("distance_km") or 0.0),
    ))

    # Step 3 – ensure at least one entry per distinct route so every applicable
    # PUV type (jeepney, bus, etc.) gets surfaced to the user.
    final: list[dict[str, Any]] = []
    route_represented: set[str] = set()
    overflow: list[dict[str, Any]] = []  # extra vehicles for already-seen routes

    for item in all_candidates:
        r = str(item.get("route", ""))
        if r not in route_represented:
            route_represented.add(r)
            final.append(item)
        else:
            overflow.append(item)

    # Fill remaining slots (up to limit) with the overflow sorted by suitability
    remaining = limit - len(final)
    if remaining > 0:
        final.extend(overflow[:remaining])

    return final[:limit]


def _vehicle_can_reach_boarding_stop(vehicle: dict[str, Any], match: dict[str, Any]) -> bool:
    direction = vehicle.get("direction")
    if direction not in {"forward", "backward"}:
        return True
        
    route_id = match["legs"][0]["route"] if "legs" in match else match["route"]
    boarding_stop = match["legs"][0]["boarding_stop"] if "legs" in match else match["boarding_stop"]
    
    route_points_for_vehicle = ROUTE_METADATA.get(route_id, {}).get("stops")
    if not route_points_for_vehicle:
        return True
    vehicle_point = _nearest_point(vehicle, route_points_for_vehicle)
    if not vehicle_point:
        return True
    board_index = boarding_stop.get("index", 0)
    if direction == "forward":
        return vehicle_point["index"] <= board_index
    return vehicle_point["index"] >= board_index


def _direction_alignment_score(vehicle: dict[str, Any], match: dict[str, Any]) -> float:
    direction = str(vehicle.get("direction") or "").strip().lower()
    if direction not in {"forward", "backward"}:
        return 0.5
    expected = "forward"
    if "legs" in match:
        expected = match["legs"][0].get("direction") or "forward"
    else:
        boarding_stop = match.get("boarding_stop") or {}
        alighting_stop = match.get("alighting_stop") or {}
        expected = "forward" if int(boarding_stop.get("index", 0)) <= int(alighting_stop.get("index", 0)) else "backward"
    return 1.0 if direction == expected else -0.5


def _nearest_applicable_point(
    target: Optional[dict[str, Any]],
    points: list[dict[str, Any]],
    prefer_types: set[str] | None = None,
) -> Optional[dict[str, Any]]:
    if not target or not _valid_coord(target):
        return None
    prefer_types = prefer_types or set()
    best: Optional[dict[str, Any]] = None
    best_score = float("inf")
    total = len(points)
    for index, point in enumerate(points):
        if not _valid_coord(point):
            continue
        distance = haversine_meters(
            float(target["latitude"]),
            float(target["longitude"]),
            float(point["latitude"]),
            float(point["longitude"]),
        )
        score = distance + _route_point_kind_score(point, index, total)
        category = _route_point_category(point, index, total)
        if prefer_types and category not in prefer_types:
            score += 350.0
        if score < best_score:
            best = {
                **point,
                "index": int(point.get("index", point.get("stop_id", index))),
                "distance_meters": round(distance, 1),
                "label": _route_point_label(point, index, total),
                "point_type": category,
            }
            best_score = score
    return best


def _nearest_point(target: Optional[dict[str, Any]], points: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if not target or not _valid_coord(target):
        return None
    best = None
    best_distance = float("inf")
    for point in points:
        distance = haversine_meters(
            float(target["latitude"]),
            float(target["longitude"]),
            float(point["latitude"]),
            float(point["longitude"]),
        )
        if distance < best_distance:
            best_distance = distance
            best = point
    if best is None:
        return None
    index = best.get("index", best.get("stop_id", points.index(best)))
    return {
        **best,
        "index": int(index),
        "distance_meters": round(best_distance, 1),
    }


def _best_place_text_match(normalized_query: str, places: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if not normalized_query:
        return None
    best: tuple[float, Optional[dict[str, Any]]] = (0, None)
    for place in places:
        aliases = [place["name"], *(place.get("aliases") or [])]
        for alias in aliases:
            normalized_alias = normalize_text(alias)
            score = _text_match_score(normalized_query, normalized_alias)
            if not score:
                score = _fuzzy_token_score(normalized_query, normalized_alias)
            if score:
                score += _place_kind_boost(place, normalized_query)
            if score > best[0]:
                best = (score, place)
    return best[1]


def _text_match_score(needle: str, haystack: str) -> int:
    if not needle or not haystack:
        return 0
    if haystack == needle:
        return 220 + len(haystack)
    if haystack in needle:
        return 165 + len(haystack)
    if needle in haystack:
        return 110 + len(needle)
    tokens = needle.split()
    if tokens and all(token in haystack for token in tokens):
        return 85 + len(needle)
    compact_needle = needle.replace(" ", "")
    compact_haystack = haystack.replace(" ", "")
    if compact_needle and compact_needle in compact_haystack:
        return 75 + len(compact_needle)
    if compact_haystack.startswith(compact_needle) or compact_needle.startswith(compact_haystack):
        return 70 + min(len(compact_needle), len(compact_haystack))
    return 0


def _fuzzy_token_score(needle: str, haystack: str) -> float:
    if not needle or not haystack:
        return 0.0
    needle_tokens = [token for token in needle.split() if len(token) >= 2]
    haystack_tokens = [token for token in haystack.split() if len(token) >= 2]
    if not needle_tokens or not haystack_tokens:
        return 0.0
    overlap = 0.0
    for token in needle_tokens:
        if token in haystack_tokens:
            overlap += 1.0
            continue
        if any(token in candidate or candidate in token for candidate in haystack_tokens):
            overlap += 0.65
    if not overlap:
        compact_needle = needle.replace(" ", "")
        compact_haystack = haystack.replace(" ", "")
        if compact_needle and compact_haystack and (
            compact_needle in compact_haystack
            or compact_haystack in compact_needle
            or compact_haystack.startswith(compact_needle[: max(2, min(4, len(compact_needle)))])
        ):
            overlap = 0.5
    if not overlap:
        return 0.0
    return 35.0 + overlap * 16.0


def _place_search_score(
    place: dict[str, Any],
    needle: str,
    context_latitude: Optional[float],
    context_longitude: Optional[float],
    context_text: str,
) -> float:
    haystack = " ".join([place["name"], place.get("city", ""), place.get("route", ""), *(place.get("aliases") or [])])
    normalized = normalize_text(haystack)
    score = float(_text_match_score(needle, normalized))
    if not score:
        score = _fuzzy_token_score(needle, normalized)
    if score:
        score += float(_place_kind_boost(place, needle))
        score += float(_context_boost(place, context_latitude, context_longitude, context_text))
        if normalize_text(place.get("name", "")) == needle:
            score += 30.0
        if any(normalize_text(alias) == needle for alias in place.get("aliases") or []):
            score += 24.0
    return score


def _place_kind_boost(place: dict[str, Any], needle: str = "") -> int:
    kind = place.get("kind", "")
    route_like = bool(re.fullmatch(r"(route\s+)?[a-z0-9]{1,4}", needle or ""))
    boosts = {
        "city": 70,
        "town": 68,
        "barangay": 66,
        "terminal": 58,
        "landmark": 54,
        "place": 48,
        "stop": 14,
        "route": 38 if route_like else -45,
    }
    return boosts.get(kind, 0)


def _photon_kind(properties: dict[str, Any]) -> str:
    osm_key = str(properties.get("osm_key") or "").lower()
    osm_value = str(properties.get("osm_value") or "").lower()
    place = str(properties.get("type") or "").lower()
    if osm_key == "place":
        if osm_value in {"city", "municipality"}:
            return "city"
        if osm_value in {"town", "village", "hamlet", "borough", "suburb", "quarter", "neighbourhood"}:
            return "town" if osm_value in {"town", "village", "municipality"} else "barangay"
    if osm_key in {"amenity", "shop", "tourism", "leisure", "historic"}:
        return "landmark"
    if osm_key in {"railway", "public_transport"} or osm_value in {"bus_station", "station", "terminal"}:
        return "terminal"
    if place in {"city", "town", "village"}:
        return "city" if place == "city" else "town"
    return "place"


def _nominatim_kind(place_class: str, place_type: str) -> str:
    if place_class == "place":
        if place_type in {"city", "municipality"}:
            return "city"
        if place_type in {"town", "village", "municipality"}:
            return "town"
        if place_type in {"suburb", "quarter", "neighbourhood", "barangay"}:
            return "barangay"
    if place_class in {"shop, amenity", "amenity", "shop", "tourism", "leisure", "historic", "building"}:
        return "landmark"
    if place_class in {"railway", "public_transport"} or place_type in {"bus_station", "station", "terminal"}:
        return "terminal"
    return "place"


def _contextual_query(query: str, context_text: str) -> str:
    raw = (query or "").strip()
    context = (context_text or "").strip()
    if not raw or not context:
        return raw
    normalized_raw = normalize_text(raw)
    normalized_context = normalize_text(context)
    if normalized_context and normalized_context not in normalized_raw:
        return f"{raw} {context}"
    return raw


def _filter_contextual_places(
    places: list[dict[str, Any]],
    context_latitude: Optional[float],
    context_longitude: Optional[float],
) -> list[dict[str, Any]]:
    return [
        place for place in places
        if place.get("kind") != "route" and _within_context_radius(place, context_latitude, context_longitude)
    ]


def _is_relevant_place(
    place: dict[str, Any],
    needle: str,
    context_latitude: Optional[float],
    context_longitude: Optional[float],
    allow_remote_fallback: bool = False,
) -> bool:
    if place.get("kind") == "route":
        return False
    osm_class = str(place.get("osm_class") or "").lower()
    osm_value = str(place.get("osm_value") or "").lower()
    if osm_value == "route" or (osm_class == "highway" and place.get("source")):
        return False
    if not _within_context_radius(place, context_latitude, context_longitude) and not allow_remote_fallback:
        return False
    haystack = normalize_text(f"{place.get('name', '')} {place.get('city', '')} {' '.join(place.get('aliases') or [])}")
    return bool(_text_match_score(needle, haystack) or _fuzzy_token_score(needle, haystack) or place.get("source"))


def _within_context_radius(
    place: dict[str, Any],
    context_latitude: Optional[float],
    context_longitude: Optional[float],
) -> bool:
    if context_latitude is None or context_longitude is None or not _valid_coord(place):
        return True
    distance = haversine_meters(float(context_latitude), float(context_longitude), float(place["latitude"]), float(place["longitude"]))
    return distance <= REMOTE_CONTEXT_RADIUS_METERS


def _context_boost(
    place: dict[str, Any],
    context_latitude: Optional[float],
    context_longitude: Optional[float],
    context_text: str = "",
) -> int:
    score = 0
    context = normalize_text(context_text)
    if context:
        city = normalize_text(str(place.get("city") or ""))
        aliases = normalize_text(" ".join(place.get("aliases") or []))
        if context in city or context in aliases:
            score += 90
    if context_latitude is None or context_longitude is None or not _valid_coord(place):
        return score
    distance = haversine_meters(float(context_latitude), float(context_longitude), float(place["latitude"]), float(place["longitude"]))
    if distance <= 2_000:
        return score + 120
    if distance <= 10_000:
        return score + 90
    if distance <= 30_000:
        return score + 55
    if distance <= REMOTE_CONTEXT_RADIUS_METERS:
        return score + 20
    return score - 200


def _place_sort_key(place: dict[str, Any]) -> tuple[int, str, str]:
    order = {
        "city": 0,
        "town": 1,
        "barangay": 2,
        "terminal": 3,
        "landmark": 4,
        "place": 5,
        "stop": 6,
        "route": 7,
    }
    return (order.get(place.get("kind", ""), 9), place.get("city", ""), place.get("name", ""))


def _clean_destination(value: str) -> str:
    value = re.sub(r"\b(this destination|my destination|destination|from here|right now|please|pls|po|lang|diri|dito|gikan diri)\b", " ", value)
    value = re.sub(r"\b(my current location is|current location is|from|gikan|origin is|starting from)\s+.+?\b(?:what|which|how|to reach|reach|going to)\b", " ", value)
    value = re.sub(r"\b(which|what|how)\s+.*$", " ", value)
    value = re.sub(r"^(reach|get to|go to|towards?|to)\s+", " ", value)
    value = _clean_place_phrase(value)
    return value.title() if value else ""


def _clean_place_phrase(value: str) -> str:
    value = re.sub(r"\b(is at|is|at|sa)\b", " ", value)
    value = re.sub(r"\s+", " ", value).strip(" ?.,")
    return value


def _extract_origin_destination_pair(query: str) -> tuple[str, str]:
    normalized = normalize_text(query)
    patterns = [
        r"\b(?:go|going|travel|ride|commute|get|board|take)?\s*from\s+(.+?)\s+to\s+(.+)$",
        r"\b(?:gikan|halin)\s+(.+?)\s+(?:paingon|padung|adto|pakadto|to)\s+(.+)$",
    ]
    for pattern in patterns:
        match = re.search(pattern, normalized)
        if not match:
            continue
        origin = _clean_place_phrase(match.group(1))
        destination = _clean_destination(match.group(2))
        if origin and destination:
            return origin.title(), destination
    return "", ""


def _place_result_rank(place: dict[str, Any], needle: str) -> tuple[int, float, tuple[int, str, str]]:
    name = normalize_text(str(place.get("name") or ""))
    aliases = [normalize_text(str(alias)) for alias in place.get("aliases") or []]
    if name == needle:
        match_class = 0
    elif name and (needle in name or name in needle):
        match_class = 1
    elif any(alias == needle for alias in aliases):
        match_class = 2
    else:
        match_class = 3
    return (match_class, -_place_search_score(place, needle, None, None, ""), _place_sort_key(place))


def _route_center(points: list[dict[str, Any]]) -> Optional[dict[str, float]]:
    valid = [point for point in points if _valid_coord(point)]
    if not valid:
        return None
    return {
        "latitude": sum(float(point["latitude"]) for point in valid) / len(valid),
        "longitude": sum(float(point["longitude"]) for point in valid) / len(valid),
    }


def _destination_mentions_route(destination: dict[str, Any], route_text: str) -> bool:
    terms = [destination.get("name", ""), *(destination.get("aliases") or [])]
    normalized_terms = [normalize_text(term) for term in terms if normalize_text(term)]
    if any(term and term in route_text for term in normalized_terms):
        return True
    ignored = {"cebu", "city", "philippines", "current", "location"}
    tokens = {
        token
        for term in normalized_terms
        for token in term.split()
        if len(token) >= 4 and token not in ignored
    }
    return any(token in route_text for token in tokens)


def _valid_coord(point: Any) -> bool:
    try:
        lat = float(point["latitude"] if isinstance(point, dict) else point[0])
        lon = float(point["longitude"] if isinstance(point, dict) else point[1])
    except (KeyError, IndexError, TypeError, ValueError):
        return False
    return -90 <= lat <= 90 and -180 <= lon <= 180 and not (lat == 0 and lon == 0)


def _dedupe_places(places: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, int, int]] = set()
    deduped = []
    for place in places:
        key = (
            normalize_text(place["name"]),
            round(float(place["latitude"]) * 10000),
            round(float(place["longitude"]) * 10000),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(place)
    return deduped


def _tier_penalty(tier: Optional[str]) -> int:
    return {
        "green": 0,
        "yellow": 1,
        "red": 2,
        "blinking_red": 3,
    }.get(tier or "", 4)


def _translate(language: str, english: str) -> str:
    if language == "tl":
        replacements = {
            "Best option": "Pinakamagandang sakyan",
            "Route": "Ruta",
            "Vehicle": "PUV",
            "Board near": "Sumakay malapit sa",
            "and alight near": "at bumaba malapit sa",
            "It is about": "Nasa",
            "from you, arriving in": "mula sa iyo, darating sa",
            "minutes": "minuto",
            "Estimated fare": "Tantyang pamasahe",
            "Please tell me your destination so I can search every route.": "Sabihin mo ang destinasyon mo para mahanap ko ang tamang ruta.",
        }
    elif language == "ceb":
        replacements = {
            "Best option": "Pinakamaayong sakyan",
            "Route": "Ruta",
            "Vehicle": "PUV",
            "Board near": "Sakay duol sa",
            "and alight near": "ug naog duol sa",
            "It is about": "Mga",
            "from you, arriving in": "gikan nimo, moabot sa",
            "minutes": "minuto",
            "Estimated fare": "Banabana nga plete",
            "Please tell me your destination so I can search every route.": "Isulti ang imong destinasyon para pangitaon nako ang sakto nga ruta.",
        }
    elif language == "ilo":
        replacements = {
            "Best option": "Pinakamaayo nga sakyan",
            "Route": "Ruta",
            "Vehicle": "PUV",
            "Board near": "Sakay malapit sa",
            "and alight near": "kag naog malapit sa",
            "Estimated fare": "Ginalantaw nga plete",
        }
    elif language == "ilocano":
        replacements = {
            "Best option": "Nasayaat a pagpilian",
            "Route": "Ruta",
            "Vehicle": "PUV",
            "Estimated fare": "Karkulo a bayad",
        }
    elif language == "es":
        replacements = {
            "Best option": "Mejor opcion",
            "Route": "Ruta",
            "Vehicle": "Vehiculo",
            "Board near": "Sube cerca de",
            "and alight near": "y baja cerca de",
            "Estimated fare": "Tarifa estimada",
            "Please tell me your destination so I can search every route.": "Dime tu destino para buscar todas las rutas.",
        }
    elif language == "ja":
        replacements = {
            "Best option": "Best option",
            "Route": "Route",
            "Vehicle": "Vehicle",
            "Estimated fare": "Estimated fare",
        }
    else:
        replacements = {}
    translated = english
    for source, target in replacements.items():
        translated = translated.replace(source, target)
    return translated
