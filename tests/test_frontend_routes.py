from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from backend.main import app


class FrontendAdapterTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_picker_and_itinerary_contracts(self) -> None:
        pois = self.client.get("/api/pois?scene=sz")
        self.assertEqual(pois.status_code, 200)
        self.assertGreaterEqual(len(pois.json()), 5)
        self.assertIn("cat", pois.json()[0])

        rerank = self.client.post(
            "/api/itinerary/rerank",
            json={
                "scene": "sz",
                "identity": {"partySize": 1},
                "picks": ["transport_sz_go", "dzdp_ee2f9ea919", "dzdp_f1e4617778"],
            },
        )
        self.assertEqual(rerank.status_code, 200)
        payload = rerank.json()
        self.assertEqual(payload["scene"], "sz")
        self.assertIn("variantId", payload)
        self.assertGreaterEqual(len(payload["days"]), 1)
        self.assertEqual(payload["backendTrace"]["lastSupervisorAgent"], "itinerary_planner_agent")

        preview = self.client.get("/api/itinerary/preview?scene=bj")
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.json()["scene"], "bj")
        self.assertIn("totalKm", preview.json())

    def test_order_board_weather_and_recommend_contracts(self) -> None:
        draft = self.client.post(
            "/api/orders/draft",
            json={
                "scene": "sz",
                "picks": ["transport_sz_go", "dzdp_ee2f9ea919", "dzdp_e731dac384"],
                "travelers": [{"name": "Tracy", "idNo": "440***********0023"}],
            },
        )
        self.assertEqual(draft.status_code, 200)
        order = draft.json()
        self.assertIn("orderId", order)
        self.assertGreaterEqual(order["total"], 0)
        self.assertEqual(order["backendTrace"]["lastLangGraphNode"], "persist_state")

        paid = self.client.post(f"/api/orders/{order['orderId']}/pay", json={"method": "wechat"})
        self.assertEqual(paid.status_code, 200)
        self.assertEqual(paid.json()["orderId"], order["orderId"])
        self.assertGreaterEqual(paid.json()["voucherCount"], 1)

        board = self.client.get(f"/api/board/{order['orderId']}")
        self.assertEqual(board.status_code, 200)
        self.assertEqual(board.json()["orderId"], order["orderId"])

        checkin = self.client.post(
            f"/api/board/{order['orderId']}/checkin",
            json={"stationId": "dzdp_ee2f9ea919"},
        )
        self.assertEqual(checkin.status_code, 204)

        ride = self.client.post(
            f"/api/board/{order['orderId']}/ride",
            json={"from": "深圳北站", "to": "世界之窗"},
        )
        self.assertEqual(ride.status_code, 200)
        self.assertIn("estimate", ride.json())

        weather = self.client.get("/api/weather?scene=sz")
        self.assertEqual(weather.status_code, 200)
        self.assertIn(weather.json()["days"][0]["cond"], {"晴", "雨", "雪", "多云"})

        recs = self.client.get("/api/recommend/nearby?lat=22.3&lng=114.1&type=food")
        self.assertEqual(recs.status_code, 200)
        self.assertTrue(all(item["type"] == "美食" for item in recs.json()))

    def test_stream_chat_contract(self) -> None:
        response = self.client.post("/api/chat/stream", json={"scene": "bj", "query": "北京两日游"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/event-stream", response.headers["content-type"])
        # At least one SSE data chunk, always terminated by a `done` chunk.
        # (The leading `thinking`/`text` chunks only appear when an LLM key is
        # configured; the deterministic fallback emits section/spot chunks.)
        self.assertIn("data:", response.text)
        self.assertIn('"kind": "done"', response.text)


if __name__ == "__main__":
    unittest.main()
