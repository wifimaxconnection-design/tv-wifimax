"""
Odoo XML-RPC async client.
Handles authentication, partner/subscription sync, and invoice management.
"""
import asyncio
import xmlrpc.client
import os
import structlog
from typing import Any, Optional
from tenacity import retry, stop_after_attempt, wait_exponential

logger = structlog.get_logger()

ODOO_URL = os.getenv("ODOO_URL", "https://your-odoo.example.com")
ODOO_DB = os.getenv("ODOO_DATABASE", "odoo_db")
ODOO_USER = os.getenv("ODOO_USERNAME", "admin")
ODOO_PASSWORD = os.getenv("ODOO_PASSWORD", "")


class OdooClient:
    def __init__(self):
        self._uid: Optional[int] = None
        self._common = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/common")
        self._models = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/object")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    def authenticate(self) -> int:
        uid = self._common.authenticate(ODOO_DB, ODOO_USER, ODOO_PASSWORD, {})
        if not uid:
            raise RuntimeError("Odoo authentication failed")
        self._uid = uid
        logger.info("Odoo authenticated", uid=uid)
        return uid

    def _execute(self, model: str, method: str, args: list, kwargs: dict = None) -> Any:
        if self._uid is None:
            self.authenticate()
        return self._models.execute_kw(
            ODOO_DB, self._uid, ODOO_PASSWORD,
            model, method, args, kwargs or {}
        )

    async def get_partners(self, domain: list = None) -> list:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._execute(
                "res.partner", "search_read",
                [domain or [("customer_rank", ">", 0)]],
                {"fields": ["id", "name", "email", "phone", "street", "active"], "limit": 1000}
            )
        )

    async def get_active_subscriptions(self) -> list:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._execute(
                "sale.subscription", "search_read",
                [[("stage_id.name", "in", ["In Progress", "Active"])]],
                {"fields": ["id", "partner_id", "date_start", "date", "recurring_next_date", "stage_id"]}
            )
        )

    async def suspend_subscription(self, subscription_id: int) -> bool:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: self._execute(
                "sale.subscription", "write",
                [[subscription_id], {"stage_id": self._get_suspended_stage_id()}]
            )
        )
        return bool(result)

    async def create_support_ticket(self, partner_id: int, subject: str, body: str) -> int:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._execute(
                "helpdesk.ticket", "create",
                [{
                    "name": subject,
                    "partner_id": partner_id,
                    "description": body,
                }]
            )
        )

    def _get_suspended_stage_id(self) -> int:
        stages = self._execute(
            "sale.subscription.stage", "search_read",
            [[("name", "ilike", "suspend")]],
            {"fields": ["id", "name"], "limit": 1}
        )
        return stages[0]["id"] if stages else 0

    async def get_products(self) -> list:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._execute(
                "product.product", "search_read",
                [[("type", "=", "service"), ("active", "=", True)]],
                {"fields": ["id", "name", "list_price", "description"]}
            )
        )
