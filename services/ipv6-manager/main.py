"""
IPv6 Manager Service — Carrier-Grade ISP
Gestión de pools IPv6, DHCPv6-PD, SLAAC, delegación de prefijos.
Integración con MikroTik RouterOS v7 API.
EXTIENDE sin romper la plataforma existente.
"""
import asyncio
import ipaddress
import os
import uuid
from datetime import datetime
from typing import Optional

import httpx
import redis.asyncio as aioredis
import structlog
import uvicorn
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import Gauge, Counter, make_asgi_app
from pydantic import BaseModel, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

logger = structlog.get_logger()

# ── Métricas Prometheus ──────────────────────────────────────
ipv6_pools_total    = Gauge("iptv_ipv6_pools_total",    "Total IPv6 pools")
ipv6_active_leases  = Gauge("iptv_ipv6_active_leases",  "Active IPv6 leases")
ipv6_provision_ok   = Counter("iptv_ipv6_provision_ok_total",   "Successful IPv6 provisions")
ipv6_provision_fail = Counter("iptv_ipv6_provision_fail_total",  "Failed IPv6 provisions")

# ── DB Engine ────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL",
    "postgresql+asyncpg://iptv_user:devpassword123@postgres:5432/iptv_platform")
engine = create_async_engine(DATABASE_URL, echo=False, pool_size=5)
AsyncSession_ = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSession_() as session:
        yield session

app = FastAPI(
    title="IPv6 Manager — ISP Carrier-Grade",
    version="1.0.0",
    description="Gestión IPv6 dual stack: pools, DHCPv6-PD, SLAAC, delegación de prefijos",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)


# ════════════════════════════════════════════════════════════
# MODELOS
# ════════════════════════════════════════════════════════════

class IPv6PoolCreate(BaseModel):
    pool_name: str
    ipv6_prefix: str
    delegated_size: int = 56
    gateway: Optional[str] = None
    vlan: Optional[int] = None
    wan_mode: str = "dhcpv6-pd"
    dns_primary: str = "2001:4860:4860::8888"
    dns_secondary: str = "2001:4860:4860::8844"
    ra_interval: int = 200
    description: Optional[str] = None

    @field_validator("ipv6_prefix")
    @classmethod
    def validate_prefix(cls, v):
        try:
            net = ipaddress.IPv6Network(v, strict=False)
            return str(net)
        except ValueError:
            raise ValueError(f"Prefijo IPv6 inválido: {v}")

    @field_validator("delegated_size")
    @classmethod
    def validate_delegated(cls, v):
        if not (48 <= v <= 64):
            raise ValueError("delegated_size debe estar entre 48 y 64")
        return v


class SubscriberIPv6Create(BaseModel):
    onu_serial: str
    client_id: Optional[str] = None
    pool_id: str
    wan_mode: str = "dhcpv6-pd"
    slaac_enabled: bool = False
    dhcpv6_enabled: bool = True
    tr069_enabled: bool = True


class MikroTikCommand(BaseModel):
    router_ip: str
    username: str
    password: str
    command: str


class DelegatePrefixRequest(BaseModel):
    pool_id: str
    onu_serial: str
    client_id: Optional[str] = None


# ════════════════════════════════════════════════════════════
# ENDPOINTS — POOLS IPv6
# ════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "ipv6-manager", "version": "1.0.0"}


@app.get("/api/v1/ipv6/pools")
async def list_pools(
    enabled_only: bool = Query(False),
    db: AsyncSession = Depends(get_db)
):
    """Lista todos los pools IPv6 configurados."""
    where = "WHERE enabled = TRUE" if enabled_only else ""
    result = await db.execute(text(f"""
        SELECT id, pool_name, ipv6_prefix::TEXT, delegated_size, gateway::TEXT,
               vlan, wan_mode, dns_primary::TEXT, dns_secondary::TEXT,
               ra_interval, enabled, description, created_at
        FROM ipv6_pools {where}
        ORDER BY pool_name
    """))
    rows = result.mappings().all()
    pools = [dict(r) for r in rows]
    ipv6_pools_total.set(len(pools))
    return {"status": "success", "data": pools, "total": len(pools)}


@app.post("/api/v1/ipv6/pools", status_code=201)
async def create_pool(payload: IPv6PoolCreate, db: AsyncSession = Depends(get_db)):
    """Crea un nuevo pool IPv6 para delegación de prefijos."""
    pool_id = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO ipv6_pools
        (id, pool_name, ipv6_prefix, delegated_size, gateway, vlan, wan_mode,
         dns_primary, dns_secondary, ra_interval, description)
        VALUES
        (:id, :pool_name, :ipv6_prefix, :delegated_size, :gateway, :vlan, :wan_mode,
         :dns_primary, :dns_secondary, :ra_interval, :description)
    """), {
        "id": pool_id, **payload.model_dump()
    })
    await db.commit()
    logger.info("IPv6 pool creado", pool_name=payload.pool_name, prefix=payload.ipv6_prefix)
    return {"status": "success", "id": pool_id, "pool_name": payload.pool_name}


@app.delete("/api/v1/ipv6/pools/{pool_id}", status_code=204)
async def delete_pool(pool_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(text("DELETE FROM ipv6_pools WHERE id = :id"), {"id": pool_id})
    await db.commit()


# ════════════════════════════════════════════════════════════
# ENDPOINTS — DELEGACIÓN DE PREFIJOS
# ════════════════════════════════════════════════════════════

@app.post("/api/v1/ipv6/delegate")
async def delegate_prefix(req: DelegatePrefixRequest, db: AsyncSession = Depends(get_db)):
    """
    Delega un prefijo IPv6 (/56) a un suscriptor desde el pool.
    Calcula el siguiente prefijo disponible y lo asigna.
    """
    # Obtener pool
    pool = (await db.execute(text("""
        SELECT id, ipv6_prefix::TEXT, delegated_size FROM ipv6_pools
        WHERE id = :id AND enabled = TRUE
    """), {"id": req.pool_id})).mappings().one_or_none()

    if not pool:
        raise HTTPException(status_code=404, detail="Pool IPv6 no encontrado o desactivado")

    # Obtener prefijos ya delegados
    used = (await db.execute(text("""
        SELECT delegated_prefix::TEXT FROM subscriber_ipv6
        WHERE pool_id = :pool_id AND delegated_prefix IS NOT NULL
    """), {"pool_id": req.pool_id})).scalars().all()

    # Calcular siguiente prefijo disponible
    parent = ipaddress.IPv6Network(pool["ipv6_prefix"], strict=False)
    delegated_size = pool["delegated_size"]
    used_nets = {ipaddress.IPv6Network(u, strict=False) for u in used}

    assigned = None
    for subnet in parent.subnets(new_prefix=delegated_size):
        if subnet not in used_nets:
            assigned = str(subnet)
            break

    if not assigned:
        raise HTTPException(status_code=409, detail="Pool IPv6 agotado")

    # Guardar delegación
    sub_id = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO subscriber_ipv6
        (id, onu_serial, client_id, pool_id, delegated_prefix, wan_mode, status)
        VALUES (:id, :onu_serial, :client_id, :pool_id, :delegated_prefix, 'dhcpv6-pd', 'active')
        ON CONFLICT DO NOTHING
    """), {
        "id": sub_id,
        "onu_serial": req.onu_serial,
        "client_id": req.client_id,
        "pool_id": req.pool_id,
        "delegated_prefix": assigned,
    })
    await db.commit()
    ipv6_provision_ok.inc()
    logger.info("Prefijo IPv6 delegado", onu=req.onu_serial, prefix=assigned)

    return {
        "status": "success",
        "onu_serial": req.onu_serial,
        "delegated_prefix": assigned,
        "delegated_size": delegated_size,
        "pool_id": req.pool_id,
    }


@app.get("/api/v1/ipv6/subscribers")
async def list_subscribers(
    status: Optional[str] = None,
    pool_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Lista suscriptores con prefijos IPv6 delegados."""
    where_clauses = []
    params = {}
    if status:
        where_clauses.append("s.status = :status")
        params["status"] = status
    if pool_id:
        where_clauses.append("s.pool_id = :pool_id")
        params["pool_id"] = pool_id

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    result = await db.execute(text(f"""
        SELECT s.id, s.onu_serial, s.client_id,
               s.delegated_prefix::TEXT, s.wan_mode,
               s.dhcpv6_enabled, s.slaac_enabled, s.status,
               s.last_seen, s.lease_expires,
               p.pool_name, p.ipv6_prefix::TEXT
        FROM subscriber_ipv6 s
        LEFT JOIN ipv6_pools p ON p.id = s.pool_id
        {where_sql}
        ORDER BY s.created_at DESC
        LIMIT 500
    """), params)
    rows = [dict(r) for r in result.mappings().all()]
    ipv6_active_leases.set(sum(1 for r in rows if r["status"] == "active"))
    return {"status": "success", "data": rows, "total": len(rows)}


# ════════════════════════════════════════════════════════════
# MIKROTIK — Generación de comandos RouterOS v7
# ════════════════════════════════════════════════════════════

@app.post("/api/v1/mikrotik/generate/ipv6-pool")
async def generate_pool_commands(payload: IPv6PoolCreate):
    """
    Genera los comandos RouterOS v7 para configurar el pool IPv6
    y DHCPv6-PD en MikroTik. Para pegar en terminal o API.
    """
    prefix = ipaddress.IPv6Network(payload.ipv6_prefix, strict=False)
    vlan_iface = f"vlan{payload.vlan}" if payload.vlan else "bridge-FTTH"
    commands = [
        f"# === Pool IPv6 {payload.pool_name} ===",
        f"/ipv6 pool",
        f"add name={payload.pool_name} prefix={prefix} prefix-length={payload.delegated_size}",
        f"",
        f"# DHCPv6 Server con Prefix Delegation",
        f"/ipv6 dhcp-server",
        f"add name=dhcpv6-{payload.pool_name.lower()} interface={vlan_iface} "
        f"address-pool={payload.pool_name} lease-time=1h",
        f"",
        f"# Router Advertisements",
        f"/ipv6 nd",
        f"set [{vlan_iface}] advertise-dns=yes other-configuration=yes "
        f"ra-interval={payload.ra_interval}s ra-lifetime=10m",
        f"",
        f"# DNS IPv6",
        f"/ipv6 nd prefix",
        f"add interface={vlan_iface} prefix={prefix}",
        f"",
        f"# Firewall IPv6 básico",
        f"/ipv6 firewall filter",
        f"add chain=forward src-address={prefix} action=accept comment=\"Allow {payload.pool_name}\"",
    ]
    return {
        "status": "success",
        "pool_name": payload.pool_name,
        "commands": commands,
        "commands_text": "\n".join(commands),
    }


@app.post("/api/v1/mikrotik/generate/bgp-ipv6")
async def generate_bgp_commands(
    router_name: str,
    local_as: int,
    peer_address: str,
    peer_as: int,
    announce_prefix: str,
    peer_type: str = "ibgp"
):
    """Genera configuración BGP IPv6 para RouterOS v7."""
    try:
        prefix = ipaddress.IPv6Network(announce_prefix, strict=False)
    except ValueError:
        raise HTTPException(status_code=400, detail="Prefijo IPv6 inválido")

    commands = [
        f"# === BGP IPv6 {peer_type.upper()} — {router_name} ===",
        f"",
        f"/routing bgp template",
        f"add name=IPV6-{peer_type.upper()} as={local_as} address-families=ipv6",
        f"",
        f"/routing bgp connection",
        f"add name={router_name}-{peer_type} \\",
        f"    remote.address={peer_address} remote.as={peer_as} \\",
        f"    local.role={'ibgp' if peer_type == 'ibgp' else 'ebgp'} \\",
        f"    templates=IPV6-{peer_type.upper()} \\",
        f"    address-families=ipv6 \\",
        f"    nexthop-choice=force-self",
        f"",
        f"/routing filter rule",
        f"add chain=ipv6-export-{router_name} \\",
        f"    rule=\"if (dst in {prefix}) {{ accept }}\"",
        f"",
        f"/routing bgp network",
        f"add network={prefix} comment=\"FTTH pool {router_name}\"",
        f"",
        f"# Verificar estado:",
        f"# /routing bgp session print",
        f"# /routing bgp session print where .id={router_name}-{peer_type}",
    ]
    return {
        "status": "success",
        "commands": commands,
        "commands_text": "\n".join(commands),
    }


@app.get("/api/v1/ipv6/stats")
async def ipv6_stats(db: AsyncSession = Depends(get_db)):
    """Resumen estadístico de IPv6 en la plataforma."""
    result = await db.execute(text("""
        SELECT
            (SELECT COUNT(*) FROM ipv6_pools WHERE enabled = TRUE) as pools_active,
            (SELECT COUNT(*) FROM ipv6_pools) as pools_total,
            (SELECT COUNT(*) FROM subscriber_ipv6 WHERE status = 'active') as subscribers_active,
            (SELECT COUNT(*) FROM subscriber_ipv6) as subscribers_total,
            (SELECT COUNT(*) FROM subscriber_ipv6 WHERE delegated_prefix IS NOT NULL) as prefixes_delegated,
            (SELECT COUNT(*) FROM mikrotik_routers WHERE ipv6_enabled = TRUE) as routers_ipv6,
            (SELECT COUNT(*) FROM bgp_peers WHERE status = 'established') as bgp_established
    """))
    return {"status": "success", "data": dict(result.mappings().one())}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("IPV6_MGR_PORT", 8010)))
