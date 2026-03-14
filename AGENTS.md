Отлично! Теперь на основе лучших практик из полученной информации доработаю AGENTS.md. Вот улучшенная версия:

***

# AGENTS.md

**AI Agent Context for Self-Hosted Infrastructure Platform**
**Version:** 2.0.0
**Last Updated:** February 1, 2026
**Compatible with:** GitHub Copilot, Cursor, Claude Code, OpenAI Codex, Windsurf, Aider, Jules

***

## 🎯 Quick Start for AI Agents

**You are working on an enterprise-grade self-hosted infrastructure platform** that runs 23+ services (GitLab, databases, monitoring, productivity tools) on Kubernetes with strict security, resource efficiency, and automation requirements.

**Before making ANY changes:**

1. ✅ Read `.docs/requirements.md` - Understand WHAT needs to be built
2. ✅ Read `.docs/arch-rules.md` - Learn HOW to build it (mandatory patterns)
3. ✅ Check `.docs/architecture.md` - See current state and integration points

**After making changes:**

1. ✅ Update `.docs/architecture.md` with your changes
2. ✅ Run validation checks (see Testing section)
3. ✅ Ensure all code quality gates pass

***

## Domain Responsibility Separation (CRITICAL)

**This platform has three distinct tools with non-overlapping responsibilities:**

### Helmfile = Kubernetes Deployment Orchestration
- Single entry point for ALL Helm chart deployments
- `kubernetes/apps/_others.yaml` defines service registry with `needs:` dependencies
- Deployment chain: `namespaces -> traefik -> consul -> vault -> cert-manager -> authentik -> databases -> apps`
- **NEVER call helmfile directly in production** - use Ansible

### Ansible = Infrastructure Provisioning and Orchestration
- ONLY tool for server provisioning and configuration
- ALL deployments run through: `ansible-playbook -i inventory/hosts.ini all.yml`
- Tags: `prepare`, `kubespray`, `storage`, `infrastructure`, `pangolin`, `monitoring`
- The `infrastructure` role calls Helmfile with appropriate selectors
- **Full installation = single Ansible run**

### CLI = Wrapper and Monitoring
- Wrapper around Ansible playbook execution
- Interactive prompts and deployment phase management
- Monitoring daemon for Telegram alerts
- **Does NOT directly interact with Kubernetes or Helm**

```
# Correct deployment flow:
User -> CLI (selfhost deploy) -> Ansible (all.yml) -> Helmfile -> Kubernetes
```

***

## Project Structure

```
self-hosted/
├── docs/                          # 📖 READ THESE FIRST
│   ├── requirements.md            # Business & technical requirements
│   ├── arch-rules.md              # Architecture patterns (MANDATORY)
│   └── architecture.md            # Current state (UPDATE AFTER CHANGES)
│
├── kubernetes/                    # Kubernetes infrastructure
│   ├── charts/<service>/          # Custom Helm charts
│   │   ├── Chart.yaml
│   │   ├── values.yaml
│   │   └── templates/
│   │       ├── serviceaccount.yaml    # REQUIRED
│   │       ├── rbac.yaml              # REQUIRED
│   │       ├── networkpolicy.yaml     # REQUIRED
│   │       ├── deployment.yaml
│   │       ├── service.yaml
│   │       ├── ingress.yaml
│   │       └── servicemonitor.yaml    # REQUIRED (Prometheus)
│   ├── releases/                  # Helmfile release definitions
│   ├── envs/k8s/                  # Environment values
│   └── helmfile.yaml              # Main deployment orchestration
│
├── ansible/                       # Ansible automation
│   ├── all.yml                    # Main playbook
│   ├── inventory/hosts.ini        # Infrastructure inventory
│   ├── group_vars/all/vault.yml   # Encrypted secrets
│   └── roles/                     # Ansible roles
│
└── docker/                        # Reference configs (NOT used in production)
    └── <service>/                 # Consult for env vars, ports, volumes
```

***

## 🔐 Critical Security Rules

**NEVER do these:**

- ❌ Hardcode secrets in values.yaml
- ❌ Use `:latest` image tags
- ❌ Deploy without NetworkPolicy
- ❌ Deploy without resource limits
- ❌ Use root user in containers
- ❌ Create Kubernetes Secrets (use Vault injection instead)

**ALWAYS do these:**

- ✅ Use Vault annotations for ALL secrets
- ✅ Set `runAsNonRoot: true` and `readOnlyRootFilesystem: true`
- ✅ Create ServiceAccount with minimal RBAC
- ✅ Define explicit NetworkPolicy ingress/egress rules
- ✅ Add Prometheus ServiceMonitor
- ✅ Configure health checks (liveness + readiness + startup)

***

## 🎨 Code Style & Conventions

### Naming Conventions

```yaml
Helm Charts:
  - Directory: lowercase-hyphenated (e.g., "my-service")
  - Templates: lowercase.yaml (e.g., "deployment.yaml")
  - Values: values.yaml, values-<env>.yaml

Kubernetes Resources:
  - Names: Generated via _helpers.tpl templates
  - Labels: Use standard app.kubernetes.io/* labels
  - Namespaces: ingress, service, db, code, productivity, social, data, infrastructure

Ansible:
  - Playbooks: lowercase_underscored.yml (e.g., "deploy_services.yml")
  - Roles: lowercase_underscored (e.g., "kubernetes_master")
  - Variables: snake_case (e.g., "database_host")
  - Tags: lowercase (e.g., "prepare", "deploy", "kubernetes")
```

### Database Connection Strings (CRITICAL!)

```yaml
# ✅ CORRECT - Use .db namespace
postgresql.db.svc.cluster.local:5432
mongodb.db.svc.cluster.local:27017
valkey-master.db.svc.cluster.local:6379
minio.db.svc.cluster.local:9000

# ❌ WRONG - These will fail
postgresql.code.svc.cluster.local  # Wrong namespace!
postgresql                          # Incomplete FQDN!
```

**Why this matters:** Services in `code`, `productivity`, etc. namespaces connect TO databases in `db` namespace. Wrong namespace = connection refused.

***

## 🏗️ Development Patterns

### Creating New Helm Chart

**Template to copy:** Check `kubernetes/charts/` for similar service, then:

```bash
# 1. Create structure
mkdir -p kubernetes/charts/<service>/{templates,tests}

# 2. Copy templates from similar chart (e.g., for web app, copy from nextcloud/)
cp -r kubernetes/charts/nextcloud/templates/* kubernetes/charts/<service>/templates/

# 3. MUST include these templates (non-negotiable):
templates/
├── _helpers.tpl           # Template functions
├── serviceaccount.yaml    # Pod identity
├── rbac.yaml              # Minimal permissions
├── networkpolicy.yaml     # Zero-trust networking
├── deployment.yaml        # Workload (with security context!)
├── service.yaml           # ClusterIP service
├── ingress.yaml           # External access
├── servicemonitor.yaml    # Prometheus metrics
├── pdb.yaml               # Disruption budget (for HA services)
└── tests/
    └── test-connection.yaml  # Helm test

# 4. Update values.yaml with service-specific config
# Reference: .docs/arch-rules.md section "HELM-003"

# 5. Validate
helm lint kubernetes/charts/<service>
helm template kubernetes/charts/<service> | kubeval
```

### Good and Bad Examples

**Good patterns to copy:**

- ✅ Security: `kubernetes/charts/nextcloud/templates/deployment.yaml` - Non-root, read-only FS
- ✅ NetworkPolicy: `kubernetes/charts/gitlab/templates/networkpolicy.yaml` - Explicit allows
- ✅ Monitoring: `kubernetes/charts/prometheus/templates/servicemonitor.yaml` - Metrics scraping
- ✅ Database config: `kubernetes/charts/authentik/values.yaml` - Correct namespace references

**Anti-patterns to avoid:**

- ❌ Legacy: `docker/<service>/docker-compose.yml` - Reference ONLY, never use in production
- ❌ Missing resources: Any deployment without `resources.requests/limits`
- ❌ Wrong namespace: Anything using `.code.svc.cluster.local` for databases

***

## 🧪 Testing

### Pre-Commit Validation

```bash
# Lint Helm charts
helm lint kubernetes/charts/<service>

# Validate Kubernetes manifests
helm template kubernetes/charts/<service> | kubeval

# Check for exposed secrets
git diff | grep -Ei "password|secret|token|api[_-]?key" && echo "⚠️  Possible secret exposed!"

# Lint Ansible (if modified)
cd ansible && ansible-lint *.yml
```

### Deployment Testing

```bash
# 1. Dry-run diff
cd kubernetes
helmfile -e k8s diff --selector name=<service>

# 2. Deploy to test
helmfile -e k8s apply --selector name=<service>

# 3. Verify pod status
kubectl get pods -n <namespace> -l app.kubernetes.io/name=<service>

# 4. Check logs
kubectl logs -n <namespace> -l app.kubernetes.io/name=<service> --tail=50

# 5. Run Helm tests
helm test <service> -n <namespace>

# 6. Verify metrics
kubectl port-forward -n <namespace> svc/<service> 9090:9090
curl http://localhost:9090/metrics
```

### Quality Gates

All of these MUST pass before merging:

```bash
✅ helm lint passes without errors
✅ kubeval validates all manifests
✅ No secrets in values.yaml (use Vault annotations)
✅ ServiceAccount + RBAC present
✅ NetworkPolicy with explicit rules
✅ Resource requests/limits defined
✅ Prometheus ServiceMonitor configured
✅ Health checks configured
✅ Deployment successful
✅ Pod reaches Running state
✅ Helm test passes
✅ docs/architecture.md updated
```

***

## 🚨 Common Issues & Solutions

### Issue: Pod CrashLoopBackOff

```bash
# Diagnostic
kubectl logs -n <namespace> <pod> --previous
kubectl describe pod -n <namespace> <pod>

# Common causes & fixes:
# 1. Database connection failed
#    → Check connection string uses .db.svc.cluster.local
# 2. Missing Vault secrets
#    → Verify vault.hashicorp.com/agent-inject: "true"
# 3. Health check timeout
#    → Increase initialDelaySeconds from 30 to 60
# 4. Permission denied
#    → Add emptyDir volumes for writable paths (/tmp, /cache)
```

### Issue: NetworkPolicy Blocking Traffic

```bash
# Diagnostic
kubectl describe networkpolicy <service> -n <namespace>
kubectl exec -n <namespace> <pod> -- nc -zv postgresql.db.svc.cluster.local 5432

# Fix: Add egress rule
egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: db
    ports:
    - protocol: TCP
      port: 5432  # PostgreSQL
```

### Issue: Prometheus Not Scraping

```bash
# Diagnostic
kubectl get servicemonitor -n <namespace>
kubectl logs -n service -l app.kubernetes.io/name=prometheus | grep <service>

# Fix: Ensure ServiceMonitor has correct label
metadata:
  labels:
    prometheus: kube-prometheus  # REQUIRED!
```

***

## 📝 Documentation Updates

**After ANY code change, update `docs/architecture.md`:**

```markdown
### Adding New Service

Update architecture.md with:
- Component inventory (name, namespace, version)
- Dependencies (databases, SSO, storage)
- Resource allocation (CPU, memory)
- Ingress URL
- Monitoring status

### Modifying Service

Update architecture.md with:
- Version changes
- Configuration changes
- Resource reallocation
- Breaking changes notes
```

***

## 🔄 Workflow Checklist

### For New Services

- [ ] Read `.docs/requirements.md` for service requirements
- [ ] Read `.docs/arch-rules.md` for implementation patterns
- [ ] Copy similar chart from `kubernetes/charts/`
- [ ] Create all REQUIRED templates (see Development Patterns)
- [ ] Configure database connections with `.db` namespace
- [ ] Add Vault annotations for secrets
- [ ] Add Prometheus ServiceMonitor
- [ ] Create NetworkPolicy with explicit rules
- [ ] Add to `kubernetes/releases/<namespace>.yaml.gotmpl`
- [ ] Test deployment (see Testing section)
- [ ] Update `.docs/architecture.md`
- [ ] Create chart README.md

### For Modifications

- [ ] Check `.docs/architecture.md` for current state
- [ ] Verify changes comply with `.docs/arch-rules.md`
- [ ] Make changes following existing patterns
- [ ] Run validation tests
- [ ] Update `.docs/architecture.md`
- [ ] Test in staging/dev environment

### For Ansible Roles

- [ ] Use tagged tasks for selective execution
- [ ] Store secrets in `group_vars/all/vault.yml` (encrypted)
- [ ] Make playbooks idempotent
- [ ] Test with `--check` mode first
- [ ] Document role in README.md

***

## 🎓 Learning Resources

### Essential Reading Order

1. `.docs/requirements.md` - Business requirements & technical specs
2. `.docs/arch-rules.md` - Architectural patterns (complete templates)
3. `.docs/architecture.md` - Current architecture state
4. Browse `kubernetes/charts/` - Real working examples

### Quick Reference Commands

```bash
# Helm
helm lint <chart>
helm template <chart> --debug
helm test <release> -n <namespace>

# Helmfile
helmfile -e k8s diff
helmfile -e k8s apply --selector name=<service>

# Kubectl
kubectl get pods -n <namespace>
kubectl logs -n <namespace> <pod> --tail=50
kubectl describe networkpolicy <service> -n <namespace>

# Ansible
ansible-playbook -i inventory/hosts.ini all.yml --tags <tag>
ansible-vault edit group_vars/all/vault.yml

# SOPS
sops kubernetes/envs/k8s/secrets/_all.yaml
```

***

## 🤖 AI Agent-Specific Notes

### Context Injection Tips

- Use `.docs/requirements.md` to understand business requirements
- Use `.docs/arch-rules.md` for complete template code
- Use `.docs/architecture.md` to see integration points
- Reference existing charts with `@kubernetes/charts/<service>/`

### When Stuck

1. **Ask clarifying questions** instead of guessing
2. **Propose a plan** before making large changes
3. **Check similar services** in `kubernetes/charts/`
4. **Consult arch-rules.md** for exact patterns

### Auto-Run Safety

**Safe to auto-run:**
- `helm lint`
- `helm template`
- `kubeval`
- `kubectl get`
- `kubectl describe`

**NEVER auto-run without approval:**
- `helm install/upgrade`
- `helmfile apply`
- `kubectl apply/delete`
- `ansible-playbook` (without --check)

***

## 📌 Key Principles

1. **Security First**: Never compromise on security controls
2. **Documentation Always**: Update architecture.md with every change
3. **Consistency Matters**: Follow existing patterns, don't invent new ones
4. **Test Everything**: Validate before committing
5. **Zero Trust**: Explicit NetworkPolicy for every service

**Success = Code works + Tests pass + Security validated + Docs updated** ✅

***

## 📞 Additional Context Files

For specific subsystems, see:

- `ansible/README.md` - Ansible playbook usage
- `kubernetes/charts/<service>/README.md` - Service-specific details
- `docker/<service>/README.md` - Reference configuration only

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

Use 'bd' for task tracking

<!-- bv-agent-instructions-v1 -->

---

## Beads Workflow Integration

This project uses [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) for issue tracking. Issues are stored in `.beads/` and tracked in git.

### Essential Commands

```bash
# View issues (launches TUI - avoid in automated sessions)
bv

# CLI commands for agents (use these instead)
bd ready              # Show issues ready to work (no blockers)
bd list --status=open # All open issues
bd show <id>          # Full issue details with dependencies
bd create --title="..." --type=task --priority=2
bd update <id> --status=in_progress
bd close <id> --reason="Completed"
bd close <id1> <id2>  # Close multiple issues at once
bd sync               # Commit and push changes
```

### Workflow Pattern

1. **Start**: Run `bd ready` to find actionable work
2. **Claim**: Use `bd update <id> --status=in_progress`
3. **Work**: Implement the task
4. **Complete**: Use `bd close <id>`
5. **Sync**: Always run `bd sync` at session end

### Key Concepts

- **Dependencies**: Issues can block other issues. `bd ready` shows only unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers, not words)
- **Types**: task, bug, feature, epic, question, docs
- **Blocking**: `bd dep add <issue> <depends-on>` to add dependencies

### Session Protocol

**Before ending any session, run this checklist:**

```bash
git status              # Check what changed
git add <files>         # Stage code changes
bd sync                 # Commit beads changes
git commit -m "..."     # Commit code
bd sync                 # Commit any new beads changes
git push                # Push to remote
```

### Best Practices

- Check `bd ready` at session start to find available work
- Update status as you work (in_progress → closed)
- Create new issues with `bd create` when you discover tasks
- Use descriptive titles and set appropriate priority/type
- Always `bd sync` before ending session

<!-- end-bv-agent-instructions -->
