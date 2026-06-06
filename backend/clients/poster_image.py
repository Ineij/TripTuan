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
        "visual_style": "xiaohongshu_trip_recap_zine_receipt_polaroid",
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
请生成一张 3:4 竖版 PNG 旅行回忆分享海报，整体气质是「小红书年度报告 + 音乐年度总结视觉 + 季节色彩卡片 + 数据榜单」。不要输出 HTML、SVG 或任何说明文字，直接给出完整图片。

════════════════════════════
视觉风格要求（必须执行）
════════════════════════════
- 核心参考：网易云音乐年度总结、小红书年度报告九宫格、季节色彩卡片、柔光渐变、光轨、抽象纹理、排行榜、月度时间线、漂浮小封面，以及“永不结束的夏天 / 人生海海”这种文艺旅行封面。
- 海报必须像一个“年度旅行报告”页面，不像传统旅行广告，不像景区宣传画，不像商务 PPT，也不要像纸质票根手账。
- 画面可选择以下版式之一，但必须完整、有高级设计感：
    · 柔光关键词版：深色或彩色渐变背景，中心一个巨大中文关键词，周围有环形光轨、柔焦彩虹光束、漂浮小人或小卡片，几句半透明引语作为回忆片段。
    · 季节卡片版：高饱和但干净的春绿、夏蓝、秋黄、冬白其中一种作为大底色，带抽象笔触纹理、风/雨/雪/光点，放一个小小漂浮照片卡片，左下角排大标题和数据。
    · 榜单信息版：蓝紫渐变背景，多个彩色横向 3D 榜单条堆叠，展示 POI 排名、次数、类别，像年度歌单排行榜。
    · 月度时间线版：浅青到白色流光背景，左侧月份刻度，右侧漂浮头像/圆形照片节点，形成一年路线的感觉。
- 画面要有“数字年度总结”的高级感：柔雾、光晕、透明叠层、抽象颗粒、干净大留白；不要脏乱拼贴，不要小票、条形码、胶带、过多贴纸。
- 文字风格：巨大中文标题 + 粗黑中文数据文案 + 少量半透明小字。中文要清晰，字数少，有层次；英文只作为少量装饰，如 YEARLY ROUTE / CITY RECAP。
- 配色要接近参考图：黑紫彩虹柔光、紫色雾面、荧光春绿、清透夏蓝、暖黄秋色、冰白冬色、蓝紫榜单。可以鲜艳，但必须干净、通透、高级。
- 图片/插画处理：可以使用圆形小封面、漂浮照片卡片、模糊城市光影、抽象地图线、路线点、天气符号。不要真实人物大脸，不要社交媒体 UI。
- 强制保留原框架信息，但表达方式要像“旅行人格报告”，不是机械行程单。必须包含：城市旅行标题、旅行人格、真实风景感背景、足迹地图/点亮行程点、高光瞬间、适合分享到社交平台的长图总结。
- 足迹地图必须与其他页面同一视觉体系：用风景照片压暗背景、玻璃拟态路线卡、发光点位，不要做成浅色普通地图 UI。
- 最终分享长图必须是文艺旅行封面：全幅真实风景照片背景（北京偏古建日光/天坛质感，深圳偏海边、湾区、长路、落日），大面积自然光和留白，覆盖一个巨大手写感中文标题（类似“永不结束的夏天 / 人生海海”），底部只放少量旅行数据和一句回忆文案。不要蓝色纯色底，不要格子纸，不要米白纸张，不要两张手机截图，不要深色 UI 卡片堆叠，不要普通 PPT 信息页。

════════════════════════════
文案内容（必须写入海报）
════════════════════════════
1）城市旅行标题（巨大中文标题，必须清楚；例如“北京之行 / 深圳之行”，不要写无关抽象词）：
{poster_copy.get("title", destination + " · 旅行回忆")}

2）旅行人格（中号中文，像年度报告的人设标签；背景要有城市风景照片感，北京偏天坛/古建光影，深圳偏海边落日/湾区水面）：
{poster_copy.get("subtitle", travel_date + " " + str(people_count) + "人同行")}

3）核心触动文案（可作为年度报告里的半透明引语、季节卡片副标题或榜单说明；要像用户愿意发朋友圈/小红书的句子）：
{poster_copy.get("share_text", "每一次出发，都是对日常的温柔反抗。")}

4）足迹地图 / 点亮行程点（必须出现一个抽象地图或路线图，用亮点标出总共点亮的行程点；把去过的地方名称高光出来，按顺序标注，不要编造其他地名）：
{itinerary}

5）旅行高光瞬间（从行程节点里挑一个，写成“最像你的一站 / 最值得再来的一站 / 今天最亮的一站”的感觉；不要只复述地名）

6）社交分享长图总结（必须像朋友圈/小红书可转发的文艺旅行封面，不是单页卡片；使用全幅风景照片背景 + 大号手写中文标题 + 少量数据点 + 一句有情绪的 ending；不要蓝色纯色底，不要格子纸，不要做成两张手机截图，不要堆 UI 卡片；包含出行数据、高光地点、陪伴/路线 ending）

行程数据标注（必须出现，可做成年度报告数据、小标题、榜单右侧次数或底部脚注）：
- {departure} → {destination}
- {travel_date} · {people_count} 人
- 天气：{weather_cond} {temp}°C
- 总距离：{dist_km} km · {duration_min} min
- 打卡：{checked_count}/{len(cards)} 站

════════════════════════════
品牌水印要求（极小字，底部角落）
════════════════════════════
- 可出现极小字 "by ASK XIAOTUAN · LOCAL ROUTE INTELLIGENCE" 或 "小go · 现在就出发" 作为底部角落水印。
- 不出现任何真实平台 UI，不出现小红书界面、点赞评论栏、用户名、真实品牌 logo。
- 不要出现任何网址链接。

════════════════════════════
输出要求
════════════════════════════
- 直接输出一张完整的 PNG 图片，3:4 竖版，分辨率清晰，适合手机竖屏分享朋友圈。
- 视觉必须像一张完成度高的社交媒体年度报告海报，不要像未完成草图。
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

# Negative prompt aligned with the POI lifestyle-photo style. Shared by every
# POI and transport render.
_NEGATIVE_PROMPT = (
    "watermark, social media interface, phone screenshot frame, app UI, "
    "caption text, hashtags, messy text, garbled typography, oversized logo, "
    "brand mascot, identifiable franchise trade dress, people close-up, "
    "crowded tourists, harsh flash, dirty facade, cluttered storefront, "
    "overexposed highlights, underexposed shadows, low quality, blurry, "
    "fisheye distortion, fake plastic texture, neon cyberpunk colors, "
    "real-estate listing photo, stock photo, overprocessed HDR, CGI render, "
    "cheap commercial poster, oversaturated travel ad, shiny plastic surfaces"
)

# User-supplied Xiaohongshu-inspired lifestyle-photo prompt. {subject} is filled
# with POI identity and local metadata so generated images stay tied to the
# place while sharing one premium visual language.
_POI_LIFESTYLE_PHOTO_TEMPLATE = """Create a square 1:1 premium lifestyle travel photo for a mobile travel recommendation card.

Reference direction: premium Instagram editorial travel photography, boutique lifestyle magazine, minimalist storefront / hotel / city-walk aesthetics, calm high-end composition, refined material texture, tasteful negative space. Keep the approachable local-travel feeling, but make it more elegant and less commercial. Do not include any social app interface, captions, hashtags, usernames, likes, or phone frame.

Subject: {subject}

Image goal:
- Use the original POI source photo as the primary visual reference whenever it is supplied to the image model. Preserve the real facade, sign position, entrance layout, greenery, street context, landmark silhouette, and spatial structure; improve the image rather than inventing a different place.
- Preserve the real place category and local atmosphere. The image must look like this exact POI/source scene, not a generic city stock photo.
- If the POI is a cafe, dessert shop, restaurant, hotel, or small store, make the storefront, entrance facade, awning, doorway, outdoor seating, window display, plants, paving, and warm interior glow the main visual subject.
- If the POI is a scenic spot, museum, park, plaza, waterfront, mountain, or landmark, make its recognizable entrance, path, courtyard, lake, bridge, trees, skyline, or main architectural silhouette the subject, photographed like a stylish city-walk recommendation.
- For brand-sensitive venues, use a brand-neutral storefront inspired by the location and category. Signage may be minimal, abstract, or softly unreadable. Do not create exact logos or franchise trade dress.

Unified visual style:
- Photoreal but softly enhanced, high-end Instagram editorial photography, not illustration, not 3D render.
- Natural window/daylight, soft directional shadows, gentle filmic contrast, calm highlights, matte texture, no harsh HDR.
- Muted warm neutrals, ivory, stone beige, champagne cream, warm wood, olive/sage green, dusty blue-gray, soft terracotta, and deep charcoal accents.
- Elegant, quiet, architectural, boutique, design-forward, uncluttered, premium but approachable; a beautiful travel app card image that feels curated rather than generated.
- Use a subtle film-photography feeling: clean grain, soft lens falloff, realistic depth, high dynamic range handled gently, no plastic-smooth surfaces.

Camera angle and composition:
- Match the user's Xiaohongshu reference angle as closely as the source photo allows: front-facing or near-front-facing facade/entrance view, human-eye-level to very slightly low angle, as if standing across the sidewalk looking directly at the storefront or POI entrance.
- Keep vertical architectural lines straight and parallel. Correct perspective distortion where possible; avoid diagonal tourist-snapshot angles unless the source image absolutely requires them.
- The main facade, sign wall, doorway, awning, hotel entrance, park sign, or landmark entrance should occupy the central 65-80% of the frame.
- Use a clean centered composition with the subject filling the card, similar to a storefront feature photo in a lifestyle guide. Crop to remove messy side edges, random cars, trash bins, excessive road, and irrelevant upper floors when they do not define the POI.
- Square 1:1 card crop with enough clean top/bottom breathing room for rounded-card UI cropping.
- Prefer one strong focal point: doorway, awning, facade, terrace, path, lake edge, bridge, park sign, or landmark entrance.
- For source photos shot at an awkward side angle, subtly recompose toward a straighter, more frontal view while preserving the actual identity, signage location, materials, and spatial structure.
- No close-up faces. At most a few tiny distant passersby, not the subject.

Quality requirements:
- Ultra clean, beautiful, cohesive across a grid of cards.
- No dirty storefronts, no visual clutter, no over-sharpening, no harsh HDR, no dark night scene unless the POI is specifically nightlife.
- No watermark, no UI screenshot, no app chrome, no readable social-media text.

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
    if poi.get("photo_url"):
        details.append(f"original source photo URL: {poi['photo_url']}")
    return "; ".join(details)


def _poi_image_prompt(poi: dict[str, Any], scene: str) -> str:
    return _POI_LIFESTYLE_PHOTO_TEMPLATE.format(subject=_poi_subject(poi, scene))


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
    """Generate a unified 1:1 lifestyle-photo image for a single POI.

    Returns a dict with keys:
      - status: 'generated' | 'failed'
      - image_url: relative URL '/static/generated/pois/poi_<poi_id>.png'  (on success)
      - error: error message (on failure)
    """
    settings = load_poster_image_settings()
    poi_id   = poi.get("card_id") or poi.get("id") or "unknown"
    prompt   = _poi_image_prompt(poi, scene)

    if not settings.enabled:
        return {
            "status": "failed",
            "error": "POSTER_IMAGE_API_KEY not configured.",
            "poi_id": poi_id,
            "prompt": prompt,
        }

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
