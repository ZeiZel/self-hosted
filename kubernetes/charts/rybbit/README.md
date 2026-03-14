# Rybbit Helm Chart

A Helm chart for deploying Rybbit - Self-hosted web analytics.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- PostgreSQL (external)
- ClickHouse (external)
- Persistent storage (local-path or similar)

## Installation

```bash
helm install rybbit ./rybbit -n data -f values.yaml
```

## Configuration

The following table lists the configurable parameters and their default values.

### Backend Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `backend.image.repository` | Backend image | `ghcr.io/rybbit-io/rybbit-backend` |
| `backend.image.tag` | Image tag | `latest` |
| `backend.service.port` | Service port | `3000` |
| `backend.service.targetPort` | Target port | `3001` |

### Client Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `backend.client.image.repository` | Client image | `ghcr.io/rybbit-io/rybbit-client` |
| `backend.client.image.tag` | Image tag | `latest` |
| `backend.client.service.port` | Service port | `3000` |
| `backend.client.service.targetPort` | Target port | `3002` |

### PostgreSQL Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `postgresql.enabled` | Use embedded PostgreSQL | `false` |
| `postgresql.external.host` | External PostgreSQL host | `postgresql.db.svc.cluster.local` |
| `postgresql.external.port` | PostgreSQL port | `5432` |
| `postgresql.auth.database` | Database name | `analytics` |

### ClickHouse Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `clickhouse.enabled` | Use embedded ClickHouse | `false` |
| `clickhouse.external.host` | External ClickHouse host | `clickhouse.db.svc.cluster.local` |
| `clickhouse.external.httpPort` | HTTP port | `8123` |
| `clickhouse.external.tcpPort` | TCP port | `9000` |

### Environment Variables

| Parameter | Description | Default |
|-----------|-------------|---------|
| `backend.env.NODE_ENV` | Node environment | `production` |
| `backend.env.DISABLE_SIGNUP` | Disable signup | `true` |

## Features

- Privacy-focused web analytics
- Simple and lightweight
- Real-time analytics
- No cookies required
- GDPR compliant
- Self-hosted

## Vault Secret Paths

```
secret/data/rybbit/database      # PostgreSQL password
secret/data/rybbit/clickhouse    # ClickHouse password
secret/data/rybbit/auth          # better-auth-secret
```

## License

This Helm chart is open source and available under the MIT License.
