# Proxmox Role

Configures Proxmox VE host for VM provisioning.

## Overview

This role:
- Configures Proxmox API access
- Prepares VM templates
- Sets up storage and networking
- Configures cloud-init templates

## Requirements

- Proxmox VE 7.x or 8.x installed
- SSH access to Proxmox host
- API token or password for automation

## Role Variables

See `defaults/main.yml` for key variables:

| Variable | Description |
|----------|-------------|
| `proxmox_api_host` | Proxmox API hostname/IP |
| `proxmox_api_port` | API port (default: 8006) |
| `proxmox_api_user` | API user (e.g., root@pam) |
| `proxmox_node_name` | Proxmox node name |
| `proxmox_storage` | Default storage for VMs |
| `proxmox_network_bridge` | Network bridge for VMs |

## VM Templates

Creates cloud-init enabled templates:
- Ubuntu 22.04 LTS
- Ubuntu 24.04 LTS

Templates configured with:
- Cloud-init for provisioning
- QEMU guest agent
- SSH key injection

## Dependencies

- Proxmox VE installed
- Network configured
- Storage pools configured

## Example Playbook

```yaml
- hosts: proxmox_nodes
  roles:
    - proxmox
  tags: [proxmox]
```

## Tags

- `proxmox` - Run all Proxmox tasks
- `proxmox, templates` - Create VM templates
- `proxmox, storage` - Configure storage
- `proxmox, network` - Configure networking

## Terraform Integration

After running this role, use Terraform to provision VMs:

```hcl
module "k8s_cluster" {
  source = "./modules/proxmox-vm"

  proxmox_api_url = "https://${proxmox_api_host}:${proxmox_api_port}/api2/json"
  template_name   = "ubuntu-cloud-template"
}
```
