from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from backend.core.env import config_value
from backend.core.state_store import DEFAULT_DB_PATH


class FrontendAdapterStore:
    def __init__(self, db_path: str | Path | None = None) -> None:
        configured_path = config_value("TRIP_STATE_DB_PATH")
        self.db_path = Path(db_path or configured_path or DEFAULT_DB_PATH)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def save_order(self, order: dict[str, Any]) -> None:
        now = _utc_now()
        order_id = str(order["orderId"])
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO frontend_orders (
                    order_id, scene, status, payload_json, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(order_id) DO UPDATE SET
                    scene = excluded.scene,
                    status = excluded.status,
                    payload_json = excluded.payload_json,
                    updated_at = excluded.updated_at
                """,
                (
                    order_id,
                    str(order.get("scene", "sz")),
                    str(order.get("status", "draft")),
                    _json_dumps(order),
                    order.get("createdAt") or now,
                    now,
                ),
            )

    def get_order(self, order_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload_json FROM frontend_orders WHERE order_id = ?",
                (order_id,),
            ).fetchone()
        return json.loads(row["payload_json"]) if row else None

    def save_session(self, scene: str, session: dict[str, Any]) -> None:
        now = _utc_now()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO frontend_sessions (
                    scene, trip_id, payload_json, updated_at
                )
                VALUES (?, ?, ?, ?)
                ON CONFLICT(scene) DO UPDATE SET
                    trip_id = excluded.trip_id,
                    payload_json = excluded.payload_json,
                    updated_at = excluded.updated_at
                """,
                (
                    scene,
                    str(session["trip_id"]),
                    _json_dumps(session),
                    now,
                ),
            )

    def get_session(self, scene: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload_json FROM frontend_sessions WHERE scene = ?",
                (scene,),
            ).fetchone()
        return json.loads(row["payload_json"]) if row else None

    def save_board_state(self, board_state: dict[str, Any]) -> None:
        now = _utc_now()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO frontend_board_states (
                    order_id, payload_json, updated_at
                )
                VALUES (?, ?, ?)
                ON CONFLICT(order_id) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    updated_at = excluded.updated_at
                """,
                (
                    str(board_state["orderId"]),
                    _json_dumps(board_state),
                    now,
                ),
            )

    def get_board_state(self, order_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload_json FROM frontend_board_states WHERE order_id = ?",
                (order_id,),
            ).fetchone()
        return json.loads(row["payload_json"]) if row else None

    # ── POI image cache ─────────────────────────────────────────
    def save_poi_image(self, poi_id: str, scene: str, image_url: str) -> None:
        now = _utc_now()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO poi_images (poi_id, scene, image_url, generated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(poi_id) DO UPDATE SET
                    image_url    = excluded.image_url,
                    generated_at = excluded.generated_at
                """,
                (poi_id, scene, image_url, now),
            )

    def get_poi_image(self, poi_id: str) -> str | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT image_url FROM poi_images WHERE poi_id = ?",
                (poi_id,),
            ).fetchone()
        return row["image_url"] if row else None

    def get_poi_images_for_scene(self, scene: str) -> dict[str, str]:
        """Return {poi_id: image_url} for all generated POIs in a scene."""
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT poi_id, image_url FROM poi_images WHERE scene = ?",
                (scene,),
            ).fetchall()
        return {r["poi_id"]: r["image_url"] for r in rows}

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def _init_schema(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS frontend_orders (
                    order_id TEXT PRIMARY KEY,
                    scene TEXT NOT NULL,
                    status TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS frontend_board_states (
                    order_id TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS frontend_sessions (
                    scene TEXT PRIMARY KEY,
                    trip_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS poi_images (
                    poi_id       TEXT PRIMARY KEY,
                    scene        TEXT NOT NULL,
                    image_url    TEXT NOT NULL,
                    generated_at TEXT NOT NULL
                );
                """
            )


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
