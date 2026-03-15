# Pangolin Server Helm Chart

Pangolin Server - VPN gateway with Traefik edge router for NAT traversal.

## Overview

This chart deploys the Pangolin Server stack on a VPS/gateway node that acts as the public entry point for your self-hosted infrastructure. It includes:

- **Traefik**: Edge router for HTTPS termination and Let's Encrypt certificates
- **Gerbil**: WireGuard orchestrator for VPN tunnel management
- **Pangolin**: Management UI and API for tunnel configuration

## Architecture

```
Internet --> VPS (Pangolin Server)
               |
               +-- Traefik (ports 80, 443)
               |     |
               +-- Gerbil (WireGuard port 51820)
               |     |
               +-----+-- WireGuard Tunnel --> Internal Cluster
                                                  |
                                                  +-- Traefik (NodePort 30080/30443)
                                                        |
                                                        +-- Services
```

## Prerequisites

1. A VPS node added to the Kubernetes cluster with the label:
   ```bash
   kubectl label node <vps-node> node-role.kubernetes.io/gateway=true
   ```

2. The VPS must have the following ports open:
   - 80 (HTTP)
   - 443 (HTTPS)
   - 51820 (WireGuard UDP)

3. DNS records pointing to the VPS public IP

## Installation

```bash
# Add to Helmfile releases
helmfile -e k8s apply --selector name=pangolin-server

# Or install directly
helm install pangolin-server ./charts/pangolin-server -n infrastructure
```

## Configuration

Key configuration values:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `pangolin.config.domain` | Base domain for routing | `vpn.example.com` |
| `pangolin.config.acmeEmail` | Email for Let's Encrypt | `ssl@example.com` |
| `gerbil.wireguard.network` | WireGuard network CIDR | `10.99.0.0/24` |
| `nodeSelector` | Node selector for gateway node | `node-role.kubernetes.io/gateway: "true"` |
| `hostNetwork` | Use host networking | `true` |

## WireGuard Network

The default WireGuard network is `10.99.0.0/24`:
- `10.99.0.1` - VPS gateway (Pangolin Server)
- `10.99.0.10-20` - Master nodes
- `10.99.0.21-50` - Worker nodes

## Integration with Pangolin Client

The Pangolin Client chart (deployed on internal cluster) connects to this server:

```yaml
# In pangolin client values
pangolin:
  serverEndpoint: "vpn.example.com"
  clientName: "k8s-cluster"
```

## Security Considerations

- This chart requires privileged containers for WireGuard
- Host networking is enabled for direct port access
- Ensure firewall rules are properly configured on the VPS

## Metrics

Prometheus metrics are exposed and can be scraped via ServiceMonitor.

## Troubleshooting

### WireGuard tunnel not connecting
1. Check firewall rules on VPS
2. Verify WireGuard keys are configured in Vault
3. Check Gerbil logs: `kubectl logs -l app.kubernetes.io/component=gerbil`

### Traefik not getting certificates
1. Verify DNS is pointing to VPS
2. Check ACME logs in Traefik
3. Ensure port 80 is accessible for HTTP challenge

## Related Charts

- `pangolin` (client) - Deploys on internal cluster nodes
- `traefik` - Internal cluster ingress controller
