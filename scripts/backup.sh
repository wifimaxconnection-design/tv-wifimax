#!/usr/bin/env bash
# backup.sh – Backup PostgreSQL and HLS data
set -euo pipefail

BACKUP_DIR="/opt/backups/iptv-platform"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/config"

echo "=== IPTV Platform Backup – $DATE ==="

# Database backup
echo "--- Backing up PostgreSQL ---"
docker compose exec -T postgres pg_dump \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --compress=9 \
    > "$BACKUP_DIR/db/iptv_${DATE}.sql.gz"

echo "  DB backup: $BACKUP_DIR/db/iptv_${DATE}.sql.gz"

# Config backup
echo "--- Backing up configuration ---"
tar czf "$BACKUP_DIR/config/config_${DATE}.tar.gz" \
    .env \
    docker-compose.yml \
    nginx/conf.d/ \
    monitoring/

echo "  Config backup: $BACKUP_DIR/config/config_${DATE}.tar.gz"

# Cleanup old backups
echo "--- Removing backups older than $RETENTION_DAYS days ---"
find "$BACKUP_DIR" -name "*.gz" -mtime +$RETENTION_DAYS -delete

echo "=== Backup complete ==="
du -sh "$BACKUP_DIR"
