import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, IPvAnyAddress
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.channel import Channel, Category, TranscodingJob

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────

class CategoryOut(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None

    model_config = {"from_attributes": True}


class ChannelCreate(BaseModel):
    name: str
    multicast_address: str
    multicast_port: int
    interface: str = "eth0"
    category_id: Optional[uuid.UUID] = None
    transcoding_profiles: List[str] = ["1080p", "720p", "480p"]
    logo_url: Optional[str] = None
    epg_id: Optional[str] = None
    sort_order: int = 0


class ChannelOut(BaseModel):
    id: uuid.UUID
    name: str
    multicast_address: str
    multicast_port: int
    interface: str
    transcoding_profiles: List[str]
    is_active: bool
    logo_url: Optional[str] = None
    epg_id: Optional[str] = None
    sort_order: int

    model_config = {"from_attributes": True}


class ChannelStatus(BaseModel):
    channel_id: uuid.UUID
    name: str
    is_active: bool
    ingest_status: str
    transcoding_jobs: List[dict]
    input_bitrate_mbps: float
    active_sessions: int


# ── Endpoints ────────────────────────────────────────────────

@router.get("", response_model=List[ChannelOut])
async def list_channels(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=500),
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    q = select(Channel)
    if active_only:
        q = q.where(Channel.is_active == True)
    q = q.order_by(Channel.sort_order, Channel.name).offset(skip).limit(limit)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=ChannelOut, status_code=status.HTTP_201_CREATED)
async def create_channel(payload: ChannelCreate, db: AsyncSession = Depends(get_db)):
    channel = Channel(**payload.model_dump())
    db.add(channel)
    await db.flush()
    await db.refresh(channel)
    return channel


@router.get("/{channel_id}", response_model=ChannelOut)
async def get_channel(channel_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel


@router.patch("/{channel_id}", response_model=ChannelOut)
async def update_channel(
    channel_id: uuid.UUID,
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    for key, value in payload.items():
        if hasattr(channel, key):
            setattr(channel, key, value)
    await db.flush()
    await db.refresh(channel)
    return channel


@router.delete("/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_channel(channel_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    await db.delete(channel)


@router.get("/{channel_id}/status", response_model=ChannelStatus)
async def channel_status(channel_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    jobs_result = await db.execute(
        select(TranscodingJob).where(TranscodingJob.channel_id == channel_id)
    )
    jobs = jobs_result.scalars().all()

    return ChannelStatus(
        channel_id=channel.id,
        name=channel.name,
        is_active=channel.is_active,
        ingest_status="running" if channel.is_active else "stopped",
        transcoding_jobs=[{"profile": j.profile, "status": j.status} for j in jobs],
        input_bitrate_mbps=0.0,
        active_sessions=0,
    )


@router.get("/categories/", response_model=List[CategoryOut])
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).order_by(Category.sort_order))
    return result.scalars().all()
