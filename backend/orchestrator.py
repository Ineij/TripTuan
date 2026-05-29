from __future__ import annotations

from typing import Any

from backend.agents import (
    ItineraryPlannerAgent,
    MicroRecommendAgent,
    POISelectionAgent,
    PosterAgent,
    RuntimeMonitorAgent,
)
from backend.core.models import TripState
from backend.tools.orders import OrderStatusTool, VerificationTool
from backend.tools.runtime_context import RuntimeContextTool
from backend.graphs.smart_planner import SmartPlannerGraph
from backend.core.state_store import TripStateStore
from backend.graphs.travel_graph import TravelGraphRunner


class TravelOrchestrator:
    def __init__(self) -> None:
        self._states: dict[str, TripState] = {}
        self.store = TripStateStore()
        self.poi_agent = POISelectionAgent()
        self.itinerary_agent = ItineraryPlannerAgent()
        self.runtime_agent = RuntimeMonitorAgent()
        self.micro_recommend_agent = MicroRecommendAgent()
        self.poster_agent = PosterAgent()
        self.order_status_tool = OrderStatusTool()
        self.verification_tool = VerificationTool()
        self.runtime_context_tool = RuntimeContextTool()
        self.graph_runner = TravelGraphRunner(self)
        self.smart_planner = SmartPlannerGraph(self)

    def generate_candidates(self, structured_request: dict[str, Any]) -> dict[str, Any]:
        result = self.graph_runner.run(
            "generate_candidates",
            {"structured_request": structured_request},
        )
        return result["trip_state"].to_dict()

    def select_cards(self, trip_id: str, selected_card_ids: list[str]) -> dict[str, Any]:
        state = self._get_state(trip_id)
        result = self.graph_runner.run(
            "select_cards",
            {
                "trip_state": state,
                "selected_card_ids": selected_card_ids,
                "langgraph_trace": state.langgraph_trace,
            },
        )
        return result["trip_state"].to_dict()

    def plan_trip(self, trip_id: str) -> dict[str, Any]:
        state = self._get_state(trip_id)
        result = self.graph_runner.run(
            "plan_trip",
            {"trip_state": state, "langgraph_trace": state.langgraph_trace},
        )
        return result["trip_state"].to_dict()

    def rerank_trip(
        self, trip_id: str, prev_variant_id: str | None = None
    ) -> dict[str, Any]:
        state = self._get_state(trip_id)
        result = self.graph_runner.run(
            "rerank_trip",
            {
                "trip_state": state,
                "prev_variant_id": prev_variant_id,
                "langgraph_trace": state.langgraph_trace,
            },
        )
        return result["trip_state"].to_dict()

    def build_route(self, trip_id: str) -> dict[str, Any]:
        state = self._get_state(trip_id)
        result = self.graph_runner.run(
            "build_route",
            {"trip_state": state, "langgraph_trace": state.langgraph_trace},
        )
        return result["trip_state"].to_dict()

    def create_demo_orders(self, trip_id: str) -> dict[str, Any]:
        state = self._get_state(trip_id)
        result = self.graph_runner.run(
            "create_demo_orders",
            {"trip_state": state, "langgraph_trace": state.langgraph_trace},
        )
        return result["trip_state"].to_dict()

    def pay_order(self, trip_id: str, order_id: str | None = None) -> dict[str, Any]:
        state = self._get_state(trip_id)
        result = self.graph_runner.run(
            "pay_order",
            {
                "trip_state": state,
                "order_id": order_id,
                "langgraph_trace": state.langgraph_trace,
            },
        )
        return result["trip_state"].to_dict()

    def verify_order(
        self,
        trip_id: str,
        order_id: str | None = None,
        card_id: str | None = None,
    ) -> dict[str, Any]:
        state = self._get_state(trip_id)
        result = self.graph_runner.run(
            "verify_order",
            {
                "trip_state": state,
                "order_id": order_id,
                "card_id": card_id,
                "langgraph_trace": state.langgraph_trace,
            },
        )
        return result["trip_state"].to_dict()

    def get_order_status(self, trip_id: str) -> dict[str, Any]:
        state = self._get_state(trip_id)
        state.order_status = self.order_status_tool.get_status(self.store, trip_id)
        self._save_state(state)
        return state.order_status

    def update_runtime(self, trip_id: str, runtime_payload: dict[str, Any]) -> dict[str, Any]:
        state = self._get_state(trip_id)
        result = self.graph_runner.run(
            "update_runtime",
            {
                "trip_state": state,
                "runtime_payload": runtime_payload,
                "langgraph_trace": state.langgraph_trace,
            },
        )
        return result["trip_state"].to_dict()

    def recommend(self, trip_id: str, trigger: dict[str, Any]) -> dict[str, Any]:
        state = self._get_state(trip_id)
        result = self.graph_runner.run(
            "recommend",
            {
                "trip_state": state,
                "recommend_trigger": trigger,
                "langgraph_trace": state.langgraph_trace,
            },
        )
        return result["trip_state"].to_dict()

    def create_poster(self, trip_id: str) -> dict[str, Any]:
        state = self._get_state(trip_id)
        result = self.graph_runner.run(
            "create_poster",
            {"trip_state": state, "langgraph_trace": state.langgraph_trace},
        )
        return result["trip_state"].to_dict()

    def smart_plan(self, structured_request: dict[str, Any]) -> dict[str, Any]:
        return self.smart_planner.run(structured_request)

    def get_trip(self, trip_id: str) -> dict[str, Any]:
        return self._get_state(trip_id).to_dict()

    def _get_state(self, trip_id: str) -> TripState:
        if trip_id in self._states:
            return self._states[trip_id]
        state = self.store.get_state(trip_id)
        if state is None:
            raise KeyError(f"Trip not found: {trip_id}")
        self._states[trip_id] = state
        return state

    def _save_state(self, state: TripState) -> None:
        self._states[state.trip_id] = state
        self.store.save_state(state)

    def _build_dynamic_board(self, state: TripState) -> list[dict[str, Any]]:
        route_by_to = {
            segment["to"]: segment for segment in state.route_plan.get("segments", [])
        }
        dynamic_board = []

        for item in state.static_board:
            card_id = item.get("card_id")
            route = route_by_to.get(item.get("action"))
            dynamic_board.append(
                {
                    **item,
                    "status": "pending" if card_id else "ready",
                    "route": route,
                    "can_checkin": bool(card_id),
                }
            )

        return dynamic_board
