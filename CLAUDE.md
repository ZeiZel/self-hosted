# CLAUDE.md

Please read @AGENTS.md before starting. Follow all rules from that file.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Self-hosted infrastructure platform running 40+ services on Kubernetes. Ansible provisions bare-metal nodes, Helmfile orchestrates Helm chart deployments, SOPS encrypts secrets at rest, and Vault manages runtime secrets.

**Mandatory reading before any changes:**
1. `.docs/requirements.md` — what to build (business & technical specs)
2. `.docs/arch-rules.md` — how to build it (mandatory patterns, templates)
3. `.docs/architecture.md` — current state (update after every change)

## Repository Structure

```
kubernetes/
  charts/<service>/       Custom Helm charts (24 services)
  releases/<service>.yaml.gotmpl   Helmfile release value overrides
  apps/_others.yaml       App registry: repo, chart, namespace, version, needs
  .helmfile/              Helmfile base configs (environments, repositories, releases template)
  envs/k8s/               Environment values + SOPS-encrypted secrets
  helmfile.yaml           Entry point

ansible/
  all.yml                 Main playbook (tagged roles)
  inventory/              hosts.ini, master.ini, gateway.ini, node.ini
  roles/                  docker, kubespray, pangolin, security, etc.
  group_vars/all/vault.yml  Ansible Vault encrypted secrets

docker/<service>/         Reference docker-compose configs (NOT production)
docs/                     Docusaurus documentation site
```

## Key Commands

### Helm Chart Validation
```bash
helm lint kubernetes/charts/<service>
helm template kubernetes/charts/<service>
helm template kubernetes/charts/<service> | kubeval
```

### Helmfile Operations
```bash
# Diff before applying
helmfile -e k8s diff --selector name=<service>

# Deploy single service
helmfile -e k8s apply --selector name=<service>

# Deploy all
helmfile -e k8s apply
```

### Ansible
```bash
# Full deployment
ansible-playbook -i ansible/inventory/hosts.ini ansible/all.yml --vault-password-file ~/.ansible_vault_password

# Specific tags: prepare, kubespray, cni, storage, helmfile, pangolin, monitoring
ansible-playbook -i ansible/inventory/hosts.ini ansible/all.yml --tags <tag> --vault-password-file ~/.ansible_vault_password

# Specific host group
ansible-playbook -i ansible/inventory/master.ini ansible/all.yml --vault-password-file ~/.ansible_vault_password

# Edit encrypted secrets
ansible-vault edit ansible/group_vars/all/vault.yml --vault-password-file ~/.ansible_vault_password
sops kubernetes/envs/k8s/secrets/_all.yaml
```

### Secret Leak Check
```bash
git diff | grep -Ei "password|secret|token|api[_-]?key"
```

## Architecture Rules (Critical)

### Namespace Layout
Services are segregated by function. Database connections always cross namespaces:
- `ingress` — Traefik, Consul
- `service` — Vault, Authentik, Prometheus, Grafana, Loki, cert-manager
- `db` — PostgreSQL, MongoDB, Valkey, MinIO, ClickHouse, MySQL, RabbitMQ
- `code` — GitLab, TeamCity, YouTrack, Hub, Coder
- `productivity` — Affine, Excalidraw, Penpot, Notesnook
- `social` — Stoat (Revolt), Stalwart (mail)
- `data` — Vaultwarden, Syncthing, Nextcloud, Rybbit
- `infrastructure` — Glance, Bytebase, Pangolin, Harbor, Remnawave
- `automation` — Kestra, N8n
- `content` — Ghost
- `utilities` — Vert, Metube

### Database Connection Strings
All databases live in the `db` namespace. Services in other namespaces connect via FQDN:
```
postgresql.db.svc.cluster.local:5432
mongodb.db.svc.cluster.local:27017
valkey-master.db.svc.cluster.local:6379
minio.db.svc.cluster.local:9000
clickhouse.db.svc.cluster.local:8123
```
Never use short names or wrong namespaces.

### Every Helm Chart Must Include
- `serviceaccount.yaml` — pod identity
- `rbac.yaml` — Role + RoleBinding with least privilege
- `networkpolicy.yaml` — explicit ingress/egress (default deny)
- `servicemonitor.yaml` — Prometheus scraping with label `prometheus: kube-prometheus`
- `deployment.yaml` — with security context, health probes, resource limits
- `pdb.yaml` — PodDisruptionBudget for HA services
- `tests/test-connection.yaml` — Helm test pod

### Security Context (All Pods)
```yaml
podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000
  seccompProfile:
    type: RuntimeDefault
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: [ALL]
```
Use `emptyDir` volumes for `/tmp` and cache directories when filesystem is read-only.

### Secrets: Vault Injection Only
Never create Kubernetes Secrets for application credentials. Use Vault agent annotations:
```yaml
vault.hashicorp.com/agent-inject: "true"
vault.hashicorp.com/role: "<service>-role"
vault.hashicorp.com/agent-inject-secret-<name>: "<vault-path>"
```

### Image Tags
Always pin exact versions. Never use `:latest`.

## Helmfile App Registration

To add a new service, add an entry to `kubernetes/apps/_others.yaml`:
```yaml
<service>:
  repo: charts          # or external repo name from .helmfile/repositories.yaml
  chart: <chart-name>
  namespace: <namespace>
  version: v1.0.0
  installed: true       # omit or false to disable
  needs:
    - ingress/traefik
    - service/vault
    - db/postgres       # if uses PostgreSQL
```
Then create `kubernetes/releases/<service>.yaml.gotmpl` with value overrides. The releases template automatically picks up `releases/<service>.yaml.gotmpl` by convention.

## Helmfile Value Precedence
1. Chart defaults (`charts/<service>/values.yaml`) — lowest
2. Release overrides (`releases/<service>.yaml.gotmpl`)
3. Environment values (`envs/k8s/*.yaml`)
4. SOPS secrets (`envs/k8s/secrets/*.*`) — highest

## Creating a New Custom Helm Chart

1. Copy structure from a similar chart in `kubernetes/charts/`
2. Ensure all mandatory templates exist (see list above)
3. Follow `values.yaml` structure from `.docs/arch-rules.md` HELM-003
4. Set `ingress.className: traefik` with Authentik middleware annotation
5. Register in `kubernetes/apps/_others.yaml` with `needs` dependencies
6. Create release file `kubernetes/releases/<service>.yaml.gotmpl`
7. Validate: `helm lint kubernetes/charts/<service>`
8. Update `.docs/architecture.md`

## Deployment Dependency Chain
The `needs` field in `apps/_others.yaml` enforces ordering:
```
namespaces → traefik → consul → vault → cert-manager → authentik → databases → applications
```
Databases must deploy before any app that depends on them. Vault must deploy before anything needing secrets.

## Ansible Role Tags
Main playbook supports selective execution via tags:
`prepare`, `kubespray`, `cni`, `storage`, `helmfile`, `pangolin`, `monitoring`, `security`

## Network Architecture
Home servers sit behind NAT. Pangolin VPN (WireGuard) creates a tunnel from a public VPS gateway to the cluster. Traffic flow: Internet -> Gateway VPS -> VPN tunnel -> Cluster Traefik -> Services.

## Post-Change Checklist
- [ ] `helm lint` passes
- [ ] `kubeval` validates manifests
- [ ] No secrets in plain text
- [ ] ServiceAccount + RBAC present
- [ ] NetworkPolicy with explicit rules
- [ ] Resource requests/limits defined
- [ ] ServiceMonitor configured
- [ ] Health checks (liveness + readiness + startup)
- [ ] `.docs/architecture.md` updated
