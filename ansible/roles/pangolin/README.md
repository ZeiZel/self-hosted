# Pangolin VPN Role

Ansible role for deploying Pangolin WireGuard VPN infrastructure with dual-mode support: gateway (VPS server) and node (cluster clients).

## Overview

This role automates the deployment of a WireGuard-based VPN tunnel using:
- **Pangolin Server** - WireGuard VPN server (gateway mode)
- **Gerbil** - WireGuard interface orchestrator (gateway mode)
- **Traefik** - Edge router for HTTP/HTTPS traffic (gateway mode)
- **Newt** - WireGuard VPN client (node mode)

## Architecture

```
Internet → Gateway VPS (Pangolin + Traefik) → VPN Tunnel → K8s Cluster Nodes (Newt)
                                                  ↓
                                           WireGuard Network
                                            10.99.0.0/24
```

## Requirements

- Ansible 2.20.1 or higher
- Ubuntu 22.04/24.04 or Debian 11/12
- Root access on target hosts
- WireGuard kernel module support

## Role Variables

### Required Variables (in `group_vars/all/vault.yml`)

```yaml
vault:
  vpn:
    pangolin:
      server_private_key: 'WireGuard private key'
      server_public_key: 'WireGuard public key'
      preshared_key: 'WireGuard preshared key'
      client_keys:
        hostname:
          private_key: 'Client WireGuard private key'
          public_key: 'Client WireGuard public key'
```

### Defaults (in `defaults/main.yml`)

```yaml
# Mode: 'gateway' or 'node'
pangolin_mode: "node"

# Versions
pangolin_version: "1.15.0"
gerbil_version: "1.3.0"
traefik_version: "v3.4.0"
newt_version: "1.2.0"

# Network
wireguard_network: "10.99.0.0/24"
wireguard_server_ip: "10.99.0.1"
wireguard_port: 51820
```

## Dependencies

None.

## Example Playbook

### Gateway Deployment (VPS)

```yaml
- hosts: gateway
  roles:
    - role: pangolin
      vars:
        pangolin_mode: gateway
```

### Node Deployment (K8s Cluster)

```yaml
- hosts: k8s_masters:k8s_workers
  roles:
    - role: pangolin
      vars:
        pangolin_mode: node
```

## Inventory Configuration

### gateway.ini

```ini
[gateway]
vps-gateway ansible_host=80.90.178.207 ansible_user=root

[gateway:vars]
pangolin_mode=gateway
```

### master.ini

```ini
[k8s_masters]
master-1 ansible_host=192.168.100.10 ansible_user=root

[k8s_masters:vars]
pangolin_mode=node
```

### node.ini

```ini
[k8s_workers]
worker-1 ansible_host=192.168.100.11 ansible_user=root
worker-2 ansible_host=192.168.100.12 ansible_user=root

[k8s_workers:vars]
pangolin_mode=node
```

## Tags

- `pangolin` - All tasks
- `common` - Common setup tasks
- `gateway` - Gateway-specific tasks
- `node` - Node-specific tasks
- `packages` - Package installation
- `sysctl` - Kernel parameters
- `firewall` - UFW configuration
- `directories` - Directory creation
- `download` - Binary downloads
- `install` - Binary installation
- `config` - Configuration deployment
- `systemd` - Systemd unit management
- `service` - Service management
- `iptables` - IPtables NAT rules (gateway only)
- `verify` - Deployment verification

## Usage Examples

### Deploy Gateway Only

```bash
ansible-playbook -i inventory/gateway.ini all.yml --tags pangolin,gateway
```

### Deploy Nodes Only

```bash
ansible-playbook -i inventory/master.ini,inventory/node.ini all.yml --tags pangolin,node
```

### Deploy All

```bash
ansible-playbook -i inventory/hosts.ini all.yml --tags pangolin
```

### Verify Tunnel Connectivity

From a node:
```bash
ping 10.99.0.1  # Gateway server IP
```

From gateway:
```bash
systemctl status pangolin gerbil traefik
wg show
```

From node:
```bash
systemctl status newt
wg show
```

## WireGuard Key Generation

Generate keys for Vault:

```bash
# Server keys
wg genkey | tee server.key | wg pubkey > server.pub

# Client keys (per host)
wg genkey | tee client-host1.key | wg pubkey > client-host1.pub

# Preshared key (shared across all peers)
wg genpsk > preshared.key
```

## IP Address Allocation

The role automatically assigns WireGuard IPs:
- Gateway: `10.99.0.1`
- K8s Masters: `10.99.0.10-19` (based on inventory position)
- K8s Workers: `10.99.0.20-29` (based on inventory position)

## Firewall Rules

### Gateway (VPS)
- TCP: 22 (SSH), 80 (HTTP), 443 (HTTPS)
- UDP: 51820 (WireGuard)

### Nodes (Cluster)
- TCP: 22 (SSH)
- UDP: 51820 (WireGuard)

## Files and Templates

### Tasks
- `main.yml` - Task router
- `common.yml` - Common setup for gateway/nodes
- `gateway.yml` - Gateway deployment
- `node.yml` - Node deployment

### Templates (Gateway)
- `pangolin-config.yaml.j2` - Pangolin server config
- `traefik-gateway.yml.j2` - Traefik edge router config
- `pangolin-server.service.j2` - Systemd unit
- `gerbil.service.j2` - Systemd unit
- `traefik.service.j2` - Systemd unit

### Templates (Node)
- `newt-config.yaml.j2` - Newt client config
- `newt.service.j2` - Systemd unit

## Troubleshooting

### Tunnel Not Connecting

Check systemd service status:
```bash
systemctl status pangolin  # Gateway
systemctl status newt      # Node
```

Check WireGuard interface:
```bash
wg show
ip addr show wg0
```

Check logs:
```bash
journalctl -u pangolin -f  # Gateway
journalctl -u newt -f      # Node
```

### Firewall Issues

Check UFW status:
```bash
ufw status verbose
```

Check iptables NAT (gateway):
```bash
iptables -t nat -L -n -v
```

### DNS Resolution Issues

Check resolv.conf:
```bash
cat /etc/resolv.conf
```

Test DNS:
```bash
nslookup kubernetes.default.svc.cluster.local
```

## License

MIT

## Author

Lvov Valery
