# Pangolin Client Helm Chart

Pangolin VPN client (Newt) - connects internal Kubernetes cluster to Pangolin Server gateway for NAT traversal.

## Overview

This chart deploys the Newt client, which establishes a tunnel from your internal cluster to the Pangolin Server running on a public VPS. This allows external access to services behind NAT without port forwarding.

## Architecture

```
Internal Cluster                              VPS Gateway
+------------------+                          +------------------+
|  Newt Client     | -------- Tunnel -------> |  Pangolin Server |
|  (this chart)    |                          |  Traefik + Gerbil|
+------------------+                          +------------------+
        |                                              |
        v                                              v
+------------------+                          Internet Traffic
|  Cluster Traefik |
|  (NodePort)      |
+------------------+
        |
        v
    Services
```

## Prerequisites

1. Pangolin Server deployed on VPS gateway node (see `pangolin-server` chart)
2. DNS configured to point to VPS public IP
3. Client credentials configured in Vault

## Installation

```bash
# Add to Helmfile releases
helmfile -e k8s apply --selector name=pangolin

# Or install directly
helm install pangolin ./charts/pangolin -n infrastructure
```

## Configuration

Key configuration values:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `pangolin.serverEndpoint` | Pangolin Server domain | `vpn.example.com` |
| `pangolin.clientName` | Client identification | `k8s-cluster` |
| `pangolin.mode` | Tunnel mode (newt/wireguard) | `newt` |
| `image.tag` | Newt client version | `1.10.0` |

## Tunnel Modes

### Newt Mode (Default)
- HTTP-based tunnel
- Works through firewalls and proxies
- Lower overhead for HTTP traffic

### WireGuard Mode
- UDP-based tunnel
- Better for general traffic
- Requires UDP port access

## Exposed Services

By default, the client exposes cluster Traefik to the gateway:

```yaml
tunnel:
  services:
    - name: traefik-http
      local_address: "traefik.ingress.svc.cluster.local"
      local_port: 80
      remote_port: 80

    - name: traefik-https
      local_address: "traefik.ingress.svc.cluster.local"
      local_port: 443
      remote_port: 443
```

## Integration with Pangolin Server

The client connects to the server using the configured endpoint:

```yaml
# In release values
pangolin:
  serverEndpoint: "vpn.example.com"  # Must match server domain
  clientName: "k8s-cluster"
```

## Troubleshooting

### Client not connecting
1. Verify server is reachable: `curl https://vpn.example.com/api/v1/`
2. Check client logs: `kubectl logs -l app.kubernetes.io/name=pangolin-client`
3. Verify Vault credentials are injected

### Traffic not routing
1. Check tunnel status in Pangolin Server UI
2. Verify cluster Traefik is running
3. Check NetworkPolicy allows egress to server

## Related Charts

- `pangolin-server` - Deploys on VPS gateway node
- `traefik` - Internal cluster ingress controller
