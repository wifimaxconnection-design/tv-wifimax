"""
FFmpeg process manager for NVENC GPU transcoding.
Manages per-channel, per-profile FFmpeg processes.
"""
import asyncio
import os
import time
from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple
import structlog

from profiles import PROFILES, build_ffmpeg_command, TranscodingProfile

logger = structlog.get_logger()

OUTPUT_PATH = os.getenv("TRANSCODER_OUTPUT_PATH", "/streams/transcoded")
GPU_INDEX = int(os.getenv("TRANSCODER_GPU_INDEX", "0"))
MAX_JOBS = int(os.getenv("TRANSCODER_MAX_CONCURRENT_JOBS", "8"))
FFMPEG_BIN = os.getenv("FFMPEG_BINARY", "/usr/bin/ffmpeg")


@dataclass
class TranscodingTask:
    channel_id: str
    profile_name: str
    input_url: str
    output_path: str
    process: Optional[asyncio.subprocess.Process] = None
    status: str = "stopped"
    started_at: float = field(default_factory=time.time)
    restart_count: int = 0
    last_error: Optional[str] = None


class FFmpegManager:
    def __init__(self):
        self.tasks: Dict[Tuple[str, str], TranscodingTask] = {}
        self._monitor_task: Optional[asyncio.Task] = None

    async def start(self, channel_id: str, profile_name: str, input_url: str) -> dict:
        if len(self.tasks) >= MAX_JOBS:
            return {"error": f"Max concurrent jobs ({MAX_JOBS}) reached"}

        profile = PROFILES.get(profile_name)
        if not profile:
            return {"error": f"Unknown profile: {profile_name}"}

        key = (channel_id, profile_name)
        if key in self.tasks and self.tasks[key].status == "running":
            return {"status": "already_running"}

        out_path = os.path.join(OUTPUT_PATH, channel_id, profile_name)
        os.makedirs(out_path, exist_ok=True)

        task = TranscodingTask(
            channel_id=channel_id,
            profile_name=profile_name,
            input_url=input_url,
            output_path=out_path,
        )
        self.tasks[key] = task
        asyncio.create_task(self._run_ffmpeg(task, profile))
        return {"status": "started", "output_path": out_path}

    async def _run_ffmpeg(self, task: TranscodingTask, profile: TranscodingProfile):
        while True:
            cmd = build_ffmpeg_command(
                input_url=task.input_url,
                output_path=task.output_path,
                profile=profile,
                gpu_index=GPU_INDEX,
                output_format="hls",
            )
            # Replace binary path
            cmd[0] = FFMPEG_BIN

            logger.info("Starting FFmpeg", channel=task.channel_id, profile=task.profile_name,
                        cmd=" ".join(cmd[:8]) + " ...")
            try:
                task.process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                task.status = "running"
                _, stderr = await task.process.communicate()
                rc = task.process.returncode

                if rc != 0 and stderr:
                    task.last_error = stderr.decode(errors="replace")[-500:]
                    logger.error("FFmpeg exited with error",
                                 channel=task.channel_id, rc=rc, error=task.last_error)

                if task.status == "stopping":
                    break

                task.restart_count += 1
                task.status = "restarting"
                logger.warning("FFmpeg restarting", channel=task.channel_id,
                               restarts=task.restart_count)
                await asyncio.sleep(3)

            except asyncio.CancelledError:
                break
            except Exception as e:
                task.last_error = str(e)
                task.status = "error"
                logger.error("FFmpeg exception", channel=task.channel_id, error=str(e))
                await asyncio.sleep(5)

        task.status = "stopped"

    async def stop(self, channel_id: str, profile_name: str):
        key = (channel_id, profile_name)
        task = self.tasks.get(key)
        if not task:
            return
        task.status = "stopping"
        if task.process and task.process.returncode is None:
            task.process.terminate()
            try:
                await asyncio.wait_for(task.process.wait(), timeout=10)
            except asyncio.TimeoutError:
                task.process.kill()
        del self.tasks[key]

    async def stop_channel(self, channel_id: str):
        keys = [k for k in self.tasks if k[0] == channel_id]
        for key in keys:
            await self.stop(key[0], key[1])

    def get_status(self) -> list:
        return [
            {
                "channel_id": t.channel_id,
                "profile": t.profile_name,
                "status": t.status,
                "restart_count": t.restart_count,
                "started_at": t.started_at,
                "output_path": t.output_path,
                "last_error": t.last_error,
            }
            for t in self.tasks.values()
        ]
