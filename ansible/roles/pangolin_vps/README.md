# Pangolin VPS Docker Role

Deploys Pangolin VPN Server as a Docker Compose stack on the VPS gateway. This is an alternative approach when the VPS is not part of the Kubernetes cluster.

## Architecture

```
Internet --> VPS (80.90.178.207)
               |
               +-- Docker Compose Stack:
               |     - Traefik (HTTPS termination, Let's Encrypt)
               |     - Pangolin (VPN management API)
               |     - Gerbil (WireGuard orchestrator)
               |
               | WireGuard Tunnel (UDP 51820)
               |
               v
           K8s Cluster
               |
               +-- Newt Client Pod (connects to Pangolin)
               |
               v
           Cluster Traefik --> Services
```

## Requirements

- Docker and Docker Compose installed on VPS
- UFW firewall (optional, for Debian/Ubuntu)
- Ansible Vault with VPN secrets configured

## Role Variables

### Required (from Ansible Vault)

```yaml
vpn:
  pangolin:
    server_private_key: "WireGuard server private key"
    server_public_key: "WireGuard server public key"
    preshared_key: "Shared secret for Pangolin"

domain:
  public: "example.com"

tls:
  letsencrypt:
    email: "admin@example.com"
```

### Optional (with defaults)

```yaml
# Version pinning
pangolin_version: "1.3.1"
gerbil_version: "1.1.0"
traefik_version: "3.2"

# Paths
pangolin_base_dir: "/opt/pangolin"

# WireGuard
wireguard_port: 51820
wireguard_network: "10.99.0.0/24"

# Ports
traefik_http_port: 80
traefik_https_port: 443
traefik_admin_port: 3001
```

## Usage

### Deploy to VPS

```bash
# Deploy only Pangolin VPS role
ansible-playbook -i inventory/hosts.ini all.yml \
  --tags pangolin-vps \
  --limit gateway \
  --vault-password-file ~/.ansible_vault_password
```

### Verify Deployment

```bash
# SSH to VPS and check status
ssh root@80.90.178.207

# Check containers
docker compose -f /opt/pangolin/docker-compose.yml ps

# Check logs
docker compose -f /opt/pangolin/docker-compose.yml logs -f

# Test WireGuard
wg show
```

### Access Admin UI

After deployment, access the Pangolin admin interface at:
- URL: `https://pangolin.your-domain.com`
- Default credentials are generated during deployment

## Files Created

```
/opt/pangolin/
  docker-compose.yml      # Docker Compose stack definition
  .env                    # Environment variables (secrets)
  config/
    config.yml            # Pangolin configuration
  data/                   # Persistent data
  traefik/
    traefik.yml           # Traefik static config
    dynamic/
      cluster.yml         # Dynamic routing to cluster
  letsencrypt/
    acme.json             # Let's Encrypt certificates

/etc/systemd/system/
  pangolin-docker.service # Systemd service for boot startup
```

## Exposed Ports

| Port | Protocol | Service |
|------|----------|---------|
| 80 | TCP | HTTP (redirects to HTTPS) |
| 443 | TCP | HTTPS (Traefik) |
| 51820 | UDP | WireGuard VPN |
| 3001 | TCP | Pangolin Admin UI (via Traefik) |

## Cluster Client Setup

After deploying the VPS server, configure the cluster Newt client to connect:

1. The Newt client pod in Kubernetes connects to `pangolin.your-domain.com`
2. Traffic flows: Internet -> VPS Traefik -> WireGuard -> Cluster Traefik -> Services

## Troubleshooting

### Containers not starting

```bash
# Check Docker logs
docker compose -f /opt/pangolin/docker-compose.yml logs pangolin
docker compose -f /opt/pangolin/docker-compose.yml logs traefik

# Check systemd service
systemctl status pangolin-docker
journalctl -u pangolin-docker -f
```

### Certificate issues

```bash
# Check ACME storage
cat /opt/pangolin/letsencrypt/acme.json | jq .

# Force certificate renewal
docker compose -f /opt/pangolin/docker-compose.yml restart traefik
```

### WireGuard tunnel not establishing

```bash
# Check WireGuard interface
wg show

# Check firewall
ufw status
iptables -L -n

# Check Gerbil logs
docker logs gerbil
```

## Handlers

- `restart pangolin-docker` - Restarts the entire Docker Compose stack
- `reload systemd` - Reloads systemd daemon

## Tags

- `pangolin-vps` - All tasks
- `prereq` - Prerequisites check
- `sysctl` - System configuration
- `dirs` - Directory creation
- `secrets` - Secret loading
- `config` - Configuration deployment
- `firewall` - UFW configuration
- `docker` - Docker network setup
- `deploy` - Container deployment
- `systemd` - Systemd service
- `verify` - Verification tasks

## Author

Self-Hosted Infrastructure Team
