from __future__ import annotations

import math
from typing import Any

from backend.tools import amap as tools
from backend.core.models import TripState
from backend.core.state_store import TripStateStore


class RuntimeContextTool:
    name = "RuntimeContextTool"

    def run(
        self,
        state: TripState,
        runtime_payload: dict[str, Any],
        store: TripStateStore,
    ) -> TripState:
        page_stay_seconds = int(runtime_payload.get("page_stay_seconds") or 0)
        current_location = dict(runtime_payload.get("current_location") or {})
        weather_snapshot = runtime_payload.get("weather") or state.weather
        next_route = runtime_payload.get("next_route") or self._infer_next_route(state)
        trace_points = runtime_payload.get("trace_points") or []

        if current_location:
            current_location["regeo"] = tools.reverse_geocode(current_location)
            state.current_location = current_location

        checkin_status = runtime_payload.get("checkin_status")
        if checkin_status is None and current_location:
            checkin_status = tools.evaluate_checkin(
                trip_id=state.trip_id,
                current_location=current_location,
                selected_cards=state.selected_cards,
                previous_status=state.checkin_status,
                stay_seconds=page_stay_seconds,
            )
        elif checkin_status is None:
            checkin_status = state.checkin_status
        state.checkin_status = checkin_status or tools.get_checkin_status(state.trip_id)

        state.order_status = store.get_order_status(state.trip_id)
        mapmatch_status = tools.match_trace(trace_points)
        route_progress = self._route_progress(current_location, next_route)
        taxi_quote = (
            tools.get_taxi_quote(next_route)
            if next_route and next_route.get("taxi_recommended")
            else None
        )

        flags = {
            "page_stay_over_10s": page_stay_seconds >= 10,
            "weather_risk": ((weather_snapshot or {}).get("rain_probability") or 0) >= 50,
            "checked_in_now": bool(state.checkin_status.get("checked_in_now")),
            "route_deviation": self._route_deviation(mapmatch_status),
            "taxi_recommended": bool(next_route and next_route.get("taxi_recommended")),
            "has_trace_points": bool(trace_points),
            "has_location": bool(current_location),
        }

        state.runtime_context = {
            "tool": self.name,
            "source": "deterministic_runtime_context",
            "external_api": any(
                source == "amap"
                for source in [
                    current_location.get("regeo", {}).get("source"),
                    mapmatch_status.get("source"),
                ]
            ),
            "subtool_sources": {
                "regeo": current_location.get("regeo", {}).get("source"),
                "checkin": state.checkin_status.get("source"),
                "orders": state.order_status.get("source"),
                "mapmatch": mapmatch_status.get("source"),
                "taxi": (taxi_quote or {}).get("source"),
            },
            "page_stay_seconds": page_stay_seconds,
            "current_location": current_location,
            "weather_snapshot": weather_snapshot,
            "checkin_status": state.checkin_status,
            "order_status": state.order_status,
            "next_route": next_route,
            "route_progress": route_progress,
            "mapmatch_status": mapmatch_status,
            "taxi_quote": taxi_quote,
            "trigger_flags": flags,
        }
        return state

    def _infer_next_route(self, state: TripState) -> dict[str, Any] | None:
        segments = state.route_plan.get("segments") or []
        if not segments:
            return None

        checked_ids = set(state.checkin_status.get("checked_in_card_ids") or [])
        checked_titles = {
            card["title"] for card in state.selected_cards if card.get("card_id") in checked_ids
        }
        for segment in segments:
            if segment.get("to") not in checked_titles:
                return segment
        return segments[-1]

    def _route_progress(
        self,
        current_location: dict[str, Any],
        next_route: dict[str, Any] | None,
    ) -> dict[str, Any]:
        if not next_route:
            return {"status": "no_next_route"}

        progress = {
            "status": "active",
            "next_destination": next_route.get("to"),
            "route_distance_km": next_route.get("distance_km"),
            "route_duration_minutes": next_route.get("duration_minutes"),
            "transport": next_route.get("transport"),
            "taxi_recommended": bool(next_route.get("taxi_recommended")),
        }
        destination = next_route.get("destination_location") or {}
        if (
            current_location.get("lat") is not None
            and current_location.get("lng") is not None
            and destination.get("lat") is not None
            and destination.get("lng") is not None
        ):
            distance_m = round(
                _haversine(
                    float(current_location["lat"]),
                    float(current_location["lng"]),
                    float(destination["lat"]),
                    float(destination["lng"]),
                )
                * 1000,
                1,
            )
            progress["distance_to_next_meters"] = distance_m
            progress["near_next_poi"] = distance_m <= 120
        return progress

    def _route_deviation(self, mapmatch_status: dict[str, Any]) -> bool:
        if not mapmatch_status:
            return False
        if mapmatch_status.get("source") != "amap":
            return False
        return bool(mapmatch_status.get("matched") is False)


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_km = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return 2 * radius_km * math.asin(math.sqrt(a))
