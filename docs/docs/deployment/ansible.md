---
sidebar_position: 4
---

# Ansible Deployment

Automate infrastructure provisioning and configuration with Ansible playbooks.

## Overview

Ansible playbooks are located in `ansible/` and handle:

- Server provisioning
- Kubernetes cluster setup (via Kubespray)
- VPS gateway configuration
- Pangolin VPN gateway setup

All roles are orchestrated by a single phased playbook, `ansible/all.yml`, and selected via tags. The `selfhost` CLI (`selfhost deploy`) wraps these Ansible runs; you can also invoke `ansible-playbook` directly.

## Prerequisites

- Ansible 2.9+ installed
- SSH access to target servers
- Python 3.6+ on target servers

## Configuration

### Inventory

Copy `ansible/inventory/hosts.example.ini` to `ansible/inventory/hosts.ini` and fill in your hosts (INI format):

```ini
[vps]
# VPS gateway for the Pangolin server
server ansible_host=your.vps.ip ansible_user=root ansible_port=22

[local]
127.0.0.1 ansible_user=admin ansible_connection=local

[masters]
master ansible_host=192.168.1.10 ansible_user=admin ansible_port=22

[workers]
# worker ansible_host=192.168.1.11 ansible_user=admin ansible_port=22
```

### Variables

Edit `ansible/group_vars/all/vars.yml` for common variables.

Encrypted variables go in `ansible/group_vars/all/vault.yml` (encrypted with Ansible Vault).

## Running the Playbook

Everything runs through the single `ansible/all.yml` playbook, scoped with tags.

### Full deployment

```bash
cd ansible
ansible-playbook -i inventory/hosts.ini all.yml
```

### Local host setup

Prepare the management/control host:

```bash
ansible-playbook -i inventory/hosts.ini all.yml --tags setup_host
```

### Deploy Kubernetes

Provision the cluster with Kubespray:

```bash
ansible-playbook -i inventory/hosts.ini all.yml --tags kubespray
```

### Deploy VPS gateway

VPS and Pangolin gateway setup:

```bash
ansible-playbook -i inventory/hosts.ini all.yml --tags gateway
```

## Roles

Roles are located in `ansible/roles/`:

- `pangolin` - Pangolin VPN gateway/node
- `docker` - Docker installation
- `kubespray` - Kubernetes cluster setup
- `server` - base server hardening
- `apps`, `storage`, `backup`, `monitoring`, `infrastructure`, `cert-manager`, `validate` - and more...

## Encryption

### Encrypt Variables

```bash
ansible-vault encrypt group_vars/all/vault.yml
```

### Edit Encrypted File

```bash
ansible-vault edit group_vars/all/vault.yml
```

### Run with Vault

```bash
ansible-playbook -i inventory/hosts.ini all.yml --ask-vault-pass
```

## Verification

After deployment, verify services:

```bash
# Check SSH connection
ansible all -i inventory/hosts.ini -m ping

# Check system info
ansible all -i inventory/hosts.ini -m setup
```

## Next Steps

- [Terraform Infrastructure](./terraform) - Infrastructure provisioning
- [Kubernetes Deployment](./kubernetes) - Deploy services to Kubernetes

