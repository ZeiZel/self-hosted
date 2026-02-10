# Storage Role

Deploys and configures Kubernetes storage (OpenEBS).

## Overview

This role:
- Deploys OpenEBS storage provisioner
- Configures hostpath storage class
- Sets up persistent volume provisioning
- Configures storage for databases

## Requirements

- Kubernetes cluster running
- kubectl configured on control node
- Helm installed

## Role Variables

See `defaults/main.yml` for key variables:

| Variable | Description |
|----------|-------------|
| `openebs_namespace` | OpenEBS namespace |
| `openebs_version` | OpenEBS Helm chart version |
| `default_storage_class` | Default storage class name |
| `storage_path` | Host path for storage |

## Storage Classes

Created storage classes:
- `openebs-hostpath` (default) - Local hostpath storage
- `openebs-device` - Direct device storage (optional)

## Dependencies

- Kubernetes cluster (kubespray role)

## Example Playbook

```yaml
- hosts: k8s_masters
  roles:
    - storage
  tags: [storage]
```

## Tags

- `storage` - Run all storage tasks
- `storage, deploy` - Deploy OpenEBS
- `storage, verify` - Verify storage classes

## Verification

```bash
# Check storage classes
kubectl get storageclass

# Verify default class
kubectl get storageclass -o jsonpath='{.items[?(@.metadata.annotations.storageclass\.kubernetes\.io/is-default-class=="true")].metadata.name}'
```

## Notes

- Uses hostpath for single-node deployments
- For multi-node, consider Rook-Ceph or Longhorn
- Database PVCs use this storage class by default
