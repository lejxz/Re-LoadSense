import json
import pickle
from functools import lru_cache
from typing import Any, Dict, List

import pandas as pd

from backend.app.core.config import config_value, repo_path

ETA_MODEL_PATH = repo_path(config_value("artifacts", "eta_model", default="cloud/artifacts/eta_model.pkl"))
DEMAND_FORECAST_DIR = repo_path(config_value("artifacts", "demand_forecast_dir", default="cloud/artifacts/demand"))
COUNTRY_CODES = {"PH", "TH", "VN", "MY", "ID"}


@lru_cache(maxsize=1)
def load_eta_model() -> Any:
    if ETA_MODEL_PATH.exists():
        with ETA_MODEL_PATH.open("rb") as handle:
            return pickle.load(handle)
    return None


def predict_eta(stop_id: int, time_of_day: float = 8.0, traffic_factor: float = 1.0, route: str = "04L") -> float:
    return predict_eta_details(stop_id=stop_id, time_of_day=time_of_day, traffic_factor=traffic_factor, route=route)["eta_minutes"]


def predict_eta_details(stop_id: int, time_of_day: float = 8.0, traffic_factor: float = 1.0, route: str = "04L") -> Dict[str, Any]:
    model = load_eta_model()
    if model is None:
        eta_minutes = round(
            float(config_value("eta_fallback", "base_minutes", default=5.0))
            + stop_id * float(config_value("eta_fallback", "stop_weight", default=0.75))
            + traffic_factor * float(config_value("eta_fallback", "traffic_weight", default=1.5))
            + time_of_day * float(config_value("eta_fallback", "time_of_day_weight", default=0.05)),
            2,
        )
        return {"eta_minutes": eta_minutes, "source": "fallback"}

    frame = pd.DataFrame(
        [{
            "stop_index": stop_id,
            "time_of_day": time_of_day,
            "traffic_factor": traffic_factor,
            "route": route,
        }]
    )
    prediction = model.predict(frame)[0]
    return {"eta_minutes": round(float(prediction), 2), "source": "model"}


import datetime
import random
import math

def _normalize_country(country: str | None = None) -> str:
    code = (country or "PH").strip().upper()
    return code if code in COUNTRY_CODES else "PH"


def _demand_forecast_path(country: str) -> Any:
    return DEMAND_FORECAST_DIR / f"{_normalize_country(country)}_demand_forecast.json"


def load_demand_forecast(country: str | None = None) -> Dict[str, Any]:
    if country:
        country_code = _normalize_country(country)
        country_path = _demand_forecast_path(country_code)
        if country_path.exists():
            try:
                payload = json.loads(country_path.read_text(encoding="utf-8"))
                payload.setdefault("country", country_code)
                return payload
            except Exception:
                pass
    else:
        combined: list[dict[str, Any]] = []
        for code in sorted(COUNTRY_CODES):
            country_path = _demand_forecast_path(code)
            if not country_path.exists():
                continue
            try:
                payload = json.loads(country_path.read_text(encoding="utf-8"))
                for item in payload.get("forecast", []):
                    combined.append(dict(item) | {"country": code})
            except Exception:
                continue
        if combined:
            return {
                "forecast": combined,
                "model": "country_scoped_aggregate",
                "generated_at": None,
                "country": None,
            }

    from backend.app.core.routes import list_routes
    routes = list_routes()
    if country:
        country_code = _normalize_country(country)
        routes = [r for r in routes if (r.get("country") or country_code) == country_code]
    else:
        country_code = None

    now = datetime.datetime.now(datetime.timezone.utc)
    start_time = now.replace(minute=0, second=0, microsecond=0)
    
    forecast = []
    
    for route in routes:
        route_id = route["route"]
        base_load = (sum(ord(c) for c in route_id) % 5) + 3
        
        for i in range(24):
            t = start_time + datetime.timedelta(hours=i)
            hour = t.hour
            morning_peak = math.exp(-0.5 * ((hour - 8) / 2) ** 2)
            evening_peak = math.exp(-0.5 * ((hour - 18) / 2.5) ** 2)
            
            noise = random.uniform(-0.5, 0.5)
            expected_load = base_load + (morning_peak * 4) + (evening_peak * 5) + noise
            expected_load = max(1.0, round(expected_load, 2))
            
            forecast.append({
                "route": route_id,
                "timestamp": t.isoformat(),
                "expected_load": expected_load
            })
            
    return {
        "forecast": forecast,
        "model": "dynamic_simulation",
        "generated_at": now.isoformat(),
        "country": country_code,
    }
