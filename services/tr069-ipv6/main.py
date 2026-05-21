"""
TR069 IPv6 Service — Provisioning dual stack vía GenieACS
Provisiona parámetros IPv6 en ONTs/CPEs mediante TR181/TR098.
"""
import asyncio, os, uuid
from typing import Optional
import httpx, structlog, uvicorn
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import Counter, Gauge, make_asgi_app
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

logger = structlog.get_logger()
GENIEACS_NBI = os.getenv("GENIEACS_NBI_URL", "http://yesolt_genieacs:7557")
DATABASE_URL = os.getenv("DATABASE_URL",
    "postgresql+asyncpg://iptv_user:devpassword123@postgres:5432/iptv_platform")
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSession_ = async_sessionmaker(engine, expire_on_commit=False)

def _safe_metric(cls, *args, **kwargs):
    try: return cls(*args, **kwargs)
    except ValueError:
        from prometheus_client import REGISTRY as _r; name=args[0]
        for k in list(_r._names_to_collectors.keys()):
            if name in k: return _r._names_to_collectors[k]
        raise

tr069_provisions_ok   = _safe_metric(Counter, "iptv_tr069_ipv6_ok",   "TR069 IPv6 provisions OK")
tr069_provisions_fail = _safe_metric(Counter, "iptv_tr069_ipv6_fail",  "TR069 IPv6 provisions failed")
tr069_active_devices  = _safe_metric(Gauge,   "iptv_tr069_ipv6_active","Devices with IPv6 via TR069")

async def get_db():
    async with AsyncSession_() as s: yield s

app = FastAPI(title="TR069 IPv6 Provisioning Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/metrics", make_asgi_app())


# ── GenieACS NBI helpers ─────────────────────────────────────

async def genieacs_get_device(device_id: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{GENIEACS_NBI}/devices/{device_id}")
        r.raise_for_status()
        return r.json()

async def genieacs_set_param(device_id: str, param: str, value: str, type_: str = "xsd:string"):
    """Establece un parámetro TR181/TR098 via GenieACS NBI."""
    body = {param: {"_value": value, "_type": type_}}
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.put(f"{GENIEACS_NBI}/devices/{device_id}/tasks",
                        json={"name": "setParameterValues", "parameterValues": [[param, value, type_]]})
        return r.status_code in (200, 201, 202)

async def genieacs_provision_ipv6(device_id: str, delegated_prefix: str, dns_primary: str, dns_secondary: str) -> bool:
    """
    Provisiona parámetros IPv6 en el CPE vía GenieACS.
    Usa TR181 (InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.)
    """
    params = [
        # TR181 IPv6 Address
        ("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.X_HUAWEI_IPv6Enable", "1", "xsd:boolean"),
        ("Device.IP.Interface.1.IPv6Prefix.1.Prefix",     delegated_prefix, "xsd:string"),
        ("Device.DNS.Client.Server.1.DNSServer",          dns_primary,       "xsd:string"),
        ("Device.DNS.Client.Server.2.DNSServer",          dns_secondary,     "xsd:string"),
        ("Device.DHCPv6.Client.1.Enable",                 "1",               "xsd:boolean"),
        ("Device.DHCPv6.Client.1.RequestAddresses",       "1",               "xsd:boolean"),
        ("Device.DHCPv6.Client.1.RequestPrefixes",        "1",               "xsd:boolean"),
    ]
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            body = {"name": "setParameterValues", "parameterValues": params}
            r = await c.post(f"{GENIEACS_NBI}/devices/{device_id}/tasks?connection_request", json=body)
            return r.status_code in (200, 201, 202)
    except Exception as e:
        logger.error("GenieACS provision error", device=device_id, error=str(e))
        return False


# ── Endpoints ─────────────────────────────────────────────────

class ProvisionRequest(BaseModel):
    device_id: str
    delegated_prefix: str
    dns_primary: str = "2001:4860:4860::8888"
    dns_secondary: str = "2001:4860:4860::8844"
    wan_mode: str = "dhcpv6-pd"

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "tr069-ipv6", "genieacs": GENIEACS_NBI}

@app.post("/api/v1/tr069/provision-ipv6")
async def provision_ipv6(req: ProvisionRequest, db: AsyncSession = Depends(get_db)):
    """Provisiona IPv6 dual stack en un CPE/ONU vía GenieACS TR069."""
    ok = await genieacs_provision_ipv6(
        req.device_id, req.delegated_prefix, req.dns_primary, req.dns_secondary)
    if ok:
        tr069_provisions_ok.inc()
        # Actualizar BD
        await db.execute(text("""
            UPDATE subscriber_ipv6 SET status='active', updated_at=NOW()
            WHERE onu_serial=:serial
        """), {"serial": req.device_id})
        await db.commit()
        logger.info("TR069 IPv6 provisioned", device=req.device_id, prefix=req.delegated_prefix)
        return {"status": "success", "device": req.device_id, "prefix": req.delegated_prefix}
    else:
        tr069_provisions_fail.inc()
        raise HTTPException(status_code=503, detail="GenieACS provisioning failed")

@app.get("/api/v1/tr069/devices")
async def list_devices():
    """Lista dispositivos TR069 registrados en GenieACS."""
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{GENIEACS_NBI}/devices?projection=DeviceID,_lastInform,_registered")
            return {"status": "success", "data": r.json(), "total": len(r.json())}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"GenieACS no disponible: {str(e)}")

@app.get("/api/v1/tr069/templates/tr181-ipv6")
async def get_tr181_template(device_model: str = "generic", wan_mode: str = "dhcpv6-pd"):
    """Retorna el template TR181 de parámetros IPv6 para el modelo dado."""
    templates = {
        "dhcpv6-pd": [
            ("Device.DHCPv6.Client.1.Enable",           "1"),
            ("Device.DHCPv6.Client.1.RequestAddresses", "1"),
            ("Device.DHCPv6.Client.1.RequestPrefixes",  "1"),
            ("Device.IP.Interface.1.IPv6Enable",         "1"),
            ("Device.DNS.Client.Server.1.DNSServer",    "2001:4860:4860::8888"),
        ],
        "slaac": [
            ("Device.IP.Interface.1.IPv6Enable",   "1"),
            ("Device.IP.Interface.1.AutoIPv6Enable","1"),
        ],
        "pppoe-ipv6": [
            ("Device.PPP.Interface.1.IPCP.Enable",   "1"),
            ("Device.PPP.Interface.1.IPv6CP.Enable",  "1"),
        ],
    }
    return {"status": "success", "wan_mode": wan_mode,
            "parameters": templates.get(wan_mode, templates["dhcpv6-pd"])}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("TR069_IPV6_PORT", 8015)))
