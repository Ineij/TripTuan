from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from backend.core.env import config_value
from backend.core.models import TripState


DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "travel_state.sqlite"


class TripStateStore:
    def __init__(self, db_path: str | Path | None = None) -> None:
        configured_path = config_value("TRIP_STATE_DB_PATH")
        self.db_path = Path(db_path or configured_path or DEFAULT_DB_PATH)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def save_state(self, state: TripState) -> None:
        state_data = state.to_dict()
        now = _utc_now()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO trips (
                    trip_id, user_id, stage, structured_request_json,
                    trip_state_json, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(trip_id) DO UPDATE SET
                    user_id = excluded.user_id,
                    stage = excluded.stage,
                    structured_request_json = excluded.structured_request_json,
                    trip_state_json = excluded.trip_state_json,
                    updated_at = excluded.updated_at
                """,
                (
                    state.trip_id,
                    state.user_id,
                    state.stage,
                    _json_dumps(state.structured_request),
                    _json_dumps(state_data),
                    now,
                    now,
                ),
            )
            self._replace_checkins(connection, state)
            self._replace_runtime_events(connection, state)
            self._replace_recommendations(connection, state)
            self._replace_poster(connection, state)

    def get_state(self, trip_id: str) -> TripState | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT trip_state_json FROM trips WHERE trip_id = ?",
                (trip_id,),
            ).fetchone()
        if row is None:
            return None
        return self._state_from_json(row["trip_state_json"])

    def stats(self) -> dict[str, Any]:
        with self._connect() as connection:
            return {
                "db_path": str(self.db_path),
                "trips": _count_rows(connection, "trips"),
                "orders": _count_rows(connection, "orders"),
                "checkins": _count_rows(connection, "checkins"),
                "runtime_events": _count_rows(connection, "runtime_events"),
                "recommendation_logs": _count_rows(connection, "recommendation_logs"),
                "poster_records": _count_rows(connection, "poster_records"),
            }

    def create_demo_orders(
        self,
        trip_id: str,
        cards: list[dict[str, Any]],
    ) -> dict[str, Any]:
        now = _utc_now()
        with self._connect() as connection:
            existing = {
                row["card_id"]: row
                for row in connection.execute(
                    "SELECT * FROM orders WHERE trip_id = ?",
                    (trip_id,),
                ).fetchall()
            }
            for index, card in enumerate(cards, start=1):
                card_id = str(card.get("card_id") or card.get("id") or f"card_{index}")
                if card_id in existing:
                    continue
                order_id = f"ord_{trip_id}_{index:02d}"
                payload = {
                    "card_id": card_id,
                    "title": card.get("title") or card.get("name"),
                    "type": card.get("type"),
                    "area": card.get("area"),
                    "source": "demo_order_tool",
                }
                connection.execute(
                    """
                    INSERT INTO orders (
                        order_id, trip_id, card_id, merchant_name, status,
                        paid_at, verified_at, payload_json, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        order_id,
                        trip_id,
                        card_id,
                        str(card.get("title") or card.get("name") or "未命名商户"),
                        "pending",
                        None,
                        None,
                        _json_dumps(payload),
                        now,
                        now,
                    ),
                )
        return self.get_order_status(trip_id)

    def pay_orders(self, trip_id: str, order_id: str | None = None) -> dict[str, Any]:
        now = _utc_now()
        with self._connect() as connection:
            if order_id:
                connection.execute(
                    """
                    UPDATE orders
                    SET status = 'paid', paid_at = COALESCE(paid_at, ?), updated_at = ?
                    WHERE trip_id = ? AND order_id = ? AND status IN ('pending', 'paid')
                    """,
                    (now, now, trip_id, order_id),
                )
            else:
                connection.execute(
                    """
                    UPDATE orders
                    SET status = 'paid', paid_at = COALESCE(paid_at, ?), updated_at = ?
                    WHERE trip_id = ? AND status = 'pending'
                    """,
                    (now, now, trip_id),
                )
        return self.get_order_status(trip_id)

    def verify_order(
        self,
        trip_id: str,
        order_id: str | None = None,
        card_id: str | None = None,
    ) -> dict[str, Any]:
        now = _utc_now()
        with self._connect() as connection:
            if order_id:
                connection.execute(
                    """
                    UPDATE orders
                    SET status = 'verified', verified_at = COALESCE(verified_at, ?), updated_at = ?
                    WHERE trip_id = ? AND order_id = ? AND status IN ('paid', 'verified')
                    """,
                    (now, now, trip_id, order_id),
                )
            elif card_id:
                connection.execute(
                    """
                    UPDATE orders
                    SET status = 'verified', verified_at = COALESCE(verified_at, ?), updated_at = ?
                    WHERE trip_id = ? AND card_id = ? AND status IN ('paid', 'verified')
                    """,
                    (now, now, trip_id, card_id),
                )
        return self.get_order_status(trip_id)

    def get_order_status(self, trip_id: str) -> dict[str, Any]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM orders WHERE trip_id = ? ORDER BY created_at, order_id",
                (trip_id,),
            ).fetchall()
        orders = [_order_from_row(row) for row in rows]
        counts = {
            "total": len(orders),
            "pending": sum(1 for order in orders if order["status"] == "pending"),
            "paid": sum(1 for order in orders if order["status"] == "paid"),
            "verified": sum(1 for order in orders if order["status"] == "verified"),
            "cancelled": sum(1 for order in orders if order["status"] == "cancelled"),
        }
        return {
            "trip_id": trip_id,
            "source": "sqlite",
            "tool": "OrderStatusTool",
            "orders": orders,
            "counts": counts,
            "paid": counts["paid"] + counts["verified"] > 0,
            "all_paid": counts["total"] > 0 and counts["pending"] == 0,
            "verified_items": [
                order["card_id"] for order in orders if order["status"] == "verified"
            ],
        }

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def _init_schema(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS trips (
                    trip_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    stage TEXT NOT NULL,
                    structured_request_json TEXT NOT NULL,
                    trip_state_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS checkins (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    trip_id TEXT NOT NULL,
                    card_id TEXT NOT NULL,
                    title TEXT,
                    lat REAL,
                    lng REAL,
                    distance_meters REAL,
                    checked_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    FOREIGN KEY(trip_id) REFERENCES trips(trip_id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS runtime_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    trip_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    level TEXT,
                    message TEXT,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(trip_id) REFERENCES trips(trip_id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS recommendation_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    trip_id TEXT NOT NULL,
                    popup_type TEXT NOT NULL,
                    title TEXT,
                    message TEXT,
                    action TEXT,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(trip_id) REFERENCES trips(trip_id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS poster_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    trip_id TEXT NOT NULL,
                    title TEXT,
                    subtitle TEXT,
                    share_text TEXT,
                    poster_style TEXT,
                    layout TEXT,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(trip_id) REFERENCES trips(trip_id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS orders (
                    order_id TEXT PRIMARY KEY,
                    trip_id TEXT NOT NULL,
                    card_id TEXT NOT NULL,
                    merchant_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    paid_at TEXT,
                    verified_at TEXT,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(trip_id) REFERENCES trips(trip_id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_runtime_events_trip_id
                    ON runtime_events(trip_id);
                CREATE INDEX IF NOT EXISTS idx_recommendation_logs_trip_id
                    ON recommendation_logs(trip_id);
                CREATE INDEX IF NOT EXISTS idx_checkins_trip_id
                    ON checkins(trip_id);
                CREATE INDEX IF NOT EXISTS idx_orders_trip_id
                    ON orders(trip_id);
                """
            )

    def _replace_checkins(self, connection: sqlite3.Connection, state: TripState) -> None:
        connection.execute("DELETE FROM checkins WHERE trip_id = ?", (state.trip_id,))
        checked_ids = state.checkin_status.get("checked_in_card_ids") or []
        cards_by_id = {card.get("card_id"): card for card in state.selected_cards}
        nearest = state.checkin_status.get("nearest") or {}
        now = _utc_now()
        for card_id in checked_ids:
            card = cards_by_id.get(card_id, {})
            distance = nearest.get("distance_meters") if nearest.get("card_id") == card_id else None
            payload = {"card": card, "checkin_status": state.checkin_status}
            connection.execute(
                """
                INSERT INTO checkins (
                    trip_id, card_id, title, lat, lng, distance_meters,
                    checked_at, payload_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    state.trip_id,
                    card_id,
                    card.get("title") or nearest.get("title"),
                    card.get("lat"),
                    card.get("lng"),
                    distance,
                    now,
                    _json_dumps(payload),
                ),
            )

    def _replace_runtime_events(
        self, connection: sqlite3.Connection, state: TripState
    ) -> None:
        connection.execute("DELETE FROM runtime_events WHERE trip_id = ?", (state.trip_id,))
        now = _utc_now()
        for event in state.runtime_events:
            connection.execute(
                """
                INSERT INTO runtime_events (
                    trip_id, event_type, level, message, payload_json, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    state.trip_id,
                    event.get("event_type", "unknown"),
                    event.get("level"),
                    event.get("message"),
                    _json_dumps(event),
                    now,
                ),
            )

    def _replace_recommendations(
        self, connection: sqlite3.Connection, state: TripState
    ) -> None:
        connection.execute(
            "DELETE FROM recommendation_logs WHERE trip_id = ?",
            (state.trip_id,),
        )
        now = _utc_now()
        for item in state.recommendations:
            connection.execute(
                """
                INSERT INTO recommendation_logs (
                    trip_id, popup_type, title, message, action, payload_json, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    state.trip_id,
                    item.get("popup_type", "unknown"),
                    item.get("title"),
                    item.get("message"),
                    item.get("action"),
                    _json_dumps(item),
                    now,
                ),
            )

    def _replace_poster(self, connection: sqlite3.Connection, state: TripState) -> None:
        connection.execute("DELETE FROM poster_records WHERE trip_id = ?", (state.trip_id,))
        if not state.poster:
            return
        connection.execute(
            """
            INSERT INTO poster_records (
                trip_id, title, subtitle, share_text, poster_style, layout,
                payload_json, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                state.trip_id,
                state.poster.get("title"),
                state.poster.get("subtitle"),
                state.poster.get("share_text"),
                state.poster.get("poster_style"),
                state.poster.get("layout"),
                _json_dumps(state.poster),
                _utc_now(),
            ),
        )

    def _state_from_json(self, value: str) -> TripState:
        data = json.loads(value)
        state = TripState(
            trip_id=data["trip_id"],
            user_id=data["user_id"],
            stage=data["stage"],
            structured_request=data["structured_request"],
        )
        for key in (
            "candidate_cards",
            "selected_cards",
            "static_board",
            "route_plan",
            "dynamic_board",
            "current_location",
            "weather",
            "order_status",
            "checkin_status",
            "runtime_context",
            "runtime_events",
            "recommendations",
            "poster",
            "ai_trace",
            "langgraph_trace",
            "supervisor_trace",
        ):
            setattr(state, key, data.get(key, getattr(state, key)))
        return state


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _count_rows(connection: sqlite3.Connection, table_name: str) -> int:
    row = connection.execute(f"SELECT COUNT(*) AS count FROM {table_name}").fetchone()
    return int(row["count"])


def _order_from_row(row: sqlite3.Row) -> dict[str, Any]:
    payload = json.loads(row["payload_json"]) if row["payload_json"] else {}
    return {
        "order_id": row["order_id"],
        "trip_id": row["trip_id"],
        "card_id": row["card_id"],
        "merchant_name": row["merchant_name"],
        "status": row["status"],
        "paid_at": row["paid_at"],
        "verified_at": row["verified_at"],
        "payload": payload,
    }
