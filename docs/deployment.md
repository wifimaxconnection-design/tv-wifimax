# Deployment Guide

## Ubuntu Server 24.04 LTS – Production Setup

### 1. System Preparation

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git net-tools htop iotop nvtop

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version
```

### 2. NVIDIA Driver + CUDA

```bash
# Install NVIDIA driver
sudo apt install -y nvidia-driver-545 nvidia-utils-545

# Verify
nvidia-smi

# Install CUDA Toolkit (for NVENC queries)
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt update
sudo apt install -y cuda-toolkit-12-3
```

### 3. NVIDIA Container Toolkit

```bash
bash scripts/setup-nvidia.sh
# Or manually:
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
    sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update && sudo apt install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### 4. Multicast Network Configuration

```bash
# Enable multicast routing
sudo ip route add 224.0.0.0/4 dev eth0

# Or permanently via netplan
sudo nano /etc/netplan/01-netcfg.yaml
```

```yaml
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: no
      addresses: [192.168.1.10/24]
      gateway4: 192.168.1.1
      nameservers:
        addresses: [8.8.8.8]
      routes:
        - to: 224.0.0.0/4
          via: 0.0.0.0
          on-link: true
```

```bash
sudo netplan apply
```

### 5. Platform Deployment

```bash
git clone https://github.com/your-org/iptv-platform.git
cd iptv-platform

# Copy and edit environment
cp .env.example .env
nano .env

# Initialize DB
docker compose up -d postgres redis
sleep 10
docker compose run --rm backend alembic upgrade head

# Start all services
docker compose up -d

# Verify GPU access
docker compose exec transcoder nvidia-smi
```

### 6. SSL with Let's Encrypt

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d your-domain.com

# Copy certs to nginx
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/certs/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/certs/

# Auto-renew
sudo crontab -e
# Add: 0 3 * * * certbot renew --quiet && docker compose restart nginx
```

### 7. Health Check

```bash
bash scripts/health-check.sh
```

## Multi-GPU Configuration

Edit `docker-compose.prod.yml`:
```yaml
transcoder:
  deploy:
    replicas: 2
    resources:
      reservations:
        devices:
          - driver: nvidia
            device_ids: ["0", "1"]
            capabilities: [gpu, video]
```

## Backup

```bash
# Automated backup (runs daily at 2 AM)
crontab -e
# Add: 0 2 * * * /opt/iptv-platform/scripts/backup.sh
```

## Monitoring

- Grafana: `https://your-domain.com/grafana`
- Prometheus: internal only (`localhost:9090`)
- Logs: `docker compose logs -f <service>`
