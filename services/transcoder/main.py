import asyncio
import os
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
from prometheus_client import make_asgi_app, Gauge, Counter

from ffmpeg_manager import FFmpegManager
from gpu_monitor import GPUMonitor

app = FastAPI(title="IPTV Transcoder Service", version="1.0.0")
manager = FFmpegManager()
gpu = GPUMonitor()

# Prometheus metrics
gpu_temp = Gauge("iptv_gpu_temperature_celsius", "GPU temperature", ["gpu_index"])
gpu_nvenc = Gauge("iptv_gpu_nvenc_usage_percent", "NVENC usage", ["gpu_index"])
gpu_mem = Gauge("iptv_gpu_memory_used_mb", "GPU memory used", ["gpu_index"])
active_jobs = Gauge("iptv_transcoder_active_jobs", "Active transcoding jobs")
transcode_errors = Counter("iptv_transcoder_errors_total", "Transcoding errors", ["channel_id"])

metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)


class StartRequest(BaseModel):
    channel_id: str
    profile: str
    input_url: str


@app.on_event("startup")
async def startup():
    asyncio.create_task(metrics_collector())


async def metrics_collector():
    while True:
        for g in gpu.get_all_gpus():
            idx = str(g.get("gpu_index", 0))
            gpu_temp.labels(gpu_index=idx).set(g.get("temperature_celsius", 0))
            gpu_nvenc.labels(gpu_index=idx).set(g.get("nvenc_usage_percent", 0))
            gpu_mem.labels(gpu_index=idx).set(g.get("memory_used_mb", 0))
        active_jobs.set(len(manager.tasks))
        await asyncio.sleep(10)


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "transcoder", "active_jobs": len(manager.tasks)}


@app.get("/gpu/status")
async def gpu_status():
    return gpu.get_all_gpus()


@app.post("/transcode/start")
async def start_transcoding(req: StartRequest):
    result = await manager.start(req.channel_id, req.profile, req.input_url)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.post("/transcode/stop")
async def stop_transcoding(channel_id: str, profile: Optional[str] = None):
    if profile:
        await manager.stop(channel_id, profile)
    else:
        await manager.stop_channel(channel_id)
    return {"status": "stopped"}


@app.get("/transcode/jobs")
async def list_jobs():
    return manager.get_status()


@app.get("/profiles")
async def list_profiles():
    from profiles import PROFILES
    return [
        {"name": p.name, "resolution": f"{p.width}x{p.height}",
         "codec": p.video_codec, "bitrate": p.video_bitrate}
        for p in PROFILES.values()
    ]


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("TRANSCODER_API_PORT", 8002)))
