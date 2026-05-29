"""
DianpingDB — local POI database loaded from Dianping JSON exports.

Two files are bundled:
  backend/data/bj_poi_dzdp.json   (179 POIs, Beijing)
  backend/data/sz_poi_dzdp.json   (108 POIs, Shenzhen)

This is the single source of truth for all candidate-card selection and
real-time nearby recommendations.  AMap is still used for weather, routing,
and geocoding — but NOT for POI search.

Schema (after normalisation):
  card_id          str       "dzdp_<md5[:10]>"
  scene            str       "bj" | "sz"
  type             str       "景点" | "美食" | "酒店"
  title            str       POI name
  area             str       district (区县)
  address          str       street address
  rating           float     0–5 star rating (大众点评 星级)
  price_per_person float|None  per-person spend (元), None if unavailable
  tags             list[str] e.g. ["咖啡厅", "必打卡", "本地人爱去"]
  photo_url        str       meituan CDN image
  lon              float|None
  lat              float|None
  hours            str|None  opening hours
  facilities       str|None  服务设施 text
  specialty        str|None  特色服务 text
  recommended      list[str] 推荐菜 (empty for non-food)
  dianping_url     str       original listing URL
  category_2       str       二类 (subcategory)
  category_3       str       三类
  duration_minutes int       rough visit duration estimate
  source           str       always "dianping"
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

_DATA_DIR = Path(__file__).parent

# 一类 → internal type
_CAT_MAP: dict[str, str] = {
    "景点/周边游": "景点",
    "美食":       "美食",
    "酒店":       "酒店",
}

# 二类 → rough duration (minutes)
_DURATION_MAP: dict[str, int] = {
    "公园/广场":   90,
    "自然景观":    120,
    "展览馆":      90,
    "博物馆":      90,
    "观光街区":    90,
    "人文古迹":    60,
    "更多景点/周边游": 60,
    "主题乐园":    180,
    # food
    "火锅":        75,
    "烤肉":        75,
    "自助餐":      90,
    "咖啡厅":      45,
    "饮品店":      20,
    "小吃快餐":    30,
    "面包/饮品":   20,
    # hotel — 0 means overnight, not a timed stop
    "经济型":      0,
    "民宿":        0,
    "豪华型":      0,
    "高档型":      0,
}

# Preference tag → helpful filter keywords
PREF_KEYWORDS: dict[str, list[str]] = {
    "轻松行":  ["公园", "广场", "咖啡", "茶", "自然"],
    "打卡行":  ["必打卡", "博物馆", "古迹", "景区", "地标"],
    "爱美食":  ["美食", "火锅", "烤肉", "咖啡", "小吃", "饮品"],
    "爱自然":  ["公园", "自然", "山", "湖", "森林"],
    "文艺之旅": ["博物馆", "展览", "艺术", "古迹", "文化"],
    "亲子友好": ["公园", "主题乐园", "博物馆", "广场"],
    "夜景灯光": ["夜景", "灯光", "夜市"],
    "购物体验": ["购物", "商场", "步行街"],
}


def _safe_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        f = float(str(v))
        return f if f > 0 else None
    except (ValueError, TypeError):
        return None


def _parse_recommended(raw: Any) -> list[str]:
    if not raw:
        return []
    if isinstance(raw, list):
        return [str(x) for x in raw if x]
    try:
        parsed = json.loads(str(raw).replace("'", '"'))
        if isinstance(parsed, list):
            return [str(x) for x in parsed if x]
    except Exception:
        pass
    return []


def _make_id(name: str, scene: str) -> str:
    key = f"{scene}:{name}"
    return "dzdp_" + hashlib.md5(key.encode()).hexdigest()[:10]


def _estimate_duration(cat: str, subcat: str) -> int:
    if cat == "酒店":
        return 0
    dur = _DURATION_MAP.get(subcat)
    if dur is not None:
        return dur
    if cat == "景点":
        return 60
    if cat == "美食":
        return 50
    return 45


def _normalize(raw: dict, scene: str) -> dict:
    name = (raw.get("name") or "").strip()
    cat = _CAT_MAP.get(raw.get("一类", ""), raw.get("一类", "其他"))
    subcat = (raw.get("二类") or "").strip()
    subcat3 = (raw.get("三类") or "").strip()

    tag_raw = (raw.get("tag") or "").strip()
    tags: list[str] = []
    if subcat:
        tags.append(subcat)
    if tag_raw:
        tags.extend([t.strip() for t in tag_raw.split(",") if t.strip()])

    return {
        "card_id":          _make_id(name, scene),
        "scene":            scene,
        "type":             cat,
        "title":            name,
        "area":             (raw.get("区县") or "").strip(),
        "address":          (raw.get("地址") or "").strip(),
        "rating":           float(raw.get("星级") or 0),
        "price_per_person": _safe_float(raw.get("人均消费")),
        "tags":             tags,
        "photo_url":        (raw.get("商家图片") or "").strip(),
        "lon":              _safe_float(raw.get("lon")),
        "lat":              _safe_float(raw.get("lat")),
        "hours":            raw.get("营业时间"),
        "facilities":       raw.get("服务设施"),
        "specialty":        raw.get("特色服务"),
        "recommended":      _parse_recommended(raw.get("推荐菜")),
        "dianping_url":     (raw.get("链接") or "").strip(),
        "category_2":       subcat,
        "category_3":       subcat3,
        "duration_minutes": _estimate_duration(cat, subcat),
        "source":           "dianping",
    }


# ---------------------------------------------------------------------------
# Subcategory classification
# ---------------------------------------------------------------------------

# These subcategories are drinks / light-snacks only.
# They go to the micro-recommend ("TeaSheet") rotation, NOT the main itinerary
# candidate pool.  Proper sit-down meals (火锅, 烧烤, 私房菜 …) stay in the
# candidate pool so ItineraryPlannerAgent can weave them into the route.
SNACK_SUBCATS: frozenset[str] = frozenset({
    "饮品店",
    "小吃快餐",
    "咖啡厅",
    "面包/饮品",
})


class DianpingDB:
    """Singleton-friendly POI database for the two demo scenes."""

    SCENE_TO_CITY: dict[str, str] = {"bj": "北京", "sz": "深圳"}

    def __init__(self) -> None:
        self._pois: dict[str, list[dict]] = {}
        self._by_id: dict[str, dict] = {}
        self._load()

    # ------------------------------------------------------------------
    # internal

    def _load(self) -> None:
        mapping = {"bj": "bj_poi_dzdp.json", "sz": "sz_poi_dzdp.json"}
        for scene, filename in mapping.items():
            path = _DATA_DIR / filename
            if not path.exists():
                self._pois[scene] = []
                continue
            with open(path, encoding="utf-8") as f:
                raw_list: list[dict] = json.load(f)
            normalized = [_normalize(r, scene) for r in raw_list if r.get("name")]
            self._pois[scene] = normalized
            for p in normalized:
                self._by_id[p["card_id"]] = p

    # ------------------------------------------------------------------
    # public API

    def stats(self) -> dict[str, Any]:
        return {
            scene: {
                "total": len(pois),
                "景点": sum(1 for p in pois if p["type"] == "景点"),
                "美食": sum(1 for p in pois if p["type"] == "美食"),
                "酒店": sum(1 for p in pois if p["type"] == "酒店"),
            }
            for scene, pois in self._pois.items()
        }

    def get_by_id(self, card_id: str) -> dict | None:
        return self._by_id.get(card_id)

    def all(self, scene: str) -> list[dict]:
        return list(self._pois.get(scene, []))

    def search(
        self,
        scene: str,
        *,
        categories: list[str] | None = None,
        keywords: list[str] | None = None,
        subcategories: list[str] | None = None,
        min_rating: float = 0.0,
        max_price: float | None = None,
        min_price: float | None = None,
        limit: int = 60,
    ) -> list[dict]:
        """
        Filter the DB and return sorted (rating desc) candidates.

        categories:    ["景点"] | ["美食"] | ["酒店"] | any combo
        subcategories: e.g. ["公园/广场", "咖啡厅"]
        keywords:      substring match against title / tags / area
        """
        pois = list(self._pois.get(scene, []))

        if categories:
            pois = [p for p in pois if p["type"] in categories]

        if subcategories:
            pois = [p for p in pois if p["category_2"] in subcategories]

        if keywords:
            def _match(p: dict) -> bool:
                haystack = " ".join([
                    p["title"], p["area"],
                    " ".join(p["tags"]),
                    p.get("specialty") or "",
                ])
                return any(kw in haystack for kw in keywords)
            pois = [p for p in pois if _match(p)]

        if min_rating > 0:
            pois = [p for p in pois if p["rating"] >= min_rating]

        if max_price is not None:
            pois = [p for p in pois
                    if p["price_per_person"] is None or p["price_per_person"] <= max_price]

        if min_price is not None:
            pois = [p for p in pois
                    if p["price_per_person"] is not None and p["price_per_person"] >= min_price]

        pois.sort(key=lambda x: x["rating"], reverse=True)
        return pois[:limit]

    def nearby(
        self,
        lat: float,
        lng: float,
        scene: str,
        *,
        radius_km: float = 2.0,
        categories: list[str] | None = None,
        limit: int = 12,
    ) -> list[dict]:
        """Return up to `limit` POIs within `radius_km` of (lat, lng), sorted by distance."""
        pois = list(self._pois.get(scene, []))

        if categories:
            pois = [p for p in pois if p["type"] in categories]

        def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
            R = 6371.0
            p1, p2 = math.radians(lat1), math.radians(lat2)
            dp = math.radians(lat2 - lat1)
            dl = math.radians(lon2 - lon1)
            a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
            return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        with_dist: list[tuple[float, dict]] = []
        for p in pois:
            if p["lat"] is not None and p["lon"] is not None:
                dist = _haversine(lat, lng, p["lat"], p["lon"])
                if dist <= radius_km:
                    with_dist.append((dist, p))

        with_dist.sort(key=lambda x: x[0])
        return [p for _, p in with_dist[:limit]]

    def select_for_trip(
        self,
        scene: str,
        preferences: list[str],
        *,
        party_size: int = 1,
        has_elder: bool = False,
        has_kid: bool = False,
        budget_level: str = "medium",
        intensity: str = "medium",
    ) -> dict[str, list[dict]]:
        """
        High-level helper: returns a balanced set of candidates split by type.
        This is called by the POISelectionAgent tool so the LLM can further refine.

        Returns {"景点": [...], "美食": [...], "酒店": [...]}
        """
        # Budget → price ceiling
        price_ceil = {"low": 80, "medium": 250, "high": None}.get(budget_level)

        # Intensity → number of attractions
        sight_limit = {"low": 3, "medium": 6, "high": 10}.get(intensity, 6)

        # Collect preference-driven keywords
        pref_kws: list[str] = []
        for pref in preferences:
            pref_kws.extend(PREF_KEYWORDS.get(pref, []))

        # Adjust for special groups
        elder_kws = ["无障碍", "公园", "广场"] if has_elder else []
        kid_kws   = ["亲子", "公园", "主题"] if has_kid else []
        special_kws = pref_kws + elder_kws + kid_kws

        # Min rating: stricter for high-budget, looser for low
        min_r = {"low": 3.5, "medium": 3.8, "high": 4.0}.get(budget_level, 3.8)

        def _get(cat: str, lim: int, extra_kws: list[str] | None = None) -> list[dict]:
            kws = special_kws + (extra_kws or []) if special_kws or extra_kws else None
            return self.search(
                scene,
                categories=[cat],
                keywords=kws if kws else None,
                min_rating=min_r,
                max_price=price_ceil if cat != "景点" else None,
                limit=lim,
            )

        # Food keywords from prefs
        food_pref_kws = None
        if "爱美食" in preferences:
            food_pref_kws = ["美食", "火锅", "特色", "推荐"]

        sights = _get("景点", sight_limit)
        # Fall back to no-keyword filter if we don't have enough sights for
        # a 2-day trip (need at least sight_limit - 1 to give the LLM options)
        if len(sights) < max(4, sight_limit - 1):
            sights = self.search(
                scene, categories=["景点"],
                min_rating=min_r, limit=sight_limit,
            )
        if len(sights) < 3:                       # final fallback: no rating floor
            sights = self.search(scene, categories=["景点"], limit=sight_limit)

        # Exclude drinks/snacks from itinerary candidates — they belong to the
        # micro-recommend ("TeaSheet") rotation instead.
        #
        # Important: DON'T apply generic preference keywords (博物馆/古迹/etc.) to
        # food search — those keywords are sight-specific and would wrongly exclude
        # good restaurants.  Only use food-specific keywords (from '爱美食') or
        # special-group keywords (亲子/无障碍).
        food_special_kws = elder_kws + kid_kws  # 无障碍, 亲子 — OK for food too
        def _get_food(lim: int, extra_kws: list[str] | None = None) -> list[dict]:
            kws = food_special_kws + (extra_kws or []) if food_special_kws or extra_kws else None
            raw = self.search(
                scene,
                categories=["美食"],
                keywords=kws if kws else None,
                min_rating=min_r,
                max_price=price_ceil,
                limit=lim * 4,  # oversample, then filter
            )
            return [f for f in raw if f.get("category_2", "") not in SNACK_SUBCATS][:lim]

        food = _get_food(8, food_pref_kws)
        if len(food) < 4:
            # Relax to rating+snack-exclusion only (drop all keywords)
            raw_food = self.search(
                scene, categories=["美食"],
                min_rating=min_r, max_price=price_ceil, limit=32,
            )
            food = [f for f in raw_food if f.get("category_2", "") not in SNACK_SUBCATS][:8]
        if len(food) < 3:
            # Final fallback: no price/rating ceiling either
            raw_food = self.search(scene, categories=["美食"], limit=32)
            food = [f for f in raw_food if f.get("category_2", "") not in SNACK_SUBCATS][:8]

        hotels = self.search(scene, categories=["酒店"], min_rating=min_r,
                             max_price=price_ceil, limit=4)
        if not hotels:
            hotels = self.search(scene, categories=["酒店"], limit=4)

        return {"景点": sights, "美食": food, "酒店": hotels}

    def get_micro_food(
        self,
        scene: str,
        *,
        limit: int = 5,
        offset: int = 0,
    ) -> list[dict]:
        """Return drinks / snacks for the micro-recommend rotation.

        Only items whose ``category_2`` is in ``SNACK_SUBCATS`` are returned.
        They are sorted by rating (desc) and then paginated by ``offset`` so the
        frontend can call ``换一批`` by incrementing the batch counter.
        """
        pois = [
            p for p in self._pois.get(scene, [])
            if p["type"] == "美食" and p.get("category_2", "") in SNACK_SUBCATS
        ]
        pois.sort(key=lambda x: x["rating"], reverse=True)
        # Wrap around so "换一批" is always interactive
        total = len(pois)
        if total == 0:
            return []
        start = offset % total
        # Slice with wraparound
        if start + limit <= total:
            return pois[start : start + limit]
        return pois[start:] + pois[: limit - (total - start)]


# Module-level singleton — import and use directly
_db: DianpingDB | None = None


def get_db() -> DianpingDB:
    global _db
    if _db is None:
        _db = DianpingDB()
    return _db
