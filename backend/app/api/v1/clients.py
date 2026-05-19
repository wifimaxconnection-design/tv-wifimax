import uuid
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.client import Client, Subscription, Package, Device

router = APIRouter()


class ClientCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    address: Optional[str] = None
    max_devices: int = 3
    odoo_partner_id: Optional[str] = None


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
