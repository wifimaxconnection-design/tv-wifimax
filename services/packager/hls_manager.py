"""
HLS packaging manager.
Watches transcoded output directories and manages HLS playlist validity.
"""
import asyncio
import os
import time
from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple
import structlog

logger = structlog.get_logger()

HLS_OUTPUT = os.getenv("PACKAGER_OUTPUT_PATH", "/streams/hls")
SEGMENT_DURATION = int(os.getenv("PACKAGER_HLS_SEGMENT_DURATION", "2"))
LIST_SIZE = int(os.getenv("PACKAGER_HLS_LIST_SIZE", "6"))


@dataclass
class StreamInfo:
    channel_id: str
    profile: str
    input_path: str
    output_path: str
    status: str = "active"
    last_segment: Optional[str] = None
    segment_count: int = 0
    started_at: float = field(default_factory=time.time)


class HLSManager:
    def __init__(self):
        self.streams: Dict[Tuple[str, str], StreamInfo] = {}
        self._watcher_task: Optional[asyncio.Task] = None

    async def start(self, channel_id: str, profile: str, input_path: str) -> dict:
        key = (channel_id, profile)
        out_path = os.path.join(HLS_OUTPUT, channel_id, profile)
        os.makedirs(out_path, exist_ok=True)

        stream = StreamInfo(
            channel_id=channel_id,
            profile=profile,
            input_path=input_path,
            output_path=out_path,
        )
        self.streams[key] = stream
        logger.info("HLS stream registered", channel=channel_id, profile=profile, path=out_path)

        if self._watcher_task is None or self._watcher_task.done():
            self._watcher_task = asyncio.create_task(self._watch_segments())

        return {
            "status": "active",
            "playlist_url": f"/hls/{channel_id}/{profile}/index.m3u8",
            "output_path": out_path,
        }

    async def stop(self, channel_id: str, profile: Optional[str] = None):
        if profile:
            self.streams.pop((channel_id, profile), None)
        else:
            keys = [k for k in self.streams if k[0] == channel_id]
            for k in keys:
                del self.streams[k]

    async def _watch_segments(self):
        while self.streams:
            for key, stream in list(self.streams.items()):
                out_path = stream.output_path
                try:
                    if os.path.exists(out_path):
                        segments = sorted(
                            f for f in os.listdir(out_path) if f.endswith(".ts")
                        )
                        if segments:
                            stream.last_segment = segments[-1]
                            stream.segment_count = len(segments)
                except Exception as e:
                    logger.warning("Segment watch error", error=str(e))
            await asyncio.sleep(5)

    def get_active_streams(self) -> list:
        return [
            {
                "channel_id": s.channel_id,
                "profile": s.profile,
                "status": s.status,
                "last_segment": s.last_segment,
                "segment_count": s.segment_count,
                "playlist": f"/hls/{s.channel_id}/{s.profile}/index.m3u8",
                "started_at": s.started_at,
            }
            for s in self.streams.values()
        ]
