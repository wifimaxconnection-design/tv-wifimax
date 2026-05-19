"""
Dynamic M3U playlist generator.
Fetches active channels from Backend API and generates M3U8 with HLS URLs.
"""
import httpx
import os
import structlog

logger = structlog.get_logger()
BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000")


class M3UGenerator:
    async def generate(self, base_url: str) -> str:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"{BACKEND_URL}/api/v1/channels?active_only=true&limit=500")
                channels = resp.json()
        except Exception as e:
            logger.error("Failed to fetch channels", error=str(e))
            channels = []

        lines = ["#EXTM3U x-tvg-url=\"/api/v1/epg/xmltv\""]
        for ch in channels:
            ch_id = ch["id"]
            name = ch["name"]
            logo = ch.get("logo_url") or ""
            epg_id = ch.get("epg_id") or ch_id
            profiles = ch.get("transcoding_profiles", ["1080p"])
            primary_profile = profiles[0] if profiles else "1080p"

            lines.append(
                f'#EXTINF:-1 tvg-id="{epg_id}" tvg-logo="{logo}" '
                f'group-title="IPTV",{name}'
            )
            lines.append(f"{base_url}/{ch_id}/{primary_profile}/index.m3u8")

        return "\n".join(lines)
