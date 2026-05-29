from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class TripCandidatesRequest(BaseModel):
    trip_id: str | None = None
    user_id: str = "demo_user"
    departure_location: str
    destination: str
    travel_date: str
    start_time: str = "09:00"
    people_count: int = 1
    special_groups: list[str] = Field(default_factory=list)
    preferences: list[str] = Field(default_factory=list)
    intensity: str = "medium"
    budget_level: str = "medium"


class TripSelectRequest(BaseModel):
    trip_id: str
    selected_card_ids: list[str]


class TripIdRequest(BaseModel):
    trip_id: str


class OrderActionRequest(BaseModel):
    trip_id: str
    order_id: str | None = None
    card_id: str | None = None


class RuntimeUpdateRequest(BaseModel):
    trip_id: str
    current_location: dict[str, Any] = Field(default_factory=dict)
    page_stay_seconds: int = 0
    weather: dict[str, Any] | None = None
    checkin_status: dict[str, Any] | None = None
    next_route: dict[str, Any] | None = None
    trace_points: list[dict[str, Any]] = Field(default_factory=list)


class RecommendRequest(BaseModel):
    trip_id: str
    trigger_type: str = "manual"
    page_stay_seconds: int = 0
    is_meal_time: bool = False
    current_location: dict[str, Any] = Field(default_factory=dict)
