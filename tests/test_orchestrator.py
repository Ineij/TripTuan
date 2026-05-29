from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.orchestrator import TravelOrchestrator
from backend.core.state_store import TripStateStore


class TravelOrchestratorTest(unittest.TestCase):
    def setUp(self) -> None:
        self.orchestrator = TravelOrchestrator()
        self.request = {
            "user_id": "u_001",
            "departure_location": "香港尖沙咀酒店",
            "destination": "香港迪士尼",
            "travel_date": "2026-06-01",
            "start_time": "09:00",
            "people_count": 4,
            "special_groups": ["elderly", "child"],
            "preferences": ["亲子", "轻松", "特色小吃"],
            "intensity": "low",
            "budget_level": "medium",
        }

    def test_full_mock_workflow(self) -> None:
        state = self.orchestrator.generate_candidates(self.request)
        trip_id = state["trip_id"]
        self.assertEqual(state["stage"], "selection")
        self.assertGreaterEqual(len(state["candidate_cards"]), 3)
        self.assertGreaterEqual(len(state["langgraph_trace"]), 5)
        self.assertEqual(
            state["langgraph_trace"][0]["node"],
            "structured_requirement_node",
        )
        self.assertEqual(state["supervisor_trace"][0]["target_agent"], "poi_selection_agent")
        self.assertTrue(
            state["supervisor_trace"][0]["used_official_create_supervisor"]
        )

        selected_ids = [card["card_id"] for card in state["candidate_cards"][:4]]
        state = self.orchestrator.select_cards(trip_id, selected_ids)
        self.assertEqual(len(state["selected_cards"]), 4)
        self.assertEqual(state["langgraph_trace"][-1]["node"], "persist_state")

        state = self.orchestrator.plan_trip(trip_id)
        self.assertEqual(state["stage"], "confirmed")
        self.assertGreaterEqual(len(state["static_board"]), 2)
        self.assertEqual(
            state["supervisor_trace"][-1]["target_agent"],
            "itinerary_planner_agent",
        )

        state = self.orchestrator.create_demo_orders(trip_id)
        self.assertEqual(state["order_status"]["counts"]["total"], 4)
        self.assertEqual(state["order_status"]["counts"]["pending"], 4)
        self.assertEqual(state["order_status"]["tool"], "OrderStatusTool")

        state = self.orchestrator.pay_order(trip_id)
        self.assertEqual(state["order_status"]["counts"]["paid"], 4)
        self.assertTrue(state["order_status"]["all_paid"])
        self.assertEqual(state["order_status"]["verification_tool"], "VerificationTool")

        state = self.orchestrator.build_route(trip_id)
        self.assertEqual(state["stage"], "executing")
        self.assertIn("segments", state["route_plan"])

        first_order = state["order_status"]["orders"][0]
        state = self.orchestrator.verify_order(trip_id, order_id=first_order["order_id"])
        self.assertEqual(state["order_status"]["counts"]["verified"], 1)
        self.assertIn(first_order["card_id"], state["order_status"]["verified_items"])

        state = self.orchestrator.update_runtime(
            trip_id,
            {
                "page_stay_seconds": 12,
                "next_route": state["route_plan"]["segments"][0],
            },
        )
        self.assertEqual(state["runtime_context"]["tool"], "RuntimeContextTool")
        self.assertTrue(state["runtime_context"]["trigger_flags"]["page_stay_over_10s"])
        self.assertIn("runtime_context_tool", [item["node"] for item in state["langgraph_trace"]])
        self.assertGreaterEqual(len(state["runtime_events"]), 1)

        state = self.orchestrator.recommend(
            trip_id,
            {"page_stay_seconds": 12, "is_meal_time": True},
        )
        self.assertGreaterEqual(len(state["recommendations"]), 1)

        state = self.orchestrator.create_poster(trip_id)
        self.assertEqual(state["stage"], "completed")
        self.assertIn("title", state["poster"])
        graph_names = {item["graph"] for item in state["langgraph_trace"]}
        self.assertIn("create_poster", graph_names)
        self.assertIn("build_route", graph_names)
        supervisor_agents = {item["target_agent"] for item in state["supervisor_trace"]}
        self.assertIn("poster_agent", supervisor_agents)
        self.assertIn("runtime_monitor_agent", supervisor_agents)
        self.assertEqual(
            state["poster"]["image_generation_model"],
            "qwen-image-2.0-pro",
        )
        self.assertEqual(state["poster"]["image_generation_provider"], "qwen")
        self.assertIn(
            state["poster"]["image_generation_status"],
            {"generated", "failed"},
        )
        if state["poster"]["image_generation_status"] == "generated":
            self.assertTrue(state["poster"]["image_url"].endswith(".png"))
            self.assertEqual(state["poster"]["render_tool"], "QwenPosterImageTool")

    def test_trip_state_can_be_restored_from_sqlite(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            db_path = Path(tmp_dir) / "state.sqlite"
            first = TravelOrchestrator()
            first.store = TripStateStore(db_path)

            state = first.generate_candidates(self.request)
            trip_id = state["trip_id"]
            selected_ids = [card["card_id"] for card in state["candidate_cards"][:2]]
            first.select_cards(trip_id, selected_ids)
            first.create_demo_orders(trip_id)
            first.pay_order(trip_id)

            second = TravelOrchestrator()
            second.store = TripStateStore(db_path)
            restored = second.get_trip(trip_id)

            self.assertEqual(restored["trip_id"], trip_id)
            self.assertEqual(restored["stage"], "selection")
            self.assertGreaterEqual(len(restored["candidate_cards"]), 3)
            self.assertEqual(restored["structured_request"]["destination"], "香港迪士尼")
            self.assertEqual(restored["order_status"]["counts"]["paid"], 2)
            self.assertGreaterEqual(len(restored["langgraph_trace"]), 9)
            self.assertGreaterEqual(len(restored["supervisor_trace"]), 1)
            persisted_status = second.get_order_status(trip_id)
            self.assertEqual(persisted_status["counts"]["total"], 2)


if __name__ == "__main__":
    unittest.main()
