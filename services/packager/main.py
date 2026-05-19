import asyncio
import os
import uvicorn
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel
from typing import Optional
from prometheus_client import make_asgi_app

from hls_manager import HLSManager
from m3u_generator import M3UGenerator

app = FastAPI(title="IPTV Packager Service", version="1.0.0")
hls_manager = HLSManager()
m3u_gen = M3UGenerator()

metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)


class PackageRequest(BaseModel):
    channel_id: str
    profile: str
    input_path: str
    output_format: str = "hls"  # hls, rtsp, srt, udp


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "packager"}


@app.post("/package/start")
async def start_packaging(req: PackageRequest):
    result = await hls_manager.start(req.channel_id, req.profile, req.input_path)
    return result


@app.post("/package/stop")
async def stop_packaging(channel_id: str, profile: Optional[str] = None):
    await hls_manager.stop(channel_id, profile)
    return {"status": "stopped"}


@app.get("/streams")
async def list_streams():
    return hls_manager.get_active_streams()


@app.get("/m3u")
async def get_m3u(base_url: str = "http://localhost/hls"):
    content = await m3u_gen.generate(base_url)
    return Response(content=content, media_type="audio/x-mpegurl")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PACKAGER_API_PORT", 8003)))
