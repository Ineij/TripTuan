#!/usr/bin/env python3
"""Batch-generate flat editorial city-illustration images for scenic POIs.

Covers:
  - every scenic POI in both scenes (DianpingDB: bj + sz) -> poi_<card_id>.png
  - existing shared transport images are preserved but not regenerated.

Idempotent / resumable: a POI whose PNG already exists is skipped (its DB row is
repaired if missing). Re-run after a rate-limit stall to fill the remaining gaps.

Rate-limit aware: serial, adaptive base delay between calls, exponential backoff
on HTTP 429 / Throttling, plus a circuit-breaker that exits cleanly when the
quota wall is hit so a later re-run can resume.

Usage:
    python3 backend/scripts/generate_all_poi_images.py            # full run
    python3 backend/scripts/generate_all_poi_images.py --dry-run  # plan only
"""
from __future__ import annotations

import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.clients.poster_image import (  # noqa: E402
    POI_IMAGES_DIR,
    generate_poi_image,
    load_poster_image_settings,
)
from backend.core.env import config_value  # noqa: E402
from backend.core.state_store import DEFAULT_DB_PATH  # noqa: E402
from backend.data.dianping_db import get_db  # noqa: E402

# Transport legs live in the API module. Fall back to the known demo legs if the
# (heavier) API import is unavailable for any reason.
try:
    from backend.api.frontend_routes import _TRANSPORT_BY_SCENE  # noqa: E402
except Exception:  # noqa: BLE001
    _TRANSPORT_BY_SCENE = {
        "sz": [{"id": "transport_sz_go", "mode": "高铁"}, {"id": "transport_sz_back", "mode": "高铁"}],
        "bj": [{"id": "transport_bj_go", "mode": "高铁"}, {"id": "transport_bj_back", "mode": "高铁"}],
    }

DB_PATH = Path(config_value("TRIP_STATE_DB_PATH") or DEFAULT_DB_PATH)

# ── throttle config ────────────────────────────────────────────────
BASE_DELAY = 6.0          # seconds between successful calls (floor)
BASE_DELAY_MAX = 30.0
BACKOFF_START = 20.0
BACKOFF_MAX = 180.0
MAX_RETRIES = 5           # per-item retries on throttle
WALL_FAILURES = 12        # consecutive fully-failed items -> exit to resume later
SCENIC_TYPES = {"景点", "拍照点", "休息点"}

_MODE_SLUG = {"高铁": "rail", "动车": "rail", "飞机": "air", "大巴": "bus"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _log(msg: str) -> None:
    print(f"{datetime.now().strftime('%H:%M:%S')} {msg}", flush=True)


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA busy_timeout=8000")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS poi_images (
               poi_id TEXT PRIMARY KEY, scene TEXT NOT NULL,
               image_url TEXT NOT NULL, generated_at TEXT NOT NULL)"""
    )
    return conn


def _save_row(poi_id: str, scene: str, image_url: str) -> None:
    for attempt in range(5):
        try:
            with _connect() as conn:
                conn.execute(
                    """INSERT INTO poi_images (poi_id, scene, image_url, generated_at)
                       VALUES (?, ?, ?, ?)
                       ON CONFLICT(poi_id) DO UPDATE SET
                           image_url = excluded.image_url,
                           generated_at = excluded.generated_at""",
                    (poi_id, scene, image_url, _now_iso()),
                )
            return
        except sqlite3.OperationalError as exc:
            if "locked" in str(exc).lower() and attempt < 4:
                time.sleep(1.0)
                continue
            raise


def _has_row(poi_id: str) -> bool:
    with _connect() as conn:
        return conn.execute("SELECT 1 FROM poi_images WHERE poi_id = ?", (poi_id,)).fetchone() is not None


def _is_throttle(err: str) -> bool:
    e = (err or "").lower()
    return "429" in e or "throttl" in e or "rate limit" in e or "rate_limit" in e


def _is_retryable(err: str) -> bool:
    e = (err or "").lower()
    return (
        _is_throttle(err)
        or "timeout" in e
        or "timed out" in e
        or "unexpected_eof" in e
        or "eof occurred" in e
        or "connection reset" in e
        or "temporarily unavailable" in e
        or "http 500" in e
        or "http 502" in e
        or "http 503" in e
        or "http 504" in e
    )


def _transport_jobs() -> list[tuple[str, str, list[tuple[str, str]]]]:
    """[(mode, slug, [(scene, transport_id), ...]), ...] — one job per distinct mode."""
    modes: dict[str, list[tuple[str, str]]] = {}
    for scene, legs in _TRANSPORT_BY_SCENE.items():
        for leg in legs:
            modes.setdefault(leg.get("mode", "高铁"), []).append((scene, leg["id"]))
    return [(mode, _MODE_SLUG.get(mode, "rail"), items) for mode, items in modes.items()]


def main(dry_run: bool = False) -> int:
    settings = load_poster_image_settings()
    db = get_db()
    work = [
        (scene, poi)
        for scene in ("bj", "sz")
        for poi in db.all(scene)
        if poi.get("type") in SCENIC_TYPES
    ]
    total = len(work)
    t_jobs = _transport_jobs()
    scene_counts = {
        scene: sum(1 for poi in db.all(scene) if poi.get("type") in SCENIC_TYPES)
        for scene in ("bj", "sz")
    }

    _log(f"DB={DB_PATH}")
    _log(f"model={settings.model} provider={settings.provider} size=1024*1024 enabled={settings.enabled}")
    _log(f"scenic POI library: {total} POIs (bj={scene_counts['bj']} sz={scene_counts['sz']})")
    _log(f"transport modes preserved if already present: {[(m, len(items)) for m, _, items in t_jobs]}")
    existing = sum(1 for _, poi in work if (POI_IMAGES_DIR / f"poi_{poi['card_id']}.png").exists())
    _log(f"already-generated POI pngs: {existing}/{total} (these are skipped)")

    if dry_run:
        _log("DRY-RUN: no API calls made.")
        return 0

    if not settings.enabled:
        _log("ABORT: POSTER_IMAGE_API_KEY not configured.")
        return 1

    POI_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    base_delay = BASE_DELAY
    consec_success = 0
    consec_item_fail = 0
    gen = skip = fail = 0
    failed_ids: list[str] = []

    # ── transport: preserve existing shared images, but do not generate new ones ──
    for mode, slug, items in t_jobs:
        url = f"/static/generated/pois/poi_transport_{slug}.png"
        fpath = POI_IMAGES_DIR / f"poi_transport_{slug}.png"
        if fpath.exists():
            for scene, tid in items:
                _save_row(tid, scene, url)
            _log(f"[transport {mode}] exists -> linked {len(items)} legs (skip gen)")
            skip += 1
            continue
        _log(f"[transport {mode}] missing -> skip generation in scenic-only run")

    # ── POIs ──
    for i, (scene, poi) in enumerate(work, 1):
        cid = poi["card_id"]
        url = f"/static/generated/pois/poi_{cid}.png"
        fpath = POI_IMAGES_DIR / f"poi_{cid}.png"
        if fpath.exists():
            if not _has_row(cid):
                _save_row(cid, scene, url)
            skip += 1
            if skip % 25 == 0:
                _log(f"[{i}/{total}] skipped {skip} existing so far")
            continue

        card = {
            "card_id": cid,
            "title": poi["title"],
            "area": poi.get("area", ""),
            "address": poi.get("address", ""),
            "category_2": poi.get("category_2", ""),
            "category_3": poi.get("category_3", ""),
            "type": poi.get("type", ""),
            "tags": poi.get("tags") or [],
        }
        attempt = 0
        while True:
            res = generate_poi_image(card, scene)
            if res.get("status") == "generated":
                _save_row(cid, scene, url)
                gen += 1
                consec_success += 1
                consec_item_fail = 0
                if consec_success >= 8 and base_delay > BASE_DELAY:
                    base_delay = max(BASE_DELAY, base_delay - 1)
                    consec_success = 0
                _log(f"[{i}/{total}] OK {scene} {cid} {poi['title'][:16]} (gen={gen} delay={base_delay:.0f}s)")
                time.sleep(base_delay)
                break
            err = res.get("error", "")
            if _is_retryable(err) and attempt < MAX_RETRIES:
                wait = min(BACKOFF_START * (2 ** attempt), BACKOFF_MAX)
                if _is_throttle(err):
                    base_delay = min(base_delay + 3, BASE_DELAY_MAX)
                consec_success = 0
                _log(f"[{i}/{total}] retryable {cid} backoff {wait:.0f}s (retry {attempt + 1}/{MAX_RETRIES}, base {base_delay:.0f}s)")
                time.sleep(wait)
                attempt += 1
                continue
            _log(f"[{i}/{total}] FAIL {scene} {cid} {poi['title'][:16]}: {err[:140]}")
            fail += 1
            failed_ids.append(cid)
            consec_item_fail += 1
            if consec_item_fail >= WALL_FAILURES:
                _log(f"RATE_LIMIT_WALL: {consec_item_fail} consecutive failures — exiting to resume later.")
                _log(f"PARTIAL gen={gen} skip={skip} fail={fail}")
                _log("FAILED_IDS: " + ",".join(failed_ids))
                return 2
            break

    _log(f"DONE gen={gen} skip={skip} fail={fail}")
    if failed_ids:
        _log("FAILED_IDS: " + ",".join(failed_ids))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(dry_run="--dry-run" in sys.argv))
