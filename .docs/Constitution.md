# Project Constitution

**Self-Hosted Infrastructure Platform**
**Version:** 1.0.0
**Effective Date:** February 2026

---

## Core Principles

### 1. Security First
- **Zero Trust**: All network traffic requires explicit NetworkPolicy rules
- **Secrets in Vault**: Never create Kubernetes Secrets for credentials; use Vault Agent Injector
- **Least Privilege**: RBAC roles grant only minimum required permissions
- **Non-root Containers**: All pods run as non-root user (UID 1000)
- **Read-only Filesystem**: Containers use read-only root filesystem where possible

### 2. Infrastructure as Code
- **Everything Declarative**: All infrastructure defined in version-controlled code
- **No Manual Changes**: Direct `kubectl apply` or manual changes are prohibited
- **Idempotent Operations**: Running playbooks multiple times produces the same result
- **Single Command Deploy**: Full stack deploys via single Ansible run

### 3. Resource Efficiency
- **Database Consolidation**: Services share PostgreSQL/MongoDB/Valkey clusters
- **Connection Pooling**: PgBouncer for PostgreSQL, proper pool sizing
- **Resource Limits**: All pods have defined requests and limits
- **Storage Optimization**: Use dynamic provisioning, request only needed capacity

### 4. Observability from Day One
- **100% Metrics Coverage**: Every service exposes `/metrics` endpoint
- **Structured Logging**: JSON format to stdout/stderr, collected by Loki
- **ServiceMonitor Required**: All charts include Prometheus ServiceMonitor
- **Alerting**: PrometheusRules for critical failure scenarios

---

## Architecture Rules

### Domain Responsibility Separation

```
CLI (selfhost) --> Ansible (all.yml) --> Helmfile --> Kubernetes
     │                  │                    │
     │                  │                    └── Chart deployment
     │                  └── Server provisioning, orchestration
     └── User interface, monitoring daemon
```

**NEVER:**
- Call `helmfile apply` directly in production
- Create Kubernetes resources with `kubectl apply`
- Store secrets in plain text anywhere
- Bypass Ansible for server configuration

### Database Connection Strings

All databases live in the `db` namespace. Use FQDN:

```yaml
# CORRECT
postgresql.db.svc.cluster.local:5432
mongodb.db.svc.cluster.local:27017
valkey-master.db.svc.cluster.local:6379

# WRONG
postgresql.code.svc.cluster.local  # Wrong namespace!
postgresql                          # Missing namespace!
```

### Helm Chart Requirements

Every custom chart MUST include:

| Template | Purpose |
|----------|---------|
| `serviceaccount.yaml` | Pod identity |
| `rbac.yaml` | Role + RoleBinding |
| `networkpolicy.yaml` | Explicit ingress/egress |
| `servicemonitor.yaml` | Prometheus scraping |
| `deployment.yaml` | With security context |
| `pdb.yaml` | PodDisruptionBudget |
| `tests/test-connection.yaml` | Helm test |

---

## Code Standards

### Formatting & Linting

| Tool | Target | Command |
|------|--------|---------|
| helm lint | Helm charts | `helm lint kubernetes/charts/<service>` |
| kubeval | K8s manifests | `helm template <chart> \| kubeval` |
| ansible-lint | Playbooks | `cd ansible && ansible-lint *.yml` |
| ESLint | TypeScript (CLI) | `npm run lint` |

### Naming Conventions

```yaml
Helm Charts:
  directory: lowercase-hyphenated (e.g., "my-service")
  templates: lowercase.yaml (e.g., "deployment.yaml")
  values: values.yaml

Kubernetes:
  labels: app.kubernetes.io/* standard labels
  namespaces: lowercase (ingress, service, db, code, etc.)

Ansible:
  playbooks: lowercase_underscored.yml
  roles: lowercase_underscored
  variables: snake_case
  tags: lowercase
```

### Image Policy

- **Always pin exact versions** (e.g., `v1.2.3`)
- **Never use `:latest`**
- **Prefer SHA digests** for production

---

## Agent Guidelines

### For spec-developer

1. **Read first**: Check `.docs/arch-rules.md` for templates
2. **Copy existing**: Use similar chart as starting point
3. **Validate always**: Run `helm lint` before committing
4. **Update docs**: Modify `.docs/architecture.md` after changes

### For spec-reviewer

1. **Security check**: Verify NetworkPolicy, RBAC, SecurityContext
2. **Resource check**: Confirm requests/limits are defined
3. **Secret check**: No hardcoded credentials
4. **Namespace check**: Database connections use `.db.svc.cluster.local`

### For spec-tester

1. **Helm tests**: Verify `tests/test-connection.yaml` exists
2. **Dry run**: Use `helmfile diff` before apply
3. **Pod status**: Confirm pods reach Running state
4. **Metrics**: Verify ServiceMonitor scrapes successfully

### For team-lead

1. **Orchestrate**: Spawn appropriate specialist agents
2. **Track progress**: Use Beads for task management
3. **Quality gates**: Enforce all validation before merging
4. **Documentation**: Ensure `.docs/architecture.md` is updated

---

## Deployment Phases

| Phase | Ansible Tags | Description |
|-------|--------------|-------------|
| 0 | `server`, `docker` | Infrastructure setup |
| 1 | `kubespray` | Kubernetes bootstrap |
| 2 | `storage`, `openebs` | Storage layer |
| 3 | `backup`, `zerobyte` | Backup setup |
| 4 | `infrastructure`, `base` | Core services |
| 5 | `infrastructure`, `databases` | Databases |
| 6 | `infrastructure`, `apps` | Applications |
| 7 | `pangolin` | Network gateway |
| 8 | `validate` | Verification |

---

## Quality Checklist

Before merging any change:

- [ ] `helm lint` passes without errors
- [ ] `kubeval` validates all manifests
- [ ] No secrets in plain text (use Vault)
- [ ] ServiceAccount + RBAC present
- [ ] NetworkPolicy with explicit rules
- [ ] Resource requests/limits defined
- [ ] ServiceMonitor configured
- [ ] Health checks (liveness + readiness + startup)
- [ ] `.docs/architecture.md` updated

---

## Emergency Procedures

### Rollback Deployment

```bash
# Rollback specific service
helm rollback <service> -n <namespace>

# Via Helmfile
helmfile -e k8s -l name=<service> destroy
helmfile -e k8s -l name=<service> apply --set image.tag=<previous-version>
```

### Debug Pod Issues

```bash
# Check logs
kubectl logs -n <namespace> <pod> --previous

# Describe pod
kubectl describe pod -n <namespace> <pod>

# Network connectivity
kubectl exec -n <namespace> <pod> -- nc -zv postgresql.db.svc.cluster.local 5432
```

---

**This constitution is binding for all AI agents and human contributors.**
