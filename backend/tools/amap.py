from __future__ import annotations

import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any

from backend.core.env import config_bool, config_value


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
AMAP_WEATHER_URL = "https://restapi.amap.com/v3/weather/weatherInfo"
AMAP_GEO_URL = "https://restapi.amap.com/v3/geocode/geo"
AMAP_REGEO_URL = "https://restapi.amap.com/v3/geocode/regeo"
AMAP_PLACE_TEXT_URL = "https://restapi.amap.com/v3/place/text"
AMAP_PLACE_AROUND_URL = "https://restapi.amap.com/v3/place/around"
AMAP_ROUTE_WALKING_URL = "https://restapi.amap.com/v3/direction/walking"
AMAP_ROUTE_DRIVING_URL = "https://restapi.amap.com/v3/direction/driving"
AMAP_DISTRICT_URL = "https://restapi.amap.com/v3/config/district"
AMAP_MAPMATCH_URL = "https://restapi.amap.com/v4/grasproad/driving"
# AMap adcodes (real city codes used by the weather API). Required to call
# AMap weather — extend as new destinations land. Not mock content.
AMAP_CITY_CODES: dict[str, str] = {
    "北京": "110000",
    "深圳": "440300",
}


def search_pois(destination: str, preferences: list[str], people_count: int) -> list[dict[str, Any]]:
    """Search candidate POIs for a destination via AMap.
    Returns AMap results or an empty list on failure — no mock fallback.
    The new DB layer (backend/data/) should provide POIs via a separate path."""
    amap_pois, _error = _search_amap_pois(destination, preferences, people_count)
    return amap_pois or []


def geocode_address(address: str, city: str | None = None) -> dict[str, Any]:
    payload, error = _amap_get(
        config_value("AMAP_GEO_URL", default=AMAP_GEO_URL),
        {
            "address": address,
            "city": city or "",
            "output": "JSON",
        },
    )
    geocodes = (payload or {}).get("geocodes") or []
    if geocodes:
        item = geocodes[0]
        coords = _parse_amap_location(item.get("location"))
        if coords:
            return {
                **coords,
                "formatted_address": item.get("formatted_address"),
                "country": item.get("country"),
                "province": item.get("province"),
                "city": item.get("city"),
                "district": item.get("district"),
                "adcode": item.get("adcode"),
                "level": item.get("level"),
                "source": "amap",
                "api": "geocode/geo",
            }

    return {
        "lat": None,
        "lng": None,
        "city": "",
        "adcode": "",
        "formatted_address": address,
        "source": "amap",
        "api": "geocode/geo",
        "fallback_reason": error or "AMap geo response did not include geocodes.",
    }


def reverse_geocode(location: dict[str, Any] | None) -> dict[str, Any]:
    if not location:
        return {
            "formatted_address": "",
            "source": "mock",
            "api": "geocode/regeo",
            "fallback_reason": "No location provided.",
        }

    lng = location.get("lng")
    lat = location.get("lat")
    if lng is None or lat is None:
        return {
            "formatted_address": "",
            "source": "mock",
            "api": "geocode/regeo",
            "fallback_reason": "Location must include lng and lat.",
        }

    payload, error = _amap_get(
        config_value("AMAP_REGEO_URL", default=AMAP_REGEO_URL),
        {
            "location": f"{lng},{lat}",
            "extensions": config_value("AMAP_REGEO_EXTENSIONS", default="base"),
            "radius": config_value("AMAP_REGEO_RADIUS", default="1000"),
            "output": "JSON",
        },
    )
    regeocode = (payload or {}).get("regeocode") or {}
    if regeocode:
        component = regeocode.get("addressComponent") or {}
        return {
            "formatted_address": regeocode.get("formatted_address"),
            "country": component.get("country"),
            "province": component.get("province"),
            "city": component.get("city"),
            "district": component.get("district"),
            "township": component.get("township"),
            "source": "amap",
            "api": "geocode/regeo",
        }

    return {
        "formatted_address": f"{lat},{lng}",
        "source": "mock",
        "api": "geocode/regeo",
        "fallback_reason": error or "AMap regeo response did not include regeocode.",
    }


def get_division(keyword: str, subdistrict: int = 1) -> dict[str, Any]:
    payload, error = _amap_get(
        config_value("AMAP_DISTRICT_URL", default=AMAP_DISTRICT_URL),
        {
            "keywords": keyword,
            "subdistrict": str(subdistrict),
            "extensions": config_value("AMAP_DISTRICT_EXTENSIONS", default="base"),
            "output": "JSON",
        },
    )
    districts = (payload or {}).get("districts") or []
    if districts:
        district = districts[0]
        return {
            "source": "amap",
            "api": "config/district",
            "name": district.get("name"),
            "adcode": district.get("adcode"),
            "citycode": district.get("citycode"),
            "level": district.get("level"),
            "center": district.get("center"),
            "districts": district.get("districts", []),
        }
    return {
        "source": "mock",
        "api": "config/district",
        "name": keyword,
        "fallback_reason": error or "AMap district response did not include districts.",
    }


def match_trace(points: list[dict[str, Any]]) -> dict[str, Any]:
    if not points:
        return {
            "source": "mock",
            "api": "grasproad/driving",
            "matched": False,
            "fallback_reason": "No trace points provided.",
        }

    if not config_bool("AMAP_MAPMATCH_ENABLED"):
        return {
            "source": "mock",
            "api": "grasproad/driving",
            "matched": False,
            "fallback_reason": "AMAP_MAPMATCH_ENABLED is not enabled.",
            "points_count": len(points),
        }

    matched, error = _amap_match_trace(points)
    if matched:
        return matched

    return {
        "source": "mock",
        "api": "grasproad/driving",
        "matched": False,
        "fallback_reason": error,
        "points_count": len(points),
    }


def get_weather(destination: str, travel_date: str | None = None) -> dict[str, Any]:
    """Live weather for a destination via AMap.
    On failure returns a shaped placeholder with the reason — never invents
    temperatures or conditions."""
    amap_weather, error = _get_amap_weather(destination, travel_date)
    if amap_weather is not None:
        return amap_weather

    return {
        "date": travel_date or str(date.today()),
        "condition": None,
        "temperature_c": None,
        "rain_probability": None,
        "tips": [],
        "source": "amap",
        "fallback_reason": error,
        "api_key_configured": config_bool("AMAP_WEATHER_API_KEY", "AMAP_API_KEY"),
    }


def _get_amap_weather(
    destination: str, travel_date: str | None = None
) -> tuple[dict[str, Any] | None, str]:
    api_key = _amap_weather_api_key()
    if not api_key:
        return None, "AMAP_WEATHER_API_KEY is not configured."

    city_code = _resolve_amap_city_code(destination)
    params = {
        "key": api_key,
        "city": city_code,
        "extensions": config_value("AMAP_WEATHER_EXTENSIONS", default="base"),
        "output": "JSON",
    }
    url = config_value("AMAP_WEATHER_BASE_URL", default=AMAP_WEATHER_URL)
    request_url = f"{url}?{urllib.parse.urlencode(params)}"

    try:
        with urllib.request.urlopen(
            request_url,
            timeout=float(config_value("AMAP_WEATHER_TIMEOUT_SECONDS", default="5")),
        ) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        return None, f"AMap weather request failed: {exc}"

    if str(payload.get("status")) != "1":
        info = payload.get("info") or "unknown error"
        infocode = payload.get("infocode") or "-"
        return None, f"AMap weather API error {infocode}: {info}"

    normalized = _normalize_amap_weather(payload, destination, travel_date)
    if normalized is None:
        return None, "AMap weather response did not include lives or forecasts."
    return normalized, ""


def _normalize_amap_weather(
    payload: dict[str, Any], destination: str, travel_date: str | None
) -> dict[str, Any] | None:
    lives = payload.get("lives") or []
    if lives:
        live = lives[0]
        condition = str(live.get("weather") or "unknown")
        rain_probability = _estimate_rain_probability(condition)
        return {
            "date": live.get("reporttime") or travel_date or str(date.today()),
            "condition": condition,
            "temperature_c": _safe_int(live.get("temperature")),
            "rain_probability": rain_probability,
            "humidity": _safe_int(live.get("humidity")),
            "winddirection": live.get("winddirection"),
            "windpower": live.get("windpower"),
            "city": live.get("city"),
            "adcode": live.get("adcode"),
            "source": "amap",
            "api": "weatherInfo",
            "extensions": "base",
            "tips": _weather_tips(destination, condition, rain_probability),
        }

    forecasts = payload.get("forecasts") or []
    if forecasts and forecasts[0].get("casts"):
        forecast = forecasts[0]
        cast = forecast["casts"][0]
        condition = str(cast.get("dayweather") or cast.get("nightweather") or "unknown")
        rain_probability = _estimate_rain_probability(condition)
        return {
            "date": cast.get("date") or travel_date or str(date.today()),
            "condition": condition,
            "temperature_c": _safe_int(cast.get("daytemp")),
            "rain_probability": rain_probability,
            "city": forecast.get("city"),
            "adcode": forecast.get("adcode"),
            "source": "amap",
            "api": "weatherInfo",
            "extensions": "all",
            "tips": _weather_tips(destination, condition, rain_probability),
        }

    return None


def _amap_weather_api_key() -> str:
    return _amap_api_key()


def _resolve_amap_city_code(destination: str) -> str:
    for keyword, code in AMAP_CITY_CODES.items():
        if keyword in destination:
            return code
    return destination


def _estimate_rain_probability(condition: str) -> int:
    if any(word in condition for word in ["暴雨", "大雨", "雷阵雨"]):
        return 80
    if any(word in condition for word in ["中雨", "阵雨"]):
        return 60
    if "雨" in condition:
        return 45
    if any(word in condition for word in ["雪", "雨夹雪"]):
        return 40
    if any(word in condition for word in ["阴", "雾", "霾"]):
        return 25
    return 10


def _weather_tips(destination: str, condition: str, rain_probability: int) -> list[str]:
    """Generic tips derived from real AMap weather data. No destination-keyed
    hardcoded tips — those should come from the DB / agent instead."""
    del destination
    if rain_probability >= 60:
        return ["降水风险较高，建议优先安排室内点位并准备雨具。"]
    if rain_probability >= 35:
        return ["天气存在不确定性，建议保留近距离备选路线。"]
    if "雪" in condition:
        return ["户外时间较长，建议准备保暖装备。"]
    return ["天气适合轻量出行。"]


def _safe_int(value: Any) -> int | None:
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return None


def get_order_status(trip_id: str) -> dict[str, Any]:
    return {
        "trip_id": trip_id,
        "source": "mock_empty",
        "tool": "OrderStatusTool",
        "orders": [],
        "counts": {
            "total": 0,
            "pending": 0,
            "paid": 0,
            "verified": 0,
            "cancelled": 0,
        },
        "paid": False,
        "all_paid": False,
        "verified_items": [],
    }


def get_checkin_status(trip_id: str) -> dict[str, Any]:
    return {
        "trip_id": trip_id,
        "checked_in_card_ids": [],
        "count": 0,
        "source": "rule",
        "api": "location_radius_dwell",
    }


def evaluate_checkin(
    trip_id: str,
    current_location: dict[str, Any] | None,
    selected_cards: list[dict[str, Any]],
    previous_status: dict[str, Any] | None = None,
    stay_seconds: int = 0,
) -> dict[str, Any]:
    previous_status = previous_status or get_checkin_status(trip_id)
    checked_ids = set(previous_status.get("checked_in_card_ids") or [])
    radius_m = float(config_value("CHECKIN_RADIUS_METERS", default="80"))
    min_stay_seconds = int(config_value("CHECKIN_MIN_STAY_SECONDS", default="10"))

    status = {
        "trip_id": trip_id,
        "checked_in_card_ids": sorted(checked_ids),
        "count": len(checked_ids),
        "source": "rule",
        "api": "location_radius_dwell",
        "rule": {
            "radius_meters": radius_m,
            "min_stay_seconds": min_stay_seconds,
        },
        "checked_in_now": False,
    }

    if not current_location or current_location.get("lat") is None or current_location.get("lng") is None:
        status["fallback_reason"] = "Current location must include lat and lng."
        return status

    nearest = _nearest_card(current_location, selected_cards)
    if nearest is None:
        status["fallback_reason"] = "No selected cards can be checked in."
        return status

    status["nearest"] = nearest
    can_checkin = nearest["distance_meters"] <= radius_m and stay_seconds >= min_stay_seconds
    if can_checkin:
        checked_ids.add(nearest["card_id"])
        status["checked_in_now"] = nearest["card_id"]
    elif nearest["distance_meters"] > radius_m:
        status["fallback_reason"] = "User is outside check-in radius."
    else:
        status["fallback_reason"] = "User has not stayed long enough for check-in."

    status["checked_in_card_ids"] = sorted(checked_ids)
    status["count"] = len(checked_ids)
    return status


def get_route_between(origin: dict[str, Any], destination: dict[str, Any]) -> dict[str, Any]:
    origin_lat, origin_lng = origin["lat"], origin["lng"]
    dest_lat, dest_lng = destination["lat"], destination["lng"]
    distance_km = _haversine(origin_lat, origin_lng, dest_lat, dest_lng)
    origin_name = origin.get("name") or origin["title"]
    destination_name = destination.get("name") or destination["title"]
    amap_route, error = _get_amap_route_between(
        origin_lat,
        origin_lng,
        dest_lat,
        dest_lng,
        origin_name,
        destination_name,
        distance_km,
    )
    if amap_route:
        return amap_route

    if distance_km <= 0.8:
        transport = "walk"
        duration_minutes = max(5, round(distance_km / 4.2 * 60))
    elif distance_km <= 3:
        transport = "walk_or_taxi"
        duration_minutes = max(8, round(distance_km / 12 * 60))
    else:
        transport = "taxi"
        duration_minutes = max(12, round(distance_km / 22 * 60))

    return {
        "from": origin_name,
        "to": destination_name,
        "origin_location": {"lat": origin_lat, "lng": origin_lng, "name": origin_name},
        "destination_location": {"lat": dest_lat, "lng": dest_lng, "name": destination_name},
        "distance_km": round(distance_km, 2),
        "duration_minutes": duration_minutes,
        "transport": transport,
        "taxi_recommended": transport in {"walk_or_taxi", "taxi"},
        "source": "mock",
        "api": "local_haversine",
        "fallback_reason": error,
    }


def get_taxi_quote(route: dict[str, Any]) -> dict[str, Any]:
    distance_km = float(route.get("distance_km") or 0)
    base = 18
    estimate = base + distance_km * 6
    return {
        "available": True,
        "estimated_price": round(estimate),
        "reason": "距离较远或同行有老人儿童时，打车能降低体力消耗。",
        "source": "mock",
        "tool": "local_taxi_estimate",
        "external_api": False,
    }


def _nearest_card(
    current_location: dict[str, Any],
    cards: list[dict[str, Any]],
) -> dict[str, Any] | None:
    nearest: dict[str, Any] | None = None
    for card in cards:
        if card.get("lat") is None or card.get("lng") is None:
            continue
        distance_m = round(
            _haversine(
                float(current_location["lat"]),
                float(current_location["lng"]),
                float(card["lat"]),
                float(card["lng"]),
            )
            * 1000,
            1,
        )
        candidate = {
            "card_id": card["card_id"],
            "title": card["title"],
            "distance_meters": distance_m,
        }
        if nearest is None or distance_m < nearest["distance_meters"]:
            nearest = candidate
    return nearest


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_km = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return 2 * radius_km * math.asin(math.sqrt(a))


def _search_amap_pois(
    destination: str, preferences: list[str], people_count: int
) -> tuple[list[dict[str, Any]], str]:
    if not _amap_api_key():
        return [], "AMAP_API_KEY is not configured."

    geocoded = geocode_address(destination)
    division = get_division(str(geocoded.get("adcode") or geocoded.get("city") or destination))
    city = str(geocoded.get("adcode") or division.get("adcode") or "")
    keywords = _poi_keywords(destination, preferences)
    pois: list[dict[str, Any]] = []
    last_error = ""

    for keyword in keywords:
        payload, error = _amap_get(
            config_value("AMAP_PLACE_TEXT_URL", default=AMAP_PLACE_TEXT_URL),
            {
                "keywords": keyword,
                "city": city,
                "citylimit": "false",
                "offset": "10",
                "page": "1",
                "extensions": "base",
                "output": "JSON",
            },
        )
        last_error = error or last_error
        for item in (payload or {}).get("pois") or []:
            normalized = _normalize_amap_poi(item, destination, preferences, people_count)
            if normalized:
                pois.append(normalized)

    if geocoded.get("source") == "amap":
        for keyword in ["餐饮", "小吃", "奶茶", "休息"]:
            payload, error = _amap_get(
                config_value("AMAP_PLACE_AROUND_URL", default=AMAP_PLACE_AROUND_URL),
                {
                    "location": f"{geocoded['lng']},{geocoded['lat']}",
                    "keywords": keyword,
                    "radius": config_value("AMAP_PLACE_RADIUS", default="3000"),
                    "offset": "5",
                    "page": "1",
                    "extensions": "base",
                    "output": "JSON",
                },
            )
            last_error = error or last_error
            for item in (payload or {}).get("pois") or []:
                normalized = _normalize_amap_poi(item, destination, preferences, people_count)
                if normalized:
                    pois.append(normalized)

    unique = list({poi["id"]: poi for poi in pois}.values())
    if unique:
        return unique[:8], ""
    return [], last_error or "AMap POI search returned no pois."


def _normalize_amap_poi(
    item: dict[str, Any],
    destination: str,
    preferences: list[str],
    people_count: int,
) -> dict[str, Any] | None:
    coords = _parse_amap_location(item.get("location"))
    if not coords:
        return None

    raw_type = str(item.get("type") or "")
    name = str(item.get("name") or "未命名点位")
    card_type = _infer_card_type(raw_type, name)
    tags = _infer_poi_tags(raw_type, name, preferences, people_count)
    duration = _infer_duration_minutes(card_type, raw_type, name)
    city = item.get("cityname") or item.get("pname") or ""
    area = item.get("adname") or city or destination

    return {
        "id": f"amap_{item.get('id') or abs(hash(name + str(coords)))}",
        "city": city,
        "area": area,
        "name": name,
        "type": card_type,
        "tags": tags,
        "description": f"来自高德 POI 检索：{raw_type or '地点'}",
        "duration_minutes": duration,
        "family_friendly": people_count >= 2 or "亲子" in preferences,
        "elderly_friendly": "轻松" in preferences or card_type in {"餐饮", "休息点"},
        "child_friendly": "亲子" in preferences or card_type in {"景点", "餐饮"},
        "lat": coords["lat"],
        "lng": coords["lng"],
        "source": "amap",
        "api": "place/text|place/around",
        "address": item.get("address"),
        "adcode": item.get("adcode"),
    }


def _get_amap_route_between(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    origin_name: str,
    destination_name: str,
    local_distance_km: float,
) -> tuple[dict[str, Any] | None, str]:
    if not _amap_api_key():
        return None, "AMAP_API_KEY is not configured."

    mode = "walking" if local_distance_km <= 3 else "driving"
    url = config_value(
        "AMAP_ROUTE_WALKING_URL" if mode == "walking" else "AMAP_ROUTE_DRIVING_URL",
        default=AMAP_ROUTE_WALKING_URL if mode == "walking" else AMAP_ROUTE_DRIVING_URL,
    )
    payload, error = _amap_get(
        url,
        {
            "origin": f"{origin_lng},{origin_lat}",
            "destination": f"{dest_lng},{dest_lat}",
            "extensions": "base",
            "output": "JSON",
        },
    )
    paths = ((payload or {}).get("route") or {}).get("paths") or []
    if not paths:
        return None, error or "AMap route response did not include paths."

    path = paths[0]
    distance_m = _safe_int(path.get("distance")) or int(local_distance_km * 1000)
    duration_s = _safe_int(path.get("duration")) or 0
    duration_minutes = max(1, round(duration_s / 60)) if duration_s else 0
    distance_km = round(distance_m / 1000, 2)
    transport = "walk" if mode == "walking" else "taxi"

    return {
        "from": origin_name,
        "to": destination_name,
        "origin_location": {"lat": origin_lat, "lng": origin_lng, "name": origin_name},
        "destination_location": {"lat": dest_lat, "lng": dest_lng, "name": destination_name},
        "distance_km": distance_km,
        "duration_minutes": duration_minutes,
        "transport": transport,
        "taxi_recommended": mode == "driving" or distance_km > 1.2,
        "source": "amap",
        "api": f"direction/{mode}",
    }, ""


def _amap_match_trace(points: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, str]:
    api_key = _amap_api_key()
    if not api_key:
        return None, "AMAP_API_KEY is not configured."

    normalized_points = _normalize_mapmatch_points(points)
    if not normalized_points:
        return None, "Trace points must include lng/lat or longitude/latitude."

    request_url = (
        f"{config_value('AMAP_MAPMATCH_URL', default=AMAP_MAPMATCH_URL)}"
        f"?{urllib.parse.urlencode({'key': api_key})}"
    )
    request = urllib.request.Request(
        request_url,
        data=json.dumps(normalized_points).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="GET",
    )

    try:
        with urllib.request.urlopen(
            request, timeout=float(config_value("AMAP_TIMEOUT_SECONDS", default="5"))
        ) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        return None, f"AMap MapMatch request failed: {exc}"

    if str(payload.get("errcode")) not in {"0", "10000"}:
        errmsg = payload.get("errmsg") or payload.get("info") or "unknown error"
        return None, f"AMap MapMatch API error {payload.get('errcode')}: {errmsg}"

    data = payload.get("data") or payload
    return {
        "source": "amap",
        "api": "grasproad/driving",
        "matched": True,
        "points_count": len(normalized_points),
        "distance": data.get("distance") if isinstance(data, dict) else None,
        "raw": data,
    }, ""


def _normalize_mapmatch_points(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    now = int(time.time())
    for index, point in enumerate(points[:500]):
        lng = point.get("lng", point.get("longitude"))
        lat = point.get("lat", point.get("latitude"))
        if lng is None or lat is None:
            continue
        normalized.append(
            {
                "x": float(lng),
                "y": float(lat),
                "sp": float(point.get("speed", point.get("sp", 0))),
                "ag": float(point.get("angle", point.get("ag", 0))),
                "tm": int(point.get("timestamp", point.get("tm", now + index))),
            }
        )
    return normalized


def _amap_get(url: str, params: dict[str, Any]) -> tuple[dict[str, Any] | None, str]:
    api_key = _amap_api_key()
    if not api_key:
        return None, "AMAP_API_KEY is not configured."

    safe_params = {key: value for key, value in params.items() if value not in (None, "")}
    safe_params["key"] = api_key
    request_url = f"{url}?{urllib.parse.urlencode(safe_params)}"

    try:
        with urllib.request.urlopen(
            request_url, timeout=float(config_value("AMAP_TIMEOUT_SECONDS", default="5"))
        ) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        return None, f"AMap request failed: {exc}"

    if str(payload.get("status")) != "1":
        info = payload.get("info") or "unknown error"
        infocode = payload.get("infocode") or "-"
        return None, f"AMap API error {infocode}: {info}"

    return payload, ""


def _amap_api_key() -> str:
    return config_value("AMAP_MAP_API_KEY", "AMAP_API_KEY", "AMAP_WEATHER_API_KEY")


def _parse_amap_location(value: Any) -> dict[str, float] | None:
    if not isinstance(value, str) or "," not in value:
        return None
    lng_text, lat_text = value.split(",", 1)
    try:
        return {"lng": float(lng_text), "lat": float(lat_text)}
    except ValueError:
        return None


def _poi_keywords(destination: str, preferences: list[str]) -> list[str]:
    keywords = [destination]
    for preference in preferences:
        if preference in {"特色小吃", "小吃"}:
            keywords.append("小吃")
        elif preference in {"奶茶", "茶饮"}:
            keywords.append("奶茶")
        elif preference in {"亲子", "拍照", "轻松"}:
            keywords.append(destination)
        else:
            keywords.append(preference)
    keywords.extend(["餐饮", "休息"])
    deduped: list[str] = []
    for keyword in keywords:
        if keyword and keyword not in deduped:
            deduped.append(keyword)
    return deduped[:5]


def _infer_card_type(raw_type: str, name: str) -> str:
    if any(word in raw_type + name for word in ["餐饮", "美食", "小吃", "茶", "咖啡"]):
        return "餐饮"
    if any(word in raw_type + name for word in ["酒店", "休息", "公园", "广场"]):
        return "休息点"
    if any(word in raw_type + name for word in ["摄影", "景点", "风景", "公园", "乐园"]):
        return "景点"
    return "景点"


def _infer_poi_tags(
    raw_type: str, name: str, preferences: list[str], people_count: int
) -> list[str]:
    tags = [tag for tag in preferences if tag in {"亲子", "轻松", "拍照", "特色小吃"}]
    if "餐饮" in raw_type or any(word in name for word in ["餐", "茶", "小吃", "咖啡"]):
        tags.append("餐饮")
    if people_count >= 3:
        tags.append("多人友好")
    return list(dict.fromkeys(tags or ["推荐"]))


def _infer_duration_minutes(card_type: str, raw_type: str, name: str) -> int:
    if card_type == "餐饮":
        return 45
    if "乐园" in name or "风景名胜" in raw_type:
        return 120
    if card_type == "休息点":
        return 25
    return 60
