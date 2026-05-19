import asyncio
import os
import uvicorn
from fastapi import FastAPI
from prometheus_client import make_asgi_app

from ingest_manager import IngestManager

app = FastAPI(title="IPTV Ingest Service", version="1.0.0")
manager = IngestManager()

metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)


@app.on_event("startup")
async def startup():
    asyncio.create_task(manager.run())


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "ingest"}


@app.get("/channels/stats")
async def channel_stats():
    return manager.get_stats()


@app.post("/channels/{channel_id}/start")
async def start_channel(channel_id: str, multicast_address: str, port: int, interface: str = "eth0"):
    await manager.start_channel(channel_id, multicast_address, port, interface)
    return {"status": "started", "channel_id": channel_id}


@app.post("/channels/{channel_id}/stop")
async def stop_channel(channel_id: str):
    await manager.stop_channel(channel_id)
    return {"status": "stopped", "channel_id": channel_id}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("INGEST_API_PORT", 8001)), log_level="info")
