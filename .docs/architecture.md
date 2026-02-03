# Architecture Documentation

**Project**: Self-Hosted Infrastructure Platform
**Last Updated**: February 2026
**Version**: 1.0.0
**Status**: Production-Ready

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

Self-hosted enterprise platform running 40+ services on Kubernetes with strict security, automation, and observability requirements.

### Key Characteristics

- **Kubernetes**: v1.28.5 (3-node cluster: 1 master, 2 workers)
- **CNI**: Calico v3.28.0 with IPIPCrossSubnet encapsulation
- **Storage**: OpenEBS hostpath provisioner
- **Ingress**: Traefik v3.4.0
- **Service Mesh**: Consul
- **Secrets**: HashiCorp Vault with auto-unseal
- **SSO**: Authentik
- **Monitoring**: Prometheus + Grafana + Loki
- **Backup**: Velero with MinIO backend

---

## Infrastructure

### Physical Infrastructure

**Home Server** (192.168.100.2):
- Proxmox VE hypervisor
- Hosts Kubernetes cluster VMs
- Connected via WireGuard VPN to gateway

**Gateway VPS** (80.90.178.207):
- Public-facing edge server
- Pangolin WireGuard VPN server
- Traefik edge router
- Routes traffic to cluster

### Kubernetes Cluster

```
Master Node: k8s-master-1
- IP: 192.168.100.10
- CPU: 4 cores
- RAM: 8 GB
- Disk: 50 GB
- Role: Control plane + workloads

Worker Node 1: k8s-worker-1
- IP: 192.168.100.11
- CPU: 4 cores
- RAM: 16 GB
- Disk: 100 GB
- Role: Workloads

Worker Node 2: k8s-worker-2
- IP: 192.168.100.12
- CPU: 4 cores
- RAM: 16 GB
- Disk: 100 GB
- Role: Workloads
```

### Ansible Roles

| Role | Purpose | Status |
|------|---------|--------|
| proxmox | Provision VMs on Proxmox | ✅ Complete |
| kubespray | Deploy Kubernetes cluster | ✅ Complete |
| cni | Configure Calico networking | ✅ Complete |
| storage | Deploy OpenEBS storage | ✅ Complete |
| pangolin | Setup WireGuard VPN | ✅ Complete |
| infrastructure | Deploy all services via Helmfile | ✅ Complete |
| monitoring | Verify Prometheus/Grafana | ✅ Complete |
| backup | Configure Velero backups | ✅ Complete |

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
          ├─ Master (10.99.0.10) ←→ Newt Client
          ├─ Worker-1 (10.99.0.11) ←→ Newt Client
          └─ Worker-2 (10.99.0.12) ←→ Newt Client
                │
                └─→ Cluster Traefik (ingress namespace)
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

**Total Services**: 42

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
- NetworkPolicy on all 23 custom charts (100% coverage)
- Default deny-all policy
- Explicit ingress from Traefik only
- Explicit egress to required services
- Service-specific database access

**Traffic Flow**:
```
Internet → Gateway VPS (TLS termination)
         → WireGuard tunnel (encrypted)
         → Cluster Traefik (mTLS)
         → Services (NetworkPolicy enforced)
```

### Identity & Access

**Pod Identity**:
- ServiceAccount for all 23 charts (100% coverage)
- RBAC Role + RoleBinding with least privilege
- Minimal permissions (pod/configmap read only)

**SSO**:
- Authentik for user authentication
- OAuth2 integration for all web apps
- LDAP backend for legacy apps

**Secrets Management**:
- HashiCorp Vault for all secrets
- Vault Agent Injector annotations
- Auto-rotation for database credentials
- No Kubernetes Secrets for app credentials

### Compliance

**Chart Compliance (100%):**
- ✅ NetworkPolicy: 23/23
- ✅ ServiceAccount: 23/23
- ✅ RBAC: 23/23
- ✅ ServiceMonitor: 23/23
- ✅ PodDisruptionBudget: 23/23
- ✅ Helm Tests: 23/23

**Security Context:**
- runAsNonRoot: true (all pods)
- readOnlyRootFilesystem: true (where possible)
- allowPrivilegeEscalation: false
- capabilities.drop: [ALL]

---

## Deployment Architecture

### Deployment Pipeline

```
1. Ansible: prepare → proxmox → kubespray → cni → storage
2. Infrastructure: prerequisites → base → apps → verify
3. Post-deployment: monitoring → backup
```

### Helmfile Deployment

**Tag-based deployment:**
```bash
# Full stack
ansible-playbook -i inventory/hosts.ini all.yml

# Base infrastructure only
ansible-playbook -i inventory/hosts.ini all.yml --tags base

# Specific service
ansible-playbook -i inventory/hosts.ini all.yml --tags vault

# Applications
ansible-playbook -i inventory/hosts.ini all.yml --tags apps
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
- **ServiceMonitor**: 23/23 charts (100% coverage)
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
| Security | ✅ Production | 100% |
| Monitoring | ✅ Production | 100% |
| Backup | ✅ Production | 100% |
| Documentation | ✅ Complete | 100% |

**Platform Status**: Production-Ready ✅

**Last Review**: February 2026
**Next Review**: Monthly
