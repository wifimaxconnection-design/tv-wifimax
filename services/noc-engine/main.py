"""
NOC Engine — Enterprise Network Operations Center
Agrega estado de todos los servicios, genera eventos NOC,
integra con Zabbix y dispara alertas WhatsApp.
"""
import asyncio
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

import httpx
import structlog
import uvicorn
from fastapi import FastAPI, Depends, Query
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
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

logger = structlog.get_logger()

# ── Servicios internos ───────────────────────────────────────
BACKEND_URL     = os.getenv("BACKEND_URL",       "http://backend:8000")
IPV6_MGR_URL    = os.getenv("IPV6_MGR_URL",      "http://ipv6-manager:8010")
BGP_ORCH_URL    = os.getenv("BGP_ORCH_URL",       "http://bgp-orchestrator:8011")
WA_ALERTS_URL   = os.getenv("WA_ALERTS_URL",     "http://whatsapp-alerts:8014")
ZABBIX_SYNC_URL = os.getenv("ZABBIX_SYNC_URL",   "http://zabbix-sync:8013")
YESOLT_URL      = os.getenv("YESOLT_URL",        "http://yesolt_app:8090")
GENIEACS_NBI    = os.getenv("GENIEACS_NBI_URL",  "http://yesolt_genieacs:7557")

# ── Métricas ─────────────────────────────────────────────────
noc_services_up   = _safe_metric(Gauge, "iptv_noc_services_up",   "Servicios UP en la plataforma")
noc_services_down = _safe_metric(Gauge, "iptv_noc_services_down",  "Servicios DOWN")
noc_open_events   = _safe_metric(Gauge, "iptv_noc_open_events",    "Eventos NOC abiertos")
noc_fiber_cuts    = _safe_metric(Gauge, "iptv_noc_fiber_cuts",     "Cortes de fibra activos")

DATABASE_URL = os.getenv("DATABASE_URL",
    "postgresql+asyncpg://iptv_user:devpassword123@postgres:5432/iptv_platform")
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSession_ = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSession_() as s:
        yield s

app = FastAPI(title="NOC Engine — Enterprise", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/metrics", make_asgi_app())

# ── Servicios a monitorear ───────────────────────────────────
SERVICES_MAP = {
    "backend":       f"{BACKEND_URL}/health",
    "ipv6-manager":  f"{IPV6_MGR_URL}/health",
    "bgp-orch":      f"{BGP_ORCH_URL}/health",
    "whatsapp":      f"{WA_ALERTS_URL}/health",
    "zabbix-sync":   f"{ZABBIX_SYNC_URL}/health",
    "yesolt":        f"{YESOLT_URL}/",
}


async def check_service(name: str, url: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=4) as client:
            r = await client.get(url)
            return {"name": name, "status": "up" if r.status_code < 400 else "degraded",
                    "http_code": r.status_code, "latency_ms": r.elapsed.total_seconds() * 1000}
    except Exception as e:
        return {"name": name, "status": "down", "error": str(e)[:100]}


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "noc-engine"}


@app.get("/api/v1/noc/platform-status")
async def platform_status():
    """Estado en tiempo real de todos los microservicios de la plataforma."""
    tasks = [check_service(name, url) for name, url in SERVICES_MAP.items()]
    results = await asyncio.gather(*tasks)
    up   = sum(1 for r in results if r["status"] == "up")
    down = sum(1 for r in results if r["status"] == "down")
    noc_services_up.set(up)
    noc_services_down.set(down)
    return {
        "status": "success",
        "summary": {"up": up, "down": down, "degraded": len(results) - up - down},
        "services": results,
        "overall": "healthy" if down == 0 else ("degraded" if up > 0 else "critical"),
    }


@app.get("/api/v1/noc/dashboard")
async def noc_dashboard(db: AsyncSession = Depends(get_db)):
    """Dashboard NOC completo — una sola llamada para toda la UI."""
    # Estado de servicios (paralelo)
    service_checks = await asyncio.gather(
        *[check_service(n, u) for n, u in SERVICES_MAP.items()],
        return_exceptions=True
    )

    # Datos desde PostgreSQL
    pg_stats = (await db.execute(text("""
        SELECT
            (SELECT COUNT(*) FROM channels WHERE is_active=TRUE)     as channels_active,
            (SELECT COUNT(*) FROM clients WHERE is_active=TRUE)       as clients_active,
            (SELECT COUNT(*) FROM stream_sessions WHERE ended_at IS NULL) as sessions_live,
            (SELECT COUNT(*) FROM subscriptions WHERE is_active=TRUE) as subscriptions_active,
            (SELECT COUNT(*) FROM noc_events WHERE status='open')     as events_open,
            (SELECT COUNT(*) FROM noc_events WHERE severity='critical' AND status='open') as events_critical,
            (SELECT COUNT(*) FROM fiber_cuts WHERE status != 'resolved') as fiber_cuts_open,
            (SELECT COUNT(*) FROM maintenance_windows WHERE status='active') as maintenances_active,
            (SELECT COUNT(*) FROM ipv6_pools WHERE enabled=TRUE)      as ipv6_pools_active,
            (SELECT COUNT(*) FROM bgp_peers WHERE status='established') as bgp_established,
            (SELECT COUNT(*) FROM mikrotik_routers WHERE status='online') as routers_online
    """))).mappings().one()

    # Últimos eventos NOC
    recent_events = (await db.execute(text("""
        SELECT id, event_type, severity, title, source_service, affected_count, status, created_at
        FROM noc_events ORDER BY created_at DESC LIMIT 20
    """))).mappings().all()

    # Cortes de fibra activos
    fiber_cuts = (await db.execute(text("""
        SELECT id, olt_name, pon_interface, affected_onus, latitude, longitude,
               cause, status, opened_at, tech_assigned
        FROM fiber_cuts WHERE status != 'resolved'
        ORDER BY opened_at DESC
    """))).mappings().all()

    noc_open_events.set(pg_stats["events_open"])
    noc_fiber_cuts.set(pg_stats["fiber_cuts_open"])

    return {
        "status": "success",
        "timestamp": datetime.utcnow().isoformat(),
        "platform": {
            "services": [r if not isinstance(r, Exception) else {"status": "error"} for r in service_checks],
        },
        "network": dict(pg_stats),
        "events": {"recent": [dict(e) for e in recent_events]},
        "fiber_cuts": [dict(f) for f in fiber_cuts],
    }


@app.get("/api/v1/noc/events")
async def list_events(
    severity: Optional[str] = None,
    status: Optional[str] = Query("open"),
    source: Optional[str] = None,
    limit: int = Query(50, le=500),
    db: AsyncSession = Depends(get_db)
):
    where, params = ["1=1"], {}
    if severity: where.append("severity=:sev"); params["sev"] = severity
    if status:   where.append("status=:st");    params["st"] = status
    if source:   where.append("source_service=:src"); params["src"] = source
    params["lim"] = limit
    result = await db.execute(text(f"""
        SELECT id, event_type, severity, title, description, source_service,
               affected_entity, affected_count, status, ack_by, ack_at,
               resolved_at, created_at, metadata
        FROM noc_events WHERE {' AND '.join(where)}
        ORDER BY created_at DESC LIMIT :lim
    """), params)
    return {"status": "success", "data": [dict(r) for r in result.mappings().all()]}


@app.post("/api/v1/noc/events", status_code=201)
async def create_event(
    event_type: str,
    severity: str,
    title: str,
    source_service: str,
    description: Optional[str] = None,
    affected_entity: Optional[str] = None,
    affected_count: int = 0,
    db: AsyncSession = Depends(get_db)
):
    event_id = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO noc_events (id, event_type, severity, title, description,
                                source_service, affected_entity, affected_count)
        VALUES (:id, :et, :sev, :title, :desc, :src, :ae, :cnt)
    """), {
        "id": event_id, "et": event_type, "sev": severity, "title": title,
        "desc": description, "src": source_service, "ae": affected_entity, "cnt": affected_count,
    })
    await db.commit()

    # Disparar alerta WhatsApp si es crítico
    if severity in ("critical", "disaster"):
        asyncio.create_task(_trigger_alert(event_id, severity, title, affected_entity, affected_count))

    return {"status": "success", "id": event_id}


@app.patch("/api/v1/noc/events/{event_id}/acknowledge")
async def ack_event(event_id: str, by: str, db: AsyncSession = Depends(get_db)):
    await db.execute(text("""
        UPDATE noc_events SET status='acknowledged', ack_by=:by, ack_at=NOW()
        WHERE id=:id
    """), {"id": event_id, "by": by})
    await db.commit()
    return {"status": "success", "acknowledged_by": by}


@app.patch("/api/v1/noc/events/{event_id}/resolve")
async def resolve_event(event_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(text("""
        UPDATE noc_events SET status='resolved', resolved_at=NOW()
        WHERE id=:id
    """), {"id": event_id})
    await db.commit()
    return {"status": "success"}


# ─── Fiber Cuts ───────────────────────────────────────────────

@app.get("/api/v1/noc/fiber-cuts")
async def list_fiber_cuts(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    where = f"WHERE status='{status}'" if status else "WHERE status != 'resolved'"
    result = await db.execute(text(f"""
        SELECT id, olt_name, pon_interface, affected_onus, latitude, longitude,
               location_desc, cause, status, opened_at, resolved_at,
               tech_assigned, notes
        FROM fiber_cuts {where}
        ORDER BY opened_at DESC
    """))
    return {"status": "success", "data": [dict(r) for r in result.mappings().all()]}


@app.post("/api/v1/noc/fiber-cuts", status_code=201)
async def create_fiber_cut(
    olt_name: str,
    pon_interface: str,
    affected_onus: int,
    location_desc: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    cause: str = "unknown",
    db: AsyncSession = Depends(get_db)
):
    cut_id = str(uuid.uuid4())
    # Crear evento NOC asociado
    event_id = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO noc_events (id, event_type, severity, title, source_service, affected_entity, affected_count)
        VALUES (:id, 'fiber_cut', 'critical',
                :title, 'noc-engine', :ae, :cnt)
    """), {
        "id": event_id,
        "title": f"Corte de fibra en {olt_name} / {pon_interface}",
        "ae": f"{olt_name}:{pon_interface}",
        "cnt": affected_onus,
    })
    await db.execute(text("""
        INSERT INTO fiber_cuts
        (id, olt_name, pon_interface, affected_onus, latitude, longitude,
         location_desc, cause, noc_event_id)
        VALUES (:id, :olt, :pon, :onus, :lat, :lon, :loc, :cause, :evid)
    """), {
        "id": cut_id, "olt": olt_name, "pon": pon_interface,
        "onus": affected_onus, "lat": latitude, "lon": longitude,
        "loc": location_desc, "cause": cause, "evid": event_id,
    })
    await db.commit()
    asyncio.create_task(_trigger_alert(
        event_id, "critical",
        f"🔴 Corte de fibra {olt_name}/{pon_interface} — {affected_onus} ONUs afectadas",
        location_desc, affected_onus
    ))
    return {"status": "success", "id": cut_id, "event_id": event_id}


async def _trigger_alert(event_id: str, severity: str, title: str,
                          entity: Optional[str], count: int):
    """Envía alerta WhatsApp vía el microservicio de alertas."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(f"{WA_ALERTS_URL}/api/v1/alerts/send", json={
                "event_id": event_id,
                "severity": severity,
                "title": title,
                "affected_entity": entity,
                "affected_count": count,
            })
    except Exception as e:
        logger.warning("Error enviando alerta WhatsApp", error=str(e))


# ─── Maintenance Windows ──────────────────────────────────────

@app.get("/api/v1/noc/maintenance")
async def list_maintenance(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT id, title, description, affected_items, starts_at, ends_at,
               suppress_alerts, created_by, status
        FROM maintenance_windows
        WHERE status NOT IN ('cancelled','completed')
        ORDER BY starts_at
    """))
    return {"status": "success", "data": [dict(r) for r in result.mappings().all()]}


@app.post("/api/v1/noc/maintenance", status_code=201)
async def create_maintenance(
    title: str,
    starts_at: str,
    ends_at: str,
    affected_items: list[str] = [],
    description: Optional[str] = None,
    suppress_alerts: bool = True,
    created_by: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    maint_id = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO maintenance_windows
        (id, title, description, affected_items, starts_at, ends_at, suppress_alerts, created_by)
        VALUES (:id, :title, :desc, :items, :start, :end, :suppress, :by)
    """), {
        "id": maint_id, "title": title, "desc": description,
        "items": affected_items, "start": starts_at, "end": ends_at,
        "suppress": suppress_alerts, "by": created_by,
    })
    await db.commit()
    return {"status": "success", "id": maint_id}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("NOC_ENGINE_PORT", 8012)))

