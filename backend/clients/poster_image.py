from __future__ import annotations

import base64
import binascii
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from backend.core.env import config_value
from backend.core.models import TripState


STATIC_DIR = Path(__file__).resolve().parents[1] / "static"
GENERATED_DIR = STATIC_DIR / "generated"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


@dataclass(frozen=True, slots=True)
class PosterImageSettings:
    api_key: str
    base_url: str
    model: str
    provider: str = "qwen"
    size: str = "928*1664"
    timeout_seconds: int = 60

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)


def load_poster_image_settings() -> PosterImageSettings:
    api_key = (
        os.environ.get("POSTER_IMAGE_API_KEY")
        or config_value("POSTER_IMAGE_API_KEY")
        or os.environ.get("DASHSCOPE_API_KEY")
        or config_value("DASHSCOPE_API_KEY")
    )
    base_url = (
        os.environ.get("POSTER_IMAGE_BASE_URL")
        or config_value("POSTER_IMAGE_BASE_URL")
        or "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
    )
    return PosterImageSettings(
        api_key=api_key,
        base_url=base_url.rstrip("/"),
        model=os.environ.get("POSTER_IMAGE_MODEL")
        or config_value("POSTER_IMAGE_MODEL", default="qwen-image-2.0-pro"),
        provider=os.environ.get("POSTER_IMAGE_PROVIDER")
        or config_value("POSTER_IMAGE_PROVIDER", default="qwen"),
        size=os.environ.get("POSTER_IMAGE_SIZE")
        or config_value("POSTER_IMAGE_SIZE", default="928*1664"),
        timeout_seconds=int(config_value("POSTER_IMAGE_TIMEOUT_SECONDS", default="60")),
    )


def generate_trip_poster_png(
    state: TripState,
    poster_copy: dict[str, Any],
) -> dict[str, Any]:
    settings = load_poster_image_settings()
    prompt = build_poster_prompt(state, poster_copy)
    if not settings.enabled:
        return {
            "image_generation_status": "failed",
            "image_generation_model": settings.model,
            "image_generation_provider": settings.provider,
            "image_generation_error": "POSTER_IMAGE_API_KEY or DASHSCOPE_API_KEY is not configured.",
            "image_prompt": prompt,
        }

    payload = {
        "model": settings.model,
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": [{"text": prompt}],
                }
            ]
        },
        "parameters": {
            "negative_prompt": (
                "low quality, blurry, messy layout, unreadable text, typo, wrong Chinese characters, "
                "extra landmarks, fake logo, watermark, cheap gradient, cluttered UI screenshot"
            ),
            "prompt_extend": True,
            "watermark": False,
            "size": settings.size,
        },
    }
    response, error = _post_json(
        settings.base_url,
        payload,
        settings.api_key,
        settings.timeout_seconds,
    )
    if response is None:
        return {
            "image_generation_status": "failed",
            "image_generation_model": settings.model,
            "image_generation_provider": settings.provider,
            "image_generation_error": error,
            "image_prompt": prompt,
        }

    image_bytes, parse_error = _extract_png_bytes(response, settings.api_key, settings.timeout_seconds)
    if not image_bytes:
        return {
            "image_generation_status": "failed",
            "image_generation_model": settings.model,
            "image_generation_provider": settings.provider,
            "image_generation_error": parse_error or "Model response did not include PNG image data.",
            "image_prompt": prompt,
            "image_response_shape": _response_shape(response),
        }

    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    file_name = f"poster_{state.trip_id}.png"
    output_path = GENERATED_DIR / file_name
    output_path.write_bytes(image_bytes)
    return {
        "image_generation_status": "generated",
        "image_generation_model": settings.model,
        "image_generation_provider": settings.provider,
        "image_url": f"/static/generated/{file_name}",
        "image_path": str(output_path),
        "image_prompt": prompt,
        "render_tool": "QwenPosterImageTool",
        "render_format": "png",
        "visual_style": "retro_netease_summary_meituan_yellow",
    }


def build_poster_prompt(state: TripState, poster_copy: dict[str, Any]) -> str:
    request = state.structured_request
    cards = state.selected_cards or state.candidate_cards[:5]
    itinerary = _itinerary_lines(state, cards)
    route_plan = state.route_plan or {}
    weather = state.weather or {}
    checked_count = state.checkin_status.get("count", 0)
    preferences = "、".join(request.get("preferences") or [])
    special_groups = "、".join(request.get("special_groups") or [])

    destination = request.get('destination') or '目的地'
    departure = request.get('departure_location') or '出发地'
    travel_date = request.get('travel_date') or '近期'
    people_count = request.get('people_count') or 2
    weather_cond = weather.get('condition') or '晴'
    temp = weather.get('temperature_c', '--')
    dist_km = route_plan.get('total_distance_km', 0)
    duration_min = route_plan.get('total_duration_minutes', 0)

    return f"""
请生成一张 3:4 竖版 PNG 旅行回忆海报，整体气质是「诗意插画 + 文化旅行手账」，不要输出 HTML、SVG 或任何说明文字，直接给出完整图片。

════════════════════════════
视觉风格要求（必须执行）
════════════════════════════
- 整体质感：仿手绘水彩 + 旧地图纸张肌理，像一本私人旅行日记的封面或扉页。
- 构图分区：
    · 顶部（约 28%）：目的地城市全景速写线稿或标志建筑剪影，上方留白标注英文城市大字（如 SHENZHEN / BEIJING），字体用粗粗的复古衬线体（类 Clarendon / Trajan）。
    · 中部（约 44%）：核心情绪插图区——画出一条手绘路线折线穿越城市地图碎片，线上标注行程节点名称（用中文手写风格），周围点缀邮票、印章、水彩晕染色块。
    · 底部（约 28%）：数据总结板块，像旅行日记脚注，展示人数、打卡站数、总距离、天气符号、出发地→目的地箭头文字，用复古打字机字体+中文混排。
- 配色：
    · 主色调：米白旧纸（#F5EDD8）/ 墨绿（#2D4A3E）/ 暖赤陶（#C1440E）/ 美团黄（#FFD100，作为点睛色，用于一个标题装饰条或底色印章）
    · 绝对不要：廉价渐变、霓虹色、过度饱和的数字风格背景。
- 文字层次：
    1. 巨大英文城市名（顶部）
    2. 中文主标题「{poster_copy.get("title", destination + " · 旅行回忆")}」（中部）
    3. 中文副标题「{poster_copy.get("subtitle", travel_date + " " + str(people_count) + "人同行")}」（中部偏下）
    4. 一句诗意核心文案（见下方），字号中等，排在路线图旁边或底部
    5. 行程数据（最底部，小字）
- 插画细节：建筑/景点速写轮廓不能完全写实，要有插画感、减法留白，不要塞满整个画面。

════════════════════════════
文案内容（必须写入海报）
════════════════════════════
核心一句话文案（手写风格置于海报中部）：
{poster_copy.get("share_text", "每一次出发，都是对日常的温柔反抗。")}

行程节点（路线图上按顺序标注，不要编造其他地名）：
{itinerary}

行程数据标注（底部脚注区）：
- {departure} → {destination}
- {travel_date} · {people_count} 人
- 天气：{weather_cond} {temp}°C
- 总距离：{dist_km} km · {duration_min} min
- 打卡：{checked_count}/{len(cards)} 站

════════════════════════════
品牌水印要求（极小字，底部角落）
════════════════════════════
- 可出现极小字 "by ASK XIAOTUAN · LOCAL ROUTE INTELLIGENCE" 作为版权水印，不出现任何真实品牌 logo。
- 不要出现任何网址链接。

════════════════════════════
输出要求
════════════════════════════
- 直接输出一张完整的 PNG 图片，3:4 竖版，分辨率清晰，适合手机竖屏分享朋友圈。
- 不要输出任何说明文字、HTML 代码、Markdown 标记。
""".strip()


def _itinerary_lines(state: TripState, cards: list[dict[str, Any]]) -> str:
    board_items = [item for item in state.static_board if item.get("card_id")]
    if board_items:
        return "\n".join(
            f"- {item.get('time', '--:--')} {item.get('action')} / {item.get('type')}"
            for item in board_items[:8]
        )
    return "\n".join(
        f"- {index + 1}. {card.get('title')} / {card.get('type')} / {card.get('duration_minutes')}min"
        for index, card in enumerate(cards[:8])
    )


def _post_json(
    url: str,
    payload: dict[str, Any],
    api_key: str,
    timeout_seconds: int,
) -> tuple[dict[str, Any] | None, str]:
    request = urllib.request.Request(
        url=url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8")), ""
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        return None, f"HTTP {exc.code}: {detail[:600]}"
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        return None, str(exc)


def _extract_png_bytes(
    response: dict[str, Any],
    api_key: str,
    timeout_seconds: int,
) -> tuple[bytes | None, str]:
    candidates = list(_walk_values(response))
    for value in candidates:
        if not isinstance(value, str):
            continue
        image_bytes = _decode_png_data(value)
        if image_bytes:
            return image_bytes, ""
        if value.startswith("http://") or value.startswith("https://"):
            downloaded, error = _download_png(value, api_key, timeout_seconds)
            if downloaded:
                return downloaded, ""
            return None, error
    return None, "No PNG data URL, base64 PNG, or PNG image URL found in response."


def _walk_values(value: Any) -> list[Any]:
    values = [value]
    if isinstance(value, dict):
        for child in value.values():
            values.extend(_walk_values(child))
    elif isinstance(value, list):
        for child in value:
            values.extend(_walk_values(child))
    return values


def _decode_png_data(value: str) -> bytes | None:
    if value.startswith("data:image/png;base64,"):
        value = value.split(",", 1)[1]
    if len(value) < 80:
        return None
    try:
        image_bytes = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error):
        return None
    return image_bytes if image_bytes.startswith(PNG_SIGNATURE) else None


def _download_png(url: str, api_key: str, timeout_seconds: int) -> tuple[bytes | None, str]:
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {api_key}"})
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            content = response.read()
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return None, f"Image URL download failed: {exc}"
    if not content.startswith(PNG_SIGNATURE):
        return None, "Image URL did not return PNG bytes."
    return content, ""


def _response_shape(value: Any, depth: int = 0) -> Any:
    if depth > 3:
        return "..."
    if isinstance(value, dict):
        return {key: _response_shape(child, depth + 1) for key, child in value.items()}
    if isinstance(value, list):
        return [_response_shape(value[0], depth + 1)] if value else []
    if isinstance(value, str):
        return f"str({len(value)})"
    return type(value).__name__


# ─────────────────────────────────────────────────────────────────
# POI thumbnail image generation
# ─────────────────────────────────────────────────────────────────

POI_IMAGES_DIR = STATIC_DIR / "generated" / "pois"

_CITY_CN: dict[str, str] = {
    "sz": "深圳",
    "bj": "北京",
}

# Negative prompt aligned with the city-illustration style (flat editorial, no
# text / photoreal / 3D). Shared by every POI and transport render.
_NEGATIVE_PROMPT = (
    "text, letters, numbers, logo, watermark, interface elements, UI, "
    "people close-up, realistic photography, photorealism, 3D rendering, "
    "messy details, excessive details, low quality, blurry, cluttered, "
    "neon, harsh colors, brand logo, mascot, franchise trade dress"
)

# User-supplied flat city-illustration prompt. {subject} is filled with the POI
# identity and local metadata so scenic spots do not collapse into generic
# city-skyline images.
_CITY_ILLUSTRATION_TEMPLATE = """Create a square 1:1 city illustration based on real-world reference photos. First search and study authentic street-view or travel photography of {subject}, accurately extracting its real architectural silhouette, skyline proportion, landmark scale, spatial hierarchy, street structure, and local environmental features. Then transform the real scene into a flat, colorful editorial illustration.

The image should use a wide-angle urban postcard composition, with a clear foreground, midground, and background hierarchy. The main landmark or architectural subject should occupy the visual center or slightly off-center position, shown from a human-eye-level to slightly low-angle perspective, creating a sense of grandeur without distortion. Maintain realistic spatial scale: buildings, streets, water, trees, mountains, or city blocks should follow the proportions of the real location, but be simplified into clean geometric shapes.

Subject accuracy requirements: the illustration must be about this exact scenic POI, not a generic city skyline. The named place itself must be the dominant visual subject and occupy the central 55-70% of the image. Use the POI's real category, facade, roofline, gate, plaza, lake, bridge, trees, mountain, waterfront, courtyard, exhibition hall, tower, or park structure as the main silhouette. Do not replace the location with repeated generic high-rise buildings, repeated generic riverside skylines, or a generic CBD postcard. Vary the viewpoint according to the place: museum entrance facade, historic gate, temple/courtyard axis, park path and lake, mountain trail, waterfront promenade, plaza sculpture, observation tower, or distinctive neighborhood street. The foreground should contain location-specific approach context such as steps, paving, water, trees, bridge, wall, slope, or square, not generic blocky buildings.

Visual style: flat illustration, modern travel poster aesthetic, soft digital gouache texture, clean blocky shapes, simplified architecture, slightly grainy paper texture, crisp silhouette, no photorealism, no 3D rendering, no excessive details. The atmosphere should feel bright, optimistic, fresh, and artistic, similar to a high-quality editorial city illustration.

Color palette: vibrant but slightly desaturated colors, low-saturation cyan blue sky, soft turquoise, warm cream yellow, coral pink, muted orange, light lavender, pale mint green, and deep navy blue shadows. Use strong sunlight and high-key lighting, with large areas of bright sky and soft cloud shapes. Shadows should be simplified into flat color blocks, using cool blue and muted purple tones. The overall palette should be colorful, airy, harmonious, and slightly retro, avoiding overly neon or harsh colors.

Composition requirements: square format, 1:1 aspect ratio, balanced visual weight, large open sky area, strong landmark silhouette, layered city skyline, clean negative space, poster-like layout, refined and decorative but not crowded. The illustration should feel like a premium travel app poster or city guide cover.

No text, no letters, no numbers, no logos, no watermark, no interface elements, no people close-up, no realistic photography, no messy details.

Aspect ratio: 1:1"""

# Same flat editorial style, adapted for a shared transport-mode illustration.
_TRANSPORT_ILLUSTRATION_TEMPLATE = """Create a square 1:1 travel illustration based on real-world reference photos. First search and study authentic photography of {subject}, accurately extracting its real silhouette, proportions, structural details, and the surrounding station/transit environment. Then transform the real scene into a flat, colorful editorial illustration.

The image should use a dynamic postcard composition, with a clear foreground, midground, and background hierarchy. The vehicle should occupy the visual center or slightly off-center position, shown from a human-eye-level to slightly low-angle perspective, conveying a sense of speed and journey without distortion. Maintain realistic proportions, but simplify everything into clean geometric shapes.

Visual style: flat illustration, modern travel poster aesthetic, soft digital gouache texture, clean blocky shapes, simplified forms, slightly grainy paper texture, crisp silhouette, no photorealism, no 3D rendering, no excessive details. The atmosphere should feel bright, optimistic, fresh, and artistic, similar to a high-quality editorial illustration.

Color palette: vibrant but slightly desaturated colors, low-saturation cyan blue sky, soft turquoise, warm cream yellow, coral pink, muted orange, light lavender, pale mint green, and deep navy blue shadows. Use strong sunlight and high-key lighting, with large areas of bright sky and soft cloud shapes. Shadows should be simplified into flat color blocks, using cool blue and muted purple tones. The overall palette should be colorful, airy, harmonious, and slightly retro, avoiding overly neon or harsh colors.

Composition requirements: square format, 1:1 aspect ratio, balanced visual weight, large open sky area, strong vehicle silhouette, layered platform and rails or runway, clean negative space, poster-like layout, refined and decorative but not crowded. The illustration should feel like a premium travel app poster.

No text, no letters, no numbers, no logos, no watermark, no interface elements, no people close-up, no realistic photography, no messy details.

Aspect ratio: 1:1"""

_TRANSPORT_SUBJECTS: dict[str, str] = {
    "高铁": "a modern Chinese high-speed bullet train (Fuxing / CRH series) arriving at a clean open railway station platform",
    "动车": "a modern Chinese high-speed bullet train (Fuxing / CRH series) arriving at a clean open railway station platform",
    "飞机": "a modern passenger airplane on an airport apron beside a clean terminal and runway",
    "大巴": "a modern intercity coach bus at a clean bus terminal",
}

_BRAND_RISK_TERMS = (
    "麦当劳",
    "肯德基",
    "星巴克",
    "DQ",
    "瑞幸",
    "库迪",
    "Manner",
    "奈雪",
    "喜茶",
    "必胜客",
    "汉堡王",
    "如家",
    "汉庭",
    "全季",
    "锦江",
    "速8",
    "7天",
    "亚朵",
    "希尔顿",
    "万豪",
    "洲际",
    "凯悦",
    "香格里拉",
    "维也纳",
    "丽枫",
    "麗枫",
    "桔子酒店",
    "格林豪泰",
)


def _poi_subject(poi: dict[str, Any], scene: str) -> str:
    name = poi.get("title") or poi.get("name") or "地点"
    area = poi.get("area") or ""
    address = poi.get("address") or ""
    city = _CITY_CN.get(scene, scene)
    location = f"{city}{area}".strip()
    category = poi.get("category_2") or poi.get("cat") or poi.get("type") or "local venue"
    subcategory = poi.get("category_3") or ""
    tags = "、".join(str(tag) for tag in (poi.get("tags") or [])[:5])
    if any(term.lower() in name.lower() for term in _BRAND_RISK_TERMS):
        place = location or city
        return (
            f"a brand-neutral {category} venue in {place}, based on the local street, "
            "storefront, station, or neighborhood environment, without any identifiable "
            "brand signage, logo, mascot, packaging, or franchise visual identity"
        )
    details = [f"the exact scenic POI named {name}"]
    if location:
        details.append(f"located in {location}")
    if address:
        details.append(f"near {address}")
    if category:
        details.append(f"category: {category}")
    if subcategory and subcategory != category:
        details.append(f"specific type: {subcategory}")
    if tags:
        details.append(f"local visual clues/tags: {tags}")
    return "; ".join(details)


def _poi_image_prompt(poi: dict[str, Any], scene: str) -> str:
    return _CITY_ILLUSTRATION_TEMPLATE.format(subject=_poi_subject(poi, scene))


def _transport_image_prompt(mode: str) -> str:
    subject = _TRANSPORT_SUBJECTS.get(mode, f"a modern {mode} vehicle at a clean transit station")
    return _TRANSPORT_ILLUSTRATION_TEMPLATE.format(subject=subject)


def _render_png(prompt: str, file_name: str, settings: PosterImageSettings) -> dict[str, Any]:
    """Render a 1:1 PNG for `prompt` and write it to POI_IMAGES_DIR/file_name.

    Single attempt — callers handle throttling / retry. Returns
    {'status': 'generated', 'image_url': ...} or {'status': 'failed', 'error': ...}.
    """
    payload = {
        "model": settings.model,
        "input": {
            "messages": [{"role": "user", "content": [{"text": prompt}]}]
        },
        "parameters": {
            "negative_prompt": _NEGATIVE_PROMPT,
            "prompt_extend": False,
            "watermark": False,
            "size": "1024*1024",
        },
    }

    response, error = _post_json(settings.base_url, payload, settings.api_key, settings.timeout_seconds)
    if response is None:
        return {"status": "failed", "error": error}

    image_bytes, parse_error = _extract_png_bytes(response, settings.api_key, settings.timeout_seconds)
    if not image_bytes:
        return {"status": "failed", "error": parse_error or "No PNG in response"}

    POI_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    output_path = POI_IMAGES_DIR / file_name
    output_path.write_bytes(image_bytes)
    return {
        "status":    "generated",
        "image_url": f"/static/generated/pois/{file_name}",
        "image_path": str(output_path),
    }


def generate_poi_image(poi: dict[str, Any], scene: str) -> dict[str, Any]:
    """Generate a 1:1 flat editorial city illustration for a single POI.

    Returns a dict with keys:
      - status: 'generated' | 'failed'
      - image_url: relative URL '/static/generated/pois/poi_<poi_id>.png'  (on success)
      - error: error message (on failure)
    """
    settings = load_poster_image_settings()
    poi_id   = poi.get("card_id") or poi.get("id") or "unknown"
    prompt   = _poi_image_prompt(poi, scene)

    if not settings.enabled:
        return {"status": "failed", "error": "POSTER_IMAGE_API_KEY not configured.", "poi_id": poi_id}

    result = _render_png(prompt, f"poi_{poi_id}.png", settings)
    result["poi_id"] = poi_id
    result["prompt"] = prompt
    return result


def generate_transport_image(mode: str, slug: str) -> dict[str, Any]:
    """Generate ONE shared 1:1 illustration for a transport mode (e.g. 高铁).

    The same image is reused for every transport leg of that mode. Stored as
    '/static/generated/pois/poi_transport_<slug>.png'.
    """
    settings = load_poster_image_settings()
    prompt   = _transport_image_prompt(mode)

    if not settings.enabled:
        return {"status": "failed", "error": "POSTER_IMAGE_API_KEY not configured.", "transport": slug}

    result = _render_png(prompt, f"poi_transport_{slug}.png", settings)
    result["transport"] = slug
    result["mode"] = mode
    result["prompt"] = prompt
    return result
