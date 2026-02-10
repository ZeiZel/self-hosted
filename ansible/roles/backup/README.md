# Backup Role

Deploys and configures backup infrastructure using Velero.

## Overview

This role:
- Deploys Velero for Kubernetes state backups
- Configures MinIO as backup storage backend
- Creates scheduled backups for cluster state
- Sets up database backup CronJobs

## Requirements

- Kubernetes cluster running
- MinIO deployed and accessible
- kubectl configured on control node

## Role Variables

See `defaults/main.yml` for full list. Key variables:

| Variable | Description |
|----------|-------------|
| `velero_namespace` | Namespace for Velero |
| `velero_version` | Velero Helm chart version |
| `backup_bucket_name` | MinIO bucket for backups |
| `backup_schedules` | List of backup schedule definitions |
| `database_backups_enabled` | Enable database backups |
| `postgres_backup_enabled` | Enable PostgreSQL backups |
| `mongodb_backup_enabled` | Enable MongoDB backups |

## Backup Schedule

Default schedules:
- Daily cluster state backup at 2 AM (7 day retention)
- Daily PostgreSQL backup at 1 AM (7 day retention)
- Daily MongoDB backup at 1:30 AM (7 day retention)
- Weekly full backup Sunday 3 AM (30 day retention)
- Monthly full backup 1st of month (365 day retention)

## Dependencies

- MinIO (object storage)
- PostgreSQL (if database backups enabled)
- MongoDB (if database backups enabled)

## Example Playbook

```yaml
- hosts: k8s_masters
  roles:
    - backup
  tags: [backup]
```

## Tags

- `backup` - Run all backup tasks
- `backup, namespace` - Create Velero namespace
- `backup, helm` - Deploy Velero via Helm
- `backup, credentials` - Configure backup credentials
- `backup, schedules` - Create backup schedules
- `backup, database` - Configure database backups
- `backup, verify` - Verify backup configuration

## Recovery

To restore from backup:

```bash
# List available backups
kubectl get backups -n velero

# Restore specific backup
velero restore create --from-backup <backup-name>
```
