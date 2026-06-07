from __future__ import annotations

import unittest

from backend.agents import ItineraryPlannerAgent
from backend.core.models import TripState


def _card(
    card_id: str,
    title: str,
    card_type: str,
    lat: float,
    lng: float,
    category_2: str = "景点",
    rating: float = 4.5,
) -> dict:
    return {
        "card_id": card_id,
        "title": title,
        "type": card_type,
        "lat": lat,
        "lng": lng,
        "category_2": category_2,
        "duration_minutes": 60,
        "rating": rating,
        "reason": "适合本次行程",
        "tags": [],
    }


class ItineraryPlannerMealRoutingTest(unittest.TestCase):
    def test_meal_slots_preserve_distance_routed_foods(self) -> None:
        agent = ItineraryPlannerAgent()
        agent._enhance_board_with_ai = lambda state, board: board
        state = TripState(
            trip_id="trip_test",
            user_id="u_test",
            stage="planning",
            structured_request={
                "departure_location": "深圳酒店",
                "destination": "深圳",
                "start_time": "09:00",
            },
        )
        sights = [
            _card("s1", "上午景点", "景点", 22.500, 114.000, "公园/广场", 4.9),
            _card("s2", "中段景点", "景点", 22.500, 114.020, "博物馆", 4.8),
            _card("s3", "傍晚景点", "景点", 22.500, 114.040, "观光街区", 4.7),
        ]
        lunch = _card("f1", "近中段简餐", "美食", 22.500, 114.019, "小吃快餐")
        dinner = _card("f2", "终点火锅", "美食", 22.500, 114.041, "火锅")

        routed = agent._route_day([*sights, lunch, dinner])
        for card in routed:
            card["_day"] = 1

        self.assertEqual(lunch["_meal"], "午餐")
        self.assertEqual(dinner["_meal"], "晚餐")
        self.assertLess(routed.index(lunch), routed.index(sights[1]))
        self.assertGreater(routed.index(dinner), routed.index(sights[2]))

        board = agent._build_board(state, routed)
        meals = [item for item in board if item.get("meal")]
        self.assertEqual([item["meal"] for item in meals], ["早餐", "午餐", "晚餐"])
        self.assertTrue(meals[0]["self_arranged"])
        self.assertEqual(meals[1]["card_id"], lunch["card_id"])
        self.assertEqual(meals[2]["card_id"], dinner["card_id"])

        real_card_ids = [item.get("card_id") for item in board if item.get("card_id")]
        self.assertEqual(real_card_ids, ["s1", "f1", "s2", "s3", "f2"])

    def test_arrival_day_skips_self_arranged_breakfast(self) -> None:
        agent = ItineraryPlannerAgent()
        agent._enhance_board_with_ai = lambda state, board: board
        state = TripState(
            trip_id="trip_arrival",
            user_id="u_test",
            stage="planning",
            structured_request={
                "departure_location": "广州南站",
                "destination": "深圳",
                "start_time": "09:00",
            },
        )
        sights = [
            _card("s1", "上午景点", "景点", 22.500, 114.000, "公园/广场", 4.9),
            _card("s2", "下午景点", "景点", 22.500, 114.020, "博物馆", 4.8),
        ]
        lunch = _card("f1", "午间简餐", "美食", 22.500, 114.010, "小吃快餐")
        dinner = _card("f2", "晚间火锅", "美食", 22.500, 114.030, "火锅")

        routed = agent._route_day([*sights, lunch, dinner])
        for card in routed:
            card["_day"] = 1

        board = agent._build_board(state, routed)
        meals = [item for item in board if item.get("meal")]

        self.assertEqual([item["meal"] for item in meals], ["午餐", "晚餐"])
        self.assertFalse(any(item.get("meal") == "早餐" for item in board))
        self.assertEqual(meals[0]["card_id"], lunch["card_id"])
        self.assertEqual(meals[1]["card_id"], dinner["card_id"])

    def test_two_selected_sights_are_split_across_two_days(self) -> None:
        agent = ItineraryPlannerAgent()
        agent._enhance_board_with_ai = lambda state, board: board
        state = TripState(
            trip_id="trip_two_sights",
            user_id="u_test",
            stage="planning",
            structured_request={
                "departure_location": "广州南站",
                "destination": "深圳",
                "start_time": "09:00",
            },
        )
        sights = [
            _card("s1", "第一天景点", "景点", 22.500, 114.000, "公园/广场", 4.9),
            _card("s2", "第二天景点", "景点", 22.700, 114.300, "博物馆", 4.8),
        ]

        ordered = agent._order_cards(sights)
        self.assertEqual(
            {card["card_id"]: card["_day"] for card in ordered},
            {"s1": 1, "s2": 2},
        )

        board = agent._build_board(state, ordered)
        day1_sights = [
            item for item in board
            if item.get("day") == 1 and item.get("type") == "景点"
        ]
        day2_sights = [
            item for item in board
            if item.get("day") == 2 and item.get("type") == "景点"
        ]

        self.assertEqual([item["card_id"] for item in day1_sights], ["s1"])
        self.assertEqual([item["card_id"] for item in day2_sights], ["s2"])

    def test_extra_food_pois_are_candidates_not_extra_meals(self) -> None:
        agent = ItineraryPlannerAgent()
        agent._enhance_board_with_ai = lambda state, board: board
        state = TripState(
            trip_id="trip_many_foods",
            user_id="u_test",
            stage="planning",
            structured_request={
                "departure_location": "深圳酒店",
                "destination": "深圳",
                "start_time": "09:00",
            },
            selected_cards=[
                _card("s1", "上午景点", "景点", 22.500, 114.000, "公园/广场", 4.9),
                _card("f1", "近景点简餐", "美食", 22.500, 114.018, "小吃快餐", 4.2),
                _card("f2", "远处简餐", "美食", 22.700, 114.300, "小吃快餐", 4.9),
                _card("f3", "近景点火锅", "美食", 22.500, 114.039, "火锅", 4.1),
                _card("f4", "远处火锅", "美食", 22.800, 114.350, "火锅", 4.8),
            ],
        )

        state = agent.run(state)
        food_items = [
            item for item in state.static_board
            if item.get("type") == "美食" and item.get("card_id")
        ]
        food_card_ids = [item["card_id"] for item in food_items]

        self.assertEqual([item["meal"] for item in food_items], ["午餐", "晚餐"])
        self.assertEqual(food_card_ids, ["f1", "f3"])
        self.assertFalse(any(item.get("meal") == "早餐" and item.get("card_id") for item in state.static_board))
        self.assertEqual(
            [card["card_id"] for card in state.selected_cards if card["type"] == "美食"],
            ["f1", "f3"],
        )


if __name__ == "__main__":
    unittest.main()
