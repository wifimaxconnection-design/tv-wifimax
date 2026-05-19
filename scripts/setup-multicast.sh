#!/usr/bin/env bash
# setup-multicast.sh – Configure multicast routing on Ubuntu
set -euo pipefail

INTERFACE="${1:-eth0}"

echo "=== Configuring multicast on interface: $INTERFACE ==="

# Enable multicast on interface
sudo ip link set "$INTERFACE" multicast on

# Add multicast route
sudo ip route add 224.0.0.0/4 dev "$INTERFACE" || echo "Route may already exist"

# Increase socket receive buffer for high-bitrate multicast
echo "net.core.rmem_max=33554432" | sudo tee -a /etc/sysctl.conf
echo "net.core.rmem_default=8388608" | sudo tee -a /etc/sysctl.conf
echo "net.ipv4.conf.all.mc_forwarding=1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Persist multicast route via netplan (adjust YAML for your setup)
echo ""
echo "=== Add this to /etc/netplan/01-netcfg.yaml for persistence: ==="
cat <<EOF
      routes:
        - to: 224.0.0.0/4
          via: 0.0.0.0
          on-link: true
EOF

echo "=== Multicast configured on $INTERFACE ==="
