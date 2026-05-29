"""
Supervisor-driven planning graph.

Unlike the existing linear graphs where supervisor nodes are no-ops, this module
creates a real langgraph-supervisor workflow where the LLM decides which agents
to call and in what order, based on the trip request and intermediate results.

State is shared via TripStateStore (trip_id as key). Each agent node reads/writes
TripState from the store and returns a JSON summary as a message. The supervisor
LLM reads those summaries to decide next steps.
"""
from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt.chat_agent_executor import AgentState
from langgraph_supervisor import create_supervisor

from backend.tools import amap as tools
from backend.clients.llm import load_settings
from backend.core.models import TripState


_SUPERVISOR_PROMPT = (
    "你是小团出行规划 Supervisor（真实 LLM 路由，非脚本）。\n"
    "任务：根据用户出行请求，协调 Agent 完成从 POI 搜索到行程规划的全流程。\n\n"
    "调用规则：\n"
    "1. 先调用 poi_selection_agent 搜索候选景点并获取天气信息\n"
    "2. poi_selection_agent 完成后，调用 itinerary_planner_agent 生成行程时间轴\n"
    "3. itinerary_planner_agent 完成后，结束并汇报规划结果\n\n"
    "消息中含有 trip_id，各 Agent 通过该 ID 读写行程状态，你只需按顺序调用。\n"
    "若 POI 候选数为 0，仍需调用 itinerary_planner_agent（它有备选数据兜底）。"
)


class SmartPlannerGraph:
    """Real supervisor-driven planner: LLM decides agent invocation order."""

    def __init__(self, orchestrator: Any) -> None:
        self.orchestrator = orchestrator
        self._compiled = None

    @property
    def enabled(self) -> bool:
        return load_settings().enabled

    def run(self, structured_request: dict[str, Any]) -> dict[str, Any]:
        trip_id = structured_request.get("trip_id") or f"trip_{uuid4().hex[:8]}"
        user_id = structured_request.get("user_id", "demo_user")
        request = structured_request | {"trip_id": trip_id, "user_id": user_id}

        state = TripState(
            trip_id=trip_id,
            user_id=user_id,
            stage="planning",
            structured_request=request,
        )
        self.orchestrator.store.save_state(state)
        self.orchestrator._states[trip_id] = state

        if not self.enabled:
            return self._run_sequential(state)

        graph = self._get_compiled()
        initial = HumanMessage(
            content=json.dumps(
                {"trip_id": trip_id, "structured_request": request},
                ensure_ascii=False,
            )
        )
        graph.invoke({"messages": [initial]})

        final = self.orchestrator.store.get_state(trip_id)
        if final is None:
            return state.to_dict()
        self.orchestrator._states[trip_id] = final
        return final.to_dict()

    def describe(self) -> dict[str, Any]:
        settings = load_settings()
        return {
            "engine": "langgraph-supervisor",
            "real_llm": settings.enabled,
            "model": settings.model if settings.enabled else None,
            "provider": settings.provider,
            "supervisor_name": "travel_supervisor",
            "agents": ["poi_selection_agent", "itinerary_planner_agent"],
        }

    def _get_compiled(self) -> Any:
        if self._compiled is None:
            self._compiled = self._build_graph()
        return self._compiled

    def _build_graph(self) -> Any:
        from langchain_openai import ChatOpenAI

        settings = load_settings()
        model = ChatOpenAI(
            model=settings.model,
            api_key=settings.api_key,
            base_url=settings.base_url,
            temperature=0.3,
        )
        workflow = create_supervisor(
            [self._make_poi_agent(), self._make_planner_agent()],
            model=model,
            prompt=_SUPERVISOR_PROMPT,
            supervisor_name="travel_supervisor",
            output_mode="last_message",
        )
        return workflow.compile(name="smart_planner_graph")

    def _make_poi_agent(self) -> Any:
        store = self.orchestrator.store
        poi_impl = self.orchestrator.poi_agent
        order_tool = self.orchestrator.order_status_tool

        def node(state: AgentState) -> dict[str, Any]:
            trip_id = _extract_trip_id(state["messages"])
            if not trip_id:
                return _error_msg("poi_selection_agent", "trip_id not found in messages")
            trip_state = store.get_state(trip_id)
            if trip_state is None:
                return _error_msg("poi_selection_agent", f"Trip {trip_id} not in store")

            updated = poi_impl.run(trip_state)
            updated.order_status = order_tool.get_status(store, updated.trip_id)
            updated.checkin_status = tools.get_checkin_status(updated.trip_id)
            store.save_state(updated)

            summary = {
                "trip_id": trip_id,
                "status": "poi_selection_complete",
                "candidate_count": len(updated.candidate_cards),
                "weather": updated.weather,
                "top_candidates": [
                    {"id": c["card_id"], "title": c["title"], "type": c["type"]}
                    for c in updated.candidate_cards[:5]
                ],
            }
            return {"messages": [AIMessage(
                content=json.dumps(summary, ensure_ascii=False),
                name="poi_selection_agent",
            )]}

        return _single_node_graph("poi_selection_agent", node)

    def _make_planner_agent(self) -> Any:
        store = self.orchestrator.store
        planner_impl = self.orchestrator.itinerary_agent

        def node(state: AgentState) -> dict[str, Any]:
            trip_id = _extract_trip_id(state["messages"])
            if not trip_id:
                return _error_msg("itinerary_planner_agent", "trip_id not found")
            trip_state = store.get_state(trip_id)
            if trip_state is None:
                return _error_msg("itinerary_planner_agent", f"Trip {trip_id} not in store")

            if not trip_state.selected_cards and trip_state.candidate_cards:
                trip_state.selected_cards = trip_state.candidate_cards[:5]

            updated = planner_impl.run(trip_state)
            store.save_state(updated)

            summary = {
                "trip_id": trip_id,
                "status": "itinerary_planning_complete",
                "stage": updated.stage,
                "board_count": len(updated.static_board),
                "itinerary": [
                    {
                        "time": item.get("time"),
                        "action": item.get("action"),
                        "type": item.get("type"),
                    }
                    for item in updated.static_board
                ],
            }
            return {"messages": [AIMessage(
                content=json.dumps(summary, ensure_ascii=False),
                name="itinerary_planner_agent",
            )]}

        return _single_node_graph("itinerary_planner_agent", node)

    def _run_sequential(self, state: TripState) -> dict[str, Any]:
        """Sequential fallback when LLM_API_KEY is not configured."""
        updated = self.orchestrator.poi_agent.run(state)
        updated.order_status = self.orchestrator.order_status_tool.get_status(
            self.orchestrator.store, updated.trip_id
        )
        updated.checkin_status = tools.get_checkin_status(updated.trip_id)

        if not updated.selected_cards and updated.candidate_cards:
            updated.selected_cards = updated.candidate_cards[:5]

        updated = self.orchestrator.itinerary_agent.run(updated)
        self.orchestrator._save_state(updated)
        return updated.to_dict()


def _extract_trip_id(messages: list[BaseMessage]) -> str | None:
    for message in reversed(messages):
        content = getattr(message, "content", "") or ""
        if isinstance(content, str) and "{" in content:
            try:
                data = json.loads(content)
                if isinstance(data, dict) and data.get("trip_id"):
                    return str(data["trip_id"])
            except (json.JSONDecodeError, KeyError):
                pass
    return None


def _error_msg(agent_name: str, error: str) -> dict[str, Any]:
    return {"messages": [AIMessage(
        content=json.dumps({"status": "error", "error": error}),
        name=agent_name,
    )]}


def _single_node_graph(name: str, node_fn: Any) -> Any:
    graph: StateGraph = StateGraph(AgentState)
    graph.add_node(name, node_fn)
    graph.add_edge(START, name)
    graph.add_edge(name, END)
    return graph.compile(name=name)
