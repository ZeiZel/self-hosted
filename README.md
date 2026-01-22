# Self-Hosted Infrastructure Platform

> Complete production-ready infrastructure platform for full control over your data and services.

## Services

**Development**: GitLab, TeamCity, YouTrack, JetBrains Hub, Bytebase  
**Monitoring**: Grafana, Prometheus, ELK Stack, Glance  
**Security**: Vault, Vaultwarden, Authentik (SSO)  
**Infrastructure**: Traefik, Consul, Pangolin VPN  
**Collaboration**: Stoat, Notesnook, Excalidraw, Stalwart Mail  
**Data**: PostgreSQL, MongoDB, Redis/Valkey, MinIO, Syncthing/Nextcloud

## Prerequisites

Install: `kubectl`, `helm`, `helmfile`, `ansible`, `gpg`, `sops`

## Quick Start

### 1. Generate GPG Key & Configure SOPS

```bash
gpg --full-generate-key
GPG_KEY_ID=$(gpg --list-secret-keys --keyid-format LONG | grep -E "^sec" | head -1 | grep -oE "[A-F0-9]{40}")
echo "---
creation_rules:
  - pgp: ${GPG_KEY_ID}" > kubernetes/.sops.yaml
export GPG_TTY=$(tty)
```

### 2. Configure Ansible Vault

Create `ansible/group_vars/all/vault.yml`:

```yaml
user:
  name: 'username'
  password: 'password_hash'  # mkpasswd --method=sha-512
  ssh_keys: ['ssh-rsa AAAAB3...']
  email: 'admin@example.com'
root:
  name: 'root'
  password: 'password_hash'
ssh:
  port: 22
```

Encrypt:
```bash
echo "vault-password" > ~/.ansible_vault_password && chmod 600 ~/.ansible_vault_password
ansible-vault encrypt ansible/group_vars/all/vault.yml --vault-password-file ~/.ansible_vault_password
```

### 3. Configure Kubernetes Secrets

Create `kubernetes/envs/k8s/secrets/_all.yaml`:

```yaml
secrets:
    domain: your-domain.com
    ingressDomain: your-domain.com
    smtpUsername: smtp@example.com
    smtpPassword: password
    authentikSecret: $(openssl rand -hex 16)
    authentikBootstrapPassword: admin
    postgresPassword: $(openssl rand -base64 32)
    mongoPassword: $(openssl rand -base64 32)
    grafanaPassword: $(openssl rand -base64 32)
```

Encrypt:
```bash
sops --encrypt --in-place kubernetes/envs/k8s/secrets/_all.yaml
```

### 4. Deploy

```bash
cd ansible

# Install Ansible dependencies
ansible-galaxy install -r requirements.yml

# Full infrastructure deployment (all hosts)
ansible-playbook -i inventory/hosts.ini all.yml --vault-password-file ~/.ansible_vault_password

# Deploy specific host groups
ansible-playbook -i inventory/master.ini all.yml --vault-password-file ~/.ansible_vault_password  # Master node
ansible-playbook -i inventory/gateway.ini all.yml --vault-password-file ~/.ansible_vault_password # Gateway/VPS
ansible-playbook -i inventory/node.ini all.yml --vault-password-file ~/.ansible_vault_password    # Worker nodes

# Deploy specific roles with tags
ansible-playbook -i inventory/hosts.ini all.yml --tags master --vault-password-file ~/.ansible_vault_password
ansible-playbook -i inventory/hosts.ini all.yml --tags gateway --vault-password-file ~/.ansible_vault_password
```

## Management

```bash
# Re-run full deployment
ansible-playbook -i inventory/hosts.ini all.yml --vault-password-file ~/.ansible_vault_password

# Update specific components
ansible-playbook -i inventory/hosts.ini all.yml --tags kubespray --vault-password-file ~/.ansible_vault_password
ansible-playbook -i inventory/hosts.ini all.yml --tags pangolin --vault-password-file ~/.ansible_vault_password

# Edit secrets
sops kubernetes/envs/k8s/secrets/_all.yaml
ansible-vault edit ansible/group_vars/all/vault.yml --vault-password-file ~/.ansible_vault_password

# Check deployment status
kubectl get pods --all-namespaces
kubectl get nodes
```

## About

Self-hosted alternative to expensive SaaS with enterprise-grade tools on your infrastructure.

**Stack**: Kubernetes, Helm, Helmfile, Ansible, Docker, Terraform, SOPS

**Credits**: Inspired by [zam-zam/helmfile-examples](https://github.com/zam-zam/helmfile-examples)
