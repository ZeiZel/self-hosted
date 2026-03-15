# Kubernetes Agent Context

**Module**: Kubernetes (Helm/Helmfile)
**Path**: `kubernetes/`
**Purpose**: Service deployment and management via Helm charts

---

## Architecture Overview

Helmfile is the **single entry point for all Helm chart deployments**:

```bash
helmfile -e k8s apply --selector name=<service>
```

**Never call Helmfile directly in production** - use Ansible infrastructure role.

---

## Directory Structure

```
kubernetes/
├── helmfile.yaml                  # Entry point
├── .helmfile/
│   ├── environments.yaml.gotmpl   # Environment configuration
│   ├── repositories.yaml          # Helm repositories
│   └── releases.yaml.gotmpl       # Release template
├── apps/
│   └── _others.yaml               # Service registry
├── charts/
│   └── <service>/                 # Custom Helm charts
│       ├── Chart.yaml
│       ├── values.yaml
│       ├── README.md
│       └── templates/
│           ├── _helpers.tpl
│           ├── serviceaccount.yaml
│           ├── rbac.yaml
│           ├── networkpolicy.yaml
│           ├── deployment.yaml
│           ├── service.yaml
│           ├── ingress.yaml
│           ├── servicemonitor.yaml
│           ├── pdb.yaml
│           └── tests/
│               └── test-connection.yaml
├── releases/
│   └── <service>.yaml.gotmpl      # Release value overrides
└── envs/
    └── k8s/
        ├── values.yaml            # Environment values
        └── secrets/
            └── _all.yaml          # SOPS-encrypted secrets
```

---

## Service Registry

Services are defined in `apps/_others.yaml`:

```yaml
gitlab:
  repo: charts                     # or external repo name
  chart: gitlab                    # chart name
  namespace: code                  # target namespace
  version: v1.0.0                  # chart version
  installed: true                  # false to disable
  needs:
    - ingress/traefik
    - service/vault
    - db/postgresql                # database dependency
```

**Deployment order is enforced by `needs`**:
```
namespaces → traefik → consul → vault → cert-manager → authentik → databases → applications
```

---

## Namespace Layout

| Namespace | Purpose | Services |
|-----------|---------|----------|
| `ingress` | Edge routing | Traefik, Consul |
| `service` | Platform services | Vault, Authentik, Prometheus, Grafana, Loki, cert-manager |
| `db` | Data layer | PostgreSQL, MongoDB, Valkey, MinIO, ClickHouse, MySQL, RabbitMQ |
| `code` | Development | GitLab, TeamCity, YouTrack, Hub, Coder |
| `productivity` | Collaboration | Affine, Excalidraw, Penpot, Notesnook |
| `social` | Communication | Stoat (Revolt), Stalwart (mail) |
| `data` | Personal data | Vaultwarden, Syncthing, Nextcloud, Rybbit |
| `infrastructure` | Operations | Glance, Bytebase, Pangolin, Harbor |
| `automation` | Workflows | Kestra, N8n |
| `content` | Publishing | Ghost |
| `utilities` | Miscellaneous | Vert, Metube |

---

## Database Connections

**All databases are in `db` namespace.** Use FQDN:

```yaml
# CORRECT
postgresql.db.svc.cluster.local:5432
mongodb.db.svc.cluster.local:27017
valkey-master.db.svc.cluster.local:6379
minio.db.svc.cluster.local:9000
clickhouse.db.svc.cluster.local:8123
mysql.db.svc.cluster.local:3306
rabbitmq.db.svc.cluster.local:5672

# WRONG
postgresql.code.svc.cluster.local  # Wrong namespace!
postgresql                          # Missing namespace!
```

---

## Mandatory Chart Templates

Every custom chart MUST include:

| Template | Purpose |
|----------|---------|
| `_helpers.tpl` | Template functions (fullname, labels, etc.) |
| `serviceaccount.yaml` | Pod identity |
| `rbac.yaml` | Role + RoleBinding (least privilege) |
| `networkpolicy.yaml` | Explicit ingress/egress rules |
| `deployment.yaml` | With security context, probes, resources |
| `service.yaml` | ClusterIP service |
| `ingress.yaml` | With Traefik and Authentik middleware |
| `servicemonitor.yaml` | Prometheus scraping |
| `pdb.yaml` | PodDisruptionBudget |
| `tests/test-connection.yaml` | Helm test |

---

## Security Context (Required)

```yaml
# values.yaml
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
    drop:
      - ALL
```

Use `emptyDir` volumes for writable paths (`/tmp`, `/cache`).

---

## Vault Integration

**Never create Kubernetes Secrets for credentials.** Use Vault Agent Injector:

```yaml
# deployment.yaml annotations
vault.hashicorp.com/agent-inject: "true"
vault.hashicorp.com/role: "<service>-role"
vault.hashicorp.com/agent-inject-secret-database: "database/creds/<service>-role"
vault.hashicorp.com/agent-inject-template-database: |
  {{- with secret "database/creds/<service>-role" -}}
  export DB_USERNAME="{{ .Data.username }}"
  export DB_PASSWORD="{{ .Data.password }}"
  {{- end }}
```

---

## NetworkPolicy Pattern

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ include "chart.fullname" . }}
spec:
  podSelector:
    matchLabels:
      {{- include "chart.selectorLabels" . | nindent 6 }}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Allow from Traefik
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress
          podSelector:
            matchLabels:
              app.kubernetes.io/name: traefik
      ports:
        - port: {{ .Values.service.targetPort }}
    # Allow Prometheus scraping
    - from:
        - namespaceSelector:
            matchLabels:
              name: service
          podSelector:
            matchLabels:
              app.kubernetes.io/name: prometheus
      ports:
        - port: metrics
  egress:
    # Allow DNS
    - to:
        - namespaceSelector:
            matchLabels:
              name: kube-system
      ports:
        - port: 53
          protocol: UDP
    # Allow database access
    - to:
        - namespaceSelector:
            matchLabels:
              name: db
      ports:
        - port: 5432  # PostgreSQL
```

---

## Helmfile Commands

```bash
# Preview changes
helmfile -e k8s diff --selector name=<service>

# Deploy single service
helmfile -e k8s apply --selector name=<service>

# Deploy all
helmfile -e k8s apply

# Destroy
helmfile -e k8s destroy --selector name=<service>

# Sync (update existing)
helmfile -e k8s sync --selector name=<service>
```

---

## Value Precedence

1. Chart defaults (`charts/<service>/values.yaml`) — lowest
2. Release overrides (`releases/<service>.yaml.gotmpl`)
3. Environment values (`envs/k8s/values.yaml`)
4. SOPS secrets (`envs/k8s/secrets/_all.yaml`) — highest

---

## Development Guidelines

### Creating New Chart

1. Copy from similar chart in `kubernetes/charts/`
2. Update `Chart.yaml` with name, version, description
3. Customize `values.yaml` for the service
4. Ensure all mandatory templates exist
5. Add NetworkPolicy rules for dependencies
6. Register in `apps/_others.yaml`
7. Create `releases/<service>.yaml.gotmpl`
8. Validate: `helm lint kubernetes/charts/<service>`

### Validation Commands

```bash
# Lint chart
helm lint kubernetes/charts/<service>

# Template and validate
helm template kubernetes/charts/<service> | kubeval

# Diff before apply
helmfile -e k8s diff --selector name=<service>
```

---

## Common Issues

### Pod CrashLoopBackOff

```bash
# Check logs
kubectl logs -n <namespace> <pod> --previous

# Common fixes:
# 1. Database connection - verify FQDN uses .db namespace
# 2. Missing secrets - check Vault annotations
# 3. Health check - increase initialDelaySeconds
# 4. Permission denied - add emptyDir for writable paths
```

### NetworkPolicy Blocking Traffic

```bash
# Debug
kubectl describe networkpolicy <name> -n <namespace>
kubectl exec -n <namespace> <pod> -- nc -zv postgresql.db.svc.cluster.local 5432

# Fix: Add egress rule for database namespace
```

### Prometheus Not Scraping

```bash
# Check ServiceMonitor exists
kubectl get servicemonitor -n <namespace>

# Fix: Ensure label is present
metadata:
  labels:
    prometheus: kube-prometheus
```

---

## SOPS Secrets

```bash
# Edit encrypted secrets
sops kubernetes/envs/k8s/secrets/_all.yaml

# View decrypted
sops -d kubernetes/envs/k8s/secrets/_all.yaml
```

---

## Integration Points

| System | Integration |
|--------|-------------|
| Ansible | Called by `infrastructure` role |
| Vault | Secrets injected via Agent Injector |
| Traefik | Ingress with Authentik middleware |
| Prometheus | ServiceMonitor CRD |
| cert-manager | TLS certificates |
