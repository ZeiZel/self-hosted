---
sidebar_position: 1
---

# Traefik

Traefik is a modern reverse proxy and load balancer that makes deploying microservices easy.

## Features

- Automatic HTTPS with Let's Encrypt
- Service discovery
- Load balancing
- Circuit breakers
- Rate limiting
- Web UI dashboard

## Deployment

Traefik is typically deployed as part of the Kubernetes infrastructure.

### Kubernetes

```bash
helmfile -e k8s apply -l name=traefik
```

## Configuration

Traefik automatically discovers services via:
- Kubernetes Ingress
- Service annotations
- Gateway API

Access dashboard at:
- **URL:** `https://traefik.<your-domain>`

## Documentation

For more information, visit the [official Traefik documentation](https://doc.traefik.io/traefik/).

