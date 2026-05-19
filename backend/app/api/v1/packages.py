import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.client import Package

router = APIRouter()


class PackageCreate(BaseModel):
    name: str
    description: Optional[str] = None
    channel_ids: List[str] = []
    price: float = 0.0
    max_devices: int = 3
    odoo_product_id: Optional[str] = None


class PackageOut(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    channel_ids: List[str]
    price: float
    max_devices: int
    is_active: bool

    model_config = {"from_attributes": True}


@router.get("", response_model=List[PackageOut])
async def list_packages(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Package).where(Package.is_active == True).order_by(Package.name))
    return result.scalars().all()


@router.post("", response_model=PackageOut, status_code=status.HTTP_201_CREATED)
async def create_package(payload: PackageCreate, db: AsyncSession = Depends(get_db)):
    pkg = Package(**payload.model_dump())
    db.add(pkg)
    await db.flush()
    await db.refresh(pkg)
    return pkg


@router.patch("/{package_id}", response_model=PackageOut)
async def update_package(
    package_id: uuid.UUID,
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Package).where(Package.id == package_id))
    pkg = result.scalar_one_or_none()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    allowed = {"name", "description", "channel_ids", "price", "max_devices", "odoo_product_id"}
    for key, value in payload.items():
        if key in allowed:
            setattr(pkg, key, value)
    await db.flush()
    await db.refresh(pkg)
    return pkg


@router.delete("/{package_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_package(package_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Package).where(Package.id == package_id))
    pkg = result.scalar_one_or_none()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    await db.delete(pkg)
