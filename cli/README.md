# Selfhost CLI

A command-line tool for automated deployment of self-hosted infrastructure on Kubernetes. Manages 40+ services with interactive configuration, resource planning, and resumable deployments.

## Features

- **Interactive Setup**: Guided wizards for machine inventory and service selection
- **Resource Planning**: Automatic bin-packing algorithm for optimal service placement
- **Resumable Deployments**: Continue from where you left off after failures
- **Headless Mode**: YAML-based configuration for CI/CD automation
- **Multi-Project Support**: Separate configurations per repository

## Requirements

- [Bun](https://bun.sh) runtime (v1.0+)
- SSH access to target machines
- Repository root must contain `kubernetes/` and `ansible/` directories

## Installation

```bash
cd cli
bun install
```

## Quick Start

```bash
# 1. Initialize CLI and verify dependencies
selfhost init

# 2. Add machines to inventory
selfhost inventory add

# 3. Select and configure services
selfhost services select

# 4. Generate deployment plan
selfhost plan

# 5. Deploy infrastructure
selfhost deploy
```

---

## Commands Reference

### `selfhost init`

Initialize the CLI and verify system dependencies.

```bash
selfhost init [options]

Options:
  --skip-deps    Skip dependency installation check
  --force        Force re-initialization
```

**Example:**

```bash
$ selfhost init

════════════════════════════════════════════════════════════
  Selfhost CLI Initialization
════════════════════════════════════════════════════════════

✔ Repository found: /home/user/self-hosted

▸ Checking dependencies
  ✔ ssh
  ✔ ansible
  ✔ kubectl
  ✔ helm
  ✔ helmfile
  ✖ sops not installed

▸ Local machine info
  OS              linux
  Architecture    x64
  SSH key exists  Yes

? Cluster name: production
? Public domain: example.com
? Local domain: homelab.local

✔ Initialization complete!
```

---

### `selfhost inventory`

Manage machine inventory for the cluster.

#### `selfhost inventory add`

Add a new machine interactively or via flags.

```bash
selfhost inventory add [options]

Options:
  --ip <ip>           Machine IP address
  --label <label>     Machine label (hostname)
  --roles <roles>     Comma-separated roles (master,worker,gateway,storage,backups)
  --ssh-user <user>   SSH username (default: root)
  --ssh-port <port>   SSH port (default: 22)
  --no-test           Skip SSH connection test
```

**Interactive Example:**

```bash
$ selfhost inventory add

════════════════════════════════════════════════════════════
  Add Machine to Inventory
════════════════════════════════════════════════════════════

? Enter machine IP address: 192.168.100.100
? Enter machine label (hostname): k8s-master-01
? Select machine roles: (Press <space> to select)
  ◉ master - Kubernetes control plane
  ◯ worker - Kubernetes worker node
  ◉ gateway - Public internet gateway (VPN)
  ◯ storage - OpenEBS storage node
  ◯ backups - Backup target (Velero)
? SSH username: root
? SSH port: 22

⠋ Testing SSH connection...
✔ SSH connection successful

✔ Machine 'k8s-master-01' added successfully
  ID     a1b2c3d4-e5f6-7890-abcd-ef1234567890
  IP     192.168.100.100
  Roles  master, gateway
```

**Non-Interactive Example:**

```bash
selfhost inventory add \
  --ip 192.168.100.101 \
  --label k8s-worker-01 \
  --roles worker,storage \
  --ssh-user root
```

#### `selfhost inventory list`

List all machines in inventory.

```bash
selfhost inventory list [options]

Options:
  --json    Output as JSON
```

**Example:**

```bash
$ selfhost inventory list

════════════════════════════════════════════════════════════
  Machine Inventory
════════════════════════════════════════════════════════════

  Total machines  3
  Masters         1
  Workers         2
  Gateways        1

┌────────────────┬─────────────────┬─────────────────┬────────┬────────────────────┐
│ Label          │ IP              │ Roles           │ Status │ Resources          │
├────────────────┼─────────────────┼─────────────────┼────────┼────────────────────┤
│ k8s-master-01  │ 192.168.100.100 │ master, gateway │ online │ 8 CPU / 32Gi       │
├────────────────┼─────────────────┼─────────────────┼────────┼────────────────────┤
│ k8s-worker-01  │ 192.168.100.101 │ worker, storage │ online │ 16 CPU / 64Gi      │
├────────────────┼─────────────────┼─────────────────┼────────┼────────────────────┤
│ k8s-worker-02  │ 192.168.100.102 │ worker          │ online │ 16 CPU / 64Gi      │
└────────────────┴─────────────────┴─────────────────┴────────┴────────────────────┘
```

#### `selfhost inventory remove`

Remove a machine from inventory.

```bash
selfhost inventory remove <label> [options]

Options:
  --force    Skip confirmation
```

#### `selfhost inventory validate`

Validate inventory configuration.

```bash
$ selfhost inventory validate

════════════════════════════════════════════════════════════
  Inventory Validation
════════════════════════════════════════════════════════════

✔ Inventory is valid

▸ Warnings
  ⚠ No dedicated storage node. OpenEBS will run on worker/master nodes.
```

#### `selfhost inventory test`

Test SSH connectivity to all machines.

```bash
$ selfhost inventory test

════════════════════════════════════════════════════════════
  Testing SSH Connectivity
════════════════════════════════════════════════════════════

✔ k8s-master-01 (192.168.100.100) - Connected
✔ k8s-worker-01 (192.168.100.101) - Connected
✔ k8s-worker-02 (192.168.100.102) - Connected
```

#### `selfhost inventory generate`

Generate Ansible inventory file.

```bash
selfhost inventory generate [options]

Options:
  -o, --output <path>    Output file path (default: stdout)
```

---

### `selfhost services`

Manage service selection and configuration.

#### `selfhost services list`

List all available services.

```bash
selfhost services list [options]

Options:
  --enabled           Show only enabled services
  --namespace <ns>    Filter by namespace
  --json              Output as JSON
```

**Example:**

```bash
$ selfhost services list --enabled

════════════════════════════════════════════════════════════
  Available Services
════════════════════════════════════════════════════════════

▸ SERVICE
┌──────────────┬───────────┬─────────┬───────────────┬────────┐
│ Service      │ Namespace │ Enabled │ Resources     │ Tier   │
├──────────────┼───────────┼─────────┼───────────────┼────────┤
│ vault        │ service   │ ✔       │ 256Mi / 500m  │ light  │
│ authentik    │ service   │ ✔       │ 512Mi / 1000m │ medium │
│ traefik      │ ingress   │ ✔       │ 128Mi / 500m  │ light  │
└──────────────┴───────────┴─────────┴───────────────┴────────┘

▸ DB
┌────────────┬───────────┬─────────┬──────────────┬────────┐
│ Service    │ Namespace │ Enabled │ Resources    │ Tier   │
├────────────┼───────────┼─────────┼──────────────┼────────┤
│ postgresql │ db        │ ✔       │ 2Gi / 2000m  │ heavy  │
│ valkey     │ db        │ ✔       │ 512Mi / 500m │ medium │
└────────────┴───────────┴─────────┴──────────────┴────────┘
```

#### `selfhost services select`

Interactive service selection wizard.

```bash
$ selfhost services select

════════════════════════════════════════════════════════════
  Service Selection
════════════════════════════════════════════════════════════

ℹ Select services to deploy. Core services are always enabled.

▸ DB
? Select db services:
  ◉ postgresql (2Gi / 2000m)
  ◉ valkey (512Mi / 500m)
  ◯ mongodb (1Gi / 1000m)
  ◯ minio (512Mi / 500m)
  ◯ clickhouse (4Gi / 2000m)
  ◯ mysql (1Gi / 1000m)

▸ CODE
? Select code services:
  ◉ gitlab (4Gi / 4000m)
  ◯ coder (1Gi / 1000m)
  ◯ teamcity (2Gi / 2000m)

✔ Services selected
  Total CPU     8500m
  Total Memory  9Gi
  Total Storage 150Gi
```

#### `selfhost services configure`

Configure a specific service.

```bash
selfhost services configure <name>
```

**Example:**

```bash
$ selfhost services configure postgresql

════════════════════════════════════════════════════════════
  Configure postgresql
════════════════════════════════════════════════════════════

ℹ PostgreSQL relational database

  Namespace     db
  Chart         postgresql
  Version       18.5.1
  Tier          heavy
  Dependencies  ingress/traefik, service/vault

? postgresql - Number of replicas: 2
? postgresql - Memory (e.g., 512Mi, 2Gi): 4Gi
? postgresql - CPU (e.g., 100m, 2): 2
? postgresql - Expose via Traefik ingress? No

✔ Configuration saved for postgresql
```

#### `selfhost services enable/disable`

Enable or disable a service.

```bash
selfhost services enable <name>
selfhost services disable <name>
```

#### `selfhost services summary`

Show enabled services summary with deployment order.

```bash
$ selfhost services summary

════════════════════════════════════════════════════════════
  Enabled Services Summary
════════════════════════════════════════════════════════════

┌────────────┬───────────┬─────────┬──────────────┬────────┐
│ Service    │ Namespace │ Enabled │ Resources    │ Tier   │
├────────────┼───────────┼─────────┼──────────────┼────────┤
│ traefik    │ ingress   │ ✔       │ 128Mi / 500m │ light  │
│ vault      │ service   │ ✔       │ 256Mi / 500m │ light  │
│ postgresql │ db        │ ✔       │ 4Gi / 2000m  │ heavy  │
│ gitlab     │ code      │ ✔       │ 4Gi / 4000m  │ heavy  │
└────────────┴───────────┴─────────┴──────────────┴────────┘

▸ Resource Requirements
  Total CPU      7000m
  Total Memory   8.5Gi
  Total Storage  80Gi

▸ Deployment Order
  1. namespaces (service)
  2. traefik (ingress)
  3. consul (service)
  4. vault (service)
  5. cert-manager (service)
  6. authentik (service)
  7. postgresql (db)
  8. gitlab (code)
```

---

### `selfhost plan`

Generate deployment plan with resource allocation.

```bash
selfhost plan [options]

Options:
  --json    Output as JSON
```

**Example:**

```bash
$ selfhost plan

════════════════════════════════════════════════════════════
  Deployment Planning
════════════════════════════════════════════════════════════

INFRASTRUCTURE
────────────────────────────────────────────────────────────
┌────────────────┬─────────────────┬─────────────────┬────────────────┬────────────────┐
│ Node           │ IP              │ Roles           │ Resources      │ Allocated      │
├────────────────┼─────────────────┼─────────────────┼────────────────┼────────────────┤
│ k8s-master-01  │ 192.168.100.100 │ master, gateway │ 8 / 32Gi       │ 1500m / 1Gi    │
│ k8s-worker-01  │ 192.168.100.101 │ worker, storage │ 16 / 64Gi      │ 6000m / 8Gi    │
│ k8s-worker-02  │ 192.168.100.102 │ worker          │ 16 / 64Gi      │ 4000m / 4Gi    │
└────────────────┴─────────────────┴─────────────────┴────────────────┴────────────────┘

SERVICES
────────────────────────────────────────────────────────────
┌────────────┬───────────┬────────────────┬──────────────┐
│ Service    │ Namespace │ Node           │ Resources    │
├────────────┼───────────┼────────────────┼──────────────┤
│ traefik    │ ingress   │ k8s-master-01  │ 128Mi / 500m │
│ vault      │ service   │ k8s-master-01  │ 256Mi / 500m │
│ postgresql │ db        │ k8s-worker-01  │ 4Gi / 2000m  │
│ gitlab     │ code      │ k8s-worker-02  │ 4Gi / 4000m  │
└────────────┴───────────┴────────────────┴──────────────┘

RESOURCE UTILIZATION
────────────────────────────────────────────────────────────
  CPU:     ████████░░░░░░░░░░░░ 28%  11500m / 40000m
  Memory:  ██████░░░░░░░░░░░░░░ 18%  13Gi / 160Gi
  Storage: 80Gi requested

✔ Plan generated successfully
ℹ Run `selfhost deploy` to start deployment
```

---

### `selfhost deploy`

Deploy infrastructure and services.

```bash
selfhost deploy [options]

Options:
  --bypass-permissions   Skip all confirmation prompts
  --config <path>        Use YAML configuration file (headless mode)
  --skip-phase <phases>  Skip specific phases (comma-separated)
  --only-phase <phase>   Run only specific phase
  --dry-run              Show what would be executed
  --resume               Resume last incomplete deployment
  --fresh                Start fresh (cancel previous incomplete)
```

**Deployment Phases:**

| Phase | Name | Description |
|-------|------|-------------|
| 1 | Infrastructure Setup | Generate inventory, SSH keys, base packages |
| 2 | Kubernetes Bootstrap | Kubespray, cluster deployment, CNI |
| 3 | Storage Layer | OpenEBS, StorageClasses |
| 4 | Core Services | Namespaces, Traefik, Consul, Vault, cert-manager, Authentik |
| 5 | Databases | PostgreSQL, MongoDB, Valkey, MinIO, etc. |
| 6 | Application Services | All selected applications |
| 7 | Network & Gateway | Pangolin VPN, WireGuard, DNS |
| 8 | Verification | Helm tests, pod status, endpoints |

**Example with Resume:**

```bash
$ selfhost deploy

════════════════════════════════════════════════════════════
  Deployment
════════════════════════════════════════════════════════════

⚠ Found incomplete deployment from 2024-01-15T10:30:00Z
  Status         running
  Current phase  Databases
  Completed      3
  Failed         1

? What would you like to do?
  ❯ Resume from where it stopped
    Start fresh (cancel previous)
    Cancel
```

**Dry Run Example:**

```bash
$ selfhost deploy --dry-run

════════════════════════════════════════════════════════════
  Deployment
════════════════════════════════════════════════════════════

ℹ DRY RUN MODE - No changes will be made

▸ Phase 1: Infrastructure Setup
  ○ Generate Ansible inventory
  ○ Setup SSH keys on all nodes
  ○ Install base packages (Docker, containerd)
  ○ Configure firewall rules

▸ Phase 2: Kubernetes Bootstrap
  ○ Run Kubespray preparation
  ○ Deploy Kubernetes cluster
  ○ Configure kubectl context
  ○ Deploy CNI (Cilium/Calico)

...
```

#### `selfhost deploy history`

Show deployment history.

```bash
selfhost deploy history [options]

Options:
  --limit <n>    Number of deployments to show (default: 10)
```

**Example:**

```bash
$ selfhost deploy history --limit 3

════════════════════════════════════════════════════════════
  Deployment History
════════════════════════════════════════════════════════════

deploy-1705312200000
  Started           2024-01-15T10:30:00Z
  Completed         2024-01-15T11:45:00Z
  Status            success
  Phases completed  8
  Phases failed     0
  Phases skipped    0

deploy-1705225800000
  Started           2024-01-14T10:30:00Z
  Completed         2024-01-14T10:45:00Z
  Status            cancelled
  Phases completed  2
  Phases failed     1
  Phases skipped    0
```

#### `selfhost deploy clean`

Clean old deployment history.

```bash
selfhost deploy clean [options]

Options:
  --keep <n>    Number of deployments to keep (default: 10)
  --all         Remove all deployment history
```

---

### `selfhost status`

Show overall cluster and deployment status.

```bash
selfhost status [options]

Options:
  --json    Output as JSON
```

**Example:**

```bash
$ selfhost status

════════════════════════════════════════════════════════════
  Selfhost Status
════════════════════════════════════════════════════════════

▸ Configuration
  Config directory   /home/user/.selfhosted
  Project directory  /home/user/.selfhosted/projects/abc123def456
  Repository         /home/user/self-hosted

▸ Cluster Configuration
  Initialized        Yes
  Cluster name       production
  Domain             example.com
  Local domain       homelab.local
  Last deployment    2024-01-15T11:45:00Z
  Active deployment  None

▸ Machine Inventory
  Total machines  3
  Online          3
  Offline         0
  Masters         1
  Workers         2
  Gateways        1

▸ Services
  Total available  43
  Enabled          12
  Heavy            2
  Medium           4
  Light            6

▸ Resource Requirements
  Total CPU      11500m
  Total Memory   13Gi
  Total Storage  80Gi

▸ Validation
  Inventory  Valid
  Services   Valid

▸ Next Steps
  • Review plan: `selfhost plan`
  • Deploy: `selfhost deploy`
```

---

### `selfhost validate`

Validate all configurations.

```bash
selfhost validate [options]

Options:
  --config <path>    Validate YAML configuration file
  --strict           Fail on warnings
```

**Example:**

```bash
$ selfhost validate

════════════════════════════════════════════════════════════
  Validation
════════════════════════════════════════════════════════════

▸ Repository
  ✔ Repository found: /home/user/self-hosted
  ✔ Apps registry
  ✔ Ansible directory
  ✔ Charts directory

▸ Dependencies
  ✔ ssh
  ✔ ansible
  ✔ kubectl
  ✔ helm
  ✔ helmfile
  ✖ sops not installed

▸ Inventory
  ✔ Inventory is valid
  ⚠ No dedicated storage node. OpenEBS will run on worker/master nodes.

▸ Services
  ✔ Service selection is valid

⚠ Validation passed with warnings
```

---

### `selfhost config`

Manage CLI configuration.

#### `selfhost config show`

Show current configuration.

```bash
$ selfhost config show

════════════════════════════════════════════════════════════
  Current Configuration
════════════════════════════════════════════════════════════

  Version          1.0.0
  Initialized      true
  Cluster name     production
  Domain           example.com
  Local domain     homelab.local
  Last deployment  2024-01-15T11:45:00Z
```

#### `selfhost config set`

Set a configuration value.

```bash
selfhost config set <key> <value>

# Valid keys:
# - cluster.name
# - cluster.domain
# - cluster.localDomain
```

**Example:**

```bash
selfhost config set cluster.domain mycompany.com
```

#### `selfhost config generate`

Generate deployment.yaml template for headless mode.

```bash
selfhost config generate [options]

Options:
  --from-current    Generate from current configuration
```

**Example:**

```bash
$ selfhost config generate > deployment.yaml
```

---

## Headless Mode (CI/CD)

For automated deployments, create a `deployment.yaml` configuration file:

```yaml
# deployment.yaml
cluster:
  name: production
  domain: example.com
  local_domain: homelab.local

nodes:
  - ip: 203.0.113.50
    label: gateway-01
    roles: [gateway]
    ssh_user: root
    ssh_port: 22

  - ip: 192.168.100.100
    label: k8s-master-01
    roles: [master, storage]
    ssh_user: root
    ssh_port: 22

  - ip: 192.168.100.101
    label: k8s-worker-01
    roles: [worker]
    ssh_user: root
    ssh_port: 22

services:
  # Core services (always enabled)
  traefik: { enabled: true }
  vault: { enabled: true }
  consul: { enabled: true }
  authentik: { enabled: true }

  # Databases
  postgresql:
    enabled: true
    replicas: 2
    resources:
      memory: 4Gi
      cpu: "2"
    storage: 50Gi

  valkey:
    enabled: true
    resources:
      memory: 1Gi
      cpu: "500m"

  # Applications
  gitlab:
    enabled: true
    replicas: 1
    resources:
      memory: 8Gi
      cpu: "4"
    public_domain: git.example.com
    expose: true

  nextcloud:
    enabled: false

settings:
  bypass_permissions: true
  skip_phases: []
  parallel_deploys: 3
```

**Usage:**

```bash
# Validate configuration
selfhost validate --config deployment.yaml

# Deploy with configuration
selfhost deploy --config deployment.yaml --bypass-permissions

# Dry run
selfhost deploy --config deployment.yaml --dry-run
```

---

## Configuration Storage

All CLI data is stored in `~/.selfhosted/`:

```
~/.selfhosted/
├── config.yaml              # Global CLI configuration
├── cache/
│   └── facts/               # Cached machine facts
│       └── <machine-id>.yaml
├── state/
│   └── deploy-<timestamp>.yaml  # Deployment state for resume
└── projects/
    └── <repo-hash>/         # Per-repository configuration
        ├── inventory.yaml   # Machine inventory
        └── services.yaml    # Service selection & configuration
```

### Global Config (`~/.selfhosted/config.yaml`)

```yaml
version: 1.0.0
cluster:
  name: production
  domain: example.com
  localDomain: homelab.local
initialized: true
lastDeployment: "2024-01-15T11:45:00Z"
activeDeploymentId: null
```

### Inventory (`~/.selfhosted/projects/<hash>/inventory.yaml`)

```yaml
machines:
  - id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
    label: k8s-master-01
    ip: 192.168.100.100
    roles:
      - master
      - gateway
    ssh:
      host: 192.168.100.100
      port: 22
      username: root
    status: online
    lastSeen: "2024-01-15T12:00:00Z"
    facts:
      hostname: k8s-master-01
      os: ubuntu
      osVersion: "22.04"
      cpuCores: 8
      memoryTotal: 34359738368
```

---

## Machine Roles

| Role | Description | Services |
|------|-------------|----------|
| `master` | Kubernetes control plane | etcd, kube-apiserver, core services |
| `worker` | Kubernetes worker node | Application workloads |
| `gateway` | Public internet gateway | Traefik, Pangolin VPN |
| `storage` | Persistent storage | OpenEBS provisioner |
| `backups` | Backup target | Velero backup storage |

### Role Combinations

| Combination | Allowed | Use Case |
|-------------|---------|----------|
| `master + gateway` | ✅ | Single-node or small clusters |
| `master + worker` | ✅ | Small clusters without dedicated workers |
| `master + storage` | ✅ | Storage on control plane |
| `worker + storage` | ✅ | Dedicated storage workers |
| `gateway + worker` | ⚠️ | Not recommended (gateway should be lightweight) |

---

## Service Tiers

Services are categorized by resource requirements:

| Tier | Memory | Examples |
|------|--------|----------|
| **Heavy** | ≥ 2Gi | GitLab, ClickHouse, PostgreSQL |
| **Medium** | 512Mi - 2Gi | Authentik, n8n, Kestra |
| **Light** | < 512Mi | Traefik, Vault, Glance |

---

## Error Handling

During deployment, if a phase fails:

```
[!] Error deploying GitLab (code/gitlab)
    Error: Pod gitlab-0 CrashLoopBackOff - insufficient memory

    Options:
    [R] Retry deployment
    [S] Skip this service (continue)
    [A] Abort deployment
    [D] Debug (show logs)

    Select action: _
```

With `--bypass-permissions`, errors will automatically skip the failed service and continue.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SELFHOST_CONFIG_DIR` | Override config directory | `~/.selfhosted` |
| `SELFHOST_NO_COLOR` | Disable colored output | `false` |
| `SELFHOST_VERBOSE` | Enable verbose logging | `false` |

---

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | General error |
| 2 | Validation failed |
| 3 | SSH connection failed |
| 4 | Deployment aborted |

---

## Development

```bash
# Run in development mode
bun run dev

# Type check
bun run typecheck

# Lint
bun run lint

# Build
bun run build
```

---

## License

MIT
