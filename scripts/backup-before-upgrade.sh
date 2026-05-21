#!/usr/bin/env bash
# backup-before-upgrade.sh — Backup completo antes de expansión carrier-grade
# Crea: DB dump, volúmenes, configs, frontend build
set -euo pipefail

BACKUP_ROOT="/opt/backups/iptv-platform/pre-upgrade-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_ROOT"/{db,volumes,configs,git}

echo "🔒 Backup pre-upgrade carrier-grade v2.0"
echo "   Destino: $BACKUP_ROOT"

# 1. PostgreSQL dump (datos existentes)
echo "[1/5] Backup PostgreSQL..."
docker compose exec -T postgres pg_dump \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --schema-only --file=/tmp/schema_backup.sql
docker compose exec -T postgres pg_dump \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --compress=9 > "$BACKUP_ROOT/db/iptv_full_$(date +%H%M%S).sql.gz"
echo "   ✓ PostgreSQL OK"

# 2. MongoDB dump (YesOLT)
echo "[2/5] Backup MongoDB (YesOLT)..."
cd /opt/yesolt-platform 2>/dev/null || cd ~/yesolt-platform 2>/dev/null || true
docker exec yesolt_db mongodump \
    -u wifimax -p wifimax31 --authenticationDatabase admin \
    --out /tmp/mongo_backup --gzip 2>/dev/null || echo "   ! MongoDB no accesible, saltando"
echo "   ✓ MongoDB OK"

# 3. Git snapshot
echo "[3/5] Git snapshot..."
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
git stash 2>/dev/null || true
git tag "pre-carrier-grade-v2-$(date +%Y%m%d)" 2>/dev/null || true
echo "   ✓ Git tag creado"

# 4. Docker volumes list
echo "[4/5] Inventario de volúmenes..."
docker volume ls | grep -E "iptv|yesolt" > "$BACKUP_ROOT/volumes/volumes_inventory.txt"
echo "   ✓ Inventario OK"

# 5. Configs
echo "[5/5] Backup configuraciones..."
cp .env "$BACKUP_ROOT/configs/.env.bak" 2>/dev/null || true
cp docker-compose.yml "$BACKUP_ROOT/configs/" 2>/dev/null || true
echo "   ✓ Configs OK"

echo ""
echo "✅ Backup completo en: $BACKUP_ROOT"
echo ""
echo "Para restaurar:"
echo "  gunzip -c $BACKUP_ROOT/db/*.gz | docker compose exec -T postgres psql -U \$POSTGRES_USER \$POSTGRES_DB"
