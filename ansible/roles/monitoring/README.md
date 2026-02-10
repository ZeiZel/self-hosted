# Monitoring Role

Verifies and configures the monitoring stack (Prometheus, Grafana, Loki).

## Overview

This role:
- Verifies Prometheus is scraping targets
- Checks Grafana dashboards are loaded
- Validates Loki log collection
- Configures alerting rules

## Requirements

- Kubernetes cluster running
- Monitoring stack deployed via Helm
- kubectl configured on control node

## Role Variables

See `defaults/main.yml` for full list:

| Variable | Description |
|----------|-------------|
| `prometheus_namespace` | Prometheus namespace |
| `grafana_namespace` | Grafana namespace |
| `alertmanager_enabled` | Enable Alertmanager configuration |
| `slack_webhook_url` | Slack webhook for alerts |

## Components

Deployed via the monitoring Helm chart:
- **Prometheus** - Metrics collection (30s scrape interval)
- **Grafana** - Dashboards and visualization
- **Loki** - Log aggregation
- **Promtail** - Log collection
- **Alertmanager** - Alert routing

## Dependencies

- `infrastructure` role (deploys monitoring)
- Vault (for credentials)

## Example Playbook

```yaml
- hosts: k8s_masters
  roles:
    - monitoring
  tags: [monitoring]
```

## Tags

- `monitoring` - Run all monitoring tasks
- `monitoring, verify` - Verify monitoring stack
- `monitoring, alerts` - Configure alerting

## Alerting

Default alert rules:
- NodeDown (critical): Node offline > 5min
- PodCrashLooping (warning): Restarts > 0 in 15min
- PVFillingUp (warning): PV < 10% free

## Dashboards

Pre-configured Grafana dashboards:
- Kubernetes cluster overview
- Node Exporter metrics
- Traefik ingress
- PostgreSQL database
