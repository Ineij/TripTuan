from __future__ import annotations

import asyncio
import json
import re
import uuid
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.tools import amap as tools
from backend.clients.llm import chat_text
from backend.clients.poster_image import generate_poi_image
from backend.core.frontend_store import FrontendAdapterStore
from backend.data.dianping_db import get_db


router = APIRouter(prefix="/api", tags=["frontend-compatible"])
_ORCHESTRATOR: Any | None = None

Scene = str


def attach_orchestrator(orchestrator: Any) -> None:
    global _ORCHESTRATOR
    _ORCHESTRATOR = orchestrator


class ChatStreamRequest(BaseModel):
    scene: Scene = "sz"
    query: str = ""


class ChatRequest(BaseModel):
    scene: Scene = "sz"
    text: str = ""


class RerankRequest(BaseModel):
    scene: Scene = "sz"
    identity: dict[str, Any] = Field(default_factory=dict)
    picks: list[str] = Field(default_factory=list)
    prevVariantId: str | None = None


class RegenerateRequest(BaseModel):
    scene: Scene = "sz"
    lastVariantId: str | None = None


class CreateDraftRequest(BaseModel):
    scene: Scene = "sz"
    picks: list[str] = Field(default_factory=list)
    travelers: list[dict[str, str]] = Field(default_factory=list)
    contactPhone: str | None = None


class PatchOrderRequest(BaseModel):
    items: list[dict[str, Any]] | None = None
    travelers: list[dict[str, str]] | None = None
    contactPhone: str | None = None


class PayOrderRequest(BaseModel):
    method: str = "wechat"


class CheckinRequest(BaseModel):
    stationId: str


class RideRequest(BaseModel):
    from_: str = Field(alias="from")
    to: str


class TransportLookupRequest(BaseModel):
    scene: Scene = "sz"
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None


class PosterRequest(BaseModel):
    scene: Scene = "sz"


_STORE = FrontendAdapterStore()


# ============================================================================
# Scene-keyed data slots. The two demo scenes the frontend was designed for
# are kept as keys; their contents are now empty and will be populated by the
# real DB layer (see backend/data/) instead of hardcoded mocks.
# ============================================================================

# Picker view models for /api/pois — combines transport (high-speed rail/flight)
# and candidate POI cards. Empty until DB is wired.
PICKER_ITEMS_BY_SCENE: dict[str, list[dict[str, Any]]] = {"sz": [], "bj": []}

# Hotel cards for /api/hotels.
HOTELS: dict[str, list[dict[str, Any]]] = {"sz": [], "bj": []}

# Travel tips for /api/tips.
TIPS: dict[str, list[dict[str, str]]] = {"sz": [], "bj": []}

# Featured spots for /api/spots.
SPOTS: dict[str, list[dict[str, Any]]] = {"sz": [], "bj": []}

# Itinerary-style sight detail for /api/sight-detail.
SIGHT_DETAIL: dict[str, list[dict[str, Any]]] = {"sz": [], "bj": []}

# Pre-built itinerary used only as a fallback when no LangGraph board exists.
ITINERARY_DAYS: dict[str, list[dict[str, Any]]] = {"sz": [], "bj": []}

# Station-id → POI keyword hints for check-in matching. Populated by the
# frontend/backend POI ID convention once the DB is loaded.
STATION_HINTS: dict[str, str] = {}

# Frontend pick-id → backend card_id keyword hints. Used by /api/itinerary/rerank
# to resolve frontend picks to real candidate cards. Will be derived from the DB.
FRONTEND_PICK_HINTS: dict[str, list[str]] = {}


# Per-trip counter used to mint a fresh variantId on every rerank call so the
# frontend can pass the previous variantId back and the agent can diversify.
_VARIANT_COUNTERS: dict[str, int] = {}


def _make_variant_id(trip_id: str) -> str:
    count = _VARIANT_COUNTERS.get(trip_id, 0) + 1
    _VARIANT_COUNTERS[trip_id] = count
    return f"{trip_id}-v{count}"


def _resolve_picks(picks: list[str], candidate_cards: list[dict[str, Any]]) -> list[str]:
    """Resolve frontend pick IDs to backend candidate card_ids.

    Picks coming from `GET /api/pois` already use real card_ids, but the
    frontend also has hardcoded fallback IDs (e.g. "s-harbour") that need
    fuzzy matching by title/area to survive ID drift.
    """
    by_id = {str(card["card_id"]): card for card in candidate_cards}
    resolved: list[str] = []
    seen: set[str] = set()

    for pick in picks:
        if pick in by_id and pick not in seen:
            resolved.append(pick)
            seen.add(pick)

    for pick in picks:
        if pick in seen:
            continue
        hints = FRONTEND_PICK_HINTS.get(pick)
        if not hints:
            continue
        for cid, card in by_id.items():
            if cid in seen:
                continue
            haystack = f"{card.get('title', '')} {card.get('area', '')}"
            if any(hint in haystack for hint in hints):
                resolved.append(cid)
                seen.add(cid)
                break

    return resolved


def _orchestrator() -> Any:
    if _ORCHESTRATOR is None:
        raise HTTPException(status_code=503, detail="TravelOrchestrator is not attached.")
    return _ORCHESTRATOR


# Scene → (departure_location, destination, city_code)
_SCENE_CONFIG: dict[str, dict[str, str]] = {
    "sz": {
        "departure_location": "广州南站",
        "destination":        "深圳",
        "city":               "深圳",
        "city_code":          "440300",
    },
    "bj": {
        "departure_location": "河北",
        "destination":        "北京",
        "city":               "北京",
        "city_code":          "110000",
    },
}

_TRANSPORT_BY_SCENE: dict[str, list[dict[str, Any]]] = {
    "sz": [
        {
            "id": "transport_sz_go",
            "cat": "transport",
            "mode": "高铁",
            "direction": "去程",
            "from": "广州南站",
            "to": "深圳北站",
            "schedules": [
                {"no": "G6005", "dep": "08:00", "arr": "08:33", "mins": "33分钟", "price": "¥74.5", "default": True},
                {"no": "G6007", "dep": "09:00", "arr": "09:33", "mins": "33分钟", "price": "¥74.5"},
                {"no": "G6009", "dep": "10:00", "arr": "10:33", "mins": "33分钟", "price": "¥74.5"},
            ],
        },
        {
            "id": "transport_sz_back",
            "cat": "transport",
            "mode": "高铁",
            "direction": "返程",
            "from": "深圳北站",
            "to": "广州南站",
            "schedules": [
                {"no": "G6006", "dep": "17:30", "arr": "18:03", "mins": "33分钟", "price": "¥74.5"},
                {"no": "G6008", "dep": "18:30", "arr": "19:03", "mins": "33分钟", "price": "¥74.5", "default": True},
                {"no": "G6010", "dep": "19:30", "arr": "20:03", "mins": "33分钟", "price": "¥74.5"},
            ],
        },
    ],
    "bj": [
        {
            "id": "transport_bj_go",
            "cat": "transport",
            "mode": "高铁",
            "direction": "去程",
            "from": "河北保定东站",
            "to": "北京西站",
            "schedules": [
                {"no": "G255", "dep": "07:30", "arr": "08:30", "mins": "60分钟", "price": "¥66", "default": True},
                {"no": "G257", "dep": "08:30", "arr": "09:30", "mins": "60分钟", "price": "¥66"},
                {"no": "D695", "dep": "09:00", "arr": "10:20", "mins": "80分钟", "price": "¥49.5"},
            ],
        },
        {
            "id": "transport_bj_back",
            "cat": "transport",
            "mode": "高铁",
            "direction": "返程",
            "from": "北京西站",
            "to": "河北保定东站",
            "schedules": [
                {"no": "G256", "dep": "17:00", "arr": "18:00", "mins": "60分钟", "price": "¥66"},
                {"no": "G258", "dep": "18:00", "arr": "19:00", "mins": "60分钟", "price": "¥66", "default": True},
                {"no": "D696", "dep": "19:30", "arr": "20:50", "mins": "80分钟", "price": "¥49.5"},
            ],
        },
    ],
}


def _structured_request(scene: str, identity: dict[str, Any] | None = None) -> dict[str, Any]:
    identity = identity or {}
    special_groups = []
    if identity.get("hasElder"):
        special_groups.append("elderly")
    if identity.get("hasKid"):
        special_groups.append("child")
    if identity.get("hasSpecial"):
        special_groups.append("special")

    cfg = _SCENE_CONFIG.get(scene, _SCENE_CONFIG["bj"])
    base = {
        "user_id":            "frontend_user",
        "scene":              scene,                      # consumed by POISelectionAgent
        "departure_location": cfg["departure_location"],
        "destination":        cfg["destination"],
        "travel_date":        identity.get("startDate") or "",
        "start_time":         "09:00",
        "people_count":       int(identity.get("partySize") or 1),
        "special_groups":     special_groups,
        "preferences":        identity.get("preferences") or [],
        "intensity":          "medium",
        "budget_level":       "medium",
    }
    return base


def _ensure_trip(scene: str, identity: dict[str, Any] | None = None) -> dict[str, Any]:
    orchestrator = _orchestrator()
    session = _STORE.get_session(scene)
    if session and session.get("trip_id"):
        try:
            state = orchestrator.get_trip(str(session["trip_id"]))
            if state.get("candidate_cards"):
                return state
        except KeyError:
            pass

    state = orchestrator.generate_candidates(_structured_request(scene, identity))
    _STORE.save_session(
        scene,
        {
            "scene": scene,
            "trip_id": state["trip_id"],
            "last_stage": state["stage"],
            "updatedAt": _now(),
        },
    )
    return state


def _get_trip_for_scene(scene: str) -> dict[str, Any]:
    return _ensure_trip(scene)


def _resolve_selected_ids(
    picks: list[str], candidate_cards: list[dict[str, Any]]
) -> list[str]:
    selected_ids = _resolve_picks(picks, candidate_cards)
    if not selected_ids:
        # Balanced auto-selection: ≤4 sights + ≤2 foods + ≤1 hotel
        sights = [c["card_id"] for c in candidate_cards if c.get("type") in ("景点", "拍照点", "休息点")][:4]
        foods  = [c["card_id"] for c in candidate_cards if c.get("type") == "美食"][:2]
        hotels = [c["card_id"] for c in candidate_cards if c.get("type") == "酒店"][:1]
        selected_ids = sights + foods + hotels
        if not selected_ids:
            selected_ids = [card["card_id"] for card in candidate_cards[:6]]
    return selected_ids


def _select_and_plan(scene: str, picks: list[str], identity: dict[str, Any] | None = None) -> dict[str, Any]:
    orchestrator = _orchestrator()
    state = _ensure_trip(scene, identity)
    selected_ids = _resolve_selected_ids(picks, state.get("candidate_cards", []))
    if selected_ids:
        state = orchestrator.select_cards(state["trip_id"], selected_ids)
    state = orchestrator.plan_trip(state["trip_id"])
    _STORE.save_session(
        scene,
        {
            "scene": scene,
            "trip_id": state["trip_id"],
            "selected_card_ids": selected_ids,
            "last_stage": state["stage"],
            "updatedAt": _now(),
        },
    )
    return state


def _select_and_rerank(
    scene: str,
    picks: list[str],
    identity: dict[str, Any] | None,
    prev_variant_id: str | None,
) -> dict[str, Any]:
    orchestrator = _orchestrator()
    state = _ensure_trip(scene, identity)
    selected_ids = _resolve_selected_ids(picks, state.get("candidate_cards", []))
    if selected_ids:
        state = orchestrator.select_cards(state["trip_id"], selected_ids)
    state = orchestrator.rerank_trip(state["trip_id"], prev_variant_id)
    _STORE.save_session(
        scene,
        {
            "scene": scene,
            "trip_id": state["trip_id"],
            "selected_card_ids": selected_ids,
            "last_stage": state["stage"],
            "updatedAt": _now(),
        },
    )
    return state


def _ensure_planned_trip(scene: str, picks: list[str] | None = None) -> dict[str, Any]:
    state = _ensure_trip(scene)
    if state.get("static_board"):
        return state
    if picks:
        selected = picks
    else:
        # Auto-select a balanced mix: ≤4 sights + ≤2 foods + ≤1 hotel
        candidates = state.get("candidate_cards", [])
        sights  = [c["card_id"] for c in candidates if c.get("type") in ("景点", "拍照点", "休息点")][:4]
        foods   = [c["card_id"] for c in candidates if c.get("type") == "美食"][:2]
        hotels  = [c["card_id"] for c in candidates if c.get("type") == "酒店"][:1]
        selected = sights + foods + hotels
        if not selected:
            selected = [c["card_id"] for c in candidates[:6]]
    return _select_and_plan(scene, selected)


def _ensure_routed_trip(trip_id: str) -> dict[str, Any]:
    orchestrator = _orchestrator()
    state = orchestrator.get_trip(trip_id)
    if not state.get("route_plan", {}).get("segments"):
        state = orchestrator.build_route(trip_id)
    return state


def _frontend_picker_items_from_state(scene: str, state: dict[str, Any]) -> list[dict[str, Any]]:
    items = _transport_items(scene)
    items.extend(
        _candidate_to_picker_item(card, index)
        for index, card in enumerate(state.get("candidate_cards", []), start=1)
    )
    return items


def _transport_items(scene: str) -> list[dict[str, Any]]:
    # Use _TRANSPORT_BY_SCENE for hardcoded transport data; fall back to
    # PICKER_ITEMS_BY_SCENE entries that carry cat=="transport" for legacy compat.
    hardcoded = _TRANSPORT_BY_SCENE.get(scene, [])
    if hardcoded:
        return [deepcopy(item) for item in hardcoded]
    return [
        deepcopy(item)
        for item in PICKER_ITEMS_BY_SCENE.get(scene, [])
        if item.get("cat") == "transport"
    ]


def _candidate_to_picker_item(card: dict[str, Any], index: int) -> dict[str, Any]:
    """Map a DB candidate card to the picker view model."""
    card_type = str(card.get("type") or "")
    cat_map = {
        "美食": "food", "餐饮": "food",
        "酒店": "hotel",
        "景点": "sight", "拍照点": "sight", "休息点": "sight",
    }
    cat = cat_map.get(card_type, "sight")

    price_num = card.get("price_per_person") or card.get("price")
    price_label = f"¥{int(price_num)}" if price_num else ""

    # Description: prefer specialty/category_2 over plain reason
    sub_desc = (card.get("specialty") or card.get("reason")
                or card.get("category_2") or card.get("area") or "")

    item = {
        "id":       card["card_id"],
        "cat":      cat,
        "name":     card.get("title", ""),
        "rating":   card.get("rating") or 0,
        "duration": _duration_label(card.get("duration_minutes")),
        "price":    price_label,
        "queue":    card.get("queue") or "",
        "subDesc":  sub_desc[:30],
        "photoSeed": _photo_seed(card.get("title") or card["card_id"]),
        "photo":    card.get("photo_url", ""),
        "preselect": index <= 6,
        "detail": {
            "tags":  card.get("tags") or [],
            "intro": sub_desc,
            "tips":  card.get("recommended") or [],
        },
        "lat":  card.get("lat"),
        "lng":  card.get("lon") or card.get("lng"),
        "backendTrace": {
            "agent":   "POISelectionAgent",
            "card_id": card["card_id"],
            "source":  card.get("source", "dianping"),
            "api":     card.get("api"),
        },
    }
    if card.get("packages"):
        item["packages"] = card["packages"]
    if card.get("badge"):
        item["badge"] = card["badge"]
    return item


def _state_to_preview(scene: str, state: dict[str, Any]) -> dict[str, Any]:
    """Build /api/itinerary/preview response from the live TripState.
    Title / route / totalKm come from the request + planned route, not mocks."""
    route_plan = state.get("route_plan") or {}
    total_km = route_plan.get("total_distance_km")
    request = state.get("structured_request") or {}
    departure = request.get("departure_location") or ""
    destination = request.get("destination") or ""
    return {
        "scene": scene,
        "title": destination or scene,
        "route": f"{departure} → {destination}" if departure and destination else "",
        "totalKm": str(total_km) if total_km is not None else "",
        "days": _board_to_days(state.get("static_board") or [], scene),
        "backendTrace": _trace_summary(state),
    }


def _board_to_days(board: list[dict[str, Any]], scene: str) -> list[dict[str, Any]]:
    if not board:
        return deepcopy(ITINERARY_DAYS.get(scene, []))

    def _to_frontend(item: dict[str, Any]) -> dict[str, Any]:
        return {
            "period":    _period_for_item(item),
            "cat":       _itinerary_cat(item.get("type")),
            "name":      item.get("action") or item.get("title") or "",
            "rating":    item.get("rating") or 0,
            "duration":  _duration_label(item.get("duration_minutes")),
            "price":     item.get("price_label") or "",
            "queue":     item.get("queue") or "",
            "note":      item.get("reason"),
            "photoSeed": _photo_seed(item.get("action") or "travel"),
            "cardId":    item.get("card_id"),
        }

    # ── Prefer explicit day tags written by ItineraryPlannerAgent ──────
    tagged = [it for it in board if it.get("day") in (1, 2)]
    if len(tagged) >= max(2, len(board) - 1):
        day1_items = [_to_frontend(it) for it in board if it.get("day") != 2]
        day2_items = [_to_frontend(it) for it in board if it.get("day") == 2]
        days = [{"label": "DAY 1", "title": "", "items": day1_items}]
        if day2_items:
            days.append({"label": "DAY 2", "title": "", "items": day2_items})
        return days

    # ── Fallback: positional split (old behaviour) ────────────────────
    items = [_to_frontend(it) for it in board]
    if len(items) > 8:
        split_at = 7
    elif len(items) >= 6:
        split_at = max(4, len(items) // 2 + 1)
    else:
        split_at = len(items)
    days = [{"label": "DAY 1", "title": "", "items": items[:split_at]}]
    if split_at < len(items):
        days.append({"label": "DAY 2", "title": "", "items": items[split_at:]})
    return days


def _trace_summary(state: dict[str, Any]) -> dict[str, Any]:
    return {
        "tripId": state.get("trip_id"),
        "stage": state.get("stage"),
        "lastLangGraphNode": (state.get("langgraph_trace") or [{}])[-1].get("node"),
        "lastSupervisorAgent": (state.get("supervisor_trace") or [{}])[-1].get("target_agent"),
        "aiTrace": state.get("ai_trace", [])[-3:],
    }


def _period_for_item(item: dict[str, Any]) -> str:
    """Return the period label for a board item.

    Rules:
    * Only 交通 items (city-to-city transit) get '出发' or '返程'.
      - Action contains 返程/返回/回程 → '返程'
      - Any other 交通 action (departure, day-2 separator, etc.) → '出发'
    * All other items (attractions, food, hotels) get a time-based label:
      上午 / 中午 / 下午 / 晚餐 / 晚上
    """
    item_type = str(item.get("type") or "")
    action    = str(item.get("action") or "")

    if item_type == "交通":
        if any(w in action for w in ("返程", "返回", "回程", "到家")):
            return "返程"
        return "出发"

    # Time-based period for attractions / food / hotels
    time_str = str(item.get("time") or "09:00")
    try:
        hour = int(time_str.split(":", 1)[0])
    except (ValueError, TypeError):
        hour = 9

    if hour < 12:
        return "上午"
    if hour < 14:
        return "中午"
    if hour < 18:
        return "下午"
    if hour < 20:
        return "晚餐"
    return "晚上"


def _period_for_time(value: str) -> str:
    """Legacy shim — kept for any callers outside _board_to_days."""
    hour = int((value.split(":", 1)[0] or "9"))
    if hour < 12:
        return "上午"
    if hour < 14:
        return "中午"
    if hour < 18:
        return "下午"
    if hour < 20:
        return "晚餐"
    return "晚上"


def _itinerary_cat(value: Any) -> str:
    if value in ("美食", "餐饮", "food"):
        return "美食"
    if value in ("酒店", "hotel"):
        return "酒店"
    if value in ("交通", "transport"):
        return "交通"
    return "景点"


def _duration_label(value: Any) -> str:
    try:
        minutes = int(value)
    except (TypeError, ValueError):
        return "1 小时"
    if minutes >= 120:
        return f"{round(minutes / 60, 1):g} 小时"
    return f"{minutes} 分钟"


def _photo_seed(value: str) -> str:
    safe = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", "-", value).strip("-")
    return safe or "travel"


def _frontend_order_items_from_status(status: dict[str, Any]) -> list[dict[str, Any]]:
    items = []
    for order in status.get("orders", []):
        payload = order.get("payload") or {}
        item_type = _itinerary_cat(payload.get("type"))
        # Use card price when available, else fall back to type default
        card_price = payload.get("price_per_person") or payload.get("price")
        try:
            amount = int(float(str(card_price))) if card_price else _amount_for_type(item_type)
        except (ValueError, TypeError):
            amount = _amount_for_type(item_type)
        items.append(
            {
                "id": order["order_id"],
                "backendOrderId": order["order_id"],
                "cardId": order.get("card_id"),
                "type": item_type,
                "name": order.get("merchant_name") or payload.get("title") or "行程订单",
                "qtyText": "后端订单 × 1",
                "amountText": "免费" if amount == 0 else f"¥{amount}",
                "amount": amount,
                "qty": 1,
                "photoSeed": _photo_seed(order.get("merchant_name") or "order"),
                "status": order.get("status"),
            }
        )
    return items


_DEFAULT_PRICES: dict[str, int] = {
    "交通": 75,
    "景点": 0,
    "美食": 88,
    "酒店": 398,
}


def _amount_for_type(item_type: str) -> int:
    return _DEFAULT_PRICES.get(item_type, 0)


def _match_card_id_for_station(state: dict[str, Any], station_id: str) -> str | None:
    hint = STATION_HINTS.get(station_id, "")
    selected = state.get("selected_cards") or state.get("candidate_cards") or []
    if hint:
        for card in selected:
            title = str(card.get("title") or "")
            if hint in title:
                return card.get("card_id")
    checked = set(state.get("order_status", {}).get("verified_items") or [])
    for order in state.get("order_status", {}).get("orders", []):
        if order.get("status") in {"paid", "verified"} and order.get("card_id") not in checked:
            return order.get("card_id")
    return selected[0].get("card_id") if selected else None


@router.post("/chat/stream")
async def stream_chat(request: ChatStreamRequest) -> StreamingResponse:
    scene = _scene(request.scene)
    state = _ensure_trip(scene)
    chunks = _chat_chunks(scene, state)

    async def event_stream():
        for chunk in chunks:
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.05 if chunk["kind"] != "text" else 0.01)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/chat")
def send_message(request: ChatRequest) -> dict[str, str]:
    scene = _scene(request.scene)
    result = chat_text(
        system_prompt=(
            "你是美团问小团风格的出行助手。用户已经在前端填写结构化出行信息，"
            "请用简洁中文回答后续问题，不要编造订单、天气或路线事实。"
        ),
        user_content=f"场景={scene}; 用户问题={request.text}",
    )
    # If LLM is unavailable, echo the question back instead of synthesizing
    # a fake hardcoded intro. The real reply path requires LLM_API_KEY.
    return {"reply": result.content if result.used else f"（LLM 暂不可用）收到：{request.text}"}


@router.get("/pois")
def get_pois(scene: Scene = Query("sz")) -> list[dict[str, Any]]:
    resolved_scene = _scene(scene)
    state = _ensure_trip(resolved_scene)
    items = _frontend_picker_items_from_state(resolved_scene, state)
    # Inject cached POI images where available
    img_map = _STORE.get_poi_images_for_scene(resolved_scene)
    if img_map:
        for item in items:
            url = img_map.get(item.get("id", ""))
            if url:
                item["imageUrl"] = url
    return items


@router.post("/pois/pregenerate")
def pregenerate_poi_images(
    scene: Scene = Query("sz"),
) -> dict[str, Any]:
    """Compatibility endpoint for the old on-demand image flow.

    The old background generator covered only sight/food cards and could be
    triggered repeatedly by the UI. Full POI image generation now runs through
    backend/scripts/generate_all_poi_images.py so it can cover every POI,
    hotels, and shared transport assets with throttling and resume support.
    """
    resolved_scene = _scene(scene)
    state = _ensure_trip(resolved_scene)
    items = _frontend_picker_items_from_state(resolved_scene, state)
    existing = _STORE.get_poi_images_for_scene(resolved_scene)
    pending = [it for it in items if it.get("id") not in existing]

    return {
        "scene":   resolved_scene,
        "total":   len(items),
        "pending": len(pending),
        "already_done": len(existing),
        "message": "Legacy background generation is disabled; run the full Qwen batch generator instead.",
    }


@router.get("/pois/{item_id}")
def get_poi(item_id: str) -> dict[str, Any]:
    for scene in ("sz", "bj"):
        session = _STORE.get_session(scene)
        if not session:
            continue
        try:
            state = _orchestrator().get_trip(str(session["trip_id"]))
        except KeyError:
            continue
        for item in _frontend_picker_items_from_state(scene, state):
            if item["id"] == item_id:
                return item
    for item in _all_picker_items():
        if item["id"] == item_id:
            return deepcopy(item)
    raise HTTPException(status_code=404, detail=f"POI not found: {item_id}")


@router.post("/pois/transport/lookup")
def lookup_transport(request: TransportLookupRequest) -> list[dict[str, Any]]:
    scene = _scene(request.scene)
    transport_list = _TRANSPORT_BY_SCENE.get(scene) or [
        item for item in PICKER_ITEMS_BY_SCENE.get(scene, [])
        if item.get("cat") == "transport"
    ]
    if not transport_list:
        raise HTTPException(status_code=404, detail=f"No transport data for scene: {scene}")
    return deepcopy(transport_list[0]["schedules"])


@router.get("/hotels")
def get_hotels(scene: Scene = Query("sz")) -> list[dict[str, Any]]:
    """Return top hotels from DianpingDB for this scene."""
    s = _scene(scene)
    db = get_db()
    hotels = db.search(s, categories=["酒店"], min_rating=3.5, limit=6)
    generated_images = _STORE.get_poi_images_for_scene(s)
    return [
        {
            "id":     h["card_id"],
            "name":   h["title"],
            "area":   h["area"],
            "rating": h["rating"],
            "price":  h.get("price_per_person"),
            "tags":   h.get("tags", []),
            "photo":  _generated_or_source_photo(h, generated_images),
            "source": "dianping",
        }
        for h in hotels
    ]


@router.get("/tips")
def get_tips(scene: Scene = Query("sz")) -> list[dict[str, str]]:
    """Return travel tips derived from top-rated POIs in DianpingDB."""
    s = _scene(scene)
    db = get_db()
    top = db.search(s, min_rating=4.2, limit=12)
    tips: list[dict[str, str]] = []
    for poi in top:
        rec = poi.get("recommended") or []
        if rec:
            tips.append({
                "icon":  "🍜" if poi["type"] == "美食" else "📍",
                "title": poi["title"],
                "body":  f"推荐：{'、'.join(rec[:3])}",
            })
        elif poi.get("specialty"):
            tips.append({
                "icon":  "✨",
                "title": poi["title"],
                "body":  str(poi["specialty"])[:60],
            })
    return tips[:8]


@router.get("/spots")
def get_spots(scene: Scene = Query("sz")) -> list[dict[str, Any]]:
    """Return featured attractions from DianpingDB."""
    s = _scene(scene)
    db = get_db()
    sights = db.search(s, categories=["景点"], min_rating=4.0, limit=8)
    generated_images = _STORE.get_poi_images_for_scene(s)
    return [
        {
            "id":     p["card_id"],
            "name":   p["title"],
            "area":   p["area"],
            "rating": p["rating"],
            "tags":   p.get("tags", [])[:3],
            "photo":  _generated_or_source_photo(p, generated_images),
            "intro":  p.get("specialty") or p.get("area") or "",
            "source": "dianping",
        }
        for p in sights
    ]


@router.get("/sight-detail")
def get_sight_detail(scene: Scene = Query("sz")) -> list[dict[str, Any]]:
    """Return structured sight detail cards from DianpingDB for itinerary preview."""
    s = _scene(scene)
    db = get_db()
    pois = db.search(s, min_rating=3.8, limit=20)
    result: list[dict[str, Any]] = []
    for p in pois:
        items: list[dict[str, str]] = []
        if p.get("recommended"):
            items.append({"icon": "🍜", "name": "推荐", "body": "、".join(p["recommended"][:3])})
        if p.get("hours"):
            items.append({"icon": "🕐", "name": "营业时间", "body": str(p["hours"])[:40]})
        if p.get("facilities"):
            items.append({"icon": "🏷️", "name": "设施", "body": str(p["facilities"])[:40]})
        result.append({
            "period": "上午" if p["type"] == "景点" else ("中午" if p["type"] == "美食" else "晚上"),
            "items":  items,
            "poi":    {"id": p["card_id"], "name": p["title"], "type": p["type"]},
        })
    return result


@router.post("/itinerary/rerank")
def rerank_itinerary(request: RerankRequest) -> dict[str, Any]:
    scene = _scene(request.scene)
    state = _select_and_rerank(
        scene, request.picks, request.identity, request.prevVariantId
    )
    return {
        "scene": scene,
        "variantId": _make_variant_id(str(state["trip_id"])),
        "days": _board_to_days(state.get("static_board") or [], scene),
        "backendTrace": _trace_summary(state),
    }


@router.post("/itinerary/regenerate")
def regenerate_itinerary(request: RegenerateRequest) -> dict[str, Any]:
    scene = _scene(request.scene)
    state = _ensure_planned_trip(scene)
    orchestrator = _orchestrator()
    state = orchestrator.rerank_trip(state["trip_id"], request.lastVariantId)
    _STORE.save_session(
        scene,
        {
            "scene": scene,
            "trip_id": state["trip_id"],
            "last_stage": state["stage"],
            "updatedAt": _now(),
        },
    )
    return {
        "scene": scene,
        "variantId": _make_variant_id(str(state["trip_id"])),
        "days": _board_to_days(state.get("static_board") or [], scene),
        "backendTrace": _trace_summary(state),
    }


@router.get("/itinerary/preview")
def get_itinerary_preview(scene: Scene = Query("sz")) -> dict[str, Any]:
    scene = _scene(scene)
    state = _ensure_planned_trip(scene)
    return _state_to_preview(scene, state)


@router.post("/orders/draft")
def create_order_draft(request: CreateDraftRequest) -> dict[str, Any]:
    scene = _scene(request.scene)
    state = _ensure_planned_trip(scene, request.picks)
    state = _orchestrator().create_demo_orders(state["trip_id"])
    items = _frontend_order_items_from_status(state.get("order_status") or {})
    order_id = f"front_{scene}_{uuid.uuid4().hex[:8]}"
    draft = {
        "orderId": order_id,
        "scene": scene,
        "tripId": state["trip_id"],
        "total": sum(int(item.get("amount", 0)) for item in items),
        "items": items,
        "travelers": request.travelers or [],
        "contactPhone": request.contactPhone,
        "status": "draft",
        "createdAt": _now(),
        "backendTrace": _trace_summary(state),
    }
    _STORE.save_order(draft)
    _STORE.save_board_state(_new_board_state(order_id, scene))
    return deepcopy(draft)


@router.get("/orders/{order_id}")
def get_order(order_id: str) -> dict[str, Any]:
    return deepcopy(_get_order(order_id))


@router.patch("/orders/{order_id}")
def patch_order(order_id: str, request: PatchOrderRequest) -> dict[str, Any]:
    order = _get_order(order_id)
    if request.items is not None:
        order["items"] = request.items
        order["total"] = sum(_amount_to_number(item.get("amount", item.get("amountText"))) for item in request.items)
    if request.travelers is not None:
        order["travelers"] = request.travelers
    if request.contactPhone is not None:
        order["contactPhone"] = request.contactPhone
    order["updatedAt"] = _now()
    _STORE.save_order(order)
    return deepcopy(order)


@router.post("/orders/{order_id}/pay")
def pay_order(order_id: str, request: PayOrderRequest) -> dict[str, Any]:
    order = _get_order(order_id)
    trip_id = order.get("tripId")
    if trip_id:
        state = _orchestrator().pay_order(str(trip_id))
        order["backendTrace"] = _trace_summary(state)
    order["status"] = "paid"
    order["payMethod"] = request.method
    order["paidAt"] = _now()
    _STORE.save_order(order)
    return {
        "orderId": order_id,
        "paidAt": order["paidAt"],
        "voucherCount": len(order.get("items", [])),
    }


@router.get("/board/{order_id}")
def get_board(order_id: str) -> dict[str, Any]:
    order = _get_order(order_id)
    if order.get("tripId"):
        state = _ensure_routed_trip(str(order["tripId"]))
        order["backendTrace"] = _trace_summary(state)
        _STORE.save_order(order)
    state = _STORE.get_board_state(order_id)
    if state is None:
        state = _new_board_state(order_id, order.get("scene", "sz"))
    state["lastUpdated"] = _now()
    _STORE.save_board_state(state)
    return deepcopy(state)


@router.post("/board/{order_id}/checkin", status_code=204)
def checkin_station(order_id: str, request: CheckinRequest) -> Response:
    order = _get_order(order_id)
    trip_id = order.get("tripId")
    if trip_id:
        trip_state = _orchestrator().get_trip(str(trip_id))
        card_id = _match_card_id_for_station(trip_state, request.stationId)
        trip_state = _orchestrator().verify_order(str(trip_id), card_id=card_id)
        order["backendTrace"] = _trace_summary(trip_state)
        _STORE.save_order(order)
    state = _STORE.get_board_state(order_id) or _new_board_state(
        order_id,
        order.get("scene", "sz"),
    )
    completed = set(state.get("completedStationIds", []))
    completed.add(request.stationId)
    state["completedStationIds"] = sorted(completed)
    state["currentStationId"] = request.stationId
    state["lastUpdated"] = _now()
    _STORE.save_board_state(state)
    return Response(status_code=204)


@router.post("/board/{order_id}/ride")
def call_ride(order_id: str, request: RideRequest) -> dict[str, Any]:
    order = _get_order(order_id)
    scene = order.get("scene", "sz")
    segment = None
    if order.get("tripId"):
        state = _ensure_routed_trip(str(order["tripId"]))
        for candidate in state.get("route_plan", {}).get("segments", []):
            if request.to in str(candidate.get("to")) or request.from_ in str(candidate.get("from")):
                segment = candidate
                break
        order["backendTrace"] = _trace_summary(state)
        _STORE.save_order(order)
    km = float((segment or {}).get("distance_km") or (4.2 if scene == "bj" else 1.8))
    quote = tools.get_taxi_quote(segment or {"distance_km": km})
    return {
        "from": request.from_,
        "to": request.to,
        "km": km,
        "etaMin": int((segment or {}).get("duration_minutes") or (12 if scene == "bj" else 7)),
        "estimate": int(quote.get("estimated_price") or (42 if scene == "bj" else 28)),
        "carType": "美团快车（mock）",
    }


@router.get("/weather")
def get_weather(
    scene: Scene = Query("sz"),
    city: str | None = Query(None),
) -> dict[str, Any]:
    """Weather for a scene's destination city. City comes from the trip
    request (which is populated by the DB layer) rather than hardcoded."""
    resolved_scene = _scene(city or scene)
    state = _ensure_trip(resolved_scene)
    city_name = (
        city
        or (state.get("structured_request") or {}).get("destination")
        or ""
    )
    snapshot = tools.get_weather(city_name, str(date.today())) if city_name else {}
    return {
        "city": city_name,
        "days": _forecast_days(snapshot) if snapshot else [],
        "source": snapshot.get("source") if snapshot else None,
        "api": snapshot.get("api") if snapshot else None,
        "fallbackReason": snapshot.get("fallback_reason") if snapshot else None,
    }


@router.get("/recommend/nearby")
def get_nearby_recommendations(
    lat: float | None = Query(None),
    lng: float | None = Query(None),
    type: str | None = Query(None),
    scene: Scene | None = Query(None),
) -> list[dict[str, Any]]:
    """Return nearby POIs directly from DianpingDB (no AMap needed).
    When lat/lng are provided, results are sorted by distance.
    Falls back to top-rated POIs in the scene when no coordinates given."""
    resolved_scene = _scene(scene or "sz")
    db = get_db()
    wanted_cat = {"food": "美食", "coffee": "美食", "sight": "景点", "hotel": "酒店"}.get(type or "")
    categories = [wanted_cat] if wanted_cat else ["美食", "景点"]

    if lat is not None and lng is not None:
        raw = db.nearby(lat, lng, resolved_scene, radius_km=2.0,
                        categories=categories, limit=12)
    else:
        raw = db.search(resolved_scene, categories=categories,
                        min_rating=3.8, limit=12)

    pois = [_candidate_card_to_frontend_poi(p) for p in raw]
    if type:
        wanted = {"food": "美食", "coffee": "美食", "sight": "景点", "hotel": "酒店"}.get(type)
        if wanted:
            pois = [poi for poi in pois if poi.get("type") == wanted]
    return pois[:6]


@router.get("/recommend/micro")
def get_micro_recommendations(
    scene: Scene = Query("sz"),
    batch: int = Query(0),
    limit: int = Query(5),
) -> list[dict[str, Any]]:
    """Paginated drinks / snacks batch for the TeaSheet micro-recommend.

    The frontend increments `batch` on each '换一批' tap.  Results wrap around
    so there is always fresh content even for a small DB.
    """
    resolved_scene = _scene(scene)
    db = get_db()
    offset = batch * limit
    items = db.get_micro_food(resolved_scene, limit=limit, offset=offset)
    result: list[dict[str, Any]] = []
    for p in items:
        poi = _candidate_card_to_frontend_poi(p)
        poi["category_2"] = p.get("category_2", "")
        poi["mode"] = "外卖" if p.get("category_2", "") in ("饮品店", "面包/饮品") else "到店"
        poi["recommended"] = p.get("recommended", [])[:3]
        result.append(poi)
    return result


@router.post("/poster")
def generate_poster(request: PosterRequest) -> dict[str, Any]:
    """Generate a trip-summary poster image for the given scene.

    Uses the PosterAgent which calls Qwen image generation (or returns a
    'failed' status when the API key is not configured). The generated PNG is
    saved under backend/static/generated/ and the URL is returned so the
    frontend can render it directly.
    """
    scene = _scene(request.scene)
    state = _ensure_trip(scene)
    trip_id = state["trip_id"]
    try:
        orch = _orchestrator()
        result = orch.create_poster(trip_id)
        poster = result.get("poster") or {}
        image_url = poster.get("image_url") or poster.get("image_generation_error")
        gen_status = poster.get("image_generation_status", "unknown")
        return {
            "status": "ok" if gen_status == "generated" else "failed",
            "imageUrl": poster.get("image_url") if gen_status == "generated" else None,
            "title": poster.get("title"),
            "subtitle": poster.get("subtitle"),
            "shareText": poster.get("share_text"),
            "prompt": poster.get("image_prompt"),
            "error": poster.get("image_generation_error") if gen_status != "generated" else None,
            "generationStatus": gen_status,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "status": "error",
            "imageUrl": None,
            "error": str(exc),
            "generationStatus": "error",
        }


def _scene(scene: str | None) -> str:
    """Normalize scene token to one of the two demo scene IDs the frontend
    was built for. Defaults to 'sz' if the caller doesn't supply one."""
    text = str(scene or "").lower()
    return "bj" if text in {"bj", "beijing", "北京"} else "sz"


def _generated_or_source_photo(
    poi: dict[str, Any],
    generated_images: dict[str, str],
) -> str:
    """Prefer a generated POI image URL, falling back to the source photo."""
    return generated_images.get(str(poi.get("card_id") or "")) or poi.get("photo_url", "")


def _bulk_generate_poi_images(
    items: list[dict[str, Any]],
    scene: str,
) -> None:
    """Synchronous worker run in executor — generates and caches images one by one."""
    import logging
    log = logging.getLogger("poi_image_gen")
    for item in items:
        poi_id = item.get("id") or item.get("card_id") or ""
        if not poi_id:
            continue
        # Skip if already generated (concurrent calls guard)
        if _STORE.get_poi_image(poi_id):
            continue
        # Build a minimal card dict for the prompt builder
        item_type = {"sight": "景点", "food": "美食", "hotel": "酒店"}.get(
            str(item.get("cat") or ""),
            str(item.get("cat") or "景点"),
        )
        card = {
            "card_id": poi_id,
            "title":   item.get("name") or item.get("title") or "",
            "area":    item.get("area") or "",
            "cat":     item.get("cat") or "sight",
            "type":    item_type,
            "tags":    (item.get("detail") or {}).get("tags") or [],
            "specialty": item.get("subDesc") or "",
            "photo_url": item.get("imageUrl") or item.get("photo") or "",
        }
        try:
            result = generate_poi_image(card, scene)
            if result.get("status") == "generated":
                _STORE.save_poi_image(poi_id, scene, result["image_url"])
                log.info("POI image generated: %s -> %s", poi_id, result["image_url"])
            else:
                log.warning("POI image failed: %s - %s", poi_id, result.get("error"))
        except Exception as exc:  # noqa: BLE001
            log.exception("POI image generation exception for %s: %s", poi_id, exc)


def _all_picker_items() -> list[dict[str, Any]]:
    return [item for items in PICKER_ITEMS_BY_SCENE.values() for item in items]


def _chat_chunks(scene: str, state: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Build the SSE chunks for /api/chat/stream. Emits a minimal frame that
    just exposes the live TripState — no synthesized 'thinking' steps and no
    hardcoded intro text. Once the DB is wired, cards / hotels / tips come
    from real agent output."""
    state = state or {}
    cards = state.get("candidate_cards") or []
    chunks: list[dict[str, Any]] = []

    # Stream candidate POIs (if the agent produced any)
    if cards:
        chunks.append({"kind": "section", "title": "行程概览"})
        chunks.extend(
            {
                "kind": "spot",
                "name": card.get("title", ""),
                "rating": card.get("rating") or 0,
                "intro": card.get("reason") or "",
                "seed": _photo_seed(card.get("title") or "travel"),
            }
            for card in cards[:5]
        )

    # Hotels / tips come from the scene slots, which start empty and get
    # filled by the DB layer (backend/data/) — not from hardcoded strings.
    if HOTELS.get(scene):
        chunks.append({"kind": "section", "title": "住宿方案"})
        chunks.extend({"kind": "hotel", **hotel} for hotel in HOTELS[scene])

    if TIPS.get(scene):
        chunks.append({"kind": "section", "title": "小贴士"})
        chunks.extend({"kind": "tip", **tip} for tip in TIPS[scene])

    chunks.append({"kind": "done"})
    return chunks


def _get_order(order_id: str) -> dict[str, Any]:
    order = _STORE.get_order(order_id)
    if order is None:
        raise HTTPException(status_code=404, detail=f"Order not found: {order_id}")
    return order


def _new_board_state(order_id: str, scene: str) -> dict[str, Any]:
    first_station = "bj1" if scene == "bj" else "hk1"
    return {
        "orderId": order_id,
        "currentStationId": first_station,
        "completedStationIds": [],
        "lastUpdated": _now(),
    }


def _forecast_days(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    """Pass through whatever the AMap weather tool returned. We no longer
    synthesize tomorrow/the-day-after temperatures from today's snapshot
    (that was mock derivation). When the DB layer brings real multi-day
    forecasts, populate `snapshot['days']` and they'll flow through here."""
    days = snapshot.get("days") or []
    if days:
        return days
    if snapshot.get("condition") and snapshot.get("temperature_c") is not None:
        return [{
            "date": "今天",
            "cond": _condition(snapshot.get("condition")),
            "tempH": int(snapshot["temperature_c"]),
            "tempL": int(snapshot["temperature_c"]),
        }]
    return []


def _condition(value: Any) -> str:
    text = str(value or "")
    if "雪" in text:
        return "雪"
    if "雨" in text:
        return "雨"
    if any(word in text for word in ["阴", "云", "cloud"]):
        return "多云"
    return "晴"


def _candidate_card_to_frontend_poi(card: dict[str, Any]) -> dict[str, Any]:
    """Map a backend candidate card (DB or AMap) to the frontend POI shape."""
    card_type = _itinerary_cat(card.get("type"))
    # Price: try price_per_person (DianpingDB), then price (legacy)
    price = card.get("price_per_person") or card.get("price") or 0
    desc = (card.get("reason") or card.get("specialty")
            or card.get("area") or card.get("category_2") or "")
    return {
        "id":       card.get("card_id"),
        "name":     card.get("title", ""),
        "type":     card_type,
        "rating":   card.get("rating") or 0,
        "desc":     desc,
        "price":    price,
        "duration": _duration_label(card.get("duration_minutes")),
        "tags":     card.get("tags") or [],
        "photo":    card.get("photo_url", ""),
        "area":     card.get("area", ""),
        "address":  card.get("address", ""),
        "lat":      card.get("lat"),
        "lng":      card.get("lon") or card.get("lng"),
        "source":   card.get("source", "dianping"),
    }


def _amount_to_number(value: Any) -> int:
    if isinstance(value, (int, float)):
        return int(value)
    match = re.search(r"¥\s*(\d+)", str(value or ""))
    return int(match.group(1)) if match else 0


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
