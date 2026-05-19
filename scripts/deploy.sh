#!/usr/bin/env bash
# deploy.sh – Full platform deployment script
set -euo pipefail

COMPOSE_CMD="docker compose"
ENV_FILE=".env"

echo "=== IPTV Platform Deployment ==="
echo "Date: $(date)"

# Check prerequisites
command -v docker >/dev/null || { echo "ERROR: Docker not found"; exit 1; }
command -v docker >/dev/null && docker compose version >/dev/null || { echo "ERROR: Docker Compose v2 required"; exit 1; }

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env file not found. Run: cp .env.example .env"
    exit 1
fi

# Verify GPU access
echo "--- Checking GPU access ---"
if docker run --rm --gpus all nvidia/cuda:12.3.2-base-ubuntu22.04 nvidia-smi &>/dev/null; then
    echo "  GPU: OK"
else
    echo "  WARNING: GPU not accessible – transcoder will not work"
fi

# Pull latest images (if using registry)
echo "--- Pulling images ---"
$COMPOSE_CMD pull --ignore-pull-failures 2>/dev/null || true

# Build local images
echo "--- Building images ---"
$COMPOSE_CMD build --parallel

# Start infrastructure first
echo "--- Starting infrastructure (Postgres, Redis) ---"
$COMPOSE_CMD up -d postgres redis
echo "  Waiting for Postgres..."
until $COMPOSE_CMD exec -T postgres pg_isready -U iptv_user; do
    sleep 2
done

# Run DB migrations
echo "--- Running database migrations ---"
$COMPOSE_CMD run --rm backend alembic upgrade head

# Start all services
echo "--- Starting all services ---"
$COMPOSE_CMD up -d

# Wait and health check
echo "--- Waiting for services (30s) ---"
sleep 30

echo "--- Health check ---"
bash scripts/health-check.sh

echo ""
echo "=== Deployment complete ==="
echo "  Dashboard:  http://$(hostname -I | awk '{print $1}')/"
echo "  API Docs:   http://$(hostname -I | awk '{print $1}')/api/docs"
echo "  Grafana:    http://$(hostname -I | awk '{print $1}'):3001/"
echo "  Prometheus: http://$(hostname -I | awk '{print $1}'):9090/"
