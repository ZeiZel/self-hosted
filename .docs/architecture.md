# Architecture Documentation

**Project**: Self-Hosted Infrastructure Platform
**Last Updated**: July 1, 2026
**Version**: 2.0.0
**Status**: ⛔ NOT production-ready (see [production-readiness-review.md](./production-readiness-review.md))

## Table of Contents

- [Overview](#overview)
- [Infrastructure](#infrastructure)
- [Network Topology](#network-topology)
- [Component Inventory](#component-inventory)
- [Database Architecture](#database-architecture)
- [Security Architecture](#security-architecture)
- [Deployment Architecture](#deployment-architecture)
- [Resource Allocation](#resource-allocation)

---

## Overview

Self-hosted enterprise platform running ~46 registered services (29 custom app charts) on Kubernetes with strict security, automation, and observability requirements.

### Key Characteristics

- **Kubernetes**: v1.28+ bare-metal, single control-plane node; multi-node supported via `selfhost node add/remove` (kubespray)
- **CNI**: Calico v3.28.0 with IPIPCrossSubnet encapsulation
- **Storage**: OpenEBS hostpath provisioner
- **Routing**: Gateway API (HTTPRoute) via a shared `Gateway`; Traefik is the GatewayClass controller
- **Helm**: v4 (server-side apply; `--force-replace` disabled for compatibility)
- **Charts**: `chart-base` universal subchart renders every app chart (empty per-chart `templates/`)
- **Service Mesh**: Consul
- **Secrets**: HashiCorp Vault (target) + SOPS-encrypted env secrets; see Security Architecture for current gaps
- **SSO**: Authentik
- **Monitoring**: Prometheus + Grafana + Loki
- **Backup**: Velero with MinIO backend
- **Operator CLI**: `selfhost` — single static Go binary (Charm stack); native monitoring daemon

---

## Infrastructure

### Physical Infrastructure

**Home Server** (192.168.100.2):
- Bare-metal Ubuntu 25.10 server
- Single-node Kubernetes control plane + workers
- Connected via WireGuard VPN to gateway

**Gateway VPS** (80.90.178.207):
- Public-facing edge server
- Pangolin WireGuard VPN server
- Traefik edge router
- Routes traffic to cluster

### Kubernetes Cluster

```
Control plane: local-server (bare-metal)
- IP: 192.168.100.2
- VPN IP: 10.99.0.2
- OS: Ubuntu 25.10
- Role: Control plane + workloads
- Scale out/in with `selfhost node add <label>` / `selfhost node remove <label>`
  (kubespray scale / remove-node); worker, storage and backup node groups supported.
```

### Ansible Roles

Actual roles under `ansible/roles/` (all phases complete per the deployment epics):

| Role | Purpose | Status |
|------|---------|--------|
| setup_host | Prepare host tooling (Homebrew, deps, SSH) | ✅ Complete |
| server | Prepare server for Kubernetes | ✅ Complete |
| docker | Install Docker runtime | ✅ Complete |
| kubespray | Deploy/scale Kubernetes cluster | ✅ Complete |
| storage / storage-node | Deploy OpenEBS storage | ✅ Complete |
| backup / backup-node | NFS + restic + Velero backups | ✅ Complete |
| infrastructure | Deploy all services via Helmfile | ✅ Complete |
| monitoring | Verify Prometheus/Grafana/Loki | ✅ Complete |
| pangolin / wireguard-client | Pangolin gateway + WireGuard VPN | ✅ Complete |
| cert-manager | Configure ClusterIssuers | ✅ Complete |
| local-access | Local `<svc>.<domain>` access | ✅ Complete |
| apps | Node-level app config | ✅ Complete |
| validate | Post-deployment verification | ✅ Complete |

---

## Network Topology

```
Internet
   │
   ├─→ Gateway VPS (80.90.178.207)
   │      ├─ Pangolin VPN Server (10.99.0.1)
   │      ├─ Traefik Edge Router (:80, :443)
   │      └─ Gerbil Orchestrator
   │
   └─→ WireGuard Tunnel (10.99.0.0/24)
          │
          ├─ Control plane (10.99.0.10) ←→ Newt Client
          └─ Additional nodes (10.99.0.1x) ←→ Newt Client   # added via `selfhost node add`
                │
                └─→ Traefik Gateway — Gateway API (ingress namespace)
                       │
                       ├─→ service/* (Vault, Consul, Authentik, Prometheus, Grafana)
                       ├─→ db/* (PostgreSQL, MongoDB, Valkey, MinIO, ClickHouse, MySQL, RabbitMQ)
                       ├─→ code/* (GitLab, Hub, YouTrack, TeamCity, Coder)
                       ├─→ social/* (Stoat/Revolt, Stalwart/Mail)
                       ├─→ data/* (Vaultwarden, Syncthing, Nextcloud, Rybbit)
                       ├─→ productivity/* (Affine, Excalidraw, Penpot, Notesnook)
                       ├─→ automation/* (Kestra, N8n)
                       ├─→ content/* (Ghost)
                       ├─→ utilities/* (Vert, Metube)
                       └─→ infrastructure/* (Glance, Bytebase, Harbor, Pangolin, Remnawave)
```

### Port Allocation

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| Traefik | 80 | TCP | HTTP |
| Traefik | 443 | TCP | HTTPS |
| Traefik | 8080 | TCP | Dashboard |
| Pangolin | 51820 | UDP | WireGuard |
| Kubernetes API | 6443 | TCP | API Server |
| etcd | 2379-2380 | TCP | etcd cluster |

---

## Component Inventory

> All app charts below render their Kubernetes resources through the shared
> `chart-base` subchart (see [Operator Tooling](#operator-tooling)); versions shown are
> the release/app versions from `kubernetes/apps/*.yaml`.

### Base Infrastructure (namespace: ingress, service)

| Component | Version | Namespace | Status | Dependencies |
|-----------|---------|-----------|--------|--------------|
| Namespaces | v1.0.0 | default | ✅ Deployed | - |
| Traefik | v37.2.0 | ingress | ✅ Deployed | - |
| Consul | >=1.0.0 | service | ✅ Deployed | Traefik |
| Vault | v1.0.0 | service | ✅ Deployed | Traefik, Consul |
| cert-manager | v1.19.1 | service | ✅ Deployed | Vault |
| Authentik | >=2024.0.0 | service | ✅ Deployed | Traefik, Consul, PostgreSQL, Valkey, Vault |
| Monitoring | v1.0.0 | service | ✅ Deployed | Traefik, Consul, Vault |
| Logging | v1.0.0 | service | ✅ Deployed | Traefik, Consul, Vault, Authentik, Monitoring |

### Databases (namespace: db)

| Component | Version | Namespace | Storage | Backup | Dependencies |
|-----------|---------|-----------|---------|--------|--------------|
| PostgreSQL | >=0.0.0 | db | 50Gi PVC | Daily | Traefik, Vault |
| MongoDB | >=0.0.0 | db | 50Gi PVC | Daily | Traefik, Vault |
| Valkey (Redis) | >=0.0.0 | db | 20Gi PVC | N/A | Traefik, Vault |
| MinIO | >=0.0.0 | db | 100Gi PVC | Replication | Traefik, Vault |
| ClickHouse | >=0.0.0 | db | 100Gi PVC | Daily | Traefik, Vault |
| MySQL | >=0.0.0 | db | 50Gi PVC | Daily | Traefik, Vault |
| RabbitMQ | >=0.0.0 | db | 20Gi PVC | N/A | Traefik, Vault |
| Supabase | >=0.0.0 | db | - | N/A | PostgreSQL, MinIO, Valkey, Traefik, Vault |

### Code & CI/CD (namespace: code)

| Component | Version | Namespace | Storage | Dependencies |
|-----------|---------|-----------|---------|--------------|
| GitLab | >=8.0.0 | code | 100Gi PVC | Traefik, Consul, PostgreSQL, Valkey, Vault |
| Hub (JetBrains) | v1.0.0 | code | 20Gi PVC | Traefik, Consul, PostgreSQL, Vault |
| YouTrack | v1.0.0 | code | 50Gi PVC | Traefik, Consul, Hub, PostgreSQL, Vault |
| TeamCity | v1.0.0 | code | 100Gi PVC | Traefik, Consul, PostgreSQL, Vault |
| Coder | v1.0.0 | code | 50Gi PVC | Traefik, Consul, cert-manager, Authentik, PostgreSQL, Vault, GitLab |

### Productivity (namespace: productivity)

| Component | Version | Namespace | Storage | Dependencies |
|-----------|---------|-----------|---------|--------------|
| Affine | v1.0.0 | productivity | 20Gi PVC | Traefik, Consul, PostgreSQL, Valkey, MinIO, Vault |
| Notesnook | v1.0.0 | productivity | 10Gi PVC | Traefik, Consul, Vault |
| Excalidraw | v1.0.0 | productivity | 5Gi PVC | Traefik, Consul, Vault |
| Penpot | v0.28.0 | productivity | 20Gi PVC | Traefik, Consul, Vault |

### Social (namespace: social)

| Component | Version | Namespace | Storage | Dependencies |
|-----------|---------|-----------|---------|--------------|
| Stoat (Revolt) | v1.0.0 | social | 50Gi PVC | Traefik, Consul, Valkey, MongoDB, MinIO, RabbitMQ, Authentik, Vault, Stalwart |
| Stalwart (Mail) | v1.0.0 | social | 50Gi PVC | Traefik, Consul, Authentik, Vault |

### Data & Storage (namespace: data)

| Component | Version | Namespace | Storage | Dependencies |
|-----------|---------|-----------|---------|--------------|
| Vaultwarden | v1.0.0 | data | 10Gi PVC | Traefik, Consul, PostgreSQL, Vault |
| Syncthing | v1.0.0 | data | 100Gi PVC | Traefik, Consul, Vault |
| Nextcloud | v1.0.0 | data | 100Gi PVC | Traefik, Consul, PostgreSQL, Valkey, Vault |
| Rybbit | v1.0.0 | data | 50Gi PVC | Traefik, Consul, PostgreSQL, ClickHouse, Vault |

### Infrastructure Tools (namespace: infrastructure)

| Component | Version | Namespace | Storage | Dependencies |
|-----------|---------|-----------|---------|--------------|
| Glance | v1.0.0 | infrastructure | 5Gi PVC | Traefik, Consul, Vault |
| Bytebase | v1.0.0 | infrastructure | 20Gi PVC | Traefik, Consul, PostgreSQL, Vault |
| Harbor | v1.0.0 | infrastructure | 100Gi PVC | Traefik, PostgreSQL, Valkey, Vault |
| Pangolin | v1.0.0 | infrastructure | - | Consul, Vault |
| Remnawave | v1.0.0 | infrastructure | 20Gi PVC | Traefik, Consul, cert-manager, Authentik, PostgreSQL, Valkey, Vault |
| Devtron | v1.0.0 | devtroncd | 50Gi PVC | Traefik, PostgreSQL, Vault |

### Automation (namespace: automation)

| Component | Version | Namespace | Storage | Dependencies |
|-----------|---------|-----------|---------|--------------|
| Kestra | >=0.0.0 | automation | 50Gi PVC | Traefik, Consul, cert-manager, Authentik, PostgreSQL, MinIO, Vault |
| N8n | >=0.0.0 | automation | 20Gi PVC | Traefik, Consul, cert-manager, Authentik, PostgreSQL, Valkey, Vault |

### Content (namespace: content)

| Component | Version | Namespace | Storage | Dependencies |
|-----------|---------|-----------|---------|--------------|
| Ghost | v1.0.0 | content | 20Gi PVC | Traefik, Consul, cert-manager, Authentik, MySQL, Vault |

### Utilities (namespace: utilities)

| Component | Version | Namespace | Storage | Dependencies |
|-----------|---------|-----------|---------|--------------|
| Vert | v1.0.0 | utilities | - | Traefik, Consul |
| Metube | v1.0.0 | utilities | 50Gi PVC | Traefik, Consul |

**Total registered services**: ~46 across `kubernetes/apps/*.yaml` (29 custom app charts + external charts such as Traefik, cert-manager, Authentik, GitLab, databases).

---

## Database Architecture

### Database Allocation

| Database | Consumers | Purpose |
|----------|-----------|---------|
| **PostgreSQL** | Authentik, GitLab, Hub, YouTrack, TeamCity, Coder, Affine, Nextcloud, Bytebase, Harbor, Kestra, N8n, Vaultwarden, Rybbit, Supabase | Primary relational database |
| **MongoDB** | Stoat (Revolt) | NoSQL document store for chat messages |
| **Valkey/Redis** | Authentik, GitLab, Affine, Nextcloud, Harbor, N8n, Stoat, Supabase | Caching and session storage |
| **MinIO** | Affine, Stoat, Kestra, Supabase | S3-compatible object storage |
| **ClickHouse** | Rybbit | Analytics database |
| **MySQL** | Ghost | Content management |
| **RabbitMQ** | Stoat (Revolt) | Message queue |

### Connection Strings

All databases are accessed via Kubernetes service FQDN:

```
postgresql.db.svc.cluster.local:5432
mongodb.db.svc.cluster.local:27017
valkey-master.db.svc.cluster.local:6379
minio.db.svc.cluster.local:9000
clickhouse.db.svc.cluster.local:8123
mysql.db.svc.cluster.local:3306
rabbitmq.db.svc.cluster.local:5672
```

---

## Security Architecture

### Network Security

**Zero-Trust Networking**:
- NetworkPolicy rendered by `chart-base` for every consuming app chart
- Default deny-all policy (base policies in the `namespaces` chart)
- Explicit ingress from the Traefik Gateway only
- Explicit egress to required services
- Service-specific database access

**Traffic Flow**:
```
Internet → Gateway VPS (TLS termination)
         → WireGuard tunnel (encrypted)
         → Traefik Gateway — Gateway API (HTTPRoute)
         → Services (NetworkPolicy enforced)
```

### Identity & Access

**Pod Identity**:
- ServiceAccount rendered by `chart-base` for every consuming app chart
- RBAC Role + RoleBinding with least privilege
- Minimal permissions (pod/configmap read only)

**SSO**:
- Authentik for user authentication
- OAuth2 integration for all web apps
- LDAP backend for legacy apps

**Secrets Management** (target vs actual):
- **Target**: HashiCorp Vault Agent Injector for all app credentials; no Kubernetes Secrets.
- **Actual**: `chart-base/templates/secrets.yaml` still renders `kind: Secret` from values,
  and SOPS encrypts `kubernetes/envs/k8s/secrets/_all.yaml` — but the active Helmfile path
  reads the **plaintext** `_all_plain.yaml` (temporary bootstrap file). Full Vault injection
  is not yet met. See [production-readiness-review.md](./production-readiness-review.md)
  (B-1, H-2, H-3).

### Compliance

**Chart Compliance** — provided centrally by `chart-base` for all consuming app charts
(the 29 app charts have empty `templates/` and inherit these resources):
- ✅ NetworkPolicy (chart-base `networkpolicy.yaml`)
- ✅ ServiceAccount (chart-base `rbac.yaml`)
- ✅ RBAC Role/RoleBinding (chart-base `rbac.yaml`)
- ✅ ServiceMonitor (chart-base `observability.yaml`, label `prometheus: kube-prometheus`)
- ✅ PodDisruptionBudget (chart-base `observability.yaml`)
- ✅ Helm Tests (chart-base `tests.yaml`)
- Exempt (keep their own templates): `namespaces`, `gitlab-ingress`.

**Security Context** — mandatory defaults set in `chart-base/templates/_helpers.tpl`:
- runAsNonRoot: true, runAsUser/fsGroup: 1000, seccompProfile: RuntimeDefault (pod level)
- readOnlyRootFilesystem: true, allowPrivilegeEscalation: false, capabilities.drop: [ALL] (container level)

---

## Deployment Architecture

### Domain Responsibility Separation

The platform uses three tools with distinct responsibilities:

| Tool | Responsibility | Entry Point |
|------|----------------|-------------|
| **CLI** (`selfhost`, Go/Charm binary) | User interface, wizards, inventory/services/plan/balance, phased deploy, monitor TUI, native daemon | `selfhost deploy` |
| **Ansible** | Server provisioning, orchestration, secret management | `ansible-playbook all.yml` |
| **Helmfile** | Kubernetes/Helm chart deployment | `helmfile apply` (called by Ansible) |

**Deployment Flow:**
```
User → CLI (selfhost deploy) → Ansible (all.yml) → Helmfile → Kubernetes
```

### CLI Commands

```bash
# Full deployment through phased execution
selfhost deploy

# Direct Ansible tag execution
selfhost deploy --tags infrastructure,databases

# Dry run (Ansible --check mode)
selfhost deploy --dry-run

# Apply individual Helmfile releases locally (bypasses phases; e.g. on Docker Desktop)
selfhost deploy release namespaces cert-manager

# Node scaling (kubespray)
selfhost node add worker-2
selfhost node remove worker-2

# Live monitoring dashboard (TUI) + background daemon
selfhost monitor
selfhost daemon start
selfhost daemon stop
```

### Deployment Pipeline

```
1. Ansible: prepare → kubespray → cni → storage
2. Infrastructure: prerequisites → base → apps → verify
3. Post-deployment: monitoring → backup
```

### Ansible Tags

| Tag | Description | Phase |
|-----|-------------|-------|
| `server` | Server preparation | Infrastructure Setup |
| `docker` | Docker installation | Infrastructure Setup |
| `kubespray` | Kubernetes deployment | Kubernetes Bootstrap |
| `storage` | OpenEBS storage | Storage Layer |
| `openebs` | OpenEBS operators | Storage Layer |
| `backup` | Backup configuration | Backup Setup |
| `zerobyte` | Zerobyte UI | Backup Setup |
| `infrastructure` | All Helmfile services | Core/DB/Apps |
| `base` | Core infrastructure | Core Services |
| `databases` | All databases | Databases |
| `apps` | All applications | Application Services |
| `pangolin` | VPN configuration | Network Gateway |
| `validate` | Verification tests | Verification |

### Helmfile Deployment

**Tag-based deployment:**
```bash
# Full stack
ansible-playbook -i inventory/hosts.ini all.yml

# Base infrastructure only
ansible-playbook -i inventory/hosts.ini all.yml --tags infrastructure,base

# Databases
ansible-playbook -i inventory/hosts.ini all.yml --tags infrastructure,databases

# Applications
ansible-playbook -i inventory/hosts.ini all.yml --tags infrastructure,apps
```

### Dependency Chain

```
Namespaces → Traefik → Consul → Vault (unsealed) → cert-manager → Authentik → Databases → Applications
```

---

## Resource Allocation

### Cluster Resources

| Node | CPU | RAM | Disk | Utilization |
|------|-----|-----|------|-------------|
| Master | 4 cores | 8 GB | 50 GB | ~60% |
| Worker-1 | 4 cores | 16 GB | 100 GB | ~70% |
| Worker-2 | 4 cores | 16 GB | 100 GB | ~70% |
| **Total** | **12 cores** | **40 GB** | **250 GB** | **~67%** |

### Storage Allocation

| PVC | Size | Usage | Service |
|-----|------|-------|---------|
| postgresql-data | 50Gi | ~30Gi | PostgreSQL |
| mongodb-data | 50Gi | ~20Gi | MongoDB |
| minio-data | 100Gi | ~50Gi | MinIO |
| gitlab-data | 100Gi | ~40Gi | GitLab |
| nextcloud-data | 100Gi | ~60Gi | Nextcloud |
| harbor-registry | 100Gi | ~70Gi | Harbor |
| **Total** | **~600Gi** | **~350Gi** | All services |

### Backup Schedule

| Type | Schedule | Retention | Target |
|------|----------|-----------|--------|
| Kubernetes state | Daily 2 AM | 7 days | Velero → MinIO |
| PostgreSQL | Daily 1 AM | 7 days, 4 weeks, 12 months | CronJob → MinIO |
| MongoDB | Daily 1:30 AM | 7 days | CronJob → MinIO |
| Weekly full | Sunday 3 AM | 30 days | Velero → MinIO |
| Monthly full | 1st of month 4 AM | 365 days | Velero → MinIO |

---

## Monitoring & Observability

### Metrics

- **Prometheus**: Metrics collection (30s scrape interval)
- **Grafana**: Dashboards (Kubernetes, Node Exporter, Traefik, PostgreSQL)
- **ServiceMonitor**: rendered by `chart-base` for every consuming app chart (label `prometheus: kube-prometheus`)
- **Alertmanager**: Alert routing (Slack integration)

### Logging

- **Loki**: Log aggregation
- **Promtail**: Log collection
- **Grafana**: Log visualization

### Alerting Rules

- NodeDown (critical): Node offline > 5min
- PodCrashLooping (warning): Restarts > 0 in 15min
- PVFillingUp (warning): PV < 10% free

---

## Status Summary

| Category | Status | Coverage |
|----------|--------|----------|
| Infrastructure | ✅ Production | 100% |
| Networking | ✅ Production | 100% |
| Storage | ✅ Production | 100% |
| Security | ⛔ Blockers | see review |
| Monitoring | ✅ Production | 100% |
| Backup | ✅ Production | 100% |
| Documentation | ✅ Complete | 100% |

**Platform Status**: ⛔ **NOT production-ready** — the production-readiness review
returned a **NO-GO** verdict (5 blockers). See
[`production-readiness-review.md`](./production-readiness-review.md) for the full
findings and remediation checklist (plaintext secrets file, mutable image tags,
consul missing NetworkPolicy/RBAC/PDB, workloads without securityContext, charts
creating K8s Secrets from values).

**Last Review**: July 1, 2026 (production-readiness re-audit after chart-base migration)
**Next Review**: After blockers remediated

---

## Operator Tooling

- **`cli/`** — operator CLI, a single static Go binary `selfhost` (Charm stack:
  cobra + bubbletea + lipgloss + bubbles + ntcharts + huh). Full feature set:
  inventory/services/plan/balance, phased resumable deploy, monitor TUI, native
  monitoring daemon (launchd/systemd, replacing the old Bun-in-Docker daemon),
  Telegram alerting + inbound command bot. State lives under `~/.selfhosted`.
  (Replaced the former Bun + NestJS + Ink implementation, June 2026.)
- **`docker/qdrant/`** — local QDrant + qdrant MCP server for agent semantic
  memory / token optimisation (developer tooling; not part of the platform).
- **Helm charts** — `kubernetes/chart-base/` is a generic `type: application` subchart
  (v0.1.0) that renders all resources for every app chart. Each app chart has an **empty
  `templates/`** dir (only `.gitkeep`), declares `chart-base` as a `file://../../chart-base` dependency,
  and supplies config under a `chart-base:` values key; helmfile vendors the
  dependency at apply time. Routing is Gateway API (HTTPRoute) via the shared
  `Gateway` in the `namespaces` chart. Exempt: `namespaces` and `gitlab-ingress`.
