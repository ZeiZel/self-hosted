---
sidebar_position: 3
---

# Installation

This guide will walk you through the installation process for the self-hosted infrastructure.

## Prerequisites

Before starting, ensure you have:

1. Reviewed the [Requirements](./requirements.md)
2. Prepared your VPS and local servers
3. Installed all required tools on your local machine
4. Configured SSH access to your servers

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/ZeiZel/self-hosted.git
cd self-hosted
```

### 2. Configure Terraform

Create `terraform/terraform.tfvars`:

```bash
cat > terraform/terraform.tfvars << 'EOF'
local_servers = [
  {
    name       = "server"
    hostname   = "server.local"
    ip_address = "192.168.31.100"
    role       = "master"
    ssh_user   = "your_user"
    ssh_key    = "~/.ssh/id_rsa"
  }
]

local_clients = []
EOF
```

### 3. Initialize Terraform

```bash
cd terraform
terraform init
terraform plan
terraform apply -auto-approve
cd ..
```

### 4. Configure Ansible Inventory

Update `ansible/pangolin/inventory/hosts.yml` with your server details.

### 5. Setup GPG/SOPS

```bash
# Create GPG key
gpg --full-generate-key

# Get key ID
GPG_KEY_ID=$(gpg --list-secret-keys --keyid-format LONG | grep -E "^sec" | head -1 | grep -oE "[A-F0-9]{40}")

# Configure .sops.yaml
cat > kubernetes/.sops.yaml << EOF
---
creation_rules:
  - pgp: ${GPG_KEY_ID}
EOF

# Set GPG_TTY
export GPG_TTY=$(tty)
```

### 6. Deploy with Ansible

```bash
cd ansible/pangolin

# Basic local server setup
ansible-playbook -i inventory/hosts.yml playbooks/deploy_local.yml

# Kubernetes cluster deployment
ansible-playbook -i inventory/hosts.yml playbooks/deploy_local_k8s.yml

# VPS deployment
ansible-playbook -i inventory/hosts.yml playbooks/deploy_vps.yml

cd ../..
```

### 7. Deploy Kubernetes Services

```bash
cd kubernetes

# Initialize helmfile
helmfile init --force

# Install Gateway API
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml

# Setup Vault (optional)
./scripts/vault-setup.sh

# Deploy all services
helmfile -e k8s apply

cd ..
```

## Verification

After installation, verify that all services are running:

```bash
# Check Kubernetes pods
kubectl get pods --all-namespaces

# Check services
kubectl get services --all-namespaces

# Check ingress
kubectl get ingress --all-namespaces
```

## Next Steps

- [Quick Start Guide](./quick-start.md) - Get started quickly
- [Services Documentation](../services/overview.md) - Learn about available services
- [Deployment Guides](../deployment/overview.md) - Detailed deployment instructions

