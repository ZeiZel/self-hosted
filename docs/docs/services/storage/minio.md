---
sidebar_position: 3
---

# MinIO

MinIO is a high-performance, S3-compatible object storage service.

## Features

- S3-compatible API
- High performance
- Distributed mode support
- Encryption at rest
- Lifecycle management

## Deployment

### Docker Compose

```bash
cd docker/minio
docker-compose up -d
```

### Kubernetes

```bash
helmfile -e k8s apply -l name=minio
```

## Configuration

Default credentials (change in production):
- **Access Key:** minioautumn
- **Secret Key:** minioautumn

Access at:
- **Console:** `http://localhost:9001` (Docker) or `https://minio.<your-domain>` (Kubernetes)
- **API:** `http://localhost:9000`

## Usage

MinIO is used by other services (Stoat, Notesnook) for object storage. It can also be used directly via S3 API.

## Documentation

For more information, visit the [official MinIO documentation](https://min.io/docs/).

