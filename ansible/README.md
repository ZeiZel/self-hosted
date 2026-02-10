# Self-Hosted Infrastructure - Ansible Automation

This directory contains Ansible playbooks and roles for provisioning and configuring a self-hosted Kubernetes infrastructure.

## Overview

The infrastructure consists of:
- **Proxmox VE** - Virtualization platform on bare metal
- **Kubernetes Cluster** - 1 master + 3 specialized worker nodes
- **Gateway VPS** - Public-facing server with WireGuard VPN (Pangolin)
- **Monitoring** - Prometheus, Grafana, Loki stack
- **Application Services** - 40+ services via Helmfile

## Quick Start

### Prerequisites

- Ansible 2.14+
- kubectl, helm, helmfile
- sops, gpg (for secrets management)
- SSH key configured for target hosts

### Basic Usage

```bash
# Full deployment (all hosts, all roles)
ansible-playbook -i inventory/hosts.ini all.yml --vault-password-file ~/.ansible_vault_password

# Specific tags (see Tags section below)
ansible-playbook -i inventory/hosts.ini all.yml --tags prepare --vault-password-file ~/.ansible_vault_password

# Dry run (check mode)
ansible-playbook -i inventory/hosts.ini all.yml --check --vault-password-file ~/.ansible_vault_password
```

## Proxmox + Terraform Integration

### Quick Start: Provision VMs

```bash
# 1. Setup Proxmox (one-time)
ansible-playbook -i inventory/hosts.ini all.yml --tags proxmox-setup

# 2. Provision VMs
ansible-playbook -i inventory/hosts.ini all.yml --tags terraform,provision

# 3. Configure VMs
ansible-playbook -i inventory/hosts.ini all.yml --tags post-provision,prepare
```

### VM Specifications

- **k8s-master-1**: 192.168.100.10, 8 cores, 8GB RAM, 200GB disk
- **k8s-worker-db**: 192.168.100.11, 3 cores, 10GB RAM, 400GB disk (databases)
- **k8s-worker-services**: 192.168.100.12, 3 cores, 8GB RAM, 200GB disk
- **k8s-worker-apps**: 192.168.100.13, 2 cores, 6GB RAM, 200GB disk

See [PROXMOX.md](PROXMOX.md) for detailed Proxmox documentation.

## Tags Reference

### Main Tags
- `proxmox` - All Proxmox tasks (setup + terraform + post-provision)
- `prepare` - Server setup (docker, security, packages)
- `kubespray` - Kubernetes cluster deployment
- `helmfile` - Application deployment
- `pangolin` - WireGuard VPN setup

### Proxmox-Specific Tags
- `proxmox-setup` - Proxmox API verification, template checks
- `terraform` - Terraform operations (init, plan, apply)
- `provision` - VM creation (terraform apply)
- `post-provision` - VM verification and SSH checks

## Roles

| Role | Description | Tags |
|------|-------------|------|
| proxmox_setup | Prepare Proxmox for VM provisioning | proxmox-setup |
| proxmox_terraform | Create VMs with Terraform | terraform, provision |
| proxmox_post_provision | Verify VMs ready | post-provision |
| setup_server | Basic server config | prepare, setup |
| docker | Install Docker CE | prepare, docker |
| security | Firewall, SSH hardening | prepare, security |
| kubespray | Deploy Kubernetes | kubespray |
| infrastructure | Deploy Helmfile apps | helmfile |
| pangolin | WireGuard VPN | pangolin |

## Inventory Groups

- `proxmox_nodes` - Proxmox VE servers
- `proxmox_vms` - VMs created by Terraform (dynamic)
- `k8s_masters` - Kubernetes master nodes
- `k8s_workers` - Kubernetes worker nodes
- `gateway` - Public VPS gateway

## Secrets Management

Secrets are stored in `group_vars/all/vault.yml` (Ansible Vault encrypted).

Edit secrets:
```bash
ansible-vault edit group_vars/all/vault.yml --vault-password-file ~/.ansible_vault_password
```

Store vault password:
```bash
echo "your-password" > ~/.ansible_vault_password
chmod 600 ~/.ansible_vault_password
```

## Troubleshooting

### Proxmox API Connection Failed
```bash
# Test API manually
curl -k https://192.168.100.2:8006/api2/json/version
```

### Cloud-init Template Not Found
```bash
# List templates
ssh root@192.168.100.2 'qm list | grep template'
```

### Terraform Errors
```bash
# View detailed logs
cd terraform/proxmox
terraform plan
```

### SSH Timeout to VMs
```bash
# Check cloud-init status
ssh user@192.168.100.10 'cloud-init status --wait'
```

## Additional Documentation

- [PROXMOX.md](PROXMOX.md) - Detailed Proxmox setup guide
- [roles/*/README.md](roles/) - Role-specific documentation
- [terraform/proxmox/README.md](terraform/proxmox/README.md) - Terraform workspace guide

## License

MIT
