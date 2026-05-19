#!/usr/bin/env bash
# health-check.sh – Verify all services are healthy
set -euo pipefail

SERVICES=(
    "backend:8000:/health"
    "auth:8004:/health"
    "ingest:8001:/health"
    "transcoder:8002:/health"
    "packager:8003:/health"
    "odoo_connector:8005:/health"
)

ALL_OK=true

echo "=== Service Health Check ==="
for entry in "${SERVICES[@]}"; do
    IFS=':' read -r name port path <<< "$entry"
    url="http://localhost:${port}${path}"
    if curl -sf "$url" >/dev/null 2>&1; then
        echo "  [OK] $name ($url)"
    else
        echo "  [FAIL] $name ($url)"
        ALL_OK=false
    fi
done

echo ""
echo "=== GPU Status ==="
docker compose exec transcoder nvidia-smi --query-gpu=name,temperature.gpu,utilization.encoder,memory.used,memory.total --format=csv,noheader 2>/dev/null \
    || echo "  GPU query unavailable"

echo ""
echo "=== Container Status ==="
docker compose ps

if $ALL_OK; then
    echo ""
    echo "All services healthy!"
    exit 0
else
    echo ""
    echo "Some services are unhealthy. Check: docker compose logs <service>"
    exit 1
fi
