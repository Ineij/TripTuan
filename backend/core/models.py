from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal


TripStage = Literal["planning", "selection", "confirmed", "executing", "completed"]


@dataclass(slots=True)
class TripState:
    trip_id: str
    user_id: str
    stage: TripStage
    structured_request: dict[str, Any]
    candidate_cards: list[dict[str, Any]] = field(default_factory=list)
    selected_cards: list[dict[str, Any]] = field(default_factory=list)
    static_board: list[dict[str, Any]] = field(default_factory=list)
    route_plan: dict[str, Any] = field(default_factory=dict)
    dynamic_board: list[dict[str, Any]] = field(default_factory=list)
    current_location: dict[str, Any] = field(default_factory=dict)
    weather: dict[str, Any] = field(default_factory=dict)
    order_status: dict[str, Any] = field(default_factory=dict)
    checkin_status: dict[str, Any] = field(default_factory=dict)
    runtime_context: dict[str, Any] = field(default_factory=dict)
    runtime_events: list[dict[str, Any]] = field(default_factory=list)
    recommendations: list[dict[str, Any]] = field(default_factory=list)
    poster: dict[str, Any] = field(default_factory=dict)
    ai_trace: list[dict[str, Any]] = field(default_factory=list)
    langgraph_trace: list[dict[str, Any]] = field(default_factory=list)
    supervisor_trace: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
