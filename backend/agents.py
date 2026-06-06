from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Any

from backend.tools import amap as tools
from backend.data.dianping_db import get_db
from backend.clients.llm import LLMResult, chat_json
from backend.core.models import TripState
from backend.clients.poster_image import generate_trip_poster_png


# ---------------------------------------------------------------------------
# Shared geo utility
# ---------------------------------------------------------------------------

def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km between two lat/lng points."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(max(0.0, min(1.0, a))))


def _dest_to_scene(destination: str) -> str:
    """Infer scene key from destination string."""
    d = destination.lower()
    if "北京" in destination or "beijing" in d:
        return "bj"
    if "深圳" in destination or "shenzhen" in d:
        return "sz"
    return "bj"


class POISelectionAgent:
    """
    Selects candidate cards from the Dianping local DB, then lets the LLM
    filter and annotate them based on user preferences, intensity, budget, and
    special-group requirements.

    No AMap POI search — AMap is still used for weather only.
    """

    def run(self, state: TripState) -> TripState:
        request = state.structured_request
        scene = request.get("scene") or _dest_to_scene(request.get("destination", ""))
        destination = request.get("destination", "")

        # 1. Weather (still from AMap)
        weather = tools.get_weather(destination, request.get("travel_date")) if destination else {}
        state.weather = weather

        # 2. Pull candidate pool from DianpingDB
        db = get_db()
        preferences  = request.get("preferences", [])
        budget_level = request.get("budget_level", "medium")
        intensity    = request.get("intensity", "medium")
        special_groups = set(request.get("special_groups", []))

        by_type = db.select_for_trip(
            scene,
            preferences=preferences,
            budget_level=budget_level,
            intensity=intensity,
            has_elder="elderly" in special_groups,
            has_kid="child" in special_groups,
        )

        # 3. Let LLM pick + annotate the best subset
        selected = self._llm_select(state, by_type, request)
        if not selected:
            selected = self._heuristic_select(by_type, intensity)

        state.candidate_cards = [self._db_to_card(p, request) for p in selected]
        state.stage = "selection"
        return state

    # ------------------------------------------------------------------
    # LLM selection

    def _llm_select(
        self,
        state: TripState,
        by_type: dict[str, list[dict]],
        request: dict[str, Any],
    ) -> list[dict] | None:
        """Ask the LLM to choose the best POIs from the candidate pool."""
        all_pois = []
        for items in by_type.values():
            all_pois.extend(items)
        if not all_pois:
            return None

        # Build a compact summary for the LLM (avoid huge token counts)
        compact = [
            {
                "card_id": p["card_id"],
                "type": p["type"],
                "title": p["title"],
                "area": p["area"],
                "rating": p["rating"],
                "price": p.get("price_per_person"),
                "tags": p.get("tags", [])[:4],
                "category_2": p.get("category_2", ""),
                "duration_min": p.get("duration_minutes", 60),
            }
            for p in all_pois
        ]

        payload = {
            "structured_request": {
                "destination":    request.get("destination"),
                "departure":      request.get("departure_location"),
                "travel_date":    request.get("travel_date"),
                "people_count":   request.get("people_count", 1),
                "preferences":    request.get("preferences", []),
                "intensity":      request.get("intensity", "medium"),
                "budget_level":   request.get("budget_level", "medium"),
                "special_groups": request.get("special_groups", []),
            },
            "candidate_pool": compact,
        }

        system_prompt = """你是 POISelectionAgent，负责从候选 POI 池中为用户挑选最合适的卡片。

规则：
1. 根据 preferences 调整比例：
   - 轻松行 → 景点最多3个，优先公园/咖啡/休闲场所
   - 打卡行 → 景点4-6个，优先高评分地标
   - 爱美食 → 美食6-8个，景点减少到2-3个
   - 文艺之旅 → 景点以博物馆/展览/古迹为主
   - 亲子友好 → 公园/主题乐园优先
2. 2天1夜行程（默认）：总站点 10-14；intensity low → ≤8；high → ≤16
3. budget：
   - low → 优先免费/低价景点，美食人均≤50
   - medium → 正常
   - high → 可选高价餐厅，min_rating≥4.2
4. special_groups：elderly 避免体力消耗大的，child 优选亲子设施
5. 每个行程必须包含至少1个酒店
6. 只从 candidate_pool 的 card_id 中选，不得新增
7. 只返回 JSON：
   {"selected": ["card_id1", "card_id2", ...], "reason": "一句话说明选择逻辑"}
"""

        data, result = chat_json(system_prompt, payload)
        _trace_ai(state, "POISelectionAgent.llm_select", result)

        if not data or not isinstance(data.get("selected"), list):
            return None

        id_to_poi = {p["card_id"]: p for p in all_pois}
        selected: list[dict] = []
        seen: set[str] = set()
        for cid in data["selected"]:
            if cid in id_to_poi and cid not in seen:
                selected.append(id_to_poi[cid])
                seen.add(cid)

        # If LLM returned nothing useful, fall back
        return selected if len(selected) >= 3 else None

    def _heuristic_select(
        self, by_type: dict[str, list[dict]], intensity: str
    ) -> list[dict]:
        """Fallback: take top-rated items without LLM."""
        limits = {"low": (3, 4, 2), "medium": (7, 5, 2), "high": (8, 6, 3)}
        s_lim, f_lim, h_lim = limits.get(intensity, (5, 5, 2))
        result = []
        result.extend(by_type.get("景点", [])[:s_lim])
        result.extend(by_type.get("美食", [])[:f_lim])
        result.extend(by_type.get("酒店", [])[:h_lim])
        return result

    # ------------------------------------------------------------------
    # Card conversion

    def _db_to_card(self, poi: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
        """Convert DianpingDB record → TripState candidate_card schema."""
        tags = poi.get("tags", [])
        special_groups = set(request.get("special_groups", []))
        reasons: list[str] = []

        if "elderly" in special_groups:
            reasons.append("路线已考虑老人友好")
        if "child" in special_groups:
            reasons.append("亲子友好场所优先")
        if poi.get("type") == "美食":
            reasons.append("可作为体力恢复节点")

        return {
            "card_id":          poi["card_id"],
            "type":             poi["type"],
            "title":            poi["title"],
            "area":             poi.get("area", ""),
            "address":          poi.get("address", ""),
            "tags":             tags,
            "duration_minutes": poi.get("duration_minutes", 60),
            "rating":           poi.get("rating", 0.0),
            "price_per_person": poi.get("price_per_person"),
            "photo_url":        poi.get("photo_url", ""),
            "lat":              poi.get("lat"),
            "lng":              poi.get("lon"),   # DB uses "lon", card uses "lng"
            "hours":            poi.get("hours"),
            "recommended":      poi.get("recommended", []),
            "reason":           "；".join(reasons) or "匹配本次出行需求",
            "source":           "dianping",
            "dianping_url":     poi.get("dianping_url", ""),
            "category_2":       poi.get("category_2", ""),
        }


class ItineraryPlannerAgent:
    def run(self, state: TripState) -> TripState:
        request = state.structured_request
        cards = state.selected_cards or state.candidate_cards[:5]
        ordered_cards = self._order_cards(cards)
        state.selected_cards = ordered_cards
        state.static_board = self._build_board(state, ordered_cards)
        state.selected_cards = self._planned_cards_from_board(ordered_cards, state.static_board)
        state.stage = "confirmed"
        return state

    def rerank(self, state: TripState, prev_variant_id: str | None = None) -> TripState:
        """Reorder selected cards using LLM (with heuristic fallback).

        Unlike `run`, this asks the LLM to produce an actual ordering decision
        based on rhythm, weather, and the previous variant, instead of only
        rewriting `reason` text on a fixed sort.
        """
        request = state.structured_request
        cards = state.selected_cards or state.candidate_cards[:5]
        if not cards:
            state.stage = "confirmed"
            return state

        ordered_cards = self._llm_rerank(state, cards, request, prev_variant_id)
        if ordered_cards is None:
            ordered_cards = self._heuristic_rerank(cards, prev_variant_id)

        state.selected_cards = ordered_cards
        state.static_board = self._build_board(state, ordered_cards)
        state.selected_cards = self._planned_cards_from_board(ordered_cards, state.static_board)
        state.stage = "confirmed"
        return state

    # Anchored meal times so a day always reads breakfast → morning sights →
    # lunch → afternoon sights → dinner, and the period mapping lands correctly
    # (午 12:30 → 中午, 晚 18:30 → 晚餐).
    _MEAL_TIMES: dict[str, str] = {"早餐": "08:30", "午餐": "12:30", "晚餐": "18:30"}

    def _build_board(
        self, state: TripState, ordered_cards: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Build a meal-aware day plan from the already geo-routed cards.

        `_order_cards` owns the distance algorithm: it clusters days, routes each
        day, and inserts restaurants at the lowest-detour meal windows. This
        method keeps that ordering intact while rendering every day as
        breakfast / lunch / dinner slots plus the surrounding route items.
        """
        cards_by_day: dict[int, list[dict[str, Any]]] = {}
        for card in ordered_cards:
            day = int(card.get("_day") or 1)
            cards_by_day.setdefault(day, []).append(card)
        if not cards_by_day:
            cards_by_day = {1: []}

        board: list[dict[str, Any]] = []
        for day in sorted(cards_by_day):
            day_cards = cards_by_day[day]
            route_cards = [c for c in day_cards if c["type"] != "酒店"]
            hotels = [c for c in day_cards if c["type"] == "酒店"]
            board.extend(self._build_day(state, day, route_cards, hotels))
        return self._enhance_board_with_ai(state, board)

    def _planned_cards_from_board(
        self, ordered_cards: list[dict[str, Any]], board: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        card_by_id = {str(card.get("card_id")): card for card in ordered_cards if card.get("card_id")}
        planned: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in board:
            cid = item.get("card_id")
            key = str(cid) if cid else ""
            if key and key in card_by_id and key not in seen:
                planned.append(card_by_id[key])
                seen.add(key)
        return planned

    def _build_day(
        self,
        state: TripState,
        day: int,
        route_cards: list[dict[str, Any]],
        hotels: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        request = state.structured_request
        departure = request.get("departure_location", "出发地")

        if day == 1:
            items: list[dict[str, Any]] = [{
                "time": "08:00",
                "action": f"从{departure}出发",
                "type": "交通", "day": 1,
                "reason": "先进入核心目的地区域，减少后续来回折返。",
            }]
        else:
            items = [{
                "time": "08:00",
                "action": "第二天 · 继续出发",
                "type": "交通", "day": day,
                "reason": "新的一天，体力恢复，继续探索。",
            }]

        route_items, food_by_meal, meal_positions = self._split_route_by_meal(route_cards)

        breakfast_food = food_by_meal.get("早餐")
        if self._should_include_breakfast_slot(request, day, breakfast_food):
            items.append(self._meal_slot(state, day, "早餐", breakfast_food))

        lunch_cut = meal_positions.get("午餐")
        if lunch_cut is None:
            lunch_cut = (len(route_items) + 1) // 2
        dinner_cut = meal_positions.get("晚餐")
        if dinner_cut is None:
            dinner_cut = len(route_items)
        lunch_cut = max(0, min(lunch_cut, len(route_items)))
        dinner_cut = max(lunch_cut, min(dinner_cut, len(route_items)))

        morning = route_items[:lunch_cut]
        afternoon = route_items[lunch_cut:dinner_cut]
        evening = route_items[dinner_cut:]

        clock = self._parse_start_time("09:30")
        for card in morning:
            items.append(self._sight_item(state, card, clock, day))
            clock += timedelta(minutes=int(card.get("duration_minutes") or 90) + 15)

        items.append(self._meal_slot(state, day, "午餐", food_by_meal.get("午餐")))

        clock = self._parse_start_time("14:00")
        for card in afternoon:
            items.append(self._sight_item(state, card, clock, day))
            clock += timedelta(minutes=int(card.get("duration_minutes") or 90) + 15)

        items.append(self._meal_slot(state, day, "晚餐", food_by_meal.get("晚餐")))

        clock = self._parse_start_time("19:45")
        for card in evening:
            items.append(self._sight_item(state, card, clock, day))
            clock += timedelta(minutes=int(card.get("duration_minutes") or 90) + 15)

        # Overnight hotel caps day 1.
        if hotels:
            hotel = hotels[0]
            hotel_clock = max(self._parse_start_time("20:30"), clock)
            items.append({
                "time": hotel_clock.strftime("%H:%M"),
                "action": hotel["title"],
                "type": "酒店",
                "card_id": hotel["card_id"],
                "duration_minutes": hotel.get("duration_minutes") or 0,
                "day": day,
                "rating": hotel.get("rating") or 0,
                "reason": self._planning_reason(hotel, request, state.weather),
            })
        return items

    def _split_route_by_meal(
        self, route_cards: list[dict[str, Any]]
    ) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], dict[str, int]]:
        """Separate lunch/dinner cards from the routed sequence.

        Hard rule: selected food POIs can only become lunch or dinner. Extra
        restaurants are candidates that lose the slot competition; they do not
        stay in the itinerary as additional food stops.
        """
        route_items: list[dict[str, Any]] = []
        food_by_meal: dict[str, dict[str, Any]] = {}
        meal_positions: dict[str, int] = {}

        for card in route_cards:
            if card["type"] != "美食":
                route_items.append(card)
                continue

            meal = str(card.get("_meal") or self._meal_preference(card))
            if meal not in {"午餐", "晚餐"}:
                meal = "午餐"
            if meal not in food_by_meal:
                food_by_meal[meal] = card
                meal_positions[meal] = len(route_items)

        return route_items, food_by_meal, meal_positions

    _TRANSPORT_ARRIVAL_HINTS = (
        "站", "机场", "高铁", "火车", "动车", "客运", "汽车站", "码头"
    )
    _CITY_HINTS = (
        "北京", "深圳", "广州", "上海", "杭州", "成都", "重庆", "武汉", "南京",
        "西安", "天津", "河北", "保定", "香港", "澳门", "苏州", "佛山", "东莞",
    )
    _SCENE_CITY_HINTS = {
        "sz": ("深圳", "shenzhen"),
        "bj": ("北京", "beijing"),
    }

    def _should_include_breakfast_slot(
        self,
        request: dict[str, Any],
        day: int,
        breakfast_food: dict[str, Any] | None,
    ) -> bool:
        if breakfast_food is not None:
            return True
        if day > 1:
            return True
        return not self._is_first_day_arrival(request)

    def _is_first_day_arrival(self, request: dict[str, Any]) -> bool:
        departure = str(request.get("departure_location") or "")
        if not departure:
            return False

        # A station/airport style start means the traveller has just arrived or
        # is still in city-to-city transit; breakfast should happen before this
        # destination itinerary unless the user picked a real breakfast shop.
        if any(hint in departure for hint in self._TRANSPORT_ARRIVAL_HINTS):
            return True

        if self._departure_matches_destination(request, departure):
            return False

        destination = str(request.get("destination") or "")
        destination_tokens = set(self._destination_tokens(request))
        for city in self._CITY_HINTS:
            if city in departure and city not in destination and city not in destination_tokens:
                return True
        return False

    def _departure_matches_destination(
        self, request: dict[str, Any], departure: str
    ) -> bool:
        departure_lower = departure.lower()
        for token in self._destination_tokens(request):
            if token and token.lower() in departure_lower:
                return True
        return False

    def _destination_tokens(self, request: dict[str, Any]) -> tuple[str, ...]:
        destination = str(request.get("destination") or "")
        scene = str(request.get("scene") or "")
        tokens = [destination]
        tokens.extend(self._SCENE_CITY_HINTS.get(scene, ()))
        if "北京" in destination:
            tokens.extend(("北京", "beijing"))
        if "深圳" in destination:
            tokens.extend(("深圳", "shenzhen"))
        if "香港" in destination:
            tokens.extend(("香港", "hong kong"))
        return tuple(dict.fromkeys(token for token in tokens if token))

    def _sight_item(
        self, state: TripState, card: dict[str, Any], clock: datetime, day: int
    ) -> dict[str, Any]:
        return {
            "time": clock.strftime("%H:%M"),
            "action": card["title"],
            "type": card["type"],
            "card_id": card["card_id"],
            "duration_minutes": card.get("duration_minutes") or 90,
            "day": day,
            "rating": card.get("rating") or 0,
            "reason": self._planning_reason(card, state.structured_request, state.weather),
        }

    def _meal_slot(
        self, state: TripState, day: int, meal: str, food: dict[str, Any] | None
    ) -> dict[str, Any]:
        """A meal-time row: the picked restaurant if one was assigned, else a
        self-arranged placeholder so every day still reads as a full 早/午/晚."""
        time_str = self._MEAL_TIMES[meal]
        if food is not None:
            return {
                "time": time_str,
                "action": food["title"],
                "type": "美食",
                "card_id": food["card_id"],
                "duration_minutes": food.get("duration_minutes") or 60,
                "day": day,
                "meal": meal,
                "rating": food.get("rating") or 0,
                "reason": self._planning_reason(food, state.structured_request, state.weather),
            }
        if meal == "早餐":
            action = "早餐 · 酒店含早 / 自理"
            reason = "酒店含早或就近解决，不占用团购名额。"
        else:
            action = f"{meal} · 自理"
            reason = "这一餐先留个位，想团购可回挑选页加购。"
        return {
            "time": time_str,
            "action": action,
            "type": "美食",
            "duration_minutes": 60,
            "day": day,
            "meal": meal,
            "self_arranged": True,
            "reason": reason,
        }

    def _route_sights(self, sights: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Geo-route a day's sights (nearest-neighbour + 2-opt) then de-fatigue."""
        if len(sights) <= 1:
            return list(sights)
        ordered = self._nearest_neighbor(sights)
        if len(ordered) >= 3:
            ordered = self._two_opt(ordered)
        return self._balance_fatigue(ordered)

    # Cuisine keywords (substring-matched against a card's category_2), so
    # "烧烤烤串" still reads as a dinner, "精品咖啡" as a lunch, etc.
    _BREAKFAST_KEYWORDS = ("早餐", "早茶", "粥", "包子", "豆浆")
    _DINNER_KEYWORDS = ("火锅", "烧烤", "烤肉", "烤串", "自助", "烫", "海鲜", "夜宵", "酒馆")
    _LUNCH_KEYWORDS  = ("咖啡", "饮品", "面包", "甜品", "小吃", "快餐", "茶", "简餐", "轻食")

    def _meal_preference(self, food: dict[str, Any]) -> str:
        text = " ".join(
            [
                str(food.get("category_2") or ""),
                str(food.get("title") or ""),
                " ".join(str(tag) for tag in food.get("tags", [])[:4]),
            ]
        )
        if any(k in text for k in self._BREAKFAST_KEYWORDS):
            return "午餐"
        if any(k in text for k in self._DINNER_KEYWORDS):
            return "晚餐"
        if any(k in text for k in self._LUNCH_KEYWORDS):
            return "午餐"
        return "午餐"  # neutral cuisines default to lunch

    def _distribute_foods(
        self, foods: list[dict[str, Any]], num_days: int
    ) -> dict[tuple[int, str], dict[str, Any] | None]:
        """Assign picked restaurants only to lunch/dinner slots."""
        slots: dict[tuple[int, str], dict[str, Any] | None] = {
            (d, meal): None
            for d in range(1, num_days + 1)
            for meal in ("午餐", "晚餐")
        }
        per_day = {d: 0 for d in range(1, num_days + 1)}

        def place(food: dict[str, Any], meals: tuple[str, ...]) -> None:
            # Try each meal in preference order, on the least-busy day that has
            # that slot open — this spreads meals evenly across days.
            for meal in meals:
                for d in sorted(range(1, num_days + 1), key=lambda x: per_day[x]):
                    if slots[(d, meal)] is None:
                        slots[(d, meal)] = food
                        per_day[d] += 1
                        return

        for food in foods:
            pref = self._meal_preference(food)
            other = "晚餐" if pref == "午餐" else "午餐"
            place(food, (pref, other))
        return slots

    def _llm_rerank(
        self,
        state: TripState,
        cards: list[dict[str, Any]],
        request: dict[str, Any],
        prev_variant_id: str | None,
    ) -> list[dict[str, Any]] | None:
        baseline = self._order_cards(cards)
        baseline_ids = [str(c["card_id"]) for c in baseline]
        # When the caller passed a previous variantId, seed the LLM with a
        # different starting order so it has something concrete to vary from.
        seed_ids = (
            [str(c["card_id"]) for c in self._heuristic_rerank(cards, prev_variant_id)]
            if prev_variant_id
            else baseline_ids
        )
        payload = {
            "structured_request": request,
            "weather": state.weather,
            "previous_variant_id": prev_variant_id,
            "seed_order": seed_ids,
            "cards": [
                {
                    "card_id": c["card_id"],
                    "title": c.get("title"),
                    "type": c.get("type"),
                    "tags": c.get("tags", []),
                    "duration_minutes": c.get("duration_minutes"),
                    "area": c.get("area"),
                }
                for c in cards
            ],
        }
        system_prompt = (
            "你是 ItineraryPlannerAgent，负责给一日行程的卡片排序。要求：\n"
            "1) 节奏合理：避免连续多个高强度景点，餐饮穿插在两个景点之间作为体力恢复；\n"
            "2) 结合 weather 与 structured_request（intensity、special_groups）调整动线；\n"
            "3) 若 previous_variant_id 不为空，请给出与上一次明显不同的排序"
            "（可参考 seed_order 作为差异化起点，例如调整餐饮位置、把热门景点移到上午或下午、把酒店放最后等），"
            "且与默认排序至少有 2 处位置不同；\n"
            "4) order 必须包含且仅包含给定的全部 card_id，不可遗漏或新增；\n"
            "5) 只返回 JSON：{\"order\": [\"card_id\", ...], \"summary\": \"为什么这样排\"}。"
        )
        # Use higher temperature when rerank is asked for variety
        temperature = 0.9 if prev_variant_id else 0.5
        data, result = chat_json(system_prompt, payload, temperature=temperature)
        _trace_ai(state, "ItineraryPlannerAgent.rerank", result)
        if not data or not isinstance(data.get("order"), list):
            return None

        card_by_id = {str(c["card_id"]): c for c in cards}
        ordered: list[dict[str, Any]] = []
        seen: set[str] = set()
        for cid in data["order"]:
            key = str(cid)
            if key in card_by_id and key not in seen:
                ordered.append(card_by_id[key])
                seen.add(key)
        if len(ordered) != len(cards):
            return None

        # If LLM regurgitated the baseline despite being asked to vary, force
        # a heuristic rotation so the user actually sees a different plan.
        if prev_variant_id and [str(c["card_id"]) for c in ordered] == baseline_ids:
            return self._heuristic_rerank(cards, prev_variant_id)
        return ordered

    def _heuristic_rerank(
        self, cards: list[dict[str, Any]], prev_variant_id: str | None
    ) -> list[dict[str, Any]]:
        base = self._order_cards(cards)
        if not prev_variant_id or len(base) < 2:
            return base
        # Rotate the order deterministically by hashing the previous variant
        offset = (abs(hash(prev_variant_id)) % (len(base) - 1)) + 1
        return base[offset:] + base[:offset]

    # ------------------------------------------------------------------
    # Fatigue scores per subcategory (高 = more tiring, 0 = restful)
    # ------------------------------------------------------------------
    _FATIGUE: dict[str, int] = {
        "自然景观": 3, "主题乐园": 3,
        "公园/广场": 2, "观光街区": 2, "人文古迹": 2,
        "博物馆": 1, "展览馆": 1, "更多景点/周边游": 1,
        # food / hotel = rest
        "美食": 0, "火锅": 0, "烤肉": 0, "咖啡厅": 0,
        "饮品店": 0, "小吃快餐": 0, "面包/饮品": 0, "自助餐": 0,
        "酒店": 0,
    }
    # Food subcategories preferred at lunch vs dinner
    _LUNCH_CATS: frozenset[str] = frozenset({"咖啡厅", "饮品店", "面包/饮品", "小吃快餐"})
    _DINNER_CATS: frozenset[str] = frozenset({"火锅", "烤肉", "自助餐"})

    def _order_cards(self, cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """
        Three-layer smart ordering:
          1. Geographic sight clustering → Day 1 / Day 2 groups
          2. Within each day: nearest-neighbour routing + 2-opt improvement
          3. Fatigue balancing + meal insertion at lunch / dinner positions
        Hotels are always placed at the end of their day.
        Each returned card is tagged with _day=1 or _day=2.
        """
        hotels = [c for c in cards if c["type"] == "酒店"]
        route_cards = [c for c in cards if c["type"] != "酒店"]
        sights = [c for c in route_cards if c["type"] != "美食"]
        foods = [c for c in route_cards if c["type"] == "美食"]

        if not route_cards:
            for c in cards:
                c["_day"] = 1
            return cards

        # ── Layer 1: day clustering ────────────────────────────────────
        # A 2-day trip must have at least one sight on each day whenever the
        # user picked two or more sights. Foods are assigned after that by
        # proximity, so restaurants cannot accidentally consume Day 2 by
        # themselves while all attractions stay on Day 1.
        if len(sights) >= 2:
            day1_sights, day2_sights = self._split_sights_across_days(sights)
            day1_foods, day2_foods = self._assign_foods_to_days(
                foods, day1_sights, day2_sights
            )
            day1_raw = day1_sights + day1_foods
            day2_raw = day2_sights + day2_foods
        else:
            day1_raw, day2_raw = route_cards, []

        # ── Layer 2+3: route each day ──────────────────────────────────
        day1_ordered = self._route_day(day1_raw)
        day2_ordered = self._route_day(day2_raw) if day2_raw else []

        # Hotels: first hotel caps Day 1, second caps Day 2
        if hotels:
            day1_ordered.append(hotels[0])
        if len(hotels) > 1 and day2_ordered:
            day2_ordered.append(hotels[1])
        elif len(hotels) > 1:
            day1_ordered.append(hotels[1])

        # Tag cards so _build_board knows which day each belongs to
        for c in day1_ordered:
            c["_day"] = 1
        for c in day2_ordered:
            c["_day"] = 2

        return day1_ordered + day2_ordered

    def _split_sights_across_days(
        self, sights: list[dict[str, Any]]
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        if len(sights) < 2:
            return list(sights), []

        day1, day2 = self._cluster_days(sights)
        if day1 and day2:
            return day1, day2

        ordered = self._nearest_neighbor(sights)
        split_at = (len(ordered) + 1) // 2
        day1 = ordered[:split_at]
        day2 = ordered[split_at:]
        if not day2 and len(day1) > 1:
            day2 = [day1.pop()]
        return day1, day2

    def _assign_foods_to_days(
        self,
        foods: list[dict[str, Any]],
        day1_sights: list[dict[str, Any]],
        day2_sights: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        day1_foods: list[dict[str, Any]] = []
        day2_foods: list[dict[str, Any]] = []
        for food in foods:
            d1 = self._distance_to_group(food, day1_sights)
            d2 = self._distance_to_group(food, day2_sights)
            if d1 == d2:
                (day1_foods if len(day1_foods) <= len(day2_foods) else day2_foods).append(food)
            elif d1 < d2:
                day1_foods.append(food)
            else:
                day2_foods.append(food)
        return day1_foods, day2_foods

    def _distance_to_group(
        self, poi: dict[str, Any], group: list[dict[str, Any]]
    ) -> float:
        if not group:
            return float("inf")
        if not (poi.get("lat") and poi.get("lng")):
            return float("inf")
        distances = [
            _haversine(poi["lat"], poi["lng"], item["lat"], item["lng"])
            for item in group
            if item.get("lat") and item.get("lng")
        ]
        return min(distances) if distances else float("inf")

    # ------------------------------------------------------------------
    # Layer 1 — Geographic K-means clustering into two days
    # ------------------------------------------------------------------

    def _cluster_days(
        self, pois: list[dict[str, Any]]
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Split POIs into two geographically compact day-clusters.

        Uses 3 iterations of K-means starting from the two farthest points.
        Falls back to an even count split when fewer than 4 POIs have coords.
        """
        with_coords = [
            (c, c["lat"], c["lng"])
            for c in pois
            if c.get("lat") and c.get("lng")
        ]
        without_coords = [c for c in pois if not (c.get("lat") and c.get("lng"))]

        if len(with_coords) < 2:
            half = len(pois) // 2 + (len(pois) % 2)
            return pois[:half], pois[half:]

        # Initialise centroids as the two farthest points
        best_dist = -1.0
        ci, cj = 0, len(with_coords) - 1
        for i in range(len(with_coords)):
            for j in range(i + 1, len(with_coords)):
                d = _haversine(
                    with_coords[i][1], with_coords[i][2],
                    with_coords[j][1], with_coords[j][2],
                )
                if d > best_dist:
                    best_dist, ci, cj = d, i, j

        c1 = (with_coords[ci][1], with_coords[ci][2])
        c2 = (with_coords[cj][1], with_coords[cj][2])
        grp1: list[tuple[dict, float, float]] = []
        grp2: list[tuple[dict, float, float]] = []

        for _ in range(3):
            grp1, grp2 = [], []
            for poi, lat, lng in with_coords:
                if _haversine(lat, lng, c1[0], c1[1]) <= _haversine(lat, lng, c2[0], c2[1]):
                    grp1.append((poi, lat, lng))
                else:
                    grp2.append((poi, lat, lng))
            if not grp1 or not grp2:
                break
            c1 = (
                sum(lat for _, lat, _ in grp1) / len(grp1),
                sum(lng for _, _, lng in grp1) / len(grp1),
            )
            c2 = (
                sum(lat for _, lat, _ in grp2) / len(grp2),
                sum(lng for _, _, lng in grp2) / len(grp2),
            )

        day1: list[dict] = [p for p, _, _ in grp1]
        day2: list[dict] = [p for p, _, _ in grp2]

        # Distribute coord-less POIs evenly
        for i, poi in enumerate(without_coords):
            (day1 if i % 2 == 0 else day2).append(poi)

        # Rebalance: Day 2 needs at least 2 non-hotel POIs for a meaningful day
        while len(day2) < 2 and len(day1) > 2:
            day2.insert(0, day1.pop(-1))

        return day1, day2

    # ------------------------------------------------------------------
    # Layer 2 — Within-day geographic routing
    # ------------------------------------------------------------------

    def _route_day(self, pois: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Order a single day: geo-route sights, then insert meals at meal times."""
        if len(pois) <= 1:
            return list(pois)

        sights = [c for c in pois if c["type"] not in ("美食", "酒店")]
        foods  = [c for c in pois if c["type"] == "美食"]

        # Geo-route the sights
        ordered_sights = self._nearest_neighbor(sights)
        if len(ordered_sights) >= 3:
            ordered_sights = self._two_opt(ordered_sights)

        # Layer 3: fatigue balancing (no consecutive high-fatigue sights)
        ordered_sights = self._balance_fatigue(ordered_sights)

        # Insert food at meal-appropriate positions
        return self._insert_meals(ordered_sights, foods)

    def _nearest_neighbor(self, pois: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Greedy nearest-neighbour starting from the highest-rated POI."""
        if len(pois) <= 1:
            return list(pois)

        if not all(c.get("lat") and c.get("lng") for c in pois):
            # No coords: sort by rating descending
            return sorted(pois, key=lambda c: -(c.get("rating") or 0))

        unvisited = list(pois)
        cur = max(unvisited, key=lambda c: c.get("rating") or 0)
        unvisited.remove(cur)
        path = [cur]

        while unvisited:
            nxt = min(
                unvisited,
                key=lambda c: _haversine(cur["lat"], cur["lng"], c["lat"], c["lng"]),
            )
            path.append(nxt)
            unvisited.remove(nxt)
            cur = nxt

        return path

    def _two_opt(self, pois: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """2-opt local search: swap reversed segments if they shorten the route."""
        if not all(c.get("lat") and c.get("lng") for c in pois):
            return pois

        def _total(path: list[dict]) -> float:
            return sum(
                _haversine(path[i]["lat"], path[i]["lng"],
                           path[i + 1]["lat"], path[i + 1]["lng"])
                for i in range(len(path) - 1)
            )

        best = list(pois)
        improved = True
        while improved:
            improved = False
            for i in range(1, len(best) - 1):
                for j in range(i + 1, len(best)):
                    candidate = best[:i] + best[i:j + 1][::-1] + best[j + 1:]
                    if _total(candidate) < _total(best) - 0.01:   # 10m threshold
                        best = candidate
                        improved = True
        return best

    # ------------------------------------------------------------------
    # Layer 3 — Fatigue balancing & meal insertion
    # ------------------------------------------------------------------

    def _balance_fatigue(self, sights: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Ensure no two consecutive high-fatigue (score ≥ 3) activities."""
        def score(c: dict) -> int:
            return self._FATIGUE.get(c.get("category_2", ""), 1)

        result = list(sights)
        for _ in range(8):
            swapped = False
            for i in range(len(result) - 1):
                if score(result[i]) >= 3 and score(result[i + 1]) >= 3:
                    # Find the nearest low-fatigue item further in the list
                    for j in range(i + 2, len(result)):
                        if score(result[j]) < 3:
                            result.insert(i + 1, result.pop(j))
                            swapped = True
                            break
            if not swapped:
                break
        return result

    def _insert_meals(
        self, sights: list[dict[str, Any]], foods: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Insert food items at minimum-detour positions within meal windows.

        For each food POI we find the insertion index that minimises the extra
        distance added to the geo-routed sight sequence:
            detour(i) = dist(i-1 → food) + dist(food → i) - dist(i-1 → i)

        Timing constraints keep each meal in the right part of the day:
          - lunch: first 55 % of the route
          - dinner: last 55 % (i.e., index ≥ 45 % of current route)
        When coordinates are missing we fall back to the old positional approach.
        """
        if not foods:
            return sights

        result = list(sights)
        remaining = list(foods)
        for meal in ("午餐", "晚餐"):
            food = self._choose_food_for_meal(remaining, result, meal)
            if food is None:
                continue
            remaining.remove(food)
            food["_meal"] = meal
            lo, hi = self._meal_window(meal, len(result))
            result = self._insert_min_detour(result, food, lo=lo, hi=hi)
        return result

    def _choose_food_for_meal(
        self,
        foods: list[dict[str, Any]],
        route: list[dict[str, Any]],
        meal: str,
    ) -> dict[str, Any] | None:
        if not foods:
            return None
        lo, hi = self._meal_window(meal, len(route))
        return min(
            foods,
            key=lambda food: (
                0 if self._meal_preference(food) == meal else 1,
                self._min_detour_cost(route, food, lo, hi),
                -(food.get("rating") or 0),
            ),
        )

    def _meal_window(self, meal: str, route_length: int) -> tuple[int, int]:
        if route_length <= 0:
            return 0, 0
        if meal == "晚餐":
            lo = max(1, round(route_length * 0.45))
            return lo, route_length
        hi = max(1, round(route_length * 0.55))
        lo = 1 if route_length > 1 else 0
        return lo, hi

    def _min_detour_cost(
        self,
        route: list[dict[str, Any]],
        food: dict[str, Any],
        lo: int,
        hi: int,
    ) -> float:
        n = len(route)
        if n == 0:
            return 0.0
        lo = max(0, min(lo, n))
        hi = max(lo, min(hi, n))
        if not (food.get("lat") and food.get("lng")):
            return float("inf")
        if not all(c.get("lat") and c.get("lng") for c in route):
            return float("inf")

        best = float("inf")
        for i in range(lo, hi + 1):
            if i == 0:
                cost = _haversine(
                    food["lat"], food["lng"],
                    route[0]["lat"], route[0]["lng"],
                )
            elif i == n:
                cost = _haversine(
                    route[-1]["lat"], route[-1]["lng"],
                    food["lat"], food["lng"],
                )
            else:
                prev_c, next_c = route[i - 1], route[i]
                cost = (
                    _haversine(prev_c["lat"], prev_c["lng"],
                               food["lat"], food["lng"])
                    + _haversine(food["lat"], food["lng"],
                                 next_c["lat"], next_c["lng"])
                    - _haversine(prev_c["lat"], prev_c["lng"],
                                 next_c["lat"], next_c["lng"])
                )
            best = min(best, cost)
        return best

    def _insert_min_detour(
        self,
        route: list[dict[str, Any]],
        food: dict[str, Any],
        lo: int,
        hi: int,
    ) -> list[dict[str, Any]]:
        """Insert *food* into *route* at the index in [lo, hi] with minimum detour.

        If any POI is missing coordinates we fall back to the midpoint of [lo, hi].
        """
        n = len(route)
        lo = max(0, min(lo, n))
        hi = max(lo, min(hi, n))

        has_food_coords = food.get("lat") and food.get("lng")
        has_route_coords = all(c.get("lat") and c.get("lng") for c in route)

        if not has_food_coords or not has_route_coords or n == 0:
            # Fallback: midpoint of allowed range
            pos = max(lo, min(hi, (lo + hi) // 2))
            result = list(route)
            result.insert(pos, food)
            return result

        best_pos    = lo
        best_detour = float("inf")

        for i in range(lo, hi + 1):
            if i == 0:
                d = _haversine(
                    food["lat"], food["lng"],
                    route[0]["lat"], route[0]["lng"],
                )
            elif i == n:
                d = _haversine(
                    route[-1]["lat"], route[-1]["lng"],
                    food["lat"], food["lng"],
                )
            else:
                prev_c, next_c = route[i - 1], route[i]
                if not (prev_c.get("lat") and next_c.get("lat")):
                    continue
                d = (
                    _haversine(prev_c["lat"], prev_c["lng"],
                               food["lat"], food["lng"])
                    + _haversine(food["lat"], food["lng"],
                                 next_c["lat"], next_c["lng"])
                    - _haversine(prev_c["lat"], prev_c["lng"],
                                 next_c["lat"], next_c["lng"])
                )
            if d < best_detour:
                best_detour = d
                best_pos = i

        result = list(route)
        result.insert(best_pos, food)
        return result

    def _planning_reason(
        self, card: dict[str, Any], request: dict[str, Any], weather: dict[str, Any]
    ) -> str:
        reasons = [card["reason"]]
        if request.get("intensity") == "low":
            reasons.append("按低强度路线编排，预留缓冲时间")
        if (weather.get("rain_probability") or 0) >= 30:
            reasons.append("天气存在不确定性，建议保留室内或近距离备选")
        return "；".join(reasons)

    def _parse_start_time(self, value: str) -> datetime:
        return datetime.strptime(value, "%H:%M")

    def _enhance_board_with_ai(
        self, state: TripState, board: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        payload = {
            "structured_request": state.structured_request,
            "weather": state.weather,
            "selected_cards": state.selected_cards,
            "static_board": board,
        }
        system_prompt = (
            "你是出行规划 App 的 ItineraryPlannerAgent。"
            "请在不编造 POI、不改变 card_id、不改变既有时间格式的前提下，"
            "优化每个行程节点的 reason，让它更像真实产品里的解释。"
            "只返回 JSON：{\"static_board\": [...]}。"
        )
        data, result = chat_json(system_prompt, payload)
        _trace_ai(state, "ItineraryPlannerAgent", result)

        ai_board = data.get("static_board") if data else None
        if not isinstance(ai_board, list) or len(ai_board) != len(board):
            return board

        enhanced = []
        for original, ai_item in zip(board, ai_board):
            reason = ai_item.get("reason") if isinstance(ai_item, dict) else None
            enhanced.append({**original, "reason": reason or original["reason"]})
        return enhanced


class RuntimeMonitorAgent:
    def run(self, state: TripState, runtime_payload: dict[str, Any]) -> TripState:
        runtime_context = runtime_payload.get("runtime_context") or state.runtime_context
        flags = runtime_context.get("trigger_flags", {})
        events: list[dict[str, Any]] = []

        if flags.get("page_stay_over_10s"):
            events.append(
                {
                    "event_type": "map_stay",
                    "level": "info",
                    "message": "你已经在地图页停留了一会儿，可以给出附近短暂停留建议。",
                }
            )

        if flags.get("weather_risk"):
            events.append(
                {
                    "event_type": "weather_risk",
                    "level": "warning",
                    "message": "当前降雨概率较高，建议优先选择近距离或室内节点。",
                }
            )

        if flags.get("checked_in_now"):
            nearest = runtime_context.get("checkin_status", {}).get("nearest") or {}
            events.append(
                {
                    "event_type": "checkin_success",
                    "level": "success",
                    "message": f"已到达 {nearest.get('title', '当前点位')}，打卡状态已更新。",
                    "checkin_status": runtime_context.get("checkin_status"),
                }
            )

        if flags.get("taxi_recommended"):
            events.append(
                {
                    "event_type": "taxi_suggestion",
                    "level": "info",
                    "message": "下一段距离较远，同行人数较多时建议打车。",
                    "taxi_quote": runtime_context.get("taxi_quote"),
                }
            )

        if flags.get("has_trace_points"):
            events.append(
                {
                    "event_type": "mapmatch_status",
                    "level": "info",
                    "message": "已尝试进行轨迹纠偏，用于判断是否偏离既定路线。",
                    "mapmatch": runtime_context.get("mapmatch_status"),
                }
            )

        if flags.get("route_deviation"):
            events.append(
                {
                    "event_type": "route_deviation",
                    "level": "warning",
                    "message": "轨迹与路线存在偏差，建议重新计算下一段路线。",
                    "route_progress": runtime_context.get("route_progress"),
                }
            )

        events = self._enhance_events_with_ai(state, events, runtime_payload)
        state.runtime_events.extend(events)
        state.stage = "executing"
        return state

    def _enhance_events_with_ai(
        self,
        state: TripState,
        events: list[dict[str, Any]],
        runtime_payload: dict[str, Any],
    ) -> list[dict[str, Any]]:
        if not events:
            return events

        payload = {
            "structured_request": state.structured_request,
            "weather": state.runtime_context.get("weather_snapshot") or state.weather,
            "runtime_payload": runtime_payload,
            "runtime_context": state.runtime_context,
            "events": events,
        }
        system_prompt = (
            "你是出行执行阶段的 RuntimeMonitorAgent。"
            "事实判断已经由接口完成，你只负责把 message 改写成简洁、友好、可执行的提醒。"
            "不要改变 event_type、level、taxi_quote。"
            "只返回 JSON：{\"events\": [...]}。"
        )
        data, result = chat_json(system_prompt, payload)
        _trace_ai(state, "RuntimeMonitorAgent", result)

        ai_events = data.get("events") if data else None
        if not isinstance(ai_events, list) or len(ai_events) != len(events):
            return events

        enhanced = []
        for original, ai_item in zip(events, ai_events):
            message = ai_item.get("message") if isinstance(ai_item, dict) else None
            enhanced.append({**original, "message": message or original["message"]})
        return enhanced


class MicroRecommendAgent:
    def run(self, state: TripState, trigger: dict[str, Any]) -> TripState:
        recommendations: list[dict[str, Any]] = []
        trigger_type = trigger.get("trigger_type", "manual")
        request = state.structured_request
        scene = request.get("scene") or _dest_to_scene(request.get("destination", ""))

        # 1. Real nearby POIs from DianpingDB
        current_loc = trigger.get("current_location") or {}
        lat = current_loc.get("lat") or current_loc.get("latitude")
        lng = current_loc.get("lng") or current_loc.get("longitude")
        nearby_pois: list[dict] = []
        if lat and lng:
            db = get_db()
            nearby_pois = db.nearby(
                float(lat), float(lng), scene,
                radius_km=2.0,
                categories=["美食", "景点"],
                limit=8,
            )

        if nearby_pois and trigger.get("page_stay_seconds", 0) >= 10:
            poi = nearby_pois[0]
            recommendations.append({
                "popup_type": "nearby_rest",
                "title": f"附近推荐：{poi['title']}",
                "message": f"{poi.get('area','')} · ★{poi.get('rating','')} · "
                           f"{poi.get('category_2',poi['type'])}",
                "action": "view_detail",
                "card_id": poi["card_id"],
                "poi": poi,
            })
        elif trigger.get("page_stay_seconds", 0) >= 10:
            recommendations.append({
                "popup_type": "nearby_rest",
                "title": "休息一下",
                "message": "附近可以安排一个短暂停留点，不会明显打乱后续行程。",
                "action": "view_detail",
            })

        if trigger.get("is_meal_time"):
            # Prefer a nearby food POI over a fixed card
            food_nearby = [p for p in nearby_pois if p["type"] == "美食"]
            if food_nearby:
                poi = food_nearby[0]
                recommendations.append({
                    "popup_type": "food_recommendation",
                    "title": f"到饭点了 · {poi['title']}",
                    "message": f"距你 {_approx_dist_label(lat, lng, poi)} · "
                               f"★{poi.get('rating','')} · "
                               + ("、".join(poi.get("recommended", [])[:2]) or poi.get("category_2", "")),
                    "action": "view_detail",
                    "card_id": poi["card_id"],
                    "poi": poi,
                })
            else:
                food_card = self._first_card_by_type(state.candidate_cards, "美食")
                if food_card:
                    recommendations.append({
                        "popup_type": "food_recommendation",
                        "title": "到饭点了",
                        "message": f"可以考虑 {food_card['title']}，移动距离较短，适合作为补给点。",
                        "action": "view_detail",
                        "card_id": food_card["card_id"],
                    })

        if (state.weather.get("rain_probability") or 0) >= 50:
            recommendations.append({
                "popup_type": "weather_tip",
                "title": "天气提醒",
                "message": "降雨概率偏高，建议优先选择室内或距离更近的点位。",
                "action": "adjust_route",
            })

        if not recommendations:
            # Return nearby POIs as general recs even without a specific trigger
            if nearby_pois:
                for poi in nearby_pois[:3]:
                    recommendations.append({
                        "popup_type": "nearby_poi",
                        "title": poi["title"],
                        "message": f"{poi.get('area','')} · ★{poi.get('rating','')} · {poi.get('category_2','')}",
                        "action": "view_detail",
                        "card_id": poi["card_id"],
                        "poi": poi,
                    })
            else:
                recommendations.append({
                    "popup_type": "route_tip",
                    "title": "路线正常",
                    "message": f"当前触发来源为 {trigger_type}，暂不需要调整路线。",
                    "action": "dismiss",
                })

        recommendations = self._enhance_recommendations_with_ai(state, recommendations, trigger)
        state.recommendations.extend(recommendations)
        return state

    def _first_card_by_type(
        self, cards: list[dict[str, Any]], card_type: str
    ) -> dict[str, Any] | None:
        return next((card for card in cards if card["type"] == card_type), None)

    def _enhance_recommendations_with_ai(
        self,
        state: TripState,
        recommendations: list[dict[str, Any]],
        trigger: dict[str, Any],
    ) -> list[dict[str, Any]]:
        payload = {
            "structured_request": state.structured_request,
            "weather": state.weather,
            "trigger": trigger,
            "recommendations": recommendations,
            "candidate_cards": state.candidate_cards,
        }
        system_prompt = (
            "你是地图页轻量弹窗的 MicroRecommendAgent。"
            "请优化 title 和 message，让推荐更像美团本地生活场景。"
            "不要编造候选卡片之外的商户，不要改变 popup_type、action、card_id。"
            "只返回 JSON：{\"recommendations\": [...]}。"
        )
        data, result = chat_json(system_prompt, payload)
        _trace_ai(state, "MicroRecommendAgent", result)

        ai_recommendations = data.get("recommendations") if data else None
        if not isinstance(ai_recommendations, list) or len(ai_recommendations) != len(recommendations):
            return recommendations

        enhanced = []
        for original, ai_item in zip(recommendations, ai_recommendations):
            if not isinstance(ai_item, dict):
                enhanced.append(original)
                continue
            enhanced.append(
                {
                    **original,
                    "title": ai_item.get("title") or original["title"],
                    "message": ai_item.get("message") or original["message"],
                }
            )
        return enhanced


class PosterAgent:
    def run(self, state: TripState) -> TripState:
        checked_count = state.checkin_status.get("count", 0)
        total = len(state.selected_cards)
        destination = state.structured_request["destination"]
        preference = (state.structured_request.get("preferences") or ["轻松"])[0]

        fallback_poster = {
            "title": f"今天点亮了 {checked_count or total} 个{destination}角落",
            "subtitle": f"一条适合{preference}出行的路线",
            "share_text": "我们把日常推开一条缝，让城市的光从路线里照进来。每一次抵达，都是对生活重新说是。",
            "poster_style": "retro_meituan_travel_summary",
            "layout": "netease_yearly_summary_route_poster",
        }
        poster = self._create_poster_with_ai(state, fallback_poster)
        state.poster = {**poster, **generate_trip_poster_png(state, poster)}
        state.stage = "completed"
        return state

    def _create_poster_with_ai(
        self, state: TripState, fallback_poster: dict[str, Any]
    ) -> dict[str, Any]:
        payload = {
            "structured_request": state.structured_request,
            "selected_cards": state.selected_cards,
            "checkin_status": state.checkin_status,
            "route_plan": state.route_plan,
            "fallback_poster": fallback_poster,
        }
        system_prompt = (
            "你是出行分享海报的 PosterAgent。"
            "请生成适合社交媒体传播的中文旅行总结海报文案。"
            "语言要有哲学散文的力度：像存在主义、格言体和清澈反抗精神，但必须是原创，"
            "不要引用或改写任何作家的原句，不要出现尼采、加缪等作家姓名。"
            "标题要短而有记忆点，副标题体现路线特点，share_text 要优美、克制、适合海报。"
            "必须包含本次旅行真实信息的精神概括，不要编造候选点之外的地点。"
            "只返回 JSON，字段必须为 title、subtitle、share_text、poster_style、layout。"
        )
        data, result = chat_json(system_prompt, payload)
        _trace_ai(state, "PosterAgent", result)

        if not isinstance(data, dict):
            return fallback_poster

        return {
            "title": data.get("title") or fallback_poster["title"],
            "subtitle": data.get("subtitle") or fallback_poster["subtitle"],
            "share_text": data.get("share_text") or fallback_poster["share_text"],
            "poster_style": fallback_poster["poster_style"],
            "layout": fallback_poster["layout"],
        }


def _approx_dist_label(lat: Any, lng: Any, poi: dict) -> str:
    """Return a human-readable distance string, e.g. '约300米'."""
    import math
    try:
        lat1, lon1 = float(lat), float(lng)
        lat2, lon2 = float(poi["lat"]), float(poi["lon"])
        R = 6371000
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dp = math.radians(lat2 - lat1)
        dl = math.radians(lon2 - lon1)
        a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        dist = R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        if dist < 1000:
            return f"约{int(dist / 100) * 100}米"
        return f"约{dist / 1000:.1f}km"
    except Exception:
        return "附近"


def _trace_ai(state: TripState, agent: str, result: LLMResult) -> None:
    state.ai_trace.append(
        {
            "agent": agent,
            "provider": result.provider,
            "model": result.model,
            "used": result.used,
            "status": "called" if result.used else "fallback",
            "error": result.error,
        }
    )
