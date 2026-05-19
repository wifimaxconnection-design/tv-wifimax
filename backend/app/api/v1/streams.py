import uuid
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.client import StreamSession
from app.models.channel import Channel

router = APIRouter()


class SessionOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    channel_id: uuid.UUID
    ip_address: str
    device_type: Optional[str]
    profile: Optional[str]
    started_at: datetime
    last_seen: datetime

    model_config = {"from_attributes": True}


class StreamStats(BaseModel):
    active_sessions: int
    total_sessions_today: int
    channels_streaming: int


@router.get("", response_model=List[SessionOut])
async def list_active_sessions(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, le=1000),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StreamSession)
        .where(StreamSession.ended_at == None)
        .order_by(StreamSession.started_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/stats", response_model=StreamStats)
async def stream_stats(db: AsyncSession = Depends(get_db)):
    active = await db.execute(
        select(func.count()).select_from(StreamSession).where(StreamSession.ended_at == None)
    )
    channels_q = await db.execute(
        select(func.count(StreamSession.channel_id.distinct()))
        .where(StreamSession.ended_at == None)
    )
    return StreamStats(
        active_sessions=active.scalar() or 0,
        total_sessions_today=0,
        channels_streaming=channels_q.scalar() or 0,
    )


@router.get("/m3u")
async def get_m3u_playlist(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Channel)
        .where(Channel.is_active == True)
        .order_by(Channel.sort_order, Channel.name)
    )
    channels = result.scalars().all()

    lines = ["#EXTM3U"]
    for ch in channels:
        logo = ch.logo_url or ""
        epg = ch.epg_id or ""
        lines.append(
            f'#EXTINF:-1 tvg-id="{epg}" tvg-logo="{logo}" group-title="",'
            f'{ch.name}'
        )
        lines.append(f"http://localhost/hls/{ch.id}/1080p/index.m3u8")

    content = "\n".join(lines)
    return Response(content=content, media_type="audio/x-mpegurl")
