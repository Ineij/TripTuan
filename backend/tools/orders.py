from __future__ import annotations

from typing import Any

from backend.core.state_store import TripStateStore


class OrderStatusTool:
    name = "OrderStatusTool"

    def create_demo_orders(
        self,
        store: TripStateStore,
        trip_id: str,
        cards: list[dict[str, Any]],
    ) -> dict[str, Any]:
        status = store.create_demo_orders(trip_id, cards)
        return status | {
            "tool": self.name,
            "last_action": "create_demo_orders",
            "external_api": False,
        }

    def get_status(self, store: TripStateStore, trip_id: str) -> dict[str, Any]:
        status = store.get_order_status(trip_id)
        return status | {
            "tool": self.name,
            "last_action": "get_status",
            "external_api": False,
        }


class VerificationTool:
    name = "VerificationTool"

    def pay(
        self,
        store: TripStateStore,
        trip_id: str,
        order_id: str | None = None,
    ) -> dict[str, Any]:
        status = store.pay_orders(trip_id, order_id)
        return status | {
            "verification_tool": self.name,
            "last_action": "pay_order" if order_id else "pay_all_orders",
            "external_api": False,
        }

    def verify(
        self,
        store: TripStateStore,
        trip_id: str,
        order_id: str | None = None,
        card_id: str | None = None,
    ) -> dict[str, Any]:
        status = store.verify_order(trip_id, order_id, card_id)
        return status | {
            "verification_tool": self.name,
            "last_action": "verify_order",
            "external_api": False,
        }
