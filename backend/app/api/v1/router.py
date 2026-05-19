from fastapi import APIRouter

from app.api.v1 import channels, clients, packages, streams, monitoring, auth, epg

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(channels.router, prefix="/channels", tags=["Channels"])
api_router.include_router(clients.router, prefix="/clients", tags=["Clients"])
api_router.include_router(packages.router, prefix="/packages", tags=["Packages"])
api_router.include_router(streams.router, prefix="/streams", tags=["Streams"])
api_router.include_router(monitoring.router, prefix="/monitoring", tags=["Monitoring"])
api_router.include_router(epg.router, prefix="/epg", tags=["EPG"])
