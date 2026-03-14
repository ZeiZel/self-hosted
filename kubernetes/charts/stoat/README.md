# Stoat Helm Chart

A Helm chart for deploying Stoat (Revolt) - Self-hosted chat platform.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- MongoDB (external)
- Redis/ValKey (external)
- MinIO/S3 (external)
- RabbitMQ (optional)

## Installation

```bash
helm install stoat ./stoat -n social -f values.yaml
```

## Components

Stoat deploys the following Revolt components:

- **Web** - Frontend client
- **API** - Backend API server
- **Bonfire** - Events/WebSocket service
- **Autumn** - File server
- **January** - Metadata proxy

## Configuration

The following table lists the configurable parameters and their default values.

### Global Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `global.namespace` | Deployment namespace | `social` |
| `global.domain` | Domain name | `` |
| `global.web.port` | Web port | `5000` |
| `global.api.port` | API port | `14702` |

### External Services

| Parameter | Description | Default |
|-----------|-------------|---------|
| `global.subcharts.mongo.connection_url` | MongoDB URL | `` |
| `global.subcharts.redis.connection_url` | Redis URL | `` |
| `global.subcharts.minio.connection_url` | MinIO URL | `` |

### Component Images

| Parameter | Description | Default |
|-----------|-------------|---------|
| `web.image.repository` | Web image | `ghcr.io/revoltchat/client` |
| `api.image.repository` | API image | `ghcr.io/revoltchat/server` |
| `bonfire.image.repository` | Bonfire image | `ghcr.io/revoltchat/bonfire` |
| `autumn.image.repository` | Autumn image | `ghcr.io/revoltchat/autumn` |
| `january.image.repository` | January image | `ghcr.io/revoltchat/january` |

### Secrets

| Parameter | Description | Default |
|-----------|-------------|---------|
| `global.secret.vapid_key` | VAPID private key | `` |
| `global.secret.vapid_public_key` | VAPID public key | `` |
| `global.secret.encryption_key` | Encryption key | `` |

## Features

- Self-hosted Discord alternative
- End-to-end encryption
- Voice channels
- File uploads
- Bot support
- Federation support

## Vault Secret Paths

```
secret/data/stoat/vapid         # VAPID keys
secret/data/stoat/encryption    # encryption_key
secret/data/stoat/mongodb       # connection string
secret/data/stoat/minio         # S3 credentials
```

## Dependencies

- MongoDB for data storage
- Redis for caching and sessions
- MinIO for file storage
- RabbitMQ for message queuing (optional)

## License

This Helm chart is open source and available under the MIT License.
