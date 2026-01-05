---
sidebar_position: 5
---

# Terraform Infrastructure

Provision infrastructure using Terraform (Infrastructure as Code).

## Overview

Terraform configurations are in `terraform/` and handle:

- Server inventory generation
- Infrastructure provisioning
- Resource management

## Prerequisites

- Terraform 1.0+ installed
- Access to target infrastructure
- SSH keys configured

## Configuration

### Create terraform.tfvars

```bash
cat > terraform/terraform.tfvars << 'EOF'
local_servers = [
  {
    name       = "server"
    hostname   = "server.local"
    ip_address = "192.168.31.100"
    role       = "master"
    ssh_user   = "zeizel"
    ssh_key    = "~/.ssh/id_rsa"
  }
]

local_clients = []
EOF
```

## Usage

### Initialize

```bash
cd terraform
terraform init
```

### Plan

```bash
terraform plan
```

### Apply

```bash
terraform apply -auto-approve
```

### Destroy

```bash
terraform destroy
```

## Outputs

Terraform generates an Ansible inventory file:

- `templates/inventory.yml.tpl` - Template for inventory
- Generated inventory in output

## Variables

Key variables in `variables.tf`:

- `local_servers` - List of local servers
- `local_clients` - List of client machines
- Server configuration (hostname, IP, role, etc.)

## Integration

Terraform output can be used with:

- Ansible for configuration management
- Kubernetes for cluster setup
- Other automation tools

## Next Steps

- [Ansible Deployment](./ansible) - Configure provisioned infrastructure
- [Kubernetes Deployment](./kubernetes) - Deploy services

