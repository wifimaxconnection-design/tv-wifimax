"""
Zabbix Sync Service — ISP NOC
Sincroniza hosts, triggers y métricas desde Zabbix API 6.x.
Importa OLTs, MikroTik y servidores al NOC de la plataforma.
"""
import asyncio
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

ZABBIX_URL       = os.getenv("ZABBIX_URL",       "http://zabbix-server/zabbix")
ZABBIX_API_TOKEN = os.getenv("ZABBIX_API_TOKEN",  "")
ZABBIX_USER      = os.getenv("ZABBIX_USER",       "Admin")
ZABBIX_PASS      = os.getenv("ZABBIX_PASSWORD",   "zabbix")
SYNC_INTERVAL    = int(os.getenv("ZABBIX_SYNC_INTERVAL", "300"))

zabbix_hosts_synced   = _safe_metric(Gauge, "iptv_zabbix_hosts_synced",  "Hosts sincronizados desde Zabbix")
zabbix_problems_total = _safe_metric(Gauge, "iptv_zabbix_problems_total", "Problemas activos en Zabbix", ["severity"])
zabbix_sync_errors    = _safe_metric(Counter, "iptv_zabbix_sync_errors_total", "Errores de sincronización Zabbix")

DATABASE_URL = os.getenv("DATABASE_URL",
    "postgresql+asyncpg://iptv_user:devpassword123@postgres:5432/iptv_platform")
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSession_ = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSession_() as s:
        yield s

app = FastAPI(title="Zabbix Sync Service — ISP", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/metrics", make_asgi_app())

_zabbix_token: Optional[str] = None


# ════════════════════════════════════════════════════════════
# ZABBIX API CLIENT
# ════════════════════════════════════════════════════════════

class ZabbixClient:
    def __init__(self, url: str, token: str = "", user: str = "", password: str = ""):
        self.url = f"{url.rstrip('/')}/api_jsonrpc.php"
        self.token = token
        self.user = user
        self.password = password
        self._auth: Optional[str] = None

    async def _call(self, method: str, params: dict) -> dict:
        auth = self.token or self._auth
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": 1,
        }
        if auth:
            payload["auth"] = auth

        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(self.url, json=payload,
                                  headers={"Content-Type": "application/json"})
            r.raise_for_status()
            data = r.json()
            if "error" in data:
                raise Exception(f"Zabbix API error: {data['error']['data']}")
            return data.get("result", {})

    async def authenticate(self) -> str:
        result = await self._call("user.login", {
            "user": self.user, "password": self.password
        })
        self._auth = result
        return result

    async def get_hosts(self, group_ids: list = None) -> list:
        params = {
            "output": ["hostid", "host", "name", "status", "available"],
            "selectInterfaces": ["ip", "port", "type"],
            "selectGroups": ["groupid", "name"],
            "selectTemplates": ["templateid", "name"],
        }
        if group_ids:
            params["groupids"] = group_ids
        return await self._call("host.get", params)

    async def get_problems(self, severity: int = 3) -> list:
        """severity: 0=not classified, 1=info, 2=warning, 3=average, 4=high, 5=disaster"""
        return await self._call("problem.get", {
            "output": "extend",
            "severities": list(range(severity, 6)),
            "recent": True,
            "selectAcknowledges": "count",
        })

    async def get_triggers(self, host_ids: list) -> list:
        return await self._call("trigger.get", {
            "output": ["triggerid", "description", "priority", "value", "lastchange"],
            "hostids": host_ids,
            "only_true": True,
        })

    async def get_items(self, host_id: str, search: str = "") -> list:
        params = {
            "output": ["itemid", "name", "lastvalue", "units", "lastclock"],
            "hostids": [host_id],
        }
        if search:
            params["search"] = {"name": search}
        return await self._call("item.get", params)


zbx = ZabbixClient(ZABBIX_URL, ZABBIX_API_TOKEN, ZABBIX_USER, ZABBIX_PASS)


# ════════════════════════════════════════════════════════════
# SYNC LOOP
# ════════════════════════════════════════════════════════════

async def sync_hosts_from_zabbix(db: AsyncSession):
    """Importa todos los hosts de Zabbix a la BD local."""
    try:
        if not zbx.token and not zbx._auth:
            await zbx.authenticate()

        hosts = await zbx.get_hosts()
        synced = 0
        for h in hosts:
            ip = h.get("interfaces", [{}])[0].get("ip", "")
            groups = [g["name"] for g in h.get("groups", [])]
            templates = [t["name"] for t in h.get("templates", [])]

            # Detectar tipo de host por nombre/grupo
            host_type = "other"
            name_lower = h["name"].lower()
            if any(k in name_lower for k in ["olt", "gpon", "vsol", "huawei", "zte", "nokia"]):
                host_type = "olt"
            elif any(k in name_lower for k in ["mikrotik", "routerboard", "rb", "ccr", "chr"]):
                host_type = "mikrotik"
            elif any(k in name_lower for k in ["server", "vps", "vm"]):
                host_type = "server"

            await db.execute(text("""
                INSERT INTO zabbix_hosts
                (id, zabbix_host_id, hostname, ip_address, host_type, groups, templates,
                 status, available, synced_at)
                VALUES (gen_random_uuid(), :zbxid, :name, :ip, :type, :groups, :tpls,
                        :status, :avail, NOW())
                ON CONFLICT (zabbix_host_id) DO UPDATE SET
                    hostname=EXCLUDED.hostname,
                    ip_address=EXCLUDED.ip_address,
                    host_type=EXCLUDED.host_type,
                    groups=EXCLUDED.groups,
                    templates=EXCLUDED.templates,
                    status=EXCLUDED.status,
                    available=EXCLUDED.available,
                    synced_at=NOW()
            """), {
                "zbxid": int(h["hostid"]), "name": h["name"],
                "ip": ip or None, "type": host_type,
                "groups": groups, "tpls": templates,
                "status": int(h["status"]), "avail": int(h.get("available", 0)),
            })
            synced += 1

        await db.commit()
        zabbix_hosts_synced.set(synced)
        logger.info("Zabbix sync completado", hosts=synced)
        return synced
    except Exception as e:
        zabbix_sync_errors.inc()
        logger.error("Error sincronizando Zabbix", error=str(e))
        return 0


async def sync_loop():
    """Loop de sincronización periódica."""
    await asyncio.sleep(30)  # esperar a que la plataforma esté lista
    while True:
        async with AsyncSession_() as db:
            await sync_hosts_from_zabbix(db)
        await asyncio.sleep(SYNC_INTERVAL)


@app.on_event("startup")
async def startup():
    asyncio.create_task(sync_loop())


# ════════════════════════════════════════════════════════════
# ENDPOINTS
# ════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "zabbix-sync",
            "zabbix_url": ZABBIX_URL, "sync_interval_s": SYNC_INTERVAL}


@app.post("/api/v1/zabbix/sync")
async def trigger_sync(db: AsyncSession = Depends(get_db)):
    """Sincronización manual bajo demanda."""
    synced = await sync_hosts_from_zabbix(db)
    return {"status": "success", "hosts_synced": synced}


@app.get("/api/v1/zabbix/hosts")
async def list_hosts(
    host_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    where = "WHERE host_type=:type" if host_type else ""
    params = {"type": host_type} if host_type else {}
    result = await db.execute(text(f"""
        SELECT id, zabbix_host_id, hostname, ip_address::TEXT,
               host_type, groups, templates, status, available, synced_at
        FROM zabbix_hosts {where}
        ORDER BY hostname
    """), params)
    return {"status": "success", "data": [dict(r) for r in result.mappings().all()]}


@app.get("/api/v1/zabbix/problems")
async def get_problems(min_severity: int = 3):
    """Obtiene problemas activos directamente desde Zabbix API."""
    try:
        if not zbx.token and not zbx._auth:
            await zbx.authenticate()
        problems = await zbx.get_problems(min_severity)
        severity_map = {0: "not_classified", 1: "info", 2: "warning",
                        3: "average", 4: "high", 5: "disaster"}
        for p in problems:
            p["severity_name"] = severity_map.get(int(p.get("severity", 0)), "unknown")
        return {"status": "success", "data": problems, "total": len(problems)}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Zabbix no disponible: {str(e)}")


@app.get("/api/v1/zabbix/hosts/{zabbix_id}/metrics")
async def host_metrics(zabbix_id: int, search: str = ""):
    """Obtiene métricas de un host específico desde Zabbix."""
    try:
        if not zbx.token and not zbx._auth:
            await zbx.authenticate()
        items = await zbx.get_items(str(zabbix_id), search)
        return {"status": "success", "data": items}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/v1/zabbix/summary")
async def zabbix_summary(db: AsyncSession = Depends(get_db)):
    local_stats = (await db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE host_type='olt')        as olts,
            COUNT(*) FILTER (WHERE host_type='mikrotik')   as mikrotiks,
            COUNT(*) FILTER (WHERE host_type='server')     as servers,
            COUNT(*) FILTER (WHERE available=1)            as available,
            COUNT(*) FILTER (WHERE available=2)            as unavailable,
            COUNT(*)                                       as total
        FROM zabbix_hosts
    """))).mappings().one()
    return {"status": "success", "local": dict(local_stats)}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("ZABBIX_SYNC_PORT", 8013)))

