import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class GPUStatus(BaseModel):
    gpu_index: int
    name: str
    temperature_celsius: float
    nvenc_usage_percent: float
    memory_used_mb: float
    memory_total_mb: float
    power_draw_watts: float
    driver_version: str
    cuda_version: str


class PlatformStatus(BaseModel):
    ingest: str
    transcoder: str
    packager: str
    auth: str
    odoo_connector: str
    active_channels: int
    active_sessions: int


@router.get("/gpu", response_model=list[GPUStatus])
async def gpu_status():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get("http://transcoder:8002/gpu/status")
            resp.raise_for_status()
            return resp.json()
    except Exception:
        raise HTTPException(status_code=503, detail="Transcoder service unavailable")


@router.get("/services", response_model=PlatformStatus)
async def services_health():
    services = {
        "ingest": "http://ingest:8001/health",
        "transcoder": "http://transcoder:8002/health",
        "packager": "http://packager:8003/health",
        "auth": "http://auth:8004/health",
        "odoo_connector": "http://odoo_connector:8005/health",
    }
    statuses = {}
    async with httpx.AsyncClient(timeout=3) as client:
        for name, url in services.items():
            try:
                r = await client.get(url)
                statuses[name] = "healthy" if r.status_code == 200 else "degraded"
            except Exception:
                statuses[name] = "unreachable"

    return PlatformStatus(
        **statuses,
        active_channels=0,
        active_sessions=0,
    )


@router.get("/ingest/channels")
async def ingest_channel_stats():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get("http://ingest:8001/channels/stats")
            resp.raise_for_status()
            return resp.json()
    except Exception:
        raise HTTPException(status_code=503, detail="Ingest service unavailable")
