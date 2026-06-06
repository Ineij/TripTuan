"""Deterministic scene presets (剧本) — no LLM.

When the user accepts a scene's defaults (default preferences, just clicking
through), the whole trip is built straight from a bundled preset JSON
(``backend/data/<scene>_preset.json``) instead of running POISelectionAgent +
ItineraryPlannerAgent. The "两天一晚" variants cycle on 重新生成.

Currently 深圳 (``sz``) and 北京 (``bj``) ship presets; any other scene falls
back to the LLM pipeline.

The module is self-contained: it converts the script's POI names into full
candidate cards via the Dianping DB (so every stop keeps its real rating,
price, coordinates and bundled image), then renders a static board in the same
shape the ItineraryPlannerAgent would have produced — so all downstream
adapters (`_board_to_days`, order draft, board view) work unchanged.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from backend.agents import POISelectionAgent
from backend.core.models import TripState
from backend.data.dianping_db import get_db

_DATA_DIR = Path(__file__).resolve().parents[1] / "data"

# Scenes that ship a deterministic preset script.
PRESET_SCENES: tuple[str, ...] = ("sz", "bj")

# The default preferences the frontend seeds for every scene (see
# frontend/src/store.tsx → defaultIdentity). The preset script is the default
# experience as long as the user keeps these — or never touches them.
_DEFAULT_PREFS: frozenset[str] = frozenset({"打卡行", "爱美食"})

_NO_HOTEL = {"", "无住宿安排"}

_card_converter = POISelectionAgent()._db_to_card


def _preset_path(scene: str) -> Path:
    return _DATA_DIR / f"{scene}_preset.json"


def has_preset(scene: str) -> bool:
    return scene in PRESET_SCENES and _preset_path(scene).exists()


def load_preset(scene: str) -> dict[str, Any]:
    return json.loads(_preset_path(scene).read_text(encoding="utf-8"))


def variant_count(scene: str) -> int:
    return len(load_preset(scene).get("variants", [])) or 1


def is_default_preset(scene: str, identity: dict[str, Any] | None) -> bool:
    """True when this scene ships a preset and the user has not changed prefs.

    Empty / missing preferences (the user never touched the identity page) also
    count as default. Any other preference set means "customised" → fall back to
    the LLM planner.
    """
    if not has_preset(scene):
        return False
    if not identity:
        return True
    prefs = {str(p) for p in (identity.get("preferences") or [])}
    return not prefs or prefs == set(_DEFAULT_PREFS)


# ---------------------------------------------------------------------------
# Card lookup
# ---------------------------------------------------------------------------

def _name_index(scene: str) -> dict[str, dict[str, Any]]:
    return {c["title"]: c for c in get_db().all(scene)}


def _card_for(name: str, by_name: dict[str, dict[str, Any]],
              request: dict[str, Any]) -> dict[str, Any] | None:
    poi = by_name.get(name)
    if not poi:
        return None
    return _card_converter(poi, request)


# ---------------------------------------------------------------------------
# Board rendering (matches ItineraryPlannerAgent output shape)
# ---------------------------------------------------------------------------

def _parse(t: str) -> datetime:
    return datetime.strptime(t, "%H:%M")


def _duration(card: dict[str, Any]) -> int:
    try:
        return int(card.get("duration_minutes") or 90)
    except (TypeError, ValueError):
        return 90


def _sight_item(card: dict[str, Any], clock: datetime, day: int) -> dict[str, Any]:
    return {
        "time": clock.strftime("%H:%M"),
        "action": card["title"],
        "type": card.get("type") or "景点",
        "card_id": card["card_id"],
        "duration_minutes": _duration(card),
        "day": day,
        "rating": card.get("rating") or 0,
        "reason": card.get("reason") or "按剧本顺路编排",
    }


def _meal_item(card: dict[str, Any], time_str: str, day: int, meal: str) -> dict[str, Any]:
    return {
        "time": time_str,
        "action": card["title"],
        "type": "美食",
        "card_id": card["card_id"],
        "duration_minutes": _duration(card) or 60,
        "day": day,
        "meal": meal,
        "rating": card.get("rating") or 0,
        "reason": card.get("reason") or f"{meal}推荐",
    }


def _hotel_item(card: dict[str, Any], time_str: str, day: int) -> dict[str, Any]:
    return {
        "time": time_str,
        "action": card["title"],
        "type": "酒店",
        "card_id": card["card_id"],
        "duration_minutes": 0,
        "day": day,
        "rating": card.get("rating") or 0,
        "reason": card.get("reason") or "今晚落脚，地铁可达",
    }


def _build_board(
    variant: dict[str, Any],
    by_name: dict[str, dict[str, Any]],
    request: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return (static_board, ordered_selected_cards) for one variant."""
    departure = request.get("departure_location") or "出发地"
    board: list[dict[str, Any]] = []
    selected: list[dict[str, Any]] = []
    seen: set[str] = set()

    def take(name: str) -> dict[str, Any] | None:
        card = _card_for(name, by_name, request)
        if not card:
            return None
        cid = card["card_id"]
        if cid in seen:
            # The script lists a POI on more than one day — keep only the first
            # occurrence so a stop never appears twice in the itinerary.
            return None
        seen.add(cid)
        selected.append(card)
        return card

    for d in variant.get("days", []):
        day = int(d.get("day") or 1)
        board.append({
            "time": "08:00",
            "action": f"从{departure}出发" if day == 1 else "第二天 · 继续出发",
            "type": "交通",
            "day": day,
            "reason": "先进入核心目的地区域，减少后续来回折返。"
            if day == 1 else "新的一天，体力恢复，继续探索。",
        })

        if d.get("breakfast"):
            card = take(d["breakfast"])
            if card:
                board.append(_meal_item(card, "08:30", day, "早餐"))

        clock = _parse("09:30")
        for name in d.get("morning", []):
            card = take(name)
            if card:
                board.append(_sight_item(card, clock, day))
                clock += timedelta(minutes=_duration(card) + 15)

        if d.get("lunch"):
            card = take(d["lunch"])
            if card:
                board.append(_meal_item(card, "12:30", day, "午餐"))

        clock = _parse("14:00")
        for name in d.get("afternoon", []):
            card = take(name)
            if card:
                board.append(_sight_item(card, clock, day))
                clock += timedelta(minutes=_duration(card) + 15)

        if d.get("dinner"):
            card = take(d["dinner"])
            if card:
                board.append(_meal_item(card, "18:30", day, "晚餐"))

        hotel = d.get("hotel")
        if hotel and hotel not in _NO_HOTEL:
            card = take(hotel)
            if card:
                board.append(_hotel_item(card, "20:30", day))

    return board, selected


# ---------------------------------------------------------------------------
# Trip state
# ---------------------------------------------------------------------------

def build_preset_state(
    scene: str,
    structured_request: dict[str, Any],
    variant_idx: int = 0,
    trip_id: str | None = None,
) -> tuple[TripState, int]:
    """Build a complete TripState from a scene preset (no LLM).

    Returns (state, resolved_variant_idx). The caller persists the state.
    """
    preset = load_preset(scene)
    variants = preset.get("variants", [])
    if not variants:
        raise ValueError(f"{scene} preset has no variants")
    variant_idx = variant_idx % len(variants)
    variant = variants[variant_idx]

    by_name = _name_index(scene)
    board, selected = _build_board(variant, by_name, structured_request)

    # Candidate cards = the script's POIs, all pre-selected so the picker shows
    # the curated set already ticked. Preserve board order.
    candidates: list[dict[str, Any]] = []
    for card in selected:
        c = dict(card)
        c["preselect"] = True
        candidates.append(c)

    # Total trip distance is pre-computed and baked into the preset script
    # (<scene>_preset.json → variant.total_distance_km), so the preview card
    # shows a deterministic 公里 without an AMap round-trip.
    total_km = variant.get("total_distance_km")

    state = TripState(
        trip_id=trip_id or f"trip_{uuid4().hex[:8]}",
        user_id=str(structured_request.get("user_id") or "frontend_user"),
        stage="confirmed",
        structured_request=structured_request,
        candidate_cards=candidates,
        selected_cards=[dict(c) for c in selected],
        static_board=board,
        route_plan={"total_distance_km": total_km} if total_km is not None else {},
    )
    state.ai_trace.append({
        "agent": "ScenePreset",
        "source": f"{scene}_guidline",
        "variant": variant.get("id"),
        "note": "deterministic default script — no LLM",
    })
    return state, variant_idx
