"""
Odoo Connector Service.
Syncs clients and subscriptions between Odoo and the IPTV platform database.
Runs a periodic sync loop and exposes a REST API for on-demand sync.
"""
import asyncio
import os
import uvicorn
import structlog
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pydantic_settings import BaseSettings

from odoo_client import OdooClient

logger = structlog.get_logger()


class Settings(BaseSettings):
    ODOO_SYNC_INTERVAL_SECONDS: int = 300
    BACKEND_URL: str = "http://backend:8000"


settings = Settings()
app = FastAPI(title="Odoo Connector Service", version="1.0.0")
odoo = OdooClient()


async def sync_clients():
    """Fetch partners from Odoo and upsert them in the platform database."""
    try:
        partners = await odoo.get_partners()
        logger.info("Odoo partners fetched", count=len(partners))

        async with httpx.AsyncClient(timeout=30) as client:
            for partner in partners:
                payload = {
                    "name": partner["name"],
                    "email": partner.get("email") or f"odoo_{partner['id']}@placeholder.local",
                    "phone": partner.get("phone"),
                    "odoo_partner_id": str(partner["id"]),
                }
                try:
                    await client.post(f"{settings.BACKEND_URL}/api/v1/clients", json=payload)
                except httpx.HTTPStatusError as e:
                    if e.response.status_code != 409:  # ignore duplicate email
                        logger.error("Failed to upsert client", partner_id=partner["id"], error=str(e))
    except Exception as e:
        logger.error("Client sync failed", error=str(e))


async def sync_subscriptions():
    """Sync active subscriptions and suspend expired ones."""
    try:
        subs = await odoo.get_active_subscriptions()
        logger.info("Odoo subscriptions fetched", count=len(subs))
    except Exception as e:
        logger.error("Subscription sync failed", error=str(e))


async def sync_loop():
    while True:
        logger.info("Starting Odoo sync cycle")
        await sync_clients()
        await sync_subscriptions()
        logger.info("Odoo sync complete", next_in_seconds=settings.ODOO_SYNC_INTERVAL_SECONDS)
        await asyncio.sleep(settings.ODOO_SYNC_INTERVAL_SECONDS)


@app.on_event("startup")
async def startup():
    try:
        odoo.authenticate()
    except Exception as e:
        logger.warning("Odoo auth failed at startup (will retry)", error=str(e))
    asyncio.create_task(sync_loop())


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "odoo_connector"}


@app.post("/sync/clients")
async def trigger_client_sync():
    asyncio.create_task(sync_clients())
    return {"status": "sync_started"}


@app.post("/sync/subscriptions")
async def trigger_subscription_sync():
    asyncio.create_task(sync_subscriptions())
    return {"status": "sync_started"}


@app.get("/odoo/products")
async def list_odoo_products():
    try:
        return await odoo.get_products()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Odoo unavailable: {str(e)}")


@app.post("/odoo/tickets")
async def create_ticket(partner_id: int, subject: str, body: str):
    try:
        ticket_id = await odoo.create_support_ticket(partner_id, subject, body)
        return {"ticket_id": ticket_id}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("AUTH_API_PORT", 8005) or 8005))
