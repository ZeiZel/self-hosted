# AFFiNE Helm Chart

A Helm chart for deploying AFFiNE, an open-source knowledge base platform.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- PostgreSQL (external)
- Redis/ValKey (external)
- S3-compatible storage (Minio)

## Installation

```bash
helm install affine ./affine -f values.yaml
```

## Configuration

The following table lists the configurable parameters and their default values.

### Image Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `image.repository` | AFFiNE image repository | `ghcr.io/toeverything/affine-graphql` |
| `image.tag` | Image tag | `stable` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |

### Service Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `service.type` | Service type | `ClusterIP` |
| `service.port` | Service port | `3010` |

### Database Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `postgresql.external.host` | PostgreSQL host | `postgresql.db.svc.cluster.local` |
| `postgresql.external.port` | PostgreSQL port | `5432` |
| `postgresql.external.username` | PostgreSQL username | `affine` |
| `postgresql.external.database` | PostgreSQL database | `affine` |

### Redis Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `redis.external.host` | Redis host | `valkey-master.db.svc.cluster.local` |
| `redis.external.port` | Redis port | `6379` |

### S3 Storage Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `s3.endpoint` | S3 endpoint | `http://minio.db.svc.cluster.local:9000` |
| `s3.bucket` | S3 bucket name | `affine` |
| `s3.region` | S3 region | `us-east-1` |

### Persistence

| Parameter | Description | Default |
|-----------|-------------|---------|
| `persistence.enabled` | Enable persistence | `true` |
| `persistence.size` | PVC size | `10Gi` |
| `persistence.storageClass` | Storage class | `openebs-hostpath` |

## Features

- Full integration with external PostgreSQL
- Redis/ValKey support for caching
- S3-compatible storage (Minio)
- Consul service discovery
- Ingress support with Traefik
- Configurable authentication
- Health checks and probes
- Resource limits and requests

## Dependencies

This chart requires the following external services:
- PostgreSQL database
- Redis/ValKey cache
- S3-compatible storage (Minio)

## License

This Helm chart is open source and available under the MIT License.
