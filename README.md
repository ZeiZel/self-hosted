# Self-Hosted Infrastructure Platform

> Complete production-ready infrastructure platform for full control over your data and services.

## Quick Install

Install the CLI tool with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/ZeiZel/self-hosted/main/scripts/install.sh | bash
```

Or with wget:
```bash
wget -qO- https://raw.githubusercontent.com/ZeiZel/self-hosted/main/scripts/install.sh | bash
```

To uninstall:
```bash
curl -fsSL https://raw.githubusercontent.com/ZeiZel/self-hosted/main/scripts/install.sh | bash -s -- --uninstall
```

---

## CLI Tool

The `selfhost` CLI provides automated infrastructure deployment and management.

### Commands

| Command | Description |
|---------|-------------|
| `selfhost init` | Initialize a new selfhost project |
| `selfhost inventory` | Manage server inventory (add/remove/list hosts) |
| `selfhost services` | Manage services (list/enable/disable) |
| `selfhost plan` | Generate deployment plan |
| `selfhost deploy` | Deploy services to cluster |
| `selfhost status` | Show cluster and services status |
| `selfhost validate` | Validate configuration and manifests |
| `selfhost config` | Manage CLI configuration |
| `selfhost balance` | Resource balancing utilities |
| `selfhost monitor` | Open monitoring TUI dashboard |
| `selfhost daemon` | Manage background daemon service |

### Usage Examples

```bash
# Initialize new project
selfhost init

# Add a server to inventory
selfhost inventory add --host 192.168.1.100 --user admin --role master

# List available services
selfhost services list

# Deploy all enabled services
selfhost deploy

# Deploy specific service
selfhost deploy --service gitlab

# Check cluster status
selfhost status

# Open interactive monitoring dashboard
selfhost monitor

# Validate all configurations
selfhost validate

# Show verbose output
selfhost status --verbose
```

### Global Options

```
--verbose       Enable verbose output
--no-color      Disable colored output
--config <path> Path to configuration file
-v, --version   Display version number
-h, --help      Display help
```

### Requirements

- **Bun** runtime (automatically installed by the installer)
- **macOS** or **Linux**
- **Git**

---

## Services (42 total)

**Base Infrastructure**
- **Traefik** - Ingress controller and edge router
- **Consul** - Service mesh and service discovery
- **Vault** - Secrets management
- **cert-manager** - TLS certificate automation
- **Authentik** - Identity provider and SSO

**Monitoring & Logging**
- **Prometheus** - Metrics collection
- **Grafana** - Dashboards and visualization
- **Loki** - Log aggregation
- **Alertmanager** - Alert routing

**Databases**
- **PostgreSQL** - Primary relational database
- **MongoDB** - Document database
- **Valkey** (Redis) - Caching and sessions
- **MinIO** - S3-compatible object storage
- **ClickHouse** - Analytics database
- **MySQL** - Relational database (Ghost)
- **RabbitMQ** - Message queue
- **Supabase** - Backend-as-a-Service

**Development & CI/CD**
- **GitLab** - Git repository and CI/CD
- **TeamCity** - Build server
- **YouTrack** - Issue tracking
- **JetBrains Hub** - User management
- **Coder** - Cloud development environments
- **Bytebase** - Database schema management
- **Harbor** - Container registry
- **Devtron** - Kubernetes application delivery

**Productivity**
- **Affine** - All-in-one workspace
- **Notesnook** - Private note-taking
- **Excalidraw** - Collaborative whiteboard
- **Penpot** - Design platform

**Social & Communication**
- **Stoat** (Revolt) - Self-hosted chat
- **Stalwart** - Mail server

**Data & Storage**
- **Vaultwarden** - Password manager
- **Syncthing** - File synchronization
- **Nextcloud** - File storage and collaboration
- **Rybbit** - Analytics platform

**Infrastructure Tools**
- **Glance** - Dashboard
- **Pangolin** - WireGuard VPN management
- **Remnawave** - VPN proxy panel

**Automation**
- **Kestra** - Workflow orchestration
- **N8n** - Workflow automation

**Content**
- **Ghost** - Publishing platform

**Utilities**
- **Vert** - Utility service
- **Metube** - Media downloader

## Security Prerequisites

Before deployment, ensure you have:

1. **SSH Key Authentication** configured for all servers
2. **Ansible Vault** password stored securely (`~/.ansible_vault_password`)
3. **GPG Key** for SOPS secret encryption
4. **Strong passwords** generated for all services (32+ characters)
5. **Firewall** configured to allow only required ports

**Security checklist:**
- [ ] SSH keys deployed (no password authentication)
- [ ] Vault encrypted (`ansible-vault encrypt`)
- [ ] SOPS configured with GPG key
- [ ] `.gitignore` includes all credential files
- [ ] No secrets in git history

## Prerequisites

Install required tools:

```bash
# macOS
brew install ansible helm helmfile kubectl sops gnupg pre-commit

# Install Ansible collections
ansible-galaxy collection install community.general ansible.posix
```

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

Create `ansible/group_vars/all/vault.yml` (see `vault.example.yml` for template):

```bash
# Create vault password file
echo "your-vault-password" > ~/.ansible_vault_password && chmod 600 ~/.ansible_vault_password

# Copy example and edit
cp ansible/group_vars/all/vault.example.yml ansible/group_vars/all/vault.yml
ansible-vault encrypt ansible/group_vars/all/vault.yml --vault-password-file ~/.ansible_vault_password
```

### 3. Configure Inventory

```bash
# Copy example inventory
cp ansible/inventory/hosts.example.ini ansible/inventory/hosts.ini
# Edit with your server IPs (DO NOT add passwords - use SSH keys or vault)
```

### 4. Configure Kubernetes Secrets

Create `kubernetes/envs/k8s/secrets/_all.yaml`:

```yaml
secrets:
    domain: your-domain.com
    ingressDomain: your-domain.com
    smtpUsername: smtp@example.com
    smtpPassword: <STRONG_PASSWORD>
    authentikSecret: <RANDOM_HEX_32>
    authentikBootstrapPassword: <STRONG_PASSWORD>
    postgresPassword: <STRONG_PASSWORD>
    mongoPassword: <STRONG_PASSWORD>
    grafanaPassword: <STRONG_PASSWORD>
```

Encrypt:
```bash
sops --encrypt --in-place kubernetes/envs/k8s/secrets/_all.yaml
```

### 5. Deploy

```bash
cd ansible

# Install Ansible dependencies
ansible-galaxy install -r requirements.yml

# Full infrastructure deployment (all hosts)
ansible-playbook -i inventory/hosts.ini all.yml --vault-password-file ~/.ansible_vault_password

# Deploy specific host groups
ansible-playbook -i inventory/master.ini all.yml --vault-password-file ~/.ansible_vault_password  # Master node
ansible-playbook -i inventory/gateway.ini all.yml --vault-password-file ~/.ansible_vault_password # Gateway/VPS

# Deploy specific roles with tags
ansible-playbook -i inventory/hosts.ini all.yml --tags prepare --vault-password-file ~/.ansible_vault_password
ansible-playbook -i inventory/hosts.ini all.yml --tags kubespray --vault-password-file ~/.ansible_vault_password
ansible-playbook -i inventory/hosts.ini all.yml --tags pangolin --vault-password-file ~/.ansible_vault_password
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

## Architecture

**Deployment Model**: Three-tier architecture
- **Host (macOS)**: Local development, Ansible controller
- **VPS (Gateway)**: Public internet entry point, WireGuard gateway, Traefik edge
- **Home Server**: Kubernetes master node (bare-metal)

**Network Topology**:
```
Internet
  -> VPS Gateway (:80, :443)
     -> WireGuard Tunnel (10.99.0.0/24)
        -> Home Server
           -> Kubernetes (single-node)
              -> All Services
```

**Stack**: Kubernetes, Helm, Helmfile, Ansible, Docker, Terraform, SOPS

## Documentation

See the [docs/](./docs/) directory for full documentation, or visit the [documentation site](https://zeizel.github.io/self-hosted/).

## Credits

Inspired by [zam-zam/helmfile-examples](https://github.com/zam-zam/helmfile-examples)
