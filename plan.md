# Development Roadmap: Self-Hosted Platform to Production

## Current State

**Ansible:** 4 complete roles, 1 partial (kubespray), 2 stubs (infrastructure, pangolin), 4+ missing
**Kubernetes:** 23 custom charts with major compliance gaps (NetworkPolicy: 1/23, Tests: 0/23)
**Docs:** `.docs/architecture.md` is empty
**Hardware:** 1 home server (192.168.100.2) + 1 remote VPS (80.90.178.207)

---

## Phase 0: Foundation Fixes

> Fix structural issues that block all subsequent work.

### 0.1 Fix `all.yml` playbook

**File:** `ansible/all.yml`

- Lines 19, 34, 49 reference `role: apps` — this role does not exist. **Fix:** change to `role: infrastructure`
- The `infrastructure` role uses a **nested tag system**:
  - Tag `base` — deploys: namespace, traefik, vault, consul
  - Tag `apps` — deploys: stoat, stalwart, youtrack, hub, teamcity, authentik, vaultwarden
  - Each individual service name is also a tag for granular deployment
- Add proper Ansible tags per arch-rules deployment chain: `prepare`, `kubespray`, `cni`, `storage`, `helmfile`, `pangolin`, `monitoring`, `security`
- Add a localhost pre-flight validation play (check tools, connectivity)

### 0.2 Harmonize inventory group names

**Files:** `ansible/inventory/*.ini`, `ansible/roles/kubespray/templates/inventory.yaml.j2`

- `all.yml` targets `master`, `workers`, `gateway`
- Kubespray template references `k8s_masters`, `k8s_workers`
- Pick one convention and apply everywhere
- Populate `node.ini` with example worker entry

### 0.3 Extend vault variables

**File:** `ansible/group_vars/all/vault.example.yml`

Current vault has only `user`, `root`, `ssh`. Add:
- `domain` (primary, public)
- `databases` (postgresql, mongodb, valkey, minio credentials)
- `smtp` (host, port, username, password)
- `oauth` (authentik bootstrap, gitlab root)
- `vpn.pangolin` (server_private_key, preshared_key)
- `vault` (unseal_keys, root_token)
- `monitoring` (grafana, prometheus credentials)
- `tls.letsencrypt` (email)

### 0.4 Pin versions in `vars.yml`

**File:** `ansible/group_vars/all/vars.yml`

- `pangolin_version: "latest"` and `gerbil_version: "latest"` — pin to exact versions

**Verification:** `ansible-playbook --syntax-check -i inventory/master.ini all.yml`

---

## Phase 1: Proxmox Role

> Install Proxmox on home server, provision VMs for K8s cluster.

**Create:** `ansible/roles/proxmox/`
**Depends on:** Phase 0
**Tag:** `proxmox`

This is a prerequisite for kubespray — VMs must exist before K8s can be deployed.

### Tasks

1. **Install Proxmox VE** on bare-metal home server (add Proxmox apt repo, GPG key, install `proxmox-ve` packages)
2. **Configure networking** — create Linux bridges for VM traffic (vmbr0 for management, vmbr1 for K8s internal)
3. **Configure storage** — local-lvm for VM disks, configure backup storage
4. **Create VM template** — Ubuntu 22.04/24.04 cloud-init template with:
   - SSH key injection from vault
   - Network configuration (static IPs on the 192.168.100.x subnet)
   - Package pre-installation (prerequisites for kubespray)
5. **Provision VMs** via Proxmox API (`proxmoxer` Python module) or `qm` CLI:
   - Master VM (e.g., 192.168.100.10)
   - Worker VM(s) (e.g., 192.168.100.11, .12)
   - Configure CPU/RAM/disk per VM
6. **Update Ansible inventory** — dynamically or via template, populate `master.ini` and `node.ini` with VM IPs
7. **Verify** — all VMs reachable via SSH

**Files to create:**
- `tasks/main.yml`, `tasks/install.yml`, `tasks/network.yml`, `tasks/template.yml`, `tasks/provision.yml`
- `defaults/main.yml` — VM specs, network config, Proxmox repo URL
- `templates/interfaces.j2` — network bridge config
- `templates/cloud-init-user.yml.j2` — VM user-data
- `meta/main.yml`

**Variables needed in `vars.yml`:**
- `proxmox_vms` — list of VMs with name, vmid, cores, memory, disk, ip
- `proxmox_storage` — storage pool name
- `proxmox_network_bridge` — bridge name
- `proxmox_template_vmid` — base template ID

---

## Phase 2: Kubespray Completion

> Complete the K8s cluster bootstrap role.

**File:** `ansible/roles/kubespray/`
**Depends on:** Phase 1 (VMs must exist)

### Tasks

1. **Create kubespray group_vars templates** (prepare.yml copies them but they don't exist):
   - `templates/group_vars/all/all.yml.j2` — kube_version, container_manager (containerd), etcd, cluster_name, network plugin
   - `templates/group_vars/k8s_cluster/addons.yml.j2` — metrics_server, helm, CoreDNS config

2. **Set `kubespray_custom_config: true`** in `vars/main.yml` (currently `false`)

3. **Create `defaults/main.yml`** — kube_version, pod_cidr, service_cidr, container_manager, cni_plugin

4. **Add `tasks/verify.yml`** — post-deployment checks:
   - All nodes Ready
   - kube-system pods Running
   - CoreDNS resolving
   - etcd healthy
   - kubectl accessible from controller

5. **Add worker scale-out logic** — detect existing cluster, run `scale.yml` instead of `cluster.yml`

6. **Add `tasks/reset.yml`** — cluster teardown via kubespray `reset.yml`

---

## Phase 3: Pangolin VPN Role

> Full WireGuard VPN tunnel between gateway VPS and cluster nodes.

**File:** `ansible/roles/pangolin/`
**Depends on:** Phase 0 (can run in parallel with Phases 1-2)

### 3.1 Restructure for dual mode

Current `main.yml` is a flat stub. Split into:
- `tasks/main.yml` — router, includes common.yml + gateway.yml or node.yml based on `tags` variable
- `tasks/common.yml` — shared: packages, sysctl, UFW (extract from current main.yml)
- `tasks/gateway.yml` — server-side
- `tasks/node.yml` — client-side

### 3.2 Gateway tasks (VPS — 80.90.178.207)

1. Download + install Pangolin server binary
2. Download + install Gerbil (tunnel orchestrator)
3. Install Traefik v3.4.0 as edge router
4. Generate/load WireGuard keys from vault
5. Deploy Pangolin server config from template
6. Deploy Traefik gateway config from template
7. Create systemd units for Pangolin + Gerbil + Traefik
8. Configure iptables NAT/MASQUERADE
9. Start + enable services
10. Verify tunnel listening on port 51820

**Templates:**
- `templates/pangolin-config.yaml.j2`
- `templates/traefik-gateway.yml.j2`
- `templates/pangolin-server.service.j2`
- `templates/gerbil.service.j2`

### 3.3 Node tasks (Cluster VMs)

1. Install Newt (Pangolin client)
2. Deploy client config (endpoint = gateway IP, keys)
3. Create systemd service for Newt
4. Start + enable
5. Verify tunnel connectivity (ping gateway through WireGuard)

**Templates:**
- `templates/newt-config.yaml.j2`
- `templates/newt.service.j2`

### 3.4 Supporting files

- `defaults/main.yml` — pangolin/wireguard/gerbil defaults
- `handlers/main.yml` — restart handlers

---

## Phase 4: Infrastructure Role (Helmfile Deployment)

> Automate full helmfile deployment pipeline with nested tags.

**File:** `ansible/roles/infrastructure/`
**Depends on:** Phases 2, 5.1, 5.2

### 4.1 Role structure

```
infrastructure/
  tasks/
    main.yml            # Router: includes prerequisites + base/apps based on tags
    prerequisites.yml   # helmfile, helm, helm-diff, SOPS GPG key, kubeconfig
    base.yml            # Tag "base": namespaces → traefik → consul → vault → cert-manager → authentik
    apps.yml            # Tag "apps": stoat, stalwart, youtrack, hub, teamcity, authentik, vaultwarden
    vault_unseal.yml    # Vault initialization + unsealing
    verify.yml          # All pods Running, helm tests pass
  defaults/main.yml     # helmfile_path, environment, timeouts
  handlers/main.yml
```

### 4.2 Tag system (matching README structure)

```yaml
# Tag hierarchy:
# infrastructure (role)
#   base (tag) — deploy base infrastructure
#     namespace (sub-tag)
#     traefik (sub-tag)
#     vault (sub-tag)
#     consul (sub-tag)
#   apps (tag) — deploy applications
#     stoat (sub-tag)
#     stalwart (sub-tag)
#     youtrack (sub-tag)
#     hub (sub-tag)
#     teamcity (sub-tag)
#     authentik (sub-tag)
#     vaultwarden (sub-tag)
```

Each task in base.yml and apps.yml is tagged with the individual service name so you can run:
- `--tags base` — deploy all base infra
- `--tags vault` — deploy only vault
- `--tags apps` — deploy all apps
- `--tags stoat` — deploy only stoat

### 4.3 Deployment logic per service

Each service deployment follows the pattern:
```yaml
- name: Deploy <service>
  command: "helmfile -e k8s apply --selector app=<service>"
  args:
    chdir: "{{ kubernetes_path }}"
  tags: [base, <service>]  # or [apps, <service>]
  register: result

- name: Wait for <service> pods
  command: "kubectl get pods -n <namespace> -l app.kubernetes.io/name=<service> -o jsonpath='{.items[*].status.phase}'"
  register: pod_status
  until: "'Pending' not in pod_status.stdout and 'ContainerCreating' not in pod_status.stdout"
  retries: 30
  delay: 10
  tags: [base, <service>]  # or [apps, <service>]
```

### 4.4 Vault unsealing

After Vault pod is ready:
1. `vault status` — check initialized
2. `vault operator init` if needed, save keys
3. Unseal with stored keys
4. Configure policies + auth methods

### 4.5 SOPS key distribution

Copy GPG key to master, import into keyring, verify decryption.

---

## Phase 5: Additional Ansible Roles

> Roles referenced in arch-rules tags but not yet created.

### 5.1 CNI Role

**Create:** `ansible/roles/cni/`
**Depends on:** Phase 2
**Tag:** `cni`

1. Detect current CNI plugin
2. Apply custom Calico IPPool config (pod CIDR, encapsulation)
3. Verify CNI pods Running
4. Verify cross-node pod-to-pod connectivity

### 5.2 Storage Role

**Create:** `ansible/roles/storage/`
**Depends on:** Phase 2
**Tag:** `storage`

1. Deploy OpenEBS via helm (`storageClass: openebs-hostpath` is used in env values)
2. Configure default StorageClass
3. Verify with test PVC
4. Variables: `storage_type`, `storage_class_name`, `openebs_version`

### 5.3 Monitoring Role

**Create:** `ansible/roles/monitoring/`
**Depends on:** Phase 4
**Tag:** `monitoring`

1. Verify Prometheus/Grafana/Loki pods (deployed via helmfile)
2. Import Grafana dashboards
3. Configure alerting rules
4. Configure Alertmanager routes
5. Verify ServiceMonitor discovery

### 5.4 Backup Role

**Create:** `ansible/roles/backup/`
**Depends on:** Phase 4
**Tag:** `backup`

1. Deploy Velero for K8s state backups
2. Configure PostgreSQL backups (pgBackRest/WAL-G)
3. Configure MongoDB backups (mongodump CronJob)
4. Configure MinIO replication
5. Retention: daily 7d, weekly 4w, monthly 12m
6. Create restore runbook
7. Test backup + restore cycle

---

## Phase 6: Kubernetes Chart Compliance

> Bring all 23 custom charts to arch-rules mandatory standards.

**Independent — can run in parallel with any phase.**

### Compliance matrix (current state)

| Template | Have | Missing | % |
|----------|------|---------|----|
| ServiceAccount | 3 | 20 | 13% |
| RBAC | 7 | 16 | 30% |
| NetworkPolicy | 1 | 22 | 4% |
| ServiceMonitor | 4 | 19 | 17% |
| PDB | 1 | 22 | 4% |
| tests/ | 0 | 23 | 0% |

### Batched remediation (by template type for consistency)

1. **Batch A: NetworkPolicy** (22 charts) — default deny-all + explicit ingress/egress per HELM-006
2. **Batch B: ServiceAccount** (20 charts) — pod identity per HELM-004
3. **Batch C: RBAC** (16 charts) — Role + RoleBinding per HELM-005
4. **Batch D: ServiceMonitor** (19 charts) — label `prometheus: kube-prometheus` per HELM-008
5. **Batch E: PDB** (22 charts) — PodDisruptionBudget per HELM-009
6. **Batch F: Helm Tests** (23 charts) — `tests/test-connection.yaml` per HELM-010

### Additional fixes

- **Create missing chart:** `kubernetes/charts/notesnook/` — registered in `_others.yaml` but directory missing
- **Pin image tags:** charts using `:latest` (remnawave, vert, etc.)
- **Migrate secrets to Vault:** charts with `secret.yaml` (vaultwarden, stalwart, youtrack, grafana, affine, supabase, remnawave) → Vault Agent Injector annotations
- **Standardize values.yaml:** align to HELM-003 (security context, resources, probes)

### Validation per chart

```bash
helm lint kubernetes/charts/<service>
helm template kubernetes/charts/<service> | kubeval
```

---

## Phase 7: Operational Readiness

> Production-grade tooling, documentation, automation.

**Depends on:** All previous phases

### 7.1 Populate `.docs/architecture.md`

- Component inventory (42 services: namespace, version, status)
- Network topology (Internet → Gateway VPS → VPN → Cluster Traefik → Services)
- Dependency graph
- Database allocation table
- Resource summary

### 7.2 Validation script

**Create:** `ansible/scripts/validate.sh`
- helm lint all charts
- kubeval manifests
- ansible-lint playbooks
- SOPS decryption test
- Secret leak check

### 7.3 Bootstrap script

**Create:** `ansible/scripts/bootstrap.sh`
- Prerequisites check
- SOPS key setup
- Ansible Vault init
- Full deployment
- Post-deploy verification

### 7.4 Root pre-commit hooks

**Create:** `.pre-commit-config.yaml` (root level, current one is only in `ansible/`)
- YAML lint, helm lint, ansible-lint, gitleaks, kubeval

### 7.5 CI/CD pipeline

- Validate: lint, kubeval, trivy
- Test: dry-run diff
- Deploy: manual gate

### 7.6 Operational runbooks

- Full stack deployment from scratch
- Single service update/rollback
- Add/remove worker node
- VPN tunnel troubleshooting
- Database backup/restore
- Certificate renewal + secret rotation
- Disaster recovery

---

## Implementation Order (Critical Path)

```
Phase 0  Foundation Fixes
  │
  ├─→ Phase 1  Proxmox (create VMs on home server)
  │     │
  │     └─→ Phase 2  Kubespray (deploy K8s on VMs)
  │           │
  │           ├─→ Phase 5.1  CNI
  │           ├─→ Phase 5.2  Storage
  │           │
  │           └─→ Phase 4  Infrastructure/Helmfile ──→ Phase 5.3 Monitoring
  │                                                ──→ Phase 5.4 Backup
  │
  ├─→ Phase 3  Pangolin VPN (parallel — targets VPS + nodes)
  │
  └─→ Phase 6  Chart Compliance (independent, parallel)

All ──→ Phase 7  Operational Readiness
```

**Recommended execution order:**
1. Phase 0 — Foundation Fixes
2. Phase 1 — Proxmox (home server) + Phase 3 — Pangolin (parallel, targets VPS)
3. Phase 2 — Kubespray (on Proxmox VMs)
4. Phase 5.1 — CNI → Phase 5.2 — Storage
5. Phase 4 — Infrastructure/Helmfile
6. Phase 6 — Chart Compliance (start earlier in parallel)
7. Phase 5.3 — Monitoring + Phase 5.4 — Backup
8. Phase 7 — Operational Readiness

---

## Key Files Summary

### Modify existing
- `ansible/all.yml` — change `role: apps` → `role: infrastructure`, add tags
- `ansible/group_vars/all/vars.yml` — add K8s/storage/proxmox vars, pin versions
- `ansible/group_vars/all/vault.example.yml` — extend with all secret categories
- `ansible/roles/kubespray/vars/main.yml` — set `kubespray_custom_config: true`
- `ansible/roles/pangolin/tasks/main.yml` — restructure for gateway/node split
- `ansible/roles/infrastructure/tasks/main.yml` — full rewrite with tagged deployment
- `ansible/inventory/*.ini` — harmonize group names

### Create new roles
- `ansible/roles/proxmox/` — VM provisioning
- `ansible/roles/cni/` — CNI configuration
- `ansible/roles/storage/` — storage provisioner
- `ansible/roles/monitoring/` — observability verification
- `ansible/roles/backup/` — backup automation

### Create in existing roles
- `ansible/roles/kubespray/` — defaults, templates, verify.yml, reset.yml
- `ansible/roles/pangolin/` — gateway.yml, node.yml, common.yml, defaults, handlers, 6 templates
- `ansible/roles/infrastructure/` — prerequisites.yml, base.yml, apps.yml, vault_unseal.yml, verify.yml, defaults

### Kubernetes (Phase 6)
- 22 charts: `networkpolicy.yaml`
- 20 charts: `serviceaccount.yaml`
- 16 charts: `rbac.yaml`
- 19 charts: `servicemonitor.yaml`
- 22 charts: `pdb.yaml`
- 23 charts: `tests/test-connection.yaml`
- New chart: `kubernetes/charts/notesnook/`

### Scripts & docs
- `.docs/architecture.md` — populate
- `ansible/scripts/validate.sh`
- `ansible/scripts/bootstrap.sh`
- `.pre-commit-config.yaml` (root)
