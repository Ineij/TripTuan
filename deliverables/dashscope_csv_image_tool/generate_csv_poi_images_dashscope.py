#!/usr/bin/env python3
"""Generate source-photo-preserving POI images from a CSV via DashScope.

Expected CSV columns:
  poi_id,name,type,city,source_image_url

Example:
  export DASHSCOPE_API_KEY=sk-...
  python backend/scripts/generate_csv_poi_images_dashscope.py \
    --csv /path/to/poi.csv \
    --limit 5 \
    --scene bj

Outputs:
  backend/static/generated/pois/csv-source/<scene>_<poi_id>_source.<ext>
  backend/static/generated/pois/csv-preview/<scene>_<poi_id>_<slug>_ins.png
  backend/static/generated/pois/csv-preview/manifest.jsonl
  backend/static/generated/pois/csv-preview/<csv>_with_generated_images.csv
"""
from __future__ import annotations

import argparse
import base64
import csv
import json
import mimetypes
import os
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote


ROOT = Path(os.getenv("TRIPTUAN_ROOT", Path.cwd())).resolve()
SOURCE_DIR = ROOT / "backend" / "static" / "generated" / "pois" / "csv-source"
OUTPUT_DIR = ROOT / "backend" / "static" / "generated" / "pois" / "csv-preview"
MANIFEST_PATH = OUTPUT_DIR / "manifest.jsonl"

DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
DEFAULT_MODEL = "qwen-image-2.0-pro"
DEFAULT_SIZE = "1024*1024"


NEGATIVE_PROMPT = (
    "generic stock photo, real-estate listing photo, overprocessed HDR, CGI render, "
    "fake plastic surfaces, oversaturated travel ad, neon cyberpunk colors, "
    "social media UI, phone screenshot frame, watermark, captions, hashtags, "
    "usernames, close-up people, garbled text, excessive logos, blurry low quality"
)


@dataclass
class PoiRow:
    poi_id: str
    name: str
    poi_type: str
    city: str
    source_image_url: str
    scene: str


def main() -> int:
    load_local_env(ROOT / ".env.local")
    load_local_env(ROOT / ".env")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", required=True, help="CSV path with poi_id,name,type,city,source_image_url")
    parser.add_argument("--scene", default="", help="Scene key for output names, e.g. bj or sz")
    parser.add_argument("--limit", type=int, default=0, help="Max rows to process; 0 means all")
    parser.add_argument("--offset", type=int, default=0, help="Skip this many valid rows")
    parser.add_argument("--model", default=os.getenv("DASHSCOPE_IMAGE_MODEL", DEFAULT_MODEL))
    parser.add_argument("--size", default=os.getenv("DASHSCOPE_IMAGE_SIZE", DEFAULT_SIZE))
    parser.add_argument("--base-url", default=os.getenv("DASHSCOPE_IMAGE_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument(
        "--public-base-url",
        default=os.getenv("POI_IMAGE_PUBLIC_BASE_URL", ""),
        help="Optional prefix for generated_image_url, e.g. https://cdn.example.com",
    )
    parser.add_argument(
        "--output-csv",
        default="",
        help="Where to write CSV with generated_image_url. Defaults to csv-preview/<input>_with_generated_images.csv",
    )
    parser.add_argument("--delay", type=float, default=3.0, help="Seconds between successful calls")
    parser.add_argument("--overwrite", action="store_true", help="Regenerate even if output exists")
    parser.add_argument("--dry-run", action="store_true", help="Print planned rows and prompts without API calls")
    args = parser.parse_args()

    api_key = os.getenv("DASHSCOPE_API_KEY") or os.getenv("POSTER_IMAGE_API_KEY")
    if not api_key and not args.dry_run:
        eprint("ERROR: set DASHSCOPE_API_KEY first.")
        return 2

    rows = load_rows(Path(args.csv), args.scene)
    rows = rows[args.offset :]
    if args.limit > 0:
        rows = rows[: args.limit]

    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    log(f"rows={len(rows)} model={args.model} size={args.size}")
    for index, row in enumerate(rows, 1):
        out_path = output_path_for(row)
        if out_path.exists() and not args.overwrite:
            log(f"[{index}/{len(rows)}] SKIP exists {row.poi_id} {row.name} -> {out_path}")
            continue

        prompt = build_prompt(row)
        if args.dry_run:
            log(f"\n[{index}/{len(rows)}] DRY {row.poi_id} {row.name}")
            log(f"source_url={row.source_image_url}")
            log(prompt[:1200])
            continue

        source_path = download_source(row)
        log(f"[{index}/{len(rows)}] CALL {row.poi_id} {row.name}")
        try:
            image_url, raw = call_dashscope(
                api_key=api_key or "",
                base_url=args.base_url,
                model=args.model,
                size=args.size,
                source_path=source_path,
                prompt=prompt,
            )
            download_result(image_url, out_path)
            public_url = public_url_for(out_path, args.public_base_url)
            append_manifest(row, source_path, out_path, public_url, image_url, prompt, raw)
            log(f"[{index}/{len(rows)}] OK -> {out_path}")
            time.sleep(args.delay)
        except Exception as exc:  # noqa: BLE001
            eprint(f"[{index}/{len(rows)}] FAIL {row.poi_id} {row.name}: {exc}")
            if "InvalidApiKey" in str(exc):
                eprint("ABORT: DashScope rejected the API key. Check DASHSCOPE_API_KEY.")
                return 2
            if "Throttling" in str(exc) or "HTTP 429" in str(exc):
                eprint(
                    "ABORT: DashScope rate limit hit. Re-run later with --offset "
                    f"{args.offset + index - 1} and a larger --delay."
                )
                return 3
            continue

    write_output_csv(
        input_csv=Path(args.csv),
        output_csv=Path(args.output_csv) if args.output_csv else default_output_csv(Path(args.csv)),
        scene=args.scene,
        public_base_url=args.public_base_url,
    )
    return 0


def log(message: str) -> None:
    print(message, flush=True)


def eprint(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def load_local_env(path: Path) -> None:
    """Load KEY=VALUE pairs without overriding existing environment vars."""
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def load_rows(csv_path: Path, scene_override: str) -> list[PoiRow]:
    rows: list[PoiRow] = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        required = {"poi_id", "name", "type", "city", "source_image_url"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"CSV missing columns: {', '.join(sorted(missing))}")
        for raw in reader:
            url = (raw.get("source_image_url") or "").strip()
            if not url:
                continue
            city = (raw.get("city") or "").strip()
            rows.append(
                PoiRow(
                    poi_id=(raw.get("poi_id") or "").strip(),
                    name=(raw.get("name") or "").strip(),
                    poi_type=(raw.get("type") or "").strip(),
                    city=city,
                    source_image_url=url,
                    scene=scene_override or infer_scene(city),
                )
            )
    return rows


def infer_scene(city: str) -> str:
    text = city.lower()
    if "北京" in city or "beijing" in text:
        return "bj"
    if "深圳" in city or "shenzhen" in text:
        return "sz"
    return "poi"


def safe_slug(text: str, fallback: str = "poi") -> str:
    slug = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff_-]+", "_", text).strip("_")
    return slug[:40] or fallback


def output_path_for(row: PoiRow) -> Path:
    return OUTPUT_DIR / f"{row.scene}_{safe_slug(row.poi_id)}_{safe_slug(row.name)}_ins.png"


def default_output_csv(input_csv: Path) -> Path:
    return OUTPUT_DIR / f"{input_csv.stem}_with_generated_images.csv"


def public_url_for(path: Path, public_base_url: str = "") -> str:
    rel = "/" + quote(path.relative_to(ROOT / "backend").as_posix(), safe="/")
    return f"{public_base_url.rstrip('/')}{rel}" if public_base_url else rel


def source_path_for(row: PoiRow, content_type: str = "") -> Path:
    ext = ".jpg"
    if "png" in content_type:
        ext = ".png"
    elif "webp" in content_type:
        ext = ".webp"
    return SOURCE_DIR / f"{row.scene}_{safe_slug(row.poi_id)}_source{ext}"


def download_source(row: PoiRow) -> Path:
    probe_path = SOURCE_DIR / f"{row.scene}_{safe_slug(row.poi_id)}_source"
    existing = sorted(probe_path.parent.glob(probe_path.name + ".*"))
    if existing:
        return existing[0]

    req = urllib.request.Request(row.source_image_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        content_type = response.headers.get("content-type", "")
        data = response.read()
    path = source_path_for(row, content_type)
    path.write_bytes(data)
    return path


def encode_file_data_url(path: Path) -> str:
    mime_type, _ = mimetypes.guess_type(path)
    if not mime_type or not mime_type.startswith("image/"):
        mime_type = "image/jpeg"
    data = base64.b64encode(path.read_bytes()).decode("utf-8")
    return f"data:{mime_type};base64,{data}"


def build_prompt(row: PoiRow) -> str:
    type_hint = row.poi_type or "POI"
    if "美食" in type_hint or "餐" in type_hint or "咖啡" in type_hint:
        type_rules = (
            "If the source is food, preserve the actual dish type, plating relationship, table setting, "
            "ingredients, color family, and appetizing texture. If the source is a logo or ad poster, do not "
            "reproduce it as a poster; extract the brand/category mood and create a premium restaurant entrance, "
            "dining counter, or food recommendation card. Do not claim it is an untouched real photo."
        )
    elif "酒店" in type_hint or "民宿" in type_hint:
        type_rules = (
            "If the source is a hotel facade or room, preserve the real entrance/room layout, sign position, "
            "window/door/bed/sofa geometry, and material structure. Make it a premium boutique stay editorial image."
        )
    else:
        type_rules = (
            "If the source is a scenic spot, park, landmark, or attraction, preserve the real path, sign, pavilion, "
            "trees, flowers, water, entrance, or landmark shape; make the composition calm and city-walk editorial."
        )

    return f"""Edit the provided original POI source image for {row.name} in {row.city}. Do not invent a completely different place.

Preserve the real subject and key visual structure from the source image: storefront or hotel facade, sign position, entrance layout, food shape, plate arrangement, table setting, greenery, path, building silhouette, park sign, or landmark geometry.

POI metadata:
- name: {row.name}
- type: {row.poi_type}
- city: {row.city}

Type-specific instruction:
{type_rules}

Transform it into a premium 1:1 Instagram editorial travel / food / city-walk recommendation image.

Style:
- photoreal source-image enhancement
- premium Instagram editorial
- boutique lifestyle magazine aesthetic
- natural daylight or warm natural restaurant interior light
- soft directional shadows
- muted warm neutrals
- ivory, stone beige, champagne cream, warm wood, olive/sage green, dusty blue-gray, soft terracotta, deep charcoal
- subtle film grain
- matte texture
- gentle contrast
- refined negative space
- quiet luxury
- curated, not commercial

Camera and composition:
- If the source is a storefront, hotel, or venue entrance: make it front-facing or near-front-facing, human-eye-level to slightly low angle, straight vertical architectural lines, minimal perspective distortion, centered subject, facade/entrance/sign occupying 65-80% of the square frame.
- If the source is a park, scenic spot, or landmark: preserve the real path, sign, pavilion, trees, flowers, water, entrance, or landmark shape; make the composition calm, centered, and city-walk editorial.
- If the source is food: preserve the actual dish type and plating relationship; make it a premium restaurant editorial food photo with natural light, clean table, and appetizing but realistic color.
- If the source is a logo or ad poster: do not reproduce it as a poster. Extract the brand/category mood and create a premium storefront, entrance atmosphere, dining counter, or food recommendation card. Do not claim it is an untouched real photo.

Avoid:
{NEGATIVE_PROMPT}

Output:
Square 1:1 image, suitable for a mobile travel recommendation card."""


def call_dashscope(
    *,
    api_key: str,
    base_url: str,
    model: str,
    size: str,
    source_path: Path,
    prompt: str,
) -> tuple[str, dict[str, Any]]:
    payload = {
        "model": model,
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"image": encode_file_data_url(source_path)},
                        {"text": prompt},
                    ],
                }
            ]
        },
        "parameters": {
            "n": 1,
            "negative_prompt": NEGATIVE_PROMPT,
            "prompt_extend": True,
            "watermark": False,
            "size": size,
        },
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        base_url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {body}") from exc

    image_url = extract_image_url(raw)
    if not image_url:
        raise RuntimeError(f"No image URL in response: {json.dumps(raw, ensure_ascii=False)[:1000]}")
    return image_url, raw


def extract_image_url(raw: dict[str, Any]) -> str | None:
    try:
        content = raw["output"]["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return None
    if isinstance(content, list):
        for item in content:
            if isinstance(item, dict) and item.get("image"):
                return str(item["image"])
    return None


def download_result(image_url: str, out_path: Path) -> None:
    req = urllib.request.Request(image_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=300) as response:
        out_path.write_bytes(response.read())


def append_manifest(
    row: PoiRow,
    source_path: Path,
    out_path: Path,
    public_url: str,
    temporary_image_url: str,
    prompt: str,
    raw: dict[str, Any],
) -> None:
    record = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "poi_id": row.poi_id,
        "name": row.name,
        "type": row.poi_type,
        "city": row.city,
        "scene": row.scene,
        "source_image_url": row.source_image_url,
        "source_path": str(source_path),
        "output_path": str(out_path),
        "generated_image_url": public_url,
        "image_url_expires_24h": temporary_image_url,
        "request_id": raw.get("request_id"),
        "prompt": prompt,
    }
    with MANIFEST_PATH.open("a", encoding="utf-8") as file:
        file.write(json.dumps(record, ensure_ascii=False) + "\n")


def write_output_csv(
    input_csv: Path,
    output_csv: Path,
    scene: str,
    public_base_url: str,
) -> None:
    """Write a copy of the input CSV with generated_image_url filled in."""
    with input_csv.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)

    if "generated_image_url" not in fieldnames:
        fieldnames.append("generated_image_url")

    for row in rows:
        row_scene = scene or infer_scene(row.get("city", ""))
        candidate = OUTPUT_DIR / (
            f"{row_scene}_{safe_slug(row.get('poi_id', ''))}_{safe_slug(row.get('name', ''))}_ins.png"
        )
        if candidate.exists():
            row["generated_image_url"] = public_url_for(candidate, public_base_url)
        else:
            row.setdefault("generated_image_url", "")

    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    log(f"CSV -> {output_csv}")


if __name__ == "__main__":
    raise SystemExit(main())
