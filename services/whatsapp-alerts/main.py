"""
WhatsApp Alert Manager — ISP NOC
Soporta: Evolution API (self-hosted), WhatsApp Cloud API (Meta).
Deduplicación, cooldown, escalamiento, mantenimientos.
"""
import asyncio
import hashlib
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

import httpx
import redis.asyncio as aioredis
import structlog
import uvicorn
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import Counter, Gauge, make_asgi_app
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

logger = structlog.get_logger()

# ── Config ────────────────────────────────────────────────────
WA_PROVIDER        = os.getenv("WA_PROVIDER", "evolution")  # evolution | meta
EVOLUTION_API_URL  = os.getenv("EVOLUTION_API_URL", "http://evolution-api:8080")
EVOLUTION_API_KEY  = os.getenv("EVOLUTION_API_KEY", "")
EVOLUTION_INSTANCE = os.getenv("EVOLUTION_INSTANCE", "noc")
META_TOKEN         = os.getenv("META_WA_TOKEN", "")
META_PHONE_ID      = os.getenv("META_PHONE_NUMBER_ID", "")
COOLDOWN_MINUTES   = int(os.getenv("WA_COOLDOWN_MINUTES", "15"))
MAX_PER_HOUR       = int(os.getenv("WA_MAX_PER_HOUR", "6"))
NOC_RECIPIENTS     = os.getenv("WA_NOC_RECIPIENTS", "").split(",")

try:
    alerts_sent       = Counter("iptv_wa_alerts_sent",       "Alertas WA enviadas",           ["severity"])
    alerts_failed     = Counter("iptv_wa_alerts_failed",     "Alertas WA fallidas")
    alerts_suppressed = Counter("iptv_wa_alerts_suppressed", "Alertas suprimidas (cooldown)")
except ValueError:
    from prometheus_client import REGISTRY as _r
    alerts_sent       = _r._names_to_collectors.get("iptv_wa_alerts_sent_total")
    alerts_failed     = _r._names_to_collectors.get("iptv_wa_alerts_failed_total")
    alerts_suppressed = _r._names_to_collectors.get("iptv_wa_alerts_suppressed_total")

DATABASE_URL = os.getenv("DATABASE_URL",
    "postgresql+asyncpg://iptv_user:devpassword123@postgres:5432/iptv_platform")
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSession_ = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSession_() as s:
        yield s

_redis: Optional[aioredis.Redis] = None
async def get_redis():
    global _redis
    if _redis is None:
        _redis = await aioredis.from_url(
            os.getenv("REDIS_URL", "redis://redis:6379/6"), decode_responses=True)
    return _redis

app = FastAPI(title="WhatsApp Alert Manager — ISP NOC", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/metrics", make_asgi_app())


# ════════════════════════════════════════════════════════════
# MODELOS
# ════════════════════════════════════════════════════════════

class AlertPayload(BaseModel):
    event_id: str
    severity: str
    title: str
    affected_entity: Optional[str] = None
    affected_count: int = 0
    extra_info: Optional[str] = None
    recipients: Optional[list[str]] = None  # override recipients

class AlertRule(BaseModel):
    name: str
    event_type: Optional[str] = None
    severity_min: str = "critical"
    recipients: list[str]
    cooldown_minutes: int = 15
    max_per_hour: int = 4
    template: Optional[str] = None
    enabled: bool = True


# ════════════════════════════════════════════════════════════
# ENVÍO REAL POR PROVEEDOR
# ════════════════════════════════════════════════════════════

async def send_evolution(phone: str, message: str) -> bool:
    """Envía mensaje via Evolution API (self-hosted WhatsApp)."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{EVOLUTION_API_URL}/message/sendText/{EVOLUTION_INSTANCE}",
                headers={"apikey": EVOLUTION_API_KEY},
                json={"number": phone.replace("+", "").replace("-", "").replace(" ", ""),
                      "textMessage": {"text": message}},
            )
            return r.status_code in (200, 201)
    except Exception as e:
        logger.error("Evolution API error", error=str(e))
        return False


async def send_meta(phone: str, message: str) -> bool:
    """Envía mensaje via WhatsApp Cloud API (Meta)."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"https://graph.facebook.com/v18.0/{META_PHONE_ID}/messages",
                headers={"Authorization": f"Bearer {META_TOKEN}"},
                json={
                    "messaging_product": "whatsapp",
                    "to": phone.replace("+", ""),
                    "type": "text",
                    "text": {"body": message},
                },
            )
            return r.status_code == 200
    except Exception as e:
        logger.error("Meta WhatsApp API error", error=str(e))
        return False


async def send_whatsapp(phone: str, message: str) -> bool:
    """Router de proveedores WhatsApp."""
    if WA_PROVIDER == "evolution":
        return await send_evolution(phone, message)
    elif WA_PROVIDER == "meta":
        return await send_meta(phone, message)
    else:
        logger.warning("Proveedor WhatsApp no configurado", provider=WA_PROVIDER)
        return False


# ════════════════════════════════════════════════════════════
# DEDUPLICACIÓN Y COOLDOWN
# ════════════════════════════════════════════════════════════

async def should_suppress(event_key: str, redis: aioredis.Redis) -> bool:
    """
    Verifica cooldown via Redis.
    Clave: wa:cooldown:{hash_del_evento}
    """
    key = f"wa:cooldown:{event_key}"
    if await redis.exists(key):
        alerts_suppressed.inc()
        return True
    await redis.setex(key, COOLDOWN_MINUTES * 60, "1")
    return False


async def check_rate_limit(redis: aioredis.Redis) -> bool:
    """Limita a MAX_PER_HOUR alertas por hora."""
    key = f"wa:rate:{datetime.utcnow().strftime('%Y%m%d%H')}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 3600)
    return count <= MAX_PER_HOUR


# ════════════════════════════════════════════════════════════
# TEMPLATE DE MENSAJES
# ════════════════════════════════════════════════════════════

def build_message(severity: str, title: str, entity: Optional[str],
                  count: int, extra: Optional[str] = None) -> str:
    icons = {"critical": "🚨", "disaster": "💀", "warning": "⚠️", "info": "ℹ️"}
    icon = icons.get(severity, "🔔")
    sev_upper = severity.upper()

    lines = [
        f"{icon} *ALERTA {sev_upper} — ISP NOC*",
        f"",
        f"📋 *{title}*",
    ]
    if entity:
        lines.append(f"📍 Entidad: {entity}")
    if count > 0:
        lines.append(f"📊 Afectados: {count}")
    if extra:
        lines.append(f"ℹ️ {extra}")
    lines += [
        f"",
        f"🕐 {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC",
        f"🌐 ISP Platform NOC",
    ]
    return "\n".join(lines)


# ════════════════════════════════════════════════════════════
# ENDPOINTS
# ════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "whatsapp-alerts",
            "provider": WA_PROVIDER, "recipients_configured": len([r for r in NOC_RECIPIENTS if r])}


@app.post("/api/v1/alerts/send")
async def send_alert(
    payload: AlertPayload,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis)
):
    """
    Envía una alerta WhatsApp al grupo NOC.
    Aplica deduplicación, cooldown y rate limiting.
    """
    # Verificar si está en horario de mantenimiento
    in_maintenance = (await db.execute(text("""
        SELECT COUNT(*) FROM maintenance_windows
        WHERE status='active' AND suppress_alerts=TRUE
        AND NOW() BETWEEN starts_at AND ends_at
        AND (affected_items && ARRAY[:entity] OR affected_items = '{}')
    """), {"entity": payload.affected_entity or ""})).scalar()

    if in_maintenance:
        return {"status": "suppressed", "reason": "maintenance_window"}

    # Deduplicación
    event_key = hashlib.md5(f"{payload.severity}:{payload.title}".encode()).hexdigest()[:12]
    if await should_suppress(event_key, redis):
        return {"status": "suppressed", "reason": "cooldown"}

    # Rate limit
    if not await check_rate_limit(redis):
        return {"status": "suppressed", "reason": "rate_limit"}

    # Construir mensaje
    message = build_message(
        payload.severity, payload.title,
        payload.affected_entity, payload.affected_count, payload.extra_info
    )

    # Determinar destinatarios
    recipients = payload.recipients or [r.strip() for r in NOC_RECIPIENTS if r.strip()]
    if not recipients:
        return {"status": "skipped", "reason": "no_recipients_configured"}

    # Enviar a cada destinatario
    results = []
    for phone in recipients:
        success = await send_whatsapp(phone, message)
        status_str = "sent" if success else "failed"
        results.append({"phone": f"***{phone[-4:]}", "status": status_str})

        # Registrar en BD
        incident_id = str(uuid.uuid4())
        await db.execute(text("""
            INSERT INTO alert_incidents (id, channel, recipient, message, status)
            VALUES (:id, 'whatsapp', :recipient, :msg, :status)
        """), {"id": incident_id, "recipient": phone, "msg": message, "status": status_str})

        if success:
            alerts_sent.labels(severity=payload.severity).inc()
        else:
            alerts_failed.inc()

    await db.commit()
    logger.info("Alerta enviada", severity=payload.severity, recipients=len(recipients))
    return {"status": "success", "results": results, "message_length": len(message)}


@app.post("/api/v1/alerts/test")
async def test_alert(phone: str, db: AsyncSession = Depends(get_db)):
    """Envía un mensaje de prueba a un número específico."""
    msg = "✅ *PRUEBA NOC ISP*\n\nSistema de alertas WhatsApp configurado correctamente.\n🕐 " + \
          datetime.utcnow().strftime('%Y-%m-%d %H:%M') + " UTC"
    success = await send_whatsapp(phone, msg)
    return {"status": "success" if success else "error", "phone": f"***{phone[-4:]}"}


@app.get("/api/v1/alerts/incidents")
async def list_incidents(
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(text("""
        SELECT id, channel, recipient, status, sent_at, error
        FROM alert_incidents
        ORDER BY sent_at DESC LIMIT :lim
    """), {"lim": limit})
    return {"status": "success", "data": [dict(r) for r in result.mappings().all()]}


@app.get("/api/v1/alerts/rules")
async def list_rules(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT id, name, event_type, severity_min, recipients,
               cooldown_minutes, max_per_hour, enabled, created_at
        FROM alert_rules ORDER BY name
    """))
    return {"status": "success", "data": [dict(r) for r in result.mappings().all()]}


@app.post("/api/v1/alerts/rules", status_code=201)
async def create_rule(payload: AlertRule, db: AsyncSession = Depends(get_db)):
    rule_id = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO alert_rules
        (id, name, event_type, severity_min, recipients, cooldown_minutes, max_per_hour, enabled)
        VALUES (:id, :name, :et, :sev, :recipients, :cool, :max, :ena)
    """), {
        "id": rule_id, "name": payload.name, "et": payload.event_type,
        "sev": payload.severity_min, "recipients": payload.recipients,
        "cool": payload.cooldown_minutes, "max": payload.max_per_hour, "ena": payload.enabled,
    })
    await db.commit()
    return {"status": "success", "id": rule_id}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("WA_ALERTS_PORT", 8014)))
