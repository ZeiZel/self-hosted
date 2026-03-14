# Ghost Helm Chart

A Helm chart for deploying Ghost - Professional publishing platform for bloggers and content creators.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- MySQL/MariaDB database (external)
- Persistent storage (local-path or similar)

## Installation

```bash
helm install ghost ./ghost -n content -f values.yaml
```

## Configuration

The following table lists the configurable parameters and their default values.

### Image Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `image.repository` | Ghost image repository | `ghost` |
| `image.tag` | Image tag | `5.108.0` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |

### Service Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `service.type` | Service type | `ClusterIP` |
| `service.port` | Service port | `2368` |

### Ghost Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ghost.url` | Blog URL | `https://blog.local` |

### Database Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `database.host` | MySQL host | `mysql.db.svc.cluster.local` |
| `database.port` | MySQL port | `3306` |
| `database.name` | Database name | `ghost` |
| `database.user` | Database user | `ghost` |

### Mail Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `mail.transport` | Mail transport | `SMTP` |
| `mail.host` | SMTP host | `stalwart.social.svc.cluster.local` |
| `mail.port` | SMTP port | `587` |

### Persistence

| Parameter | Description | Default |
|-----------|-------------|---------|
| `persistence.enabled` | Enable persistence | `true` |
| `persistence.storageClass` | Storage class | `local-path` |
| `persistence.size` | PVC size | `10Gi` |

## Features

- Professional publishing platform
- SEO optimized
- Native memberships and subscriptions
- Newsletter support
- Themes and customization
- API access
- Integrations

## Vault Secret Paths

```
secret/data/ghost/database    # database.password
secret/data/ghost/mail        # mail.password
```

## License

This Helm chart is open source and available under the MIT License.
