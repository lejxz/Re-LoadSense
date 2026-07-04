from __future__ import annotations

import json
import sqlite3
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from typing import Any, Optional

from backend.app.core.compat import model_to_dict
from backend.app.core.config import config_value, repo_path
from backend.app.core.transit import infer_city, route_metadata
from backend.app.db.models import OperatorAlert, VehicleState


COUNTRY_DB_DIR = repo_path(config_value("data", "country_database_dir", default="data/countries"))
COUNTRY_CODES = ("PH", "TH", "VN", "MY", "ID")
DB_PATH = COUNTRY_DB_DIR / "PH" / "loadsense.sqlite"

_ROUTE_CACHE: list[dict[str, Any]] | None = None
_ROUTE_POLYLINE_CACHE: dict[str, list[tuple[float, float]]] = {}
_LAST_TELEMETRY_LOG_WRITE: dict[str, datetime] = {}
TELEMETRY_LOG_INTERVAL_SECONDS = 15

# --- Connection pooling: one SQLite database per country ---
_connections: dict[str, sqlite3.Connection] = {}
_db_initialized: set[str] = set()


_COUNTRY_NAME_TO_CODE = {
    "PHILIPPINES": "PH",
    "THAILAND": "TH",
    "VIETNAM": "VN",
    "MALAYSIA": "MY",
    "INDONESIA": "ID",
}

def normalize_country(country: str | None = None) -> str:
    if not country:
        return "PH"
    code = country.strip().upper()
    if code in COUNTRY_CODES:
        return code
    if code in _COUNTRY_NAME_TO_CODE:
        return _COUNTRY_NAME_TO_CODE[code]
    return "PH"


def database_path(country: str | None = None):
    code = normalize_country(country)
    return COUNTRY_DB_DIR / code / "loadsense.sqlite"


def route_geojson_path(country: str | None = None):
    code = normalize_country(country)
    return COUNTRY_DB_DIR / code / "routes" / f"{code}_osm_routes.geojson"


def _get_connection(country: str | None = None) -> sqlite3.Connection:
    """Return the country-specific connection, creating it if needed."""
    code = normalize_country(country)
    if code not in _connections:
        path = database_path(code)
        path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA cache_size=-8000;")  # 8MB cache
        _connections[code] = conn
    return _connections[code]


def _connect() -> sqlite3.Connection:
    """Legacy alias — returns shared connection instead of creating new ones."""
    return _get_connection("PH")


def init_db(country: str | None = None) -> None:
    """Initialize the database schema. Only runs once per country/process."""
    code = normalize_country(country)
    if code in _db_initialized:
        return
    conn = _get_connection(code)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS telemetry_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicle_id TEXT NOT NULL,
            route TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            occupancy INTEGER NOT NULL,
            capacity INTEGER NOT NULL,
            tier TEXT NOT NULL,
            source_timestamp TEXT NOT NULL,
            received_at TEXT NOT NULL,
            eta_minutes REAL NOT NULL,
            eta_source TEXT NOT NULL,
            next_stop_id INTEGER NOT NULL,
            route_deviation_json TEXT NOT NULL,
            signal_quality TEXT NOT NULL,
            speed_kph REAL,
            heading REAL,
            direction TEXT,
            status TEXT NOT NULL DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS vehicle_states (
            vehicle_id TEXT PRIMARY KEY,
            route TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            occupancy INTEGER NOT NULL,
            capacity INTEGER NOT NULL,
            tier TEXT NOT NULL,
            source_timestamp TEXT NOT NULL,
            received_at TEXT NOT NULL,
            eta_minutes REAL NOT NULL,
            eta_source TEXT NOT NULL,
            next_stop_id INTEGER NOT NULL,
            route_deviation_json TEXT NOT NULL,
            signal_quality TEXT NOT NULL,
            speed_kph REAL,
            heading REAL,
            direction TEXT,
            status TEXT NOT NULL DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS operator_alerts (
            id TEXT PRIMARY KEY,
            severity TEXT NOT NULL,
            vehicle_id TEXT NOT NULL,
            route TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            acknowledged INTEGER NOT NULL DEFAULT 0,
            verification_status TEXT NOT NULL DEFAULT 'open',
            resolution_note TEXT,
            verified_at TEXT
        );

        CREATE TABLE IF NOT EXISTS operator_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            alert_id TEXT NOT NULL,
            vehicle_id TEXT NOT NULL,
            route TEXT NOT NULL,
            action TEXT NOT NULL,
            timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chatbot_queries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            route TEXT NOT NULL,
            query TEXT NOT NULL,
            answer TEXT NOT NULL,
            timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS routes (
            route TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            polyline_json TEXT NOT NULL,
            country TEXT,
            region TEXT,
            tag TEXT,
            route_type TEXT,
            origin_name TEXT,
            destination_name TEXT,
            distance_km REAL,
            description TEXT,
            minimum_fare REAL,
            fare_per_km REAL
        );

        CREATE TABLE IF NOT EXISTS route_points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            route TEXT NOT NULL REFERENCES routes(route) ON DELETE CASCADE,
            sequence_order INTEGER NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            point_type TEXT NOT NULL DEFAULT 'waypoint',
            label TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS vehicles (
            vehicle_id TEXT PRIMARY KEY,
            country TEXT NOT NULL DEFAULT '',
            route TEXT NOT NULL DEFAULT '',
            driver TEXT NOT NULL DEFAULT '',
            max_occupancy INTEGER NOT NULL DEFAULT 20,
            brand TEXT,
            model TEXT,
            plate_number TEXT,
            vehicle_type TEXT,
            year INTEGER,
            registration_number TEXT,
            status TEXT NOT NULL DEFAULT 'active'
        );

        /* ── Performance indexes ── */
        CREATE INDEX IF NOT EXISTS idx_telemetry_logs_route ON telemetry_logs(route);
        CREATE INDEX IF NOT EXISTS idx_telemetry_logs_vehicle_ts ON telemetry_logs(vehicle_id, received_at);
        CREATE INDEX IF NOT EXISTS idx_telemetry_logs_received ON telemetry_logs(received_at);
        CREATE INDEX IF NOT EXISTS idx_vehicle_states_route ON vehicle_states(route);
        CREATE INDEX IF NOT EXISTS idx_routes_country ON routes(country);
        CREATE INDEX IF NOT EXISTS idx_routes_country_region ON routes(country, region);
        CREATE INDEX IF NOT EXISTS idx_routes_country_tag ON routes(country, tag);
        CREATE INDEX IF NOT EXISTS idx_route_points_route ON route_points(route, sequence_order);
        CREATE INDEX IF NOT EXISTS idx_vehicles_country ON vehicles(country);
        CREATE INDEX IF NOT EXISTS idx_vehicles_route ON vehicles(route);
        CREATE INDEX IF NOT EXISTS idx_alerts_vehicle_ts ON operator_alerts(vehicle_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_alerts_status ON operator_alerts(verification_status);
        """
    )
    _ensure_vehicle_columns(conn)
    _ensure_alert_columns(conn)
    _ensure_route_columns(conn)
    conn.commit()
    _seed_routes_if_needed(conn, code)
    _db_initialized.add(code)


def init_all_country_dbs() -> None:
    for code in COUNTRY_CODES:
        init_db(code)


def _ensure_vehicle_columns(conn: sqlite3.Connection) -> None:
    for table in ["telemetry_logs", "vehicle_states"]:
        existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if "direction" not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN direction TEXT")
        if "status" not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(vehicles)").fetchall()}
    columns = {
        "brand": "TEXT",
        "model": "TEXT",
        "plate_number": "TEXT",
        "vehicle_type": "TEXT",
        "year": "INTEGER",
        "registration_number": "TEXT",
    }
    for column, definition in columns.items():
        if column not in existing:
            conn.execute(f"ALTER TABLE vehicles ADD COLUMN {column} {definition}")

def _ensure_alert_columns(conn: sqlite3.Connection) -> None:
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(operator_alerts)").fetchall()}
    if "verification_status" not in existing:
        conn.execute("ALTER TABLE operator_alerts ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'open'")
    if "resolution_note" not in existing:
        conn.execute("ALTER TABLE operator_alerts ADD COLUMN resolution_note TEXT")
    if "verified_at" not in existing:
        conn.execute("ALTER TABLE operator_alerts ADD COLUMN verified_at TEXT")


def _ensure_route_columns(conn: sqlite3.Connection) -> None:
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(routes)").fetchall()}
    columns = {
        "country": "TEXT",
        "region": "TEXT",
        "tag": "TEXT",
        "route_type": "TEXT",
        "origin_name": "TEXT",
        "destination_name": "TEXT",
        "distance_km": "REAL",
        "description": "TEXT",
        "minimum_fare": "REAL",
        "fare_per_km": "REAL",
    }
    for column, definition in columns.items():
        if column not in existing:
            conn.execute(f"ALTER TABLE routes ADD COLUMN {column} {definition}")


def _seed_routes_if_needed(conn: sqlite3.Connection, country_code: str) -> None:
    """Seed routes from GeoJSON files if the database is empty."""
    row = conn.execute("SELECT COUNT(*) AS count FROM routes").fetchone()
    if int(row["count"] if row else 0) > 0:
        return
    total = 0
    geojson_path = route_geojson_path(country_code)
    if not geojson_path.exists():
        return
    routes = _load_geojson_routes(geojson_path, country_code, max_routes=50, max_points=120)
    for route in routes:
        conn.execute(
            """
            INSERT OR IGNORE INTO routes (
                route, name, polyline_json, country, region,
                tag, route_type, origin_name, destination_name, distance_km, description, minimum_fare, fare_per_km
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)
            """,
            (
                route["route"],
                route["name"],
                json.dumps(route["polyline"]),
                country_code,
                route.get("region") or route.get("city") or "",
                route.get("tag") or route["route"],
                route.get("route_type") or "PUV",
                route.get("origin_name") or "",
                route.get("destination_name") or "",
            ),
        )
        total += 1
    if total > 0:
        conn.commit()


def _load_geojson_routes(
    path, country: str, max_routes: int = 50, max_points: int = 120
) -> list[dict[str, Any]]:
    """Load routes from a GeoJSON file. Limits to max_routes for performance."""
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    routes: list[dict[str, Any]] = []
    for index, feature in enumerate(payload.get("features", [])):
        if len(routes) >= max_routes:
            break
        props = feature.get("properties", {})
        geometry = feature.get("geometry", {})
        if geometry.get("type") != "LineString":
            continue
        route_id = str(props.get("route_id") or props.get("route") or f"{country}-{index + 1}").strip()
        name = str(props.get("route_name") or props.get("name") or route_id).strip()
        # GeoJSON is [lon, lat], convert to (lat, lon)
        raw_coords = geometry.get("coordinates", [])
        points = [(float(c[1]), float(c[0])) for c in raw_coords if len(c) >= 2]
        points = _sample_polyline(points, max_points=max_points)
        if route_id and name and len(points) >= 2:
            # Infer city from first coordinate
            city = infer_city(
                [{"latitude": points[0][0], "longitude": points[0][1]}],
                name,
            )
            routes.append({
                "route": route_id,
                "name": name,
                "polyline": points,
                "city": city or "",
                "province": props.get("province") or "",
                "region": props.get("region") or "",
                "tag": props.get("route_ref") or props.get("ref") or route_id,
                "route_type": props.get("route_type") or "PUV",
                "origin_name": props.get("origin_name") or "",
                "destination_name": props.get("destination_name") or "",
            })
    return routes


def _sample_polyline(points: list[tuple[float, float]], max_points: int) -> list[tuple[float, float]]:
    if len(points) <= max_points:
        return points
    sampled: list[tuple[float, float]] = []
    last_index = len(points) - 1
    for i in range(max_points):
        sampled.append(points[round((i / (max_points - 1)) * last_index)])
    result: list[tuple[float, float]] = []
    for point in sampled:
        if not result or point != result[-1]:
            result.append(point)
    return result


# ────────────────────────────────────────────────────────────────
# Region queries (for dropdown population)
# ────────────────────────────────────────────────────────────────

def get_regions_for_country(country: str) -> list[str]:
    """Return distinct region entries for routes in a country.
    Used to populate region dropdowns dynamically."""
    code = normalize_country(country)
    init_db(code)
    conn = _get_connection(code)
    rows = conn.execute(
        """
        SELECT DISTINCT region
        FROM routes
        WHERE country = ?
          AND COALESCE(region, '') != ''
          AND UPPER(region) <> UPPER(country)
        ORDER BY region
        """,
        (code,),
    ).fetchall()
    return [row["region"] for row in rows]


def get_countries_with_routes() -> list[str]:
    """Return country codes that have at least one route in the database."""
    countries: set[str] = set()
    for code in COUNTRY_CODES:
        init_db(code)
        conn = _get_connection(code)
        row = conn.execute("SELECT 1 FROM routes LIMIT 1").fetchone()
        if row is not None:
            countries.add(code)
    return sorted(countries)


def country_for_route(route: str, default: str = "PH") -> str:
    route_text = str(route or "")
    for code in COUNTRY_CODES:
        init_db(code)
        conn = _get_connection(code)
        row = conn.execute("SELECT country FROM routes WHERE route = ? OR tag = ? LIMIT 1", (route_text, route_text)).fetchone()
        if row and row["country"]:
            return normalize_country(row["country"])
    return normalize_country(default)


# ────────────────────────────────────────────────────────────────
# Vehicle state persistence
# ────────────────────────────────────────────────────────────────

def save_vehicle_state(state: VehicleState, received_at: str) -> None:
    country = country_for_route(state.route)
    init_db(country)
    data = model_to_dict(state)
    received_dt = datetime.fromisoformat(received_at.replace("Z", "+00:00"))
    last_log = _LAST_TELEMETRY_LOG_WRITE.get(state.vehicle_id)
    should_log = last_log is None or (received_dt - last_log).total_seconds() >= TELEMETRY_LOG_INTERVAL_SECONDS
    params = {
        "vehicle_id": state.vehicle_id,
        "route": state.route,
        "latitude": state.latitude,
        "longitude": state.longitude,
        "occupancy": state.occupancy,
        "capacity": state.capacity,
        "tier": state.tier,
        "source_timestamp": state.timestamp,
        "received_at": received_at,
        "eta_minutes": state.eta_minutes,
        "eta_source": state.eta_source,
        "next_stop_id": state.next_stop_id,
        "route_deviation_json": json.dumps(data["route_deviation"]),
        "signal_quality": state.signal_quality,
        "speed_kph": state.speed_kph,
        "heading": state.heading,
        "direction": state.direction,
        "status": state.status,
    }
    conn = _get_connection(country)
    if should_log:
        conn.execute(
            """
            INSERT INTO telemetry_logs (
                vehicle_id, route, latitude, longitude, occupancy, capacity, tier,
                source_timestamp, received_at, eta_minutes, eta_source, next_stop_id,
                route_deviation_json, signal_quality, speed_kph, heading, direction, status
            ) VALUES (
                :vehicle_id, :route, :latitude, :longitude, :occupancy, :capacity, :tier,
                :source_timestamp, :received_at, :eta_minutes, :eta_source, :next_stop_id,
                :route_deviation_json, :signal_quality, :speed_kph, :heading, :direction, :status
            )
            """,
            params,
        )
        _LAST_TELEMETRY_LOG_WRITE[state.vehicle_id] = received_dt
    conn.execute(
        """
        INSERT INTO vehicle_states (
            vehicle_id, route, latitude, longitude, occupancy, capacity, tier,
            source_timestamp, received_at, eta_minutes, eta_source, next_stop_id,
            route_deviation_json, signal_quality, speed_kph, heading, direction, status
        ) VALUES (
            :vehicle_id, :route, :latitude, :longitude, :occupancy, :capacity, :tier,
            :source_timestamp, :received_at, :eta_minutes, :eta_source, :next_stop_id,
            :route_deviation_json, :signal_quality, :speed_kph, :heading, :direction, :status
        )
        ON CONFLICT(vehicle_id) DO UPDATE SET
            route=excluded.route,
            latitude=excluded.latitude,
            longitude=excluded.longitude,
            occupancy=excluded.occupancy,
            capacity=excluded.capacity,
            tier=excluded.tier,
            source_timestamp=excluded.source_timestamp,
            received_at=excluded.received_at,
            eta_minutes=excluded.eta_minutes,
            eta_source=excluded.eta_source,
            next_stop_id=excluded.next_stop_id,
            route_deviation_json=excluded.route_deviation_json,
            signal_quality=excluded.signal_quality,
            speed_kph=excluded.speed_kph,
            heading=excluded.heading,
            direction=excluded.direction,
            status=excluded.status
        """,
        params,
    )
    conn.commit()


# ────────────────────────────────────────────────────────────────
# Alert persistence
# ────────────────────────────────────────────────────────────────

def save_alert(alert: OperatorAlert) -> None:
    country = country_for_route(alert.route)
    init_db(country)
    conn = _get_connection(country)
    conn.execute(
        """
        INSERT OR IGNORE INTO operator_alerts (
            id, severity, vehicle_id, route, message, timestamp, acknowledged,
            verification_status, resolution_note, verified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            alert.id,
            alert.severity,
            alert.vehicle_id,
            alert.route,
            alert.message,
            alert.timestamp,
            int(alert.acknowledged),
            alert.verification_status,
            alert.resolution_note,
            alert.verified_at,
        ),
    )
    conn.commit()


def acknowledge_alert(alert_id: str, timestamp: str) -> Optional[OperatorAlert]:
    return verify_alert(alert_id, "verified", "", timestamp)


def verify_alert(alert_id: str, action: str, note: str, timestamp: str) -> Optional[OperatorAlert]:
    normalized_action = action if action in {"verified", "false_alarm", "escalated"} else "verified"
    acknowledged = 0 if normalized_action == "escalated" else 1
    conn = None
    row = None
    for code in COUNTRY_CODES:
        init_db(code)
        candidate = _get_connection(code)
        row = candidate.execute("SELECT * FROM operator_alerts WHERE id = ?", (alert_id,)).fetchone()
        if row is not None:
            conn = candidate
            break
    if row is None:
        return None
    conn.execute(
        """
        UPDATE operator_alerts
        SET acknowledged = ?, verification_status = ?, resolution_note = ?, verified_at = ?
        WHERE id = ?
        """,
        (acknowledged, normalized_action, note, timestamp, alert_id),
    )
    conn.execute(
        """
        INSERT INTO operator_feedback (alert_id, vehicle_id, route, action, timestamp)
        VALUES (?, ?, ?, ?, ?)
        """,
        (alert_id, row["vehicle_id"], row["route"], f"{normalized_action}: {note}".strip(": "), timestamp),
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM operator_alerts WHERE id = ?", (alert_id,)).fetchone()
    return _alert_from_row(updated, acknowledged=bool(acknowledged))


def save_chat_query(route: str, query: str, answer: str, timestamp: str) -> None:
    try:
        country = country_for_route(str(route))
        init_db(country)
        conn = _get_connection(country)
        conn.execute(
            "INSERT INTO chatbot_queries (route, query, answer, timestamp) VALUES (?, ?, ?, ?)",
            (str(route), str(query), str(answer), str(timestamp)),
        )
        conn.commit()
    except Exception as e:
        print(f"Warning: Failed to save chat query: {e}")


def save_operator_feedback(alert_id: str, vehicle_id: str, route: str, action: str, timestamp: str) -> None:
    country = country_for_route(route)
    init_db(country)
    conn = _get_connection(country)
    conn.execute(
        """
        INSERT INTO operator_feedback (alert_id, vehicle_id, route, action, timestamp)
        VALUES (?, ?, ?, ?, ?)
        """,
        (alert_id, vehicle_id, route, action, timestamp),
    )
    conn.commit()


# ────────────────────────────────────────────────────────────────
# Data loading
# ────────────────────────────────────────────────────────────────

def load_vehicle_states(country: str | None = None) -> list[VehicleState]:
    countries = [normalize_country(country)] if country else list(COUNTRY_CODES)
    result: list[VehicleState] = []
    for code in countries:
        init_db(code)
        conn = _get_connection(code)
        rows = conn.execute("SELECT * FROM vehicle_states").fetchall()
        result.extend(_vehicle_from_row(row) for row in rows)
    return result


def load_alerts(country: str | None = None) -> list[OperatorAlert]:
    countries = [normalize_country(country)] if country else list(COUNTRY_CODES)
    result: list[OperatorAlert] = []
    for code in countries:
        init_db(code)
        conn = _get_connection(code)
        rows = conn.execute("SELECT * FROM operator_alerts").fetchall()
        result.extend(_alert_from_row(row) for row in rows)
    return result


def has_open_alert(vehicle_id: str, message: str) -> bool:
    for code in COUNTRY_CODES:
        init_db(code)
        conn = _get_connection(code)
        row = conn.execute(
            """
            SELECT 1 FROM operator_alerts
            WHERE vehicle_id = ? AND message = ? AND (verification_status = 'open' OR acknowledged = 0)
            LIMIT 1
            """,
            (vehicle_id, message)
        ).fetchone()
        if row is not None:
            return True
    return False


def has_recent_vehicle_alert(vehicle_id: str, minutes: int = 10) -> bool:
    cutoff = (datetime.now(UTC) - timedelta(minutes=minutes)).isoformat()
    for code in COUNTRY_CODES:
        init_db(code)
        conn = _get_connection(code)
        row = conn.execute(
            """
            SELECT 1 FROM operator_alerts
            WHERE vehicle_id = ? AND timestamp >= ?
            LIMIT 1
            """,
            (vehicle_id, cutoff),
        ).fetchone()
        if row is not None:
            return True
    return False


# ────────────────────────────────────────────────────────────────
# Vehicle CRUD
# ────────────────────────────────────────────────────────────────

def list_vehicles(country: str | None = None) -> list[dict[str, Any]]:
    if country:
        code = normalize_country(country)
        init_db(code)
        conn = _get_connection(code)
        rows = conn.execute(
            """
            SELECT vehicle_id, country, route, driver, max_occupancy, brand, model,
                   plate_number, vehicle_type, year, registration_number, status
            FROM vehicles
            WHERE country = ?
            ORDER BY vehicle_id
            """,
            (code,),
        ).fetchall()
        return [dict(row) for row in rows]
    result: list[dict[str, Any]] = []
    for code in COUNTRY_CODES:
        init_db(code)
        conn = _get_connection(code)
        rows = conn.execute(
            """
            SELECT vehicle_id, country, route, driver, max_occupancy, brand, model,
                   plate_number, vehicle_type, year, registration_number, status
            FROM vehicles
            ORDER BY vehicle_id
            """
        ).fetchall()
        result.extend(dict(row) for row in rows)
    return sorted(result, key=lambda row: (row.get("country") or "", row.get("vehicle_id") or ""))


def save_vehicle(
    vehicle_id: str,
    country: str,
    route: str,
    driver: str,
    max_occupancy: int,
    brand: str | None = None,
    model: str | None = None,
    plate_number: str | None = None,
    vehicle_type: str | None = None,
    year: int | None = None,
    registration_number: str | None = None,
    status: str = "active",
) -> None:
    code = normalize_country(country)
    init_db(code)
    conn = _get_connection(code)
    conn.execute(
        """
        INSERT INTO vehicles (
            vehicle_id, country, route, driver, max_occupancy, brand, model,
            plate_number, vehicle_type, year, registration_number, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(vehicle_id) DO UPDATE SET
            country=excluded.country,
            route=excluded.route,
            driver=excluded.driver,
            max_occupancy=excluded.max_occupancy,
            brand=excluded.brand,
            model=excluded.model,
            plate_number=excluded.plate_number,
            vehicle_type=excluded.vehicle_type,
            year=excluded.year,
            registration_number=excluded.registration_number,
            status=excluded.status
        """,
        (
            vehicle_id, code, route, driver, max_occupancy, brand, model,
            plate_number, vehicle_type, year, registration_number, status,
        ),
    )
    conn.commit()


def delete_vehicle(vehicle_id: str) -> None:
    for code in COUNTRY_CODES:
        init_db(code)
        conn = _get_connection(code)
        conn.execute("DELETE FROM vehicles WHERE vehicle_id = ?", (vehicle_id,))
        conn.commit()


# ────────────────────────────────────────────────────────────────
# Incident / alert queries
# ────────────────────────────────────────────────────────────────

def list_incidents(limit: int = 50, country: str | None = None) -> list[dict[str, Any]]:
    countries = [normalize_country(country)] if country else list(COUNTRY_CODES)
    result: list[dict[str, Any]] = []
    for code in countries:
        init_db(code)
        conn = _get_connection(code)
        rows = conn.execute(
            """
            SELECT id, severity, vehicle_id, route, message, timestamp, acknowledged,
                   verification_status, resolution_note, verified_at
            FROM operator_alerts
            ORDER BY timestamp DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        result.extend(dict(row) | {"acknowledged": bool(row["acknowledged"])} for row in rows)
    return sorted(result, key=lambda row: row.get("timestamp") or "", reverse=True)[:limit]


# ────────────────────────────────────────────────────────────────
# Database status / maintenance
# ────────────────────────────────────────────────────────────────

def database_status(country: str | None = None) -> dict[str, Any]:
    countries = [normalize_country(country)] if country else list(COUNTRY_CODES)
    tables = ["telemetry_logs", "vehicle_states", "operator_alerts", "operator_feedback", "chatbot_queries", "routes", "route_points", "vehicles"]
    counts = {table: 0 for table in tables}
    load_rows: list[dict[str, Any]] = []
    vehicle_rows: list[dict[str, Any]] = []
    alert_totals: dict[str, int] = {}
    recent_chats: list[dict[str, Any]] = []
    country_statuses: dict[str, Any] = {}
    for code in countries:
        init_db(code)
        conn = _get_connection(code)
        country_counts = {
            table: conn.execute(f"SELECT COUNT(*) AS count FROM {table}").fetchone()["count"]
            for table in tables
        }
        for table, count in country_counts.items():
            counts[table] += int(count)
        country_statuses[code] = {
            "path": str(database_path(code)),
            "exists": database_path(code).exists(),
            "tables": country_counts,
        }
        load_rows.extend(dict(row) | {"country": code} for row in conn.execute(
            """
            WITH recent_logs AS (
                SELECT route, occupancy, tier
                FROM telemetry_logs
                ORDER BY id DESC
                LIMIT 5000
            )
            SELECT route,
                   COUNT(*) AS samples,
                   ROUND(AVG(occupancy), 2) AS average_occupancy,
                   SUM(CASE WHEN tier = 'blinking_red' THEN 1 ELSE 0 END) AS overloaded_samples
            FROM recent_logs
            GROUP BY route
            ORDER BY samples DESC, route
            LIMIT 8
            """
        ).fetchall())
        vehicle_rows.extend(dict(row) | {"country": code} for row in conn.execute(
            """
            SELECT route,
                   COUNT(*) AS vehicles,
                   ROUND(AVG(occupancy), 2) AS average_occupancy,
                   SUM(CASE WHEN tier IN ('red', 'blinking_red') THEN 1 ELSE 0 END) AS crowded
            FROM vehicle_states
            GROUP BY route
            ORDER BY vehicles DESC, route
            LIMIT 8
            """
        ).fetchall())
        for row in conn.execute(
            """
            SELECT verification_status, COUNT(*) AS count
            FROM operator_alerts
            GROUP BY verification_status
            ORDER BY count DESC
            """
        ).fetchall():
            alert_totals[row["verification_status"]] = alert_totals.get(row["verification_status"], 0) + int(row["count"])
        recent_chats.extend(dict(row) | {"country": code} for row in conn.execute(
            """
            SELECT route, query, answer, timestamp
            FROM chatbot_queries
            ORDER BY timestamp DESC
            LIMIT 5
            """
        ).fetchall())
    recent_chats = sorted(recent_chats, key=lambda row: row.get("timestamp") or "", reverse=True)[:5]
    alert_rows = [{"verification_status": key, "count": value} for key, value in sorted(alert_totals.items())]
    return {
        "path": str(database_path(countries[0])) if country else str(COUNTRY_DB_DIR),
        "exists": database_path(countries[0]).exists() if country else COUNTRY_DB_DIR.exists(),
        "country": countries[0] if country else None,
        "countries": country_statuses,
        "tables": counts,
        "stats": {
            "telemetry_samples": counts.get("telemetry_logs", 0),
            "active_vehicle_routes": len(vehicle_rows),
            "chat_queries": counts.get("chatbot_queries", 0),
            "open_alerts": sum(row["count"] for row in alert_rows if row["verification_status"] == "open"),
        },
        "route_loads": load_rows[:8],
        "vehicle_routes": vehicle_rows[:8],
        "alert_statuses": alert_rows,
        "recent_chats": recent_chats,
    }


def purge_old_telemetry(days: int = 7, country: str | None = None) -> int:
    """Delete telemetry logs older than N days. Returns count of deleted rows."""
    cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()
    deleted = 0
    countries = [normalize_country(country)] if country else list(COUNTRY_CODES)
    for code in countries:
        init_db(code)
        conn = _get_connection(code)
        cursor = conn.execute("DELETE FROM telemetry_logs WHERE received_at < ?", (cutoff,))
        conn.commit()
        deleted += cursor.rowcount
    return deleted


def reset_database(country: str | None = None) -> None:
    countries = [normalize_country(country)] if country else list(COUNTRY_CODES)
    for code in countries:
        init_db(code)
        conn = _get_connection(code)
        conn.execute("DELETE FROM vehicles")
        conn.execute("DELETE FROM route_points")
        conn.execute("DELETE FROM routes")
        conn.execute("DELETE FROM operator_alerts")
        conn.execute("DELETE FROM operator_feedback")
        conn.execute("DELETE FROM telemetry_logs")
        conn.execute("DELETE FROM vehicle_states")
        conn.execute("DELETE FROM chatbot_queries")
        conn.commit()
        _seed_routes_if_needed(conn, code)
        seed_demo_vehicles(conn=conn)
    invalidate_route_cache()
    _LAST_TELEMETRY_LOG_WRITE.clear()


def delete_all_alerts(country: str | None = None) -> None:
    countries = [normalize_country(country)] if country else list(COUNTRY_CODES)
    for code in countries:
        init_db(code)
        conn = _get_connection(code)
        conn.execute("DELETE FROM operator_alerts")
        conn.execute("DELETE FROM operator_feedback")
        conn.commit()


def seed_demo_vehicles(vehicles_per_route: int = 3, conn: sqlite3.Connection | None = None) -> int:
    """Seed demo vehicles — reduced to 3 per route for lean demo."""
    active_conn = conn or _get_connection()
    drivers = [
        "Jun Mercado", "Rico Santos", "Lito Garcia", "Benjie Cruz", "Mario Flores",
        "Nestor Ramos", "Allan Dela Cruz", "Romy Villanueva", "Edwin Castro", "Noel Reyes",
    ]
    prefixes = ["NGA", "CBA", "CEB", "VHY", "GTR", "KLM", "TAL", "MVD", "BJR", "RPU"]
    route_rows = active_conn.execute(
        "SELECT route, country FROM routes ORDER BY route"
    ).fetchall()
    count = 0
    for route_index, route_row in enumerate(route_rows):
        route_id = route_row["route"]
        for vehicle_index in range(max(1, vehicles_per_route)):
            plate = f"{prefixes[(route_index + vehicle_index) % len(prefixes)]}-{route_index % 10}{vehicle_index}{(route_index + vehicle_index) % 10}{vehicle_index}"
            active_conn.execute(
                """
                INSERT OR REPLACE INTO vehicles (vehicle_id, country, route, driver, max_occupancy, status)
                VALUES (?, ?, ?, ?, ?, 'active')
                """,
                (
                    plate,
                    route_row["country"] or "PH",
                    route_id,
                    drivers[(route_index + vehicle_index) % len(drivers)],
                    20 if vehicle_index % 3 else 22,
                ),
            )
            count += 1
    active_conn.commit()
    return count


# ────────────────────────────────────────────────────────────────
# Route CRUD
# ────────────────────────────────────────────────────────────────

def save_route(
    route: str,
    name: str,
    polyline: list[tuple[float, float]],
    country: str | None = None,
    region: str | None = None,
    tag: str | None = None,
    route_type: str | None = None,
    origin_name: str | None = None,
    destination_name: str | None = None,
    distance_km: float | None = None,
    description: str | None = None,
    minimum_fare: float | None = None,
    fare_per_km: float | None = None,
    points: list[dict[str, Any]] | None = None,
) -> None:
    code = normalize_country(country)
    init_db(code)
    route_points = points or [
        {
            "sequence_order": index + 1,
            "latitude": lat,
            "longitude": lon,
            "point_type": "origin" if index == 0 else "destination" if index == len(polyline) - 1 else "waypoint",
            "label": "",
        }
        for index, (lat, lon) in enumerate(polyline)
    ]
    conn = _get_connection(code)
    conn.execute(
        """
        INSERT INTO routes (
            route, name, polyline_json, country, region, tag, route_type,
            origin_name, destination_name, distance_km, description, minimum_fare, fare_per_km
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(route) DO UPDATE SET
            name=excluded.name,
            polyline_json=excluded.polyline_json,
            country=excluded.country,
            region=excluded.region,
            tag=excluded.tag,
            route_type=excluded.route_type,
            origin_name=excluded.origin_name,
            destination_name=excluded.destination_name,
            distance_km=excluded.distance_km,
            description=excluded.description,
            minimum_fare=excluded.minimum_fare,
            fare_per_km=excluded.fare_per_km
        """,
        (route, name, json.dumps(polyline), code, region, tag, route_type, origin_name, destination_name, distance_km, description, minimum_fare, fare_per_km),
    )
    conn.execute("DELETE FROM route_points WHERE route = ?", (route,))
    conn.executemany(
        """
        INSERT INTO route_points (route, sequence_order, latitude, longitude, point_type, label)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (
                route,
                int(point.get("sequence_order") or index + 1),
                float(point["latitude"]),
                float(point["longitude"]),
                str(point.get("point_type") or "waypoint"),
                str(point.get("label") or ""),
            )
            for index, point in enumerate(route_points)
        ],
    )
    conn.commit()
    invalidate_route_cache()


def delete_route(route: str, country: str | None = None) -> None:
    countries = [normalize_country(country)] if country else list(COUNTRY_CODES)
    for code in countries:
        init_db(code)
        conn = _get_connection(code)
        conn.execute("DELETE FROM routes WHERE route = ? OR tag = ?", (route, route))
        conn.commit()
    invalidate_route_cache()


def invalidate_route_cache() -> None:
    global _ROUTE_CACHE
    _ROUTE_CACHE = None
    _ROUTE_POLYLINE_CACHE.clear()


def route_exists(route: str, country: str | None = None) -> bool:
    countries = [normalize_country(country)] if country else list(COUNTRY_CODES)
    for code in countries:
        init_db(code)
        conn = _get_connection(code)
        row = conn.execute("SELECT 1 FROM routes WHERE route = ? OR tag = ? LIMIT 1", (route, route)).fetchone()
        if row is not None:
            return True
    return False


def route_name_exists(name: str, exclude_route: str | None = None, country: str | None = None) -> bool:
    countries = [normalize_country(country)] if country else list(COUNTRY_CODES)
    sql = "SELECT route FROM routes WHERE lower(name) = lower(?)"
    params: tuple[Any, ...] = (name,)
    if exclude_route:
        sql += " AND route <> ? AND COALESCE(tag, '') <> ?"
        params = (*params, exclude_route, exclude_route)
    for code in countries:
        init_db(code)
        conn = _get_connection(code)
        row = conn.execute(sql, params).fetchone()
        if row is not None:
            return True
    return False


def load_route_polyline(route: str) -> list[tuple[float, float]]:
    cache_key = route
    if cache_key in _ROUTE_POLYLINE_CACHE:
        return list(_ROUTE_POLYLINE_CACHE[cache_key])
    row = None
    for code in COUNTRY_CODES:
        init_db(code)
        conn = _get_connection(code)
        row = conn.execute("SELECT polyline_json FROM routes WHERE route = ? OR tag = ? LIMIT 1", (route, route)).fetchone()
        if row is not None:
            break
    if row is None:
        return []
    try:
        points = json.loads(row["polyline_json"]) if row["polyline_json"] else []
    except Exception:
        return []
    polyline = [(float(lat), float(lon)) for lat, lon in points]
    _ROUTE_POLYLINE_CACHE[cache_key] = polyline
    return list(polyline)


def load_routes(country: str | None = None) -> list[dict[str, Any]]:
    """Load routes with optional country filter. Uses caching."""
    global _ROUTE_CACHE
    if _ROUTE_CACHE is not None:
        result = _ROUTE_CACHE
        if country:
            code = normalize_country(country)
            result = [r for r in result if (r.get("country") or "") == code]
        return deepcopy(result)
    result: list[dict[str, Any]] = []
    for code in COUNTRY_CODES:
        init_db(code)
        conn = _get_connection(code)
        rows = conn.execute(
            "SELECT route, name, polyline_json, country, region, tag, route_type, origin_name, destination_name, distance_km, description, minimum_fare, fare_per_km FROM routes"
        ).fetchall()
        point_rows = conn.execute(
            "SELECT route, sequence_order, latitude, longitude, point_type, label FROM route_points ORDER BY route, sequence_order"
        ).fetchall()
        points_by_route: dict[str, list[dict[str, Any]]] = {}
        for point in point_rows:
            item = dict(point)
            item["name"] = item.get("label") or item.get("point_type") or f"Point {item.get('sequence_order', '')}".strip()
            points_by_route.setdefault(point["route"], []).append(item)
        for row in rows:
            try:
                poly = json.loads(row["polyline_json"]) if row["polyline_json"] else []
            except Exception:
                poly = []
            metadata = route_metadata(row["route"])
            structured_points = points_by_route.get(row["route"], [])
            stops = structured_points or metadata.get("stops") or _display_stops(poly, row["name"])
            city = metadata.get("city") or ""
            endpoints = metadata.get("endpoints") or ([stops[0]["name"], stops[-1]["name"]] if len(stops) >= 2 else [])
            result.append({
                "route": row["route"],
                "name": row["name"],
                "country": row["country"] or code,
                "region": row["region"],
                "tag": row["tag"],
                "route_type": row["route_type"],
                "origin_name": row["origin_name"],
                "destination_name": row["destination_name"],
                "distance_km": row["distance_km"],
                "description": row["description"],
                "minimum_fare": row["minimum_fare"],
                "fare_per_km": row["fare_per_km"],
                "polyline": [{"latitude": float(lat), "longitude": float(lon)} for lat, lon in poly],
                "points": structured_points,
                "stops": stops,
                "zone": metadata.get("zone") or city,
                "type": metadata.get("type") or "PUV",
                "landmarks": metadata.get("landmarks") or [stop["name"] for stop in stops[:6]],
                "endpoints": endpoints,
            })
    _ROUTE_CACHE = result
    filtered = result
    if country:
        code = normalize_country(country)
        filtered = [r for r in result if (r.get("country") or "") == code]
    return deepcopy(filtered)


def _display_stops(poly: list[list[float]] | list[tuple[float, float]], name: str) -> list[dict[str, Any]]:
    if not poly:
        return []
    if len(poly) <= 8:
        indexes = list(range(len(poly)))
    else:
        indexes = sorted({0, len(poly) - 1, *[round((len(poly) - 1) * ratio) for ratio in (0.2, 0.35, 0.5, 0.65, 0.8)]})
    labels = ["Origin", "Checkpoint 1", "Checkpoint 2", "Mid-route", "Checkpoint 3", "Checkpoint 4", "Terminal"]
    stops = []
    for display_index, point_index in enumerate(indexes):
        lat, lon = poly[point_index]
        label = labels[min(display_index, len(labels) - 1)]
        stops.append({
            "stop_id": point_index,
            "name": f"{name} {label}",
            "latitude": float(lat),
            "longitude": float(lon),
        })
    return stops


# ────────────────────────────────────────────────────────────────
# Row converters
# ────────────────────────────────────────────────────────────────

def _vehicle_from_row(row: sqlite3.Row) -> VehicleState:
    return VehicleState(
        vehicle_id=row["vehicle_id"],
        route=row["route"],
        latitude=row["latitude"],
        longitude=row["longitude"],
        occupancy=row["occupancy"],
        capacity=row["capacity"],
        tier=row["tier"],
        timestamp=row["source_timestamp"],
        eta_minutes=row["eta_minutes"],
        eta_source=row["eta_source"],
        next_stop_id=row["next_stop_id"],
        route_deviation=json.loads(row["route_deviation_json"]),
        signal_quality=row["signal_quality"],
        speed_kph=row["speed_kph"],
        heading=row["heading"],
        direction=row["direction"],
        status=row["status"] or "active",
    )


def _alert_from_row(row: sqlite3.Row, acknowledged: Optional[bool] = None) -> OperatorAlert:
    return OperatorAlert(
        id=row["id"],
        severity=row["severity"],
        vehicle_id=row["vehicle_id"],
        route=row["route"],
        message=row["message"],
        timestamp=row["timestamp"],
        acknowledged=bool(row["acknowledged"]) if acknowledged is None else acknowledged,
        verification_status=row["verification_status"] or "open",
        resolution_note=row["resolution_note"],
        verified_at=row["verified_at"],
    )
