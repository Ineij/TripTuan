"""
LangChain tools wrapping DianpingDB.

Two tools are registered:
  search_dianping_pois  — used by POISelectionAgent to build candidate cards
  nearby_dianping_pois  — used by MicroRecommendAgent for real-time board recs
"""
from __future__ import annotations

import json
from typing import Any

from langchain_core.tools import tool

from backend.data.dianping_db import get_db

# ---------------------------------------------------------------------------
# helpers


def _card_to_agent_format(p: dict) -> dict[str, Any]:
    """Convert DB record → the dict shape the rest of the agents expect."""
    return {
        "card_id":          p["card_id"],
        "type":             p["type"],
        "title":            p["title"],
        "area":             p["area"],
        "address":          p.get("address", ""),
        "tags":             p.get("tags", []),
        "rating":           p.get("rating", 0.0),
        "price_per_person": p.get("price_per_person"),
        "photo_url":        p.get("photo_url", ""),
        "lat":              p.get("lat"),
        "lon":              p.get("lon"),
        "hours":            p.get("hours"),
        "recommended":      p.get("recommended", []),
        "duration_minutes": p.get("duration_minutes", 60),
        "source":           "dianping",
        "category_2":       p.get("category_2", ""),
    }


# ---------------------------------------------------------------------------
# Tool 1: candidate selection (POISelectionAgent)

@tool
def search_dianping_pois(
    scene: str,
    categories: list[str] | None = None,
    keywords: list[str] | None = None,
    min_rating: float = 3.5,
    max_price: float | None = None,
    limit: int = 40,
) -> str:
    """
    Search the local Dianping POI database for a scene.

    Args:
        scene:       "bj" (Beijing) or "sz" (Shenzhen)
        categories:  filter by type, e.g. ["景点"] or ["美食","酒店"] or None for all
        keywords:    substring keywords to match against name/tags/area
        min_rating:  minimum star rating (0–5), default 3.5
        max_price:   upper bound on per-person spend (元), None = no limit
        limit:       max results to return (default 40)

    Returns JSON list of candidate POIs.

    Usage guide for the LLM:
    - 轻松行 preference → fewer 景点 (limit ~3), prefer 公园/咖啡 keywords
    - 打卡行 preference → 景点 with high rating (≥4.5), keyword 博物馆/地标
    - 爱美食 preference → more 美食 (limit 8+), lower 景点
    - 亲子友好 → keyword 亲子/公园/主题乐园
    - 文艺之旅 → keyword 博物馆/展览/古迹
    - budget low     → max_price ~80
    - budget medium  → max_price ~250
    - budget high    → no price cap, min_rating ≥4.0
    - Always include 1–2 酒店 cards.
    """
    db = get_db()
    results = db.search(
        scene,
        categories=categories,
        keywords=keywords,
        min_rating=min_rating,
        max_price=max_price,
        limit=limit,
    )
    cards = [_card_to_agent_format(p) for p in results]
    return json.dumps(cards, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Tool 2: nearby real-time recommendations (MicroRecommendAgent / board)

@tool
def nearby_dianping_pois(
    lat: float,
    lng: float,
    scene: str,
    radius_km: float = 2.0,
    categories: list[str] | None = None,
    limit: int = 10,
) -> str:
    """
    Find Dianping POIs near a given coordinate.

    Args:
        lat:        current latitude
        lng:        current longitude
        scene:      "bj" or "sz"
        radius_km:  search radius in km (default 2.0)
        categories: filter by type, e.g. ["美食"] or ["景点","美食"]
        limit:      max results (default 10)

    Returns JSON list sorted by distance (nearest first).
    Use this during the trip (board page) to show real nearby recommendations.
    """
    db = get_db()
    results = db.nearby(lat, lng, scene, radius_km=radius_km,
                        categories=categories, limit=limit)
    cards = [_card_to_agent_format(p) for p in results]
    return json.dumps(cards, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Tool 3: bulk candidate helper (called directly from frontend_routes, not LLM)

def get_all_candidates(scene: str, preferences: list[str],
                       budget_level: str = "medium",
                       intensity: str = "medium",
                       has_elder: bool = False,
                       has_kid: bool = False) -> list[dict[str, Any]]:
    """
    Non-tool helper: returns a flat list of candidate cards already selected
    by heuristics.  Used as the initial pool that the LLM agent then refines.
    """
    db = get_db()
    by_type = db.select_for_trip(
        scene,
        preferences=preferences,
        budget_level=budget_level,
        intensity=intensity,
        has_elder=has_elder,
        has_kid=has_kid,
    )
    cards = []
    for items in by_type.values():
        cards.extend([_card_to_agent_format(p) for p in items])
    return cards
