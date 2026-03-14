# Remnawave Helm Chart

A Helm chart for deploying Remnawave - powerful proxy management panel built on Xray-core.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- PostgreSQL (external)
- Redis/ValKey (external)
- Persistent storage (local-path or similar)

## Installation

```bash
helm install remnawave ./remnawave -n infrastructure -f values.yaml
```

## Configuration

The following table lists the configurable parameters and their default values.

### Image Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `image.repository` | Remnawave image repository | `ghcr.io/remnawave/panel` |
| `image.tag` | Image tag | `latest` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |

### Service Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `service.type` | Service type | `ClusterIP` |
| `service.port` | Service port | `3000` |

### Panel Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `panel.adminEmail` | Admin email | `admin@example.com` |
| `panel.jwtSecret` | JWT secret | `` |

### Database Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `postgresql.external.host` | PostgreSQL host | `postgresql.db.svc.cluster.local` |
| `postgresql.external.port` | PostgreSQL port | `5432` |
| `postgresql.external.database` | Database name | `remnawave` |
| `postgresql.external.username` | Database user | `remnawave` |

### Redis Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `redis.external.host` | Redis host | `valkey-master.db.svc.cluster.local` |
| `redis.external.port` | Redis port | `6379` |

### Persistence

| Parameter | Description | Default |
|-----------|-------------|---------|
| `persistence.enabled` | Enable persistence | `true` |
| `persistence.storageClass` | Storage class | `local-path` |
| `persistence.size` | PVC size | `5Gi` |

## Features

- Xray-core based proxy management
- Multi-node support
- Traffic statistics
- User management
- Subscription support
- REST API
- Telegram bot integration

## Vault Secret Paths

```
secret/data/remnawave/database    # database.password
secret/data/remnawave/jwt         # jwtSecret
secret/data/remnawave/telegram    # bot token
```

## License

This Helm chart is open source and available under the MIT License.
