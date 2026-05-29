from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, TypedDict
from uuid import uuid4

from langgraph.graph import END, START, StateGraph

from backend.tools import amap as tools
from backend.core.models import TripState
from backend.graphs.official_supervisor import OfficialSupervisorLayer


class TravelGraphState(TypedDict, total=False):
    structured_request: dict[str, Any]
    trip_state: TripState
    selected_card_ids: list[str]
    runtime_payload: dict[str, Any]
    recommend_trigger: dict[str, Any]
    order_id: str | None
    card_id: str | None
    prev_variant_id: str | None
    active_graph_name: str
    langgraph_trace: list[dict[str, Any]]


GraphNode = tuple[str, Callable[[TravelGraphState], dict[str, Any]]]


class TravelGraphRunner:
    def __init__(self, orchestrator: Any) -> None:
        self.orchestrator = orchestrator
        self.official_supervisor = OfficialSupervisorLayer()
        self.graphs = {
            "generate_candidates": self._compile_linear(
                "generate_candidates",
                [
                    ("structured_requirement_node", self._structured_requirement_node),
                    (
                        "official_supervisor",
                        self._official_supervisor_node("poi_selection_agent"),
                    ),
                    ("poi_selection_agent", self._poi_selection_agent_node),
                    ("order_status_tool", self._order_status_tool_node),
                    ("checkin_status_tool", self._checkin_status_tool_node),
                    ("persist_state", self._persist_state_node),
                ],
            ),
            "select_cards": self._compile_linear(
                "select_cards",
                [
                    ("user_selection_node", self._user_selection_node),
                    ("persist_state", self._persist_state_node),
                ],
            ),
            "plan_trip": self._compile_linear(
                "plan_trip",
                [
                    (
                        "official_supervisor",
                        self._official_supervisor_node("itinerary_planner_agent"),
                    ),
                    ("itinerary_planner_agent", self._itinerary_planner_agent_node),
                    ("persist_state", self._persist_state_node),
                ],
            ),
            "rerank_trip": self._compile_linear(
                "rerank_trip",
                [
                    (
                        "official_supervisor",
                        self._official_supervisor_node("itinerary_planner_agent"),
                    ),
                    (
                        "itinerary_planner_agent_rerank",
                        self._itinerary_planner_agent_rerank_node,
                    ),
                    ("persist_state", self._persist_state_node),
                ],
            ),
            "build_route": self._compile_linear(
                "build_route",
                [
                    ("map_route_tool", self._map_route_tool_node),
                    ("dynamic_board_node", self._dynamic_board_node),
                    ("persist_state", self._persist_state_node),
                ],
            ),
            "create_demo_orders": self._compile_linear(
                "create_demo_orders",
                [
                    ("order_status_tool", self._order_create_node),
                    ("persist_state", self._persist_state_node),
                ],
            ),
            "pay_order": self._compile_linear(
                "pay_order",
                [
                    ("verification_tool", self._order_pay_node),
                    ("persist_state", self._persist_state_node),
                ],
            ),
            "verify_order": self._compile_linear(
                "verify_order",
                [
                    ("verification_tool", self._order_verify_node),
                    ("persist_state", self._persist_state_node),
                ],
            ),
            "update_runtime": self._compile_linear(
                "update_runtime",
                [
                    ("runtime_context_tool", self._runtime_context_tool_node),
                    (
                        "official_supervisor",
                        self._official_supervisor_node("runtime_monitor_agent"),
                    ),
                    ("runtime_monitor_agent", self._runtime_monitor_agent_node),
                    ("persist_state", self._persist_state_node),
                ],
            ),
            "recommend": self._compile_linear(
                "recommend",
                [
                    (
                        "official_supervisor",
                        self._official_supervisor_node("micro_recommend_agent"),
                    ),
                    ("micro_recommend_agent", self._micro_recommend_agent_node),
                    ("persist_state", self._persist_state_node),
                ],
            ),
            "create_poster": self._compile_linear(
                "create_poster",
                [
                    (
                        "official_supervisor",
                        self._official_supervisor_node("poster_agent"),
                    ),
                    ("poster_agent", self._poster_agent_node),
                    ("persist_state", self._persist_state_node),
                ],
            ),
        }

    def run(self, graph_name: str, payload: TravelGraphState) -> TravelGraphState:
        graph = self.graphs[graph_name]
        return graph.invoke({**payload, "active_graph_name": graph_name})

    def describe(self) -> dict[str, Any]:
        return {
            "engine": "langgraph",
            "official_supervisor": self.official_supervisor.describe(),
            "graphs": {
                name: list(compiled.get_graph().nodes.keys())
                for name, compiled in self.graphs.items()
            },
        }

    def _compile_linear(self, graph_name: str, nodes: list[GraphNode]) -> Any:
        graph = StateGraph(TravelGraphState)
        for node_name, node in nodes:
            graph.add_node(node_name, self._wrap_node(graph_name, node_name, node))

        graph.add_edge(START, nodes[0][0])
        for current, following in zip(nodes, nodes[1:]):
            graph.add_edge(current[0], following[0])
        graph.add_edge(nodes[-1][0], END)
        return graph.compile()

    def _wrap_node(
        self,
        graph_name: str,
        node_name: str,
        node: Callable[[TravelGraphState], dict[str, Any]],
    ) -> Callable[[TravelGraphState], dict[str, Any]]:
        def wrapped(graph_state: TravelGraphState) -> dict[str, Any]:
            result = node(graph_state)
            trip_state = result.get("trip_state") or graph_state.get("trip_state")
            trace = list(graph_state.get("langgraph_trace") or [])
            trace.append(
                {
                    "graph": graph_name,
                    "node": node_name,
                    "at": datetime.now(timezone.utc).isoformat(),
                    "stage": trip_state.stage if trip_state else None,
                }
            )
            if trip_state is not None:
                trip_state.langgraph_trace = trace
            return {**result, "langgraph_trace": trace}

        return wrapped

    def _structured_requirement_node(
        self, graph_state: TravelGraphState
    ) -> dict[str, Any]:
        request = graph_state["structured_request"]
        trip_id = request.get("trip_id") or f"trip_{uuid4().hex[:8]}"
        user_id = request.get("user_id", "demo_user")
        state = TripState(
            trip_id=trip_id,
            user_id=user_id,
            stage="planning",
            structured_request=request | {"trip_id": trip_id, "user_id": user_id},
        )
        return {"trip_state": state}

    def _official_supervisor_node(
        self,
        target_agent: str,
    ) -> Callable[[TravelGraphState], dict[str, Any]]:
        def node(graph_state: TravelGraphState) -> dict[str, Any]:
            state = graph_state["trip_state"]
            graph_name = graph_state.get("active_graph_name", "unknown")
            state.supervisor_trace.append(
                self.official_supervisor.route(graph_name, target_agent)
            )
            return {"trip_state": state}

        return node

    def _poi_selection_agent_node(self, graph_state: TravelGraphState) -> dict[str, Any]:
        state = self.orchestrator.poi_agent.run(graph_state["trip_state"])
        return {"trip_state": state}

    def _order_status_tool_node(self, graph_state: TravelGraphState) -> dict[str, Any]:
        state = graph_state["trip_state"]
        state.order_status = self.orchestrator.order_status_tool.get_status(
            self.orchestrator.store,
            state.trip_id,
        )
        return {"trip_state": state}

    def _checkin_status_tool_node(self, graph_state: TravelGraphState) -> dict[str, Any]:
        state = graph_state["trip_state"]
        state.checkin_status = tools.get_checkin_status(state.trip_id)
        return {"trip_state": state}

    def _user_selection_node(self, graph_state: TravelGraphState) -> dict[str, Any]:
        state = graph_state["trip_state"]
        selected_ids = set(graph_state.get("selected_card_ids") or [])
        state.selected_cards = [
            card for card in state.candidate_cards if card["card_id"] in selected_ids
        ]
        state.stage = "selection"
        return {"trip_state": state}

    def _itinerary_planner_agent_node(
        self, graph_state: TravelGraphState
    ) -> dict[str, Any]:
        state = self.orchestrator.itinerary_agent.run(graph_state["trip_state"])
        return {"trip_state": state}

    def _itinerary_planner_agent_rerank_node(
        self, graph_state: TravelGraphState
    ) -> dict[str, Any]:
        state = self.orchestrator.itinerary_agent.rerank(
            graph_state["trip_state"],
            prev_variant_id=graph_state.get("prev_variant_id"),
        )
        return {"trip_state": state}

    def _map_route_tool_node(self, graph_state: TravelGraphState) -> dict[str, Any]:
        state = graph_state["trip_state"]
        routes = []
        for origin, destination in zip(state.selected_cards, state.selected_cards[1:]):
            routes.append(tools.get_route_between(origin, destination))

        state.route_plan = {
            "trip_id": state.trip_id,
            "segments": routes,
            "total_distance_km": round(sum(route["distance_km"] for route in routes), 2),
            "total_duration_minutes": sum(route["duration_minutes"] for route in routes),
        }
        return {"trip_state": state}

    def _dynamic_board_node(self, graph_state: TravelGraphState) -> dict[str, Any]:
        state = graph_state["trip_state"]
        state.dynamic_board = self.orchestrator._build_dynamic_board(state)
        state.stage = "executing"
        return {"trip_state": state}

    def _order_create_node(self, graph_state: TravelGraphState) -> dict[str, Any]:
        state = graph_state["trip_state"]
        cards = state.selected_cards or state.candidate_cards[:4]
        state.order_status = self.orchestrator.order_status_tool.create_demo_orders(
            self.orchestrator.store,
            state.trip_id,
            cards,
        )
        return {"trip_state": state}

    def _order_pay_node(self, graph_state: TravelGraphState) -> dict[str, Any]:
        state = graph_state["trip_state"]
        state.order_status = self.orchestrator.verification_tool.pay(
            self.orchestrator.store,
            state.trip_id,
            graph_state.get("order_id"),
        )
        return {"trip_state": state}

    def _order_verify_node(self, graph_state: TravelGraphState) -> dict[str, Any]:
        state = graph_state["trip_state"]
        state.order_status = self.orchestrator.verification_tool.verify(
            self.orchestrator.store,
            state.trip_id,
            graph_state.get("order_id"),
            graph_state.get("card_id"),
        )
        return {"trip_state": state}

    def _runtime_monitor_agent_node(
        self, graph_state: TravelGraphState
    ) -> dict[str, Any]:
        state = graph_state["trip_state"]
        state = self.orchestrator.runtime_agent.run(
            state,
            {
                **(graph_state.get("runtime_payload") or {}),
                "runtime_context": state.runtime_context,
            },
        )
        return {"trip_state": state}

    def _runtime_context_tool_node(
        self, graph_state: TravelGraphState
    ) -> dict[str, Any]:
        state = self.orchestrator.runtime_context_tool.run(
            graph_state["trip_state"],
            graph_state.get("runtime_payload") or {},
            self.orchestrator.store,
        )
        return {"trip_state": state}

    def _micro_recommend_agent_node(
        self, graph_state: TravelGraphState
    ) -> dict[str, Any]:
        state = self.orchestrator.micro_recommend_agent.run(
            graph_state["trip_state"],
            graph_state.get("recommend_trigger") or {},
        )
        return {"trip_state": state}

    def _poster_agent_node(self, graph_state: TravelGraphState) -> dict[str, Any]:
        state = self.orchestrator.poster_agent.run(graph_state["trip_state"])
        return {"trip_state": state}

    def _persist_state_node(self, graph_state: TravelGraphState) -> dict[str, Any]:
        state = graph_state["trip_state"]
        state.langgraph_trace = graph_state.get("langgraph_trace") or []
        self.orchestrator._save_state(state)
        return {"trip_state": state}
