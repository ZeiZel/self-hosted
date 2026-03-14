# n8n Helm Chart

A Helm chart for deploying n8n - Workflow Automation Tool.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- PostgreSQL (external)
- Redis/ValKey (optional, for queue mode)
- Persistent storage (local-path or similar)

## Installation

```bash
helm install n8n ./n8n -n automation -f values.yaml
```

## Configuration

The following table lists the configurable parameters and their default values.

### Image Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `image.repository` | n8n image repository | `n8nio/n8n` |
| `image.tag` | Image tag | `1.70.0` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |

### Service Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `service.type` | Service type | `ClusterIP` |
| `service.port` | Service port | `5678` |

### n8n Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `n8n.webhookUrl` | Webhook URL | `https://n8n.local` |
| `n8n.timezone` | Timezone | `Europe/Moscow` |
| `n8n.executions.pruneData` | Prune old executions | `true` |

### Database Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `database.type` | Database type | `postgresdb` |
| `database.host` | PostgreSQL host | `postgresql.db.svc.cluster.local` |
| `database.port` | PostgreSQL port | `5432` |
| `database.name` | Database name | `n8n` |
| `database.user` | Database user | `n8n` |

### Queue Mode (Optional)

| Parameter | Description | Default |
|-----------|-------------|---------|
| `queue.enabled` | Enable queue mode | `false` |
| `redis.host` | Redis host | `valkey-master.db.svc.cluster.local` |
| `redis.port` | Redis port | `6379` |

### Persistence

| Parameter | Description | Default |
|-----------|-------------|---------|
| `persistence.enabled` | Enable persistence | `true` |
| `persistence.storageClass` | Storage class | `local-path` |
| `persistence.size` | PVC size | `5Gi` |

## Features

- Visual workflow builder
- 400+ integrations
- Custom code execution
- Webhook support
- Cron scheduling
- Queue mode for scaling
- Execution history
- Template library

## Vault Secret Paths

```
secret/data/n8n/database      # db.password
secret/data/n8n/encryption    # encryptionKey
secret/data/n8n/credentials   # various API keys
```

## License

This Helm chart is open source and available under the MIT License.
