# Kubespray Role

Deploys Kubernetes cluster using Kubespray.

## Overview

This role:
- Clones Kubespray repository
- Configures cluster inventory
- Deploys single-node or multi-node Kubernetes cluster
- Configures kubectl on master node

## Requirements

- Ubuntu 20.04+ on target nodes
- SSH access with sudo privileges
- Python 3 installed on targets

## Role Variables

See `defaults/main.yml` for key variables:

| Variable | Description |
|----------|-------------|
| `kubespray_version` | Kubespray git tag/branch |
| `kubespray_dir` | Local directory for Kubespray |
| `kube_version` | Kubernetes version to deploy |
| `kube_network_plugin` | CNI plugin (calico, flannel, etc.) |
| `cluster_name` | Kubernetes cluster name |

## Cluster Configuration

Default configuration:
- Kubernetes v1.28.5
- Calico CNI with IPIP encapsulation
- etcd cluster (co-located with control plane)
- containerd runtime

## Dependencies

- Docker role (containerd runtime)
- Network connectivity between nodes

## Example Playbook

```yaml
- hosts: k8s_masters:k8s_workers
  roles:
    - kubespray
  tags: [kubespray]
```

## Tags

- `kubespray` - Run all Kubespray tasks
- `kubespray, prepare` - Prepare nodes for deployment
- `kubespray, deploy` - Run cluster deployment

## Post-Deployment

After deployment:
1. Copy kubeconfig to local machine
2. Verify cluster status with `kubectl get nodes`
3. Configure CNI (if separate role)
4. Deploy storage provisioner

## Scaling

To add worker nodes:
1. Add to `[k8s_workers]` in inventory
2. Re-run playbook with `--tags kubespray`
