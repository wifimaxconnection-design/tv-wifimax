#!/usr/bin/env bash
# provision-grafana.sh – Provisiona datasource Prometheus y dashboard IPTV en Grafana
# Uso: bash scripts/provision-grafana.sh [grafana_url] [user:password]
set -euo pipefail

GRAFANA_URL="${1:-http://localhost:3001}"
CREDS="${2:-admin:admin123}"
DASH_FILE="$(dirname "$0")/../monitoring/grafana/dashboards/iptv-platform.json"

echo "=== Provisionando Grafana en $GRAFANA_URL ==="

# Esperar que Grafana esté listo
for i in $(seq 1 30); do
  if curl -sf "$GRAFANA_URL/api/health" -u "$CREDS" >/dev/null 2>&1; then
    echo "  Grafana listo"
    break
  fi
  echo "  Esperando Grafana ($i/30)..."
  sleep 3
done

# Crear datasource Prometheus
echo "--- Creando datasource Prometheus ---"
curl -sf -X POST "$GRAFANA_URL/api/datasources" \
  -u "$CREDS" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Prometheus",
    "type": "prometheus",
    "url": "http://prometheus:9090",
    "access": "proxy",
    "isDefault": true,
    "jsonData": { "timeInterval": "10s" }
  }' 2>/dev/null && echo "  Datasource creado" || echo "  Datasource ya existe"

# Obtener UID del datasource
DS_UID=$(curl -sf "$GRAFANA_URL/api/datasources/name/Prometheus" -u "$CREDS" | \
  grep -o '"uid":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "  Datasource UID: $DS_UID"

# Importar dashboard
echo "--- Importando dashboard IPTV ---"
DASH_CONTENT=$(cat "$DASH_FILE" | \
  sed "s|\\\${datasource}|$DS_UID|g" | \
  sed '/"__inputs"/,/\]/d' | \
  sed '/"__requires"/,/\]/d')

PAYLOAD="{\"dashboard\": $DASH_CONTENT, \"overwrite\": true, \"folderId\": 0}"

RESULT=$(curl -sf -X POST "$GRAFANA_URL/api/dashboards/db" \
  -u "$CREDS" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

URL=$(echo "$RESULT" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
echo "  Dashboard importado"
echo "  URL: $GRAFANA_URL$URL"

echo ""
echo "=== Provisioning completo ==="
echo "  Abrí: $GRAFANA_URL/d/iptv-main"
