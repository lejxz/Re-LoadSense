import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Tuple


REPO_ROOT = Path(__file__).resolve().parents[3]
CONFIG_PATH = REPO_ROOT / "config" / "project_config.json"


@lru_cache(maxsize=1)
def get_config() -> Dict[str, Any]:
    with CONFIG_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def config_value(*keys: str, default: Any = None) -> Any:
    value: Any = get_config()
    for key in keys:
        if not isinstance(value, dict) or key not in value:
            return default
        value = value[key]
    return value


def repo_path(relative_path: str) -> Path:
    return REPO_ROOT / relative_path


def default_route() -> str:
    return config_value("project", "default_route", default="04L")


def route_names() -> Dict[str, str]:
    """Get route names from config. Returns empty dict if not configured."""
    routes = config_value("routes", default={})
    if not routes or not isinstance(routes, dict):
        return {}
    return {
        route: details.get("name", route)
        for route, details in routes.items()
        if isinstance(details, dict)
    }


def route_polylines() -> Dict[str, List[Tuple[float, float]]]:
    """Get route polylines from config. Returns empty dict if not configured."""
    routes = config_value("routes", default={})
    if not routes or not isinstance(routes, dict):
        return {}
    return {
        route: [(float(lat), float(lon)) for lat, lon in details.get("polyline", [])]
        for route, details in routes.items()
        if isinstance(details, dict) and details.get("polyline")
    }


def is_demo_mode() -> bool:
    """Check if the application should run in demo mode."""
    import os
    return os.environ.get("DEMO_MODE", "true").lower() in ("1", "true", "yes")
