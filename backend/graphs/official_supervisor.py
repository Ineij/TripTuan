from __future__ import annotations

import importlib.metadata as metadata
import warnings
from datetime import datetime, timezone
from typing import Any

from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt.chat_agent_executor import AgentState
from langgraph_supervisor import create_supervisor

from backend.clients.llm import load_settings


SUPERVISOR_AGENT_NAMES = [
    "poi_selection_agent",
    "itinerary_planner_agent",
    "runtime_monitor_agent",
    "micro_recommend_agent",
    "poster_agent",
]


class BindableSupervisorModel(FakeMessagesListChatModel):
    def bind_tools(self, tools: Any, **kwargs: Any) -> "BindableSupervisorModel":
        object.__setattr__(self, "bound_tools", tools)
        return self


class OfficialSupervisorLayer:
    supervisor_name = "official_travel_supervisor"

    def __init__(self) -> None:
        self.agent_names = SUPERVISOR_AGENT_NAMES
        self._agents = [self._make_agent(name) for name in self.agent_names]
        self._package_version = metadata.version("langgraph-supervisor")
        self._describe_app = self._compile_app(
            BindableSupervisorModel(
                responses=[
                    AIMessage(
                        content="Official langgraph-supervisor layer is ready.",
                        name=self.supervisor_name,
                    )
                ]
            )
        )

    def describe(self) -> dict[str, Any]:
        settings = load_settings()
        return {
            "package": "langgraph-supervisor",
            "version": self._package_version,
            "supervisor_name": self.supervisor_name,
            "agent_names": self.agent_names,
            "handoff_tool_prefix": "transfer_to_",
            "compiled": True,
            "graph_nodes": list(self._describe_app.get_graph().nodes.keys()),
            "real_llm_configured": settings.enabled,
            "routing_mode": (
                "scripted_fake_model_in_linear_graph — no real routing decisions. "
                "Use /trip/smart-plan for real LLM-driven supervisor routing."
            ),
        }

    def route(self, graph_name: str, target_agent: str) -> dict[str, Any]:
        if target_agent not in self.agent_names:
            raise ValueError(f"Unknown supervisor agent: {target_agent}")

        handoff_tool = f"transfer_to_{target_agent}"
        app = self._compile_app(
            BindableSupervisorModel(
                responses=[
                    AIMessage(
                        content="",
                        name=self.supervisor_name,
                        tool_calls=[
                            {
                                "name": handoff_tool,
                                "args": {},
                                "id": f"handoff_{target_agent}",
                            }
                        ],
                    ),
                    AIMessage(
                        content=f"Supervisor routed {graph_name} to {target_agent}.",
                        name=self.supervisor_name,
                    ),
                ]
            )
        )
        result = app.invoke(
            {
                "messages": [
                    HumanMessage(
                        content=(
                            f"Route graph '{graph_name}' to specialized agent "
                            f"'{target_agent}'."
                        )
                    )
                ]
            }
        )
        messages = result.get("messages", [])
        return {
            **self.describe(),
            "graph": graph_name,
            "target_agent": target_agent,
            "handoff_tool": handoff_tool,
            "message_count": len(messages),
            "message_types": [message.type for message in messages],
            "used_official_create_supervisor": True,
            "at": datetime.now(timezone.utc).isoformat(),
        }

    def _compile_app(self, model: BindableSupervisorModel) -> Any:
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message="create_react_agent has been moved.*",
            )
            workflow = create_supervisor(
                self._agents,
                model=model,
                prompt=(
                    "你是出行规划后端的官方 LangGraph Supervisor。"
                    "只负责把任务交给最合适的专职 Agent；"
                    "订单、核销、天气、定位和打卡事实由 Tool/数据库判断。"
                ),
                supervisor_name=self.supervisor_name,
                output_mode="last_message",
            )
        return workflow.compile(name="official_supervisor_workflow")

    def _make_agent(self, name: str) -> Any:
        def node(state: AgentState) -> dict[str, list[AIMessage]]:
            return {
                "messages": [
                    AIMessage(
                        content=f"{name} accepted supervisor handoff.",
                        name=name,
                    )
                ]
            }

        graph = StateGraph(AgentState)
        graph.add_node(name, node)
        graph.add_edge(START, name)
        graph.add_edge(name, END)
        return graph.compile(name=name)
