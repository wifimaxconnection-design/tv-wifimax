import uuid
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.client import Client, Subscription, Package, Device
from app.models.channel import Channel

router = APIRouter()


class ClientCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    address: Optional[str] = None
    max_devices: int = 3
    odoo_partner_id: Optional[str] = None
    notes: Optional[str] = None


class ClientOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    phone: Optional[str] = None
    is_active: bool
    max_devices: int
    odoo_partner_id: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SubscriptionCreate(BaseModel):
    client_id: uuid.UUID
    package_id: uuid.UUID
    starts_at: datetime
    expires_at: datetime

    def model_post_init(self, __context):
        # Strip timezone info — DB column is TIMESTAMP WITHOUT TIME ZONE
        if self.starts_at.tzinfo is not None:
            object.__setattr__(self, "starts_at", self.starts_at.replace(tzinfo=None))
        if self.expires_at.tzinfo is not None:
            object.__setattr__(self, "expires_at", self.expires_at.replace(tzinfo=None))


class SubscriptionOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    package_id: uuid.UUID
    starts_at: datetime
    expires_at: datetime
    is_active: bool

    model_config = {"from_attributes": True}


@router.get("", response_model=List[ClientOut])
async def list_clients(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=500),
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    q = select(Client)
    if active_only:
        q = q.where(Client.is_active == True)
    q = q.order_by(Client.name).offset(skip).limit(limit)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
async def create_client(payload: ClientCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Client).where(Client.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")
    client = Client(**payload.model_dump())
    db.add(client)
    await db.flush()
    await db.refresh(client)
    return client


@router.get("/{client_id}", response_model=ClientOut)
async def get_client(client_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.patch("/{client_id}", response_model=ClientOut)
async def update_client(
    client_id: uuid.UUID,
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    allowed = {"name", "email", "phone", "address", "max_devices", "odoo_partner_id", "notes"}
    for key, value in payload.items():
        if key in allowed:
            setattr(client, key, value)
    await db.flush()
    await db.refresh(client)
    return client


@router.patch("/{client_id}/suspend", response_model=ClientOut)
async def suspend_client(client_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    client.is_active = False
    await db.flush()
    await db.refresh(client)
    return client


@router.patch("/{client_id}/activate", response_model=ClientOut)
async def activate_client(client_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    client.is_active = True
    await db.flush()
    await db.refresh(client)
    return client


@router.get("/{client_id}/subscriptions", response_model=List[SubscriptionOut])
async def client_subscriptions(client_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Subscription).where(Subscription.client_id == client_id)
    )
    return result.scalars().all()


@router.post("/subscriptions", response_model=SubscriptionOut, status_code=201)
async def create_subscription(payload: SubscriptionCreate, db: AsyncSession = Depends(get_db)):
    sub = Subscription(**payload.model_dump())
    db.add(sub)
    await db.flush()
    await db.refresh(sub)
    return sub


@router.get("/{client_id}/m3u")
async def client_m3u_playlist(
    client_id: uuid.UUID,
    profile: str = Query("1080p", description="Perfil de calidad: 1080p, 720p, 480p, 1080p_h265, 720p_h265"),
    base_url: str = Query("http://localhost/hls", description="URL base del servidor HLS"),
    db: AsyncSession = Depends(get_db),
):
    """Genera un archivo M3U personalizado con los canales de las suscripciones activas del cliente."""
    # Verificar cliente
    client_result = await db.execute(select(Client).where(Client.id == client_id))
    client = client_result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    if not client.is_active:
        raise HTTPException(status_code=403, detail="Client account suspended")

    # Suscripciones activas y no vencidas
    now = datetime.utcnow()
    subs_result = await db.execute(
        select(Subscription).where(
            Subscription.client_id == client_id,
            Subscription.is_active == True,
            Subscription.expires_at > now,
        )
    )
    subs = subs_result.scalars().all()
    if not subs:
        raise HTTPException(status_code=404, detail="No active subscriptions found")

    # Recolectar IDs de paquetes → IDs de canales
    pkg_ids = [s.package_id for s in subs]
    pkgs_result = await db.execute(select(Package).where(Package.id.in_(pkg_ids)))
    packages = pkgs_result.scalars().all()

    channel_ids: set[str] = set()
    for pkg in packages:
        for cid in (pkg.channel_ids or []):
            channel_ids.add(str(cid))

    if not channel_ids:
        return Response(content="#EXTM3U\n# Sin canales asignados\n", media_type="audio/x-mpegurl")

    # Obtener canales ordenados
    chs_result = await db.execute(
        select(Channel)
        .where(Channel.id.in_([uuid.UUID(cid) for cid in channel_ids]), Channel.is_active == True)
        .order_by(Channel.sort_order, Channel.name)
    )
    channels = chs_result.scalars().all()

    # Validar perfil disponible para cada canal (fallback a primer perfil)
    def pick_profile(ch):
        if profile in (ch.transcoding_profiles or []):
            return profile
        return (ch.transcoding_profiles or [profile])[0]

    # Construir M3U
    lines = [f'#EXTM3U x-tvg-url="{base_url.rstrip("/")}/epg.xml" x-client-id="{client_id}"']
    for ch in channels:
        p = pick_profile(ch)
        logo = ch.logo_url or ""
        epg = ch.epg_id or str(ch.id)
        lines.append(
            f'#EXTINF:-1 tvg-id="{epg}" tvg-logo="{logo}" '
            f'group-title="IPTV",{ch.name}'
        )
        lines.append(f"{base_url.rstrip('/')}/{ch.id}/{p}/index.m3u8")

    content = "\n".join(lines) + "\n"
    filename = f"playlist_{client.name.replace(' ', '_').lower()}_{profile}.m3u"
    return Response(
        content=content,
        media_type="audio/x-mpegurl",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{client_id}/playlist-info")
async def client_playlist_info(client_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Devuelve metadatos de la playlist del cliente: canales disponibles, perfiles, suscripciones."""
    client_result = await db.execute(select(Client).where(Client.id == client_id))
    client = client_result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    now = datetime.utcnow()
    subs_result = await db.execute(
        select(Subscription).where(
            Subscription.client_id == client_id,
            Subscription.is_active == True,
            Subscription.expires_at > now,
        )
    )
    subs = subs_result.scalars().all()

    pkg_ids = [s.package_id for s in subs]
    pkgs_result = await db.execute(select(Package).where(Package.id.in_(pkg_ids)))
    packages = pkgs_result.scalars().all()

    channel_ids: set[str] = set()
    for pkg in packages:
        for cid in (pkg.channel_ids or []):
            channel_ids.add(str(cid))

    chs_result = await db.execute(
        select(Channel)
        .where(Channel.id.in_([uuid.UUID(cid) for cid in channel_ids]), Channel.is_active == True)
    )
    channels = chs_result.scalars().all()

    available_profiles: set[str] = set()
    for ch in channels:
        available_profiles.update(ch.transcoding_profiles or [])

    return {
        "client_id": str(client_id),
        "client_name": client.name,
        "is_active": client.is_active,
        "active_subscriptions": len(subs),
        "total_channels": len(channels),
        "available_profiles": sorted(available_profiles),
        "packages": [{"id": str(p.id), "name": p.name} for p in packages],
        "expires_at": max((s.expires_at for s in subs), default=None),
    }
