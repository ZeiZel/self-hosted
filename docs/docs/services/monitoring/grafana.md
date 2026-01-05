---
sidebar_position: 1
---

# Grafana

Grafana is an open-source analytics and monitoring platform.

## Features

- Beautiful dashboards
- Multiple data sources
- Alerting
- User management
- Plugin ecosystem

## Deployment

### Docker Compose

```bash
cd docker/monitoring
docker-compose up -d
```

### Kubernetes

```bash
helmfile -e k8s apply -l name=monitoring
```

## Configuration

Default credentials:
- **Username:** admin
- **Password:** admin (change on first login)

Access at:
- **URL:** `http://localhost:3000` (Docker) or `https://grafana.<your-domain>` (Kubernetes)

## Data Sources

Grafana is pre-configured with:
- Prometheus (metrics)
- Loki (logs)

## Documentation

For more information, visit the [official Grafana documentation](https://grafana.com/docs/grafana/).

