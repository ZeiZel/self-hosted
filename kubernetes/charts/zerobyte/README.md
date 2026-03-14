# Zerobyte Helm Chart

A Helm chart for deploying Zerobyte - Web UI for Restic backups with S3/NFS backend support.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- S3-compatible storage (MinIO) or NFS
- Persistent storage (local-path or similar)

## Installation

```bash
helm install zerobyte ./zerobyte -n infrastructure -f values.yaml
```

## Configuration

The following table lists the configurable parameters and their default values.

### Image Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `image.repository` | Zerobyte image repository | `kiwimato/zerobyte` |
| `image.tag` | Image tag | `latest` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |

### Service Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `service.type` | Service type | `ClusterIP` |
| `service.port` | Service port | `8000` |

### Restic Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `restic.repository` | Restic repository path | `s3:http://minio:9000/backups` |
| `restic.password` | Repository password | `` |

### S3 Backend Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `s3.enabled` | Use S3 backend | `true` |
| `s3.endpoint` | S3 endpoint | `minio.db.svc.cluster.local:9000` |
| `s3.bucket` | S3 bucket | `backups` |
| `s3.accessKey` | S3 access key | `` |
| `s3.secretKey` | S3 secret key | `` |

### NFS Backend Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `nfs.enabled` | Use NFS backend | `false` |
| `nfs.server` | NFS server | `` |
| `nfs.path` | NFS path | `/backups` |

### Persistence

| Parameter | Description | Default |
|-----------|-------------|---------|
| `persistence.enabled` | Enable persistence | `true` |
| `persistence.storageClass` | Storage class | `local-path` |
| `persistence.size` | PVC size | `5Gi` |

### Schedule Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `backup.schedule` | Backup cron schedule | `0 2 * * *` |
| `backup.retention.daily` | Daily backups to keep | `7` |
| `backup.retention.weekly` | Weekly backups to keep | `4` |
| `backup.retention.monthly` | Monthly backups to keep | `6` |

## Features

- Web UI for Restic backup management
- S3 and NFS backend support
- Scheduled backups
- Backup retention policies
- Browse and restore files
- Backup status monitoring
- Multi-repository support

## Vault Secret Paths

```
secret/data/zerobyte/restic   # repository password
secret/data/zerobyte/s3       # accessKey, secretKey
```

## Dependencies

- MinIO or S3-compatible storage
- Restic binary

## License

This Helm chart is open source and available under the MIT License.
