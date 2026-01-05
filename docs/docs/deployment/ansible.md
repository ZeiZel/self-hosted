---
sidebar_position: 4
---

# Ansible Deployment

Automate infrastructure provisioning and configuration with Ansible playbooks.

## Overview

Ansible playbooks are located in `ansible/pangolin/` and handle:

- Server provisioning
- Kubernetes cluster setup
- VPS configuration
- Pangolin VPN server setup

## Prerequisites

- Ansible 2.9+ installed
- SSH access to target servers
- Python 3.6+ on target servers

## Configuration

### Inventory

Configure `ansible/pangolin/inventory/hosts.yml`:

```yaml
local:
  hosts:
    server:
      ansible_host: 192.168.1.100
      ansible_user: ubuntu
      ansible_ssh_private_key_file: ~/.ssh/id_rsa

vps:
  hosts:
    pangolin_vps:
      ansible_host: your.vps.ip
      ansible_user: root
      pangolin_role: server
      pangolin_domain: "yourdomain.com"
      pangolin_admin_email: "admin@yourdomain.com"
```

### Variables

Edit `ansible/pangolin/group_vars/all.yml` for common variables.

Encrypted variables go in `ansible/pangolin/group_vars/vault.yml` (encrypted with Ansible Vault).

## Available Playbooks

### Deploy Local Server

Basic setup for local server:

```bash
cd ansible/pangolin
ansible-playbook -i inventory/hosts.yml playbooks/deploy_local.yml
```

### Deploy Kubernetes

Kubernetes cluster deployment:

```bash
ansible-playbook -i inventory/hosts.yml playbooks/deploy_local_k8s.yml
```

### Deploy VPS

VPS and Pangolin server setup:

```bash
ansible-playbook -i inventory/hosts.yml playbooks/deploy_vps.yml
```

## Roles

Roles are located in `ansible/pangolin/roles/`:

- `pangolin_server` - Pangolin VPN server
- `docker` - Docker installation
- `kubernetes` - Kubernetes setup
- And more...

## Encryption

### Encrypt Variables

```bash
ansible-vault encrypt group_vars/vault.yml
```

### Edit Encrypted File

```bash
ansible-vault edit group_vars/vault.yml
```

### Run with Vault

```bash
ansible-playbook -i inventory/hosts.yml playbooks/deploy_local.yml --ask-vault-pass
```

## Verification

After deployment, verify services:

```bash
# Check SSH connection
ansible all -i inventory/hosts.yml -m ping

# Check system info
ansible all -i inventory/hosts.yml -m setup
```

## Next Steps

- [Terraform Infrastructure](./terraform) - Infrastructure provisioning
- [Kubernetes Deployment](./kubernetes) - Deploy services to Kubernetes

