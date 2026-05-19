from fastapi import APIRouter, Response
from datetime import datetime, timedelta

router = APIRouter()


@router.get("/xmltv")
async def get_xmltv():
    """Return XMLTV-compatible EPG XML. Extend with real EPG source."""
    now = datetime.utcnow()
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<!DOCTYPE tv SYSTEM "xmltv.dtd">\n'
    xml += '<tv generator-info-name="IPTV Platform EPG">\n'
    xml += '  <!-- Channels and programmes populated from database -->\n'
    xml += '</tv>'
    return Response(content=xml, media_type="application/xml")
