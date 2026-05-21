"""
BGP IPv6 Orchestrator — Carrier-Grade ISP
Automatiza configuración BGP IPv6 en MikroTik RouterOS v7.
Monitorea peers, maneja failover, distribuye pools IPv6.
"""
import asyncio
import ipaddress
import os
import uuid
from datetime import datetime
from typing import Optional

import httpx
import structlog
import uvicorn
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import Gauge, Counter, make_asgi_app

def _safe_metric(cls, *args, **kwargs):
    """Create metric safely — ignore duplicate registration on restart."""
    try:
        return cls(*args, **kwargs)
    except ValueError:
        from prometheus_client import REGISTRY
        name = args[0]
        for key in list(REGISTRY._names_to_collectors.keys()):
            if name in key:
                return REGISTRY._names_to_collectors[key]
        raise
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

logger = structlog.get_logger()

# ── Métricas Prometheus ──────────────────────────────────────
bgp_peers_established = _safe_metric(Gauge, "iptv_bgp_peers_established", "BGP peers established", ["router"])
bgp_peers_down        = _safe_metric(Gauge, "iptv_bgp_peers_down",        "BGP peers down",        ["router"])
bgp_prefixes_rx       = _safe_metric(Gauge, "iptv_bgp_prefixes_rx",       "BGP prefixes received", ["router", "peer"])
bgp_failover_total    = _safe_metric(Counter, "iptv_bgp_failover_total",  "BGP failover events")
mikrotik_api_errors   = _safe_metric(Counter, "iptv_mikrotik_api_errors_total", "MikroTik API errors", ["router"])

DATABASE_URL = os.getenv("DATABASE_URL",
    "postgresql+asyncpg://iptv_user:devpassword123@postgres:5432/iptv_platform")
engine = create_async_engine(DATABASE_URL, echo=False, pool_size=5)
AsyncSession_ = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSession_() as s:
        yield s

app = FastAPI(title="BGP Orchestrator — ISP Carrier-Grade", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/metrics", make_asgi_app())


# ════════════════════════════════════════════════════════════
# MODELOS
# ════════════════════════════════════════════════════════════

class RouterCreate(BaseModel):
    name: str
    ip_address: str
    username: str
    password: str
    api_port: int = 8728
    local_as: int
    role: str = "edge"
    site: Optional[str] = None
    pop: Optional[str] = None

class BGPPeerCreate(BaseModel):
    router_id: str
    peer_name: str
    remote_address: str
    remote_as: int
    peer_type: str = "ibgp"
    address_family: str = "ipv6"
    multihop: bool = False
    route_reflector: bool = False

class AnnouncementCreate(BaseModel):
    router_id: str
    pool_id: Optional[str] = None
    prefix: str
    local_pref: int = 100
    communities: list[str] = []
    auto_announce: bool = True

class MikroTikAction(BaseModel):
    router_id: str
    action: str  # add_peer, remove_peer, announce, withdraw, check_status


# ════════════════════════════════════════════════════════════
# MIKROTIK RouterOS v7 API CLIENT
# ════════════════════════════════════════════════════════════

class MikroTikAPIClient:
    """
    Cliente para RouterOS v7 REST API.
    RouterOS v7 expone REST en :80/rest/
    """
    def __init__(self, ip: str, username: str, password: str, port: int = 80):
        self.base_url = f"http://{ip}:{port}/rest"
        self.auth = (username, password)
        self.timeout = 10

    async def get(self, path: str) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.get(f"{self.base_url}{path}", auth=self.auth)
            r.raise_for_status()
            return r.json()

    async def post(self, path: str, data: dict) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.post(f"{self.base_url}{path}", json=data, auth=self.auth)
            r.raise_for_status()
            return r.json()

    async def put(self, path: str, item_id: str, data: dict) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.put(f"{self.base_url}{path}/{item_id}", json=data, auth=self.auth)
            r.raise_for_status()
            return r.json()

    async def delete(self, path: str, item_id: str) -> None:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.delete(f"{self.base_url}{path}/{item_id}", auth=self.auth)
            r.raise_for_status()

    async def get_bgp_sessions(self) -> list:
        try:
            return await self.get("/routing/bgp/session")
        except Exception as e:
            logger.error("Error obteniendo BGP sessions", error=str(e))
            return []

    async def add_bgp_peer(self, peer_name: str, remote_addr: str, remote_as: int,
                           peer_type: str = "ibgp", template: str = "IPV6-IBGP") -> dict:
        return await self.post("/routing/bgp/connection", {
            "name": peer_name,
            "remote.address": remote_addr,
            "remote.as": str(remote_as),
            "local.role": peer_type,
            "templates": template,
            "address-families": "ipv6",
            "nexthop-choice": "force-self",
        })

    async def announce_prefix(self, prefix: str, comment: str = "") -> dict:
        return await self.post("/routing/bgp/network", {
            "network": prefix,
            "comment": comment,
        })

    async def get_interfaces(self) -> list:
        return await self.get("/interface")

    async def get_ipv6_routes(self) -> list:
        return await self.get("/ipv6/route")


# ════════════════════════════════════════════════════════════
# ENDPOINTS — ROUTERS
# ════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "bgp-orchestrator", "version": "1.0.0"}


@app.get("/api/v1/bgp/routers")
async def list_routers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT id, name, ip_address::TEXT, api_port, role, site, pop,
               local_as, router_id::TEXT, status, ipv6_enabled,
               bgp_enabled, ospf_enabled, last_seen
        FROM mikrotik_routers ORDER BY name
    """))
    return {"status": "success", "data": [dict(r) for r in result.mappings().all()]}


@app.post("/api/v1/bgp/routers", status_code=201)
async def register_router(payload: RouterCreate, db: AsyncSession = Depends(get_db)):
    """Registra un router MikroTik en la plataforma."""
    import hashlib, base64
    passwd_enc = base64.b64encode(payload.password.encode()).decode()
    router_id = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO mikrotik_routers
        (id, name, ip_address, api_port, username, password_enc, role, site, pop, local_as, bgp_enabled)
        VALUES (:id, :name, :ip, :port, :user, :pass_enc, :role, :site, :pop, :as, TRUE)
    """), {
        "id": router_id, "name": payload.name, "ip": payload.ip_address,
        "port": payload.api_port, "user": payload.username, "pass_enc": passwd_enc,
        "role": payload.role, "site": payload.site, "pop": payload.pop, "as": payload.local_as,
    })
    await db.commit()
    return {"status": "success", "id": router_id, "name": payload.name}


@app.get("/api/v1/bgp/routers/{router_id}/status")
async def router_status(router_id: str, db: AsyncSession = Depends(get_db)):
    """Consulta el estado real del router via RouterOS v7 API."""
    import base64
    row = (await db.execute(text("""
        SELECT name, ip_address::TEXT, api_port, username, password_enc
        FROM mikrotik_routers WHERE id = :id
    """), {"id": router_id})).mappings().one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Router no encontrado")

    try:
        password = base64.b64decode(row["password_enc"].encode()).decode()
        client = MikroTikAPIClient(row["ip_address"], row["username"], password, 80)
        sessions = await client.get_bgp_sessions()
        established = [s for s in sessions if s.get("established") == "true"]

        # Actualizar status en BD
        await db.execute(text("""
            UPDATE mikrotik_routers SET status='online', last_seen=NOW() WHERE id=:id
        """), {"id": router_id})
        await db.commit()

        bgp_peers_established.labels(router=row["name"]).set(len(established))
        bgp_peers_down.labels(router=row["name"]).set(len(sessions) - len(established))

        return {
            "status": "success",
            "router": row["name"],
            "bgp_sessions_total": len(sessions),
            "bgp_established": len(established),
            "sessions": sessions[:10],
        }
    except Exception as e:
        mikrotik_api_errors.labels(router=row["name"]).inc()
        await db.execute(text("""
            UPDATE mikrotik_routers SET status='offline' WHERE id=:id
        """), {"id": router_id})
        await db.commit()
        return {"status": "error", "router": row["name"], "error": str(e)}


# ════════════════════════════════════════════════════════════
# ENDPOINTS — BGP PEERS
# ════════════════════════════════════════════════════════════

@app.get("/api/v1/bgp/peers")
async def list_peers(router_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    where = "WHERE p.router_id = :rid" if router_id else ""
    params = {"rid": router_id} if router_id else {}
    result = await db.execute(text(f"""
        SELECT p.id, p.peer_name, p.remote_address::TEXT, p.remote_as,
               p.peer_type, p.address_family, p.status,
               p.uptime_seconds, p.prefixes_rx, p.prefixes_tx,
               p.last_error, p.last_checked,
               r.name as router_name, r.site
        FROM bgp_peers p
        JOIN mikrotik_routers r ON r.id = p.router_id
        {where}
        ORDER BY r.name, p.peer_name
    """), params)
    return {"status": "success", "data": [dict(r) for r in result.mappings().all()]}


@app.post("/api/v1/bgp/peers", status_code=201)
async def create_peer(payload: BGPPeerCreate, db: AsyncSession = Depends(get_db)):
    peer_id = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO bgp_peers
        (id, router_id, peer_name, remote_address, remote_as, peer_type, address_family, route_reflector)
        VALUES (:id, :router_id, :peer_name, :remote_address, :remote_as, :peer_type, :af, :rr)
    """), {
        "id": peer_id, "router_id": payload.router_id, "peer_name": payload.peer_name,
        "remote_address": payload.remote_address, "remote_as": payload.remote_as,
        "peer_type": payload.peer_type, "af": payload.address_family,
        "rr": payload.route_reflector,
    })
    await db.commit()
    logger.info("BGP peer creado", peer=payload.peer_name, router=payload.router_id)
    return {"status": "success", "id": peer_id}


@app.post("/api/v1/bgp/peers/{peer_id}/apply")
async def apply_peer_to_router(peer_id: str, db: AsyncSession = Depends(get_db)):
    """
    Aplica la configuración del peer BGP al router MikroTik via API REST.
    Genera el comando RouterOS y lo ejecuta.
    """
    import base64
    row = (await db.execute(text("""
        SELECT p.*, r.ip_address::TEXT as router_ip,
               r.username, r.password_enc, r.name as router_name
        FROM bgp_peers p
        JOIN mikrotik_routers r ON r.id = p.router_id
        WHERE p.id = :id
    """), {"id": peer_id})).mappings().one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Peer no encontrado")

    try:
        password = base64.b64decode(row["password_enc"].encode()).decode()
        client = MikroTikAPIClient(row["router_ip"], row["username"], password)
        result = await client.add_bgp_peer(
            row["peer_name"], row["remote_address"], row["remote_as"], row["peer_type"]
        )
        # Log en historial
        await db.execute(text("""
            INSERT INTO mikrotik_config_history (router_id, action, command, result, success)
            VALUES (:rid, 'add_bgp_peer', :cmd, :res, TRUE)
        """), {
            "rid": row["router_id"],
            "cmd": f"add bgp peer {row['peer_name']} {row['remote_address']}",
            "res": str(result),
        })
        await db.execute(text("UPDATE bgp_peers SET status='active' WHERE id=:id"), {"id": peer_id})
        await db.commit()
        return {"status": "success", "applied": True, "router": row["router_name"]}
    except Exception as e:
        mikrotik_api_errors.labels(router=row["router_name"]).inc()
        raise HTTPException(status_code=503, detail=f"Error aplicando a router: {str(e)}")


@app.get("/api/v1/bgp/announcements")
async def list_announcements(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT a.id, a.prefix::TEXT, a.local_pref, a.communities,
               a.active, a.auto_announce,
               r.name as router_name, p.pool_name
        FROM bgp_announcements a
        JOIN mikrotik_routers r ON r.id = a.router_id
        LEFT JOIN ipv6_pools p ON p.id = a.pool_id
        ORDER BY r.name, a.prefix
    """))
    return {"status": "success", "data": [dict(r) for r in result.mappings().all()]}


@app.get("/api/v1/bgp/summary")
async def bgp_summary(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT
            (SELECT COUNT(*) FROM mikrotik_routers WHERE status='online') as routers_online,
            (SELECT COUNT(*) FROM mikrotik_routers) as routers_total,
            (SELECT COUNT(*) FROM bgp_peers WHERE status='established') as peers_established,
            (SELECT COUNT(*) FROM bgp_peers) as peers_total,
            (SELECT COUNT(*) FROM bgp_announcements WHERE active=TRUE) as announcements_active,
            (SELECT SUM(prefixes_rx) FROM bgp_peers) as total_prefixes_rx
    """))
    return {"status": "success", "data": dict(result.mappings().one())}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("BGP_ORCH_PORT", 8011)))

