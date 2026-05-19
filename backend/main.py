import asyncio
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from prometheus_client import make_asgi_app, Gauge, Counter, Histogram
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import select, func

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import engine, Base, AsyncSessionLocal

logger = structlog.get_logger()

# ── Métricas personalizadas IPTV ──────────────────────────────
iptv_channels_total    = Gauge("iptv_channels_total",    "Total channels in database", ["status"])
iptv_packages_total    = Gauge("iptv_packages_total",    "Total packages in database")
iptv_clients_total     = Gauge("iptv_clients_total",     "Total clients in database",  ["status"])
iptv_sessions_active   = Gauge("iptv_sessions_active",   "Active stream sessions")
iptv_subscriptions_active = Gauge("iptv_subscriptions_active", "Active subscriptions")
iptv_api_info          = Gauge("iptv_api_info",          "API version info", ["version", "env"])


async def _refresh_db_metrics():
    """Actualiza gauges de BD cada 30 s."""
    from app.models.channel import Channel
    from app.models.client import Client, Package, Subscription, StreamSession

    while True:
        try:
            async with AsyncSessionLocal() as db:
                ch_active = await db.scalar(select(func.count()).select_from(Channel).where(Channel.is_active == True))
                ch_total  = await db.scalar(select(func.count()).select_from(Channel))
                pkgs      = await db.scalar(select(func.count()).select_from(Package).where(Package.is_active == True))
                cli_ok    = await db.scalar(select(func.count()).select_from(Client).where(Client.is_active == True))
                cli_sus   = await db.scalar(select(func.count()).select_from(Client).where(Client.is_active == False))
                sessions  = await db.scalar(select(func.count()).select_from(StreamSession).where(StreamSession.ended_at == None))
                subs      = await db.scalar(select(func.count()).select_from(Subscription).where(Subscription.is_active == True))

            iptv_channels_total.labels(status="active").set(ch_active or 0)
            iptv_channels_total.labels(status="inactive").set((ch_total or 0) - (ch_active or 0))
            iptv_packages_total.set(pkgs or 0)
            iptv_clients_total.labels(status="active").set(cli_ok or 0)
            iptv_clients_total.labels(status="suspended").set(cli_sus or 0)
            iptv_sessions_active.set(sessions or 0)
            iptv_subscriptions_active.set(subs or 0)
        except Exception as e:
            logger.warning("metrics refresh error", error=str(e))
        await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("IPTV Platform API starting", version="1.0.0", env=settings.APP_ENV)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    iptv_api_info.labels(version="1.0.0", env=settings.APP_ENV).set(1)
    asyncio.create_task(_refresh_db_metrics())
    yield
    logger.info("IPTV Platform API shutting down")
    await engine.dispose()


app = FastAPI(
    title="IPTV Platform API",
    description="Professional ISP-grade IPTV/OTT platform REST API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# Instrumentación HTTP automática (latencia, requests, status codes)
Instrumentator(
    should_group_status_codes=False,
    should_ignore_untemplated=True,
    should_respect_env_var=False,
    should_instrument_requests_inprogress=True,
    excluded_handlers=["/health", "/metrics"],
    inprogress_labels=True,
).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_PREFIX)


@app.get("/health", tags=["health"])
async def health():
    return {"status": "healthy", "service": "backend", "version": "1.0.0"}
