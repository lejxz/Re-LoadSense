from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class RoutePoint(BaseModel):
    sequence_order: int
    latitude: float
    longitude: float
    point_type: str
    label: str


class VehicleState(BaseModel):
    vehicle_id: str
    route: str
    latitude: float
    longitude: float
    occupancy: int
    capacity: int
    tier: str
    timestamp: str
    eta_minutes: float
    eta_source: str
    next_stop_id: int
    route_deviation: Dict[str, Any]
    signal_quality: str = "ok"
    speed_kph: Optional[float] = None
    heading: Optional[float] = None
    direction: Optional[str] = None
    status: str = "active"


class OperatorAlert(BaseModel):
    id: str
    severity: str
    vehicle_id: str
    route: str
    message: str
    timestamp: str
    acknowledged: bool = False
    verification_status: str = "open"
    resolution_note: Optional[str] = None
    verified_at: Optional[str] = None


class Vehicle(BaseModel):
    vehicle_id: str
    country: str
    route: str
    driver: str
    max_occupancy: int
    brand: Optional[str] = None
    model: Optional[str] = None
    plate_number: Optional[str] = None
    vehicle_type: Optional[str] = None
    year: Optional[int] = None
    registration_number: Optional[str] = None
    status: str = "active"
