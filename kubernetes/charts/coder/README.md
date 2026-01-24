# Coder Helm Chart

Self-hosted remote development environments with full infrastructure integration.

## Overview

This Helm chart deploys Coder, a platform for creating and managing cloud-based development workspaces. It includes:

- **Coder Server**: Main control plane for managing workspaces
- **Workspace Templates**: Pre-configured templates for Node.js, Python, Go, Docker, and Kubernetes
- **AgentAPI**: Integration endpoint for AI coding assistants
- **SSO Integration**: Authentik OIDC authentication
- **GitLab Integration**: OAuth for repository access
- **Monitoring**: Prometheus metrics and Grafana dashboards
- **Auto-scaling**: HPA for dynamic resource management

## Features

### 🚀 Workspace Templates

- **Node.js**: Node.js 20 LTS, Bun, TypeScript, pnpm, yarn
- **Python**: Python 3.11+, Poetry, pip, virtualenv
- **Go**: Go 1.22+, gopls, golangci-lint
- **Docker-in-Docker**: Full Docker daemon for container builds
- **Kubernetes Native**: kubectl, Helm, direct K8s API access

### 🤖 AI Agent Integration

Built-in AgentAPI support for:
- Claude Code (Anthropic)
- Goose (Block)
- Aider (Paul Gauthier)
- Cursor AI
- GitHub Copilot Workspace

### 🔐 Security & Authentication

- SSO via Authentik (OIDC)
- GitLab OAuth integration
- Vault secrets management
- RBAC with granular permissions
- Network policies

### 📊 Monitoring & Observability

- Prometheus ServiceMonitor
- Grafana dashboard
- Metrics for workspaces, users, API requests
- Resource usage tracking

## Prerequisites

- Kubernetes 1.24+
- Helm 3.8+
- PostgreSQL database
- Traefik ingress controller
- cert-manager for TLS
- Authentik for SSO (optional)
- Vault for secrets (optional)

## Installation

### 1. Add to Helmfile

The chart is already configured in `kubernetes/apps/_others.yaml`:

```yaml
coder:
  repo: charts
  chart: coder
  namespace: code
  version: v1.0.0
  needs:
    - ingress/traefik
    - service/consul
    - service/cert-manager
    - service/authentik
    - db/postgres
    - service/vault
    - code/gitlab
```

### 2. Configure Values

Edit `kubernetes/releases/coder.yaml.gotmpl`:

```yaml
namespace: code

coder:
  config:
    accessUrl: "https://coder.zeizel.localhost"
    wildcardAccessUrl: "*.workspace.coder.zeizel.localhost"
  
  oidc:
    enabled: true
    issuerUrl: "https://authentik.zeizel.localhost/application/o/coder/"
    clientId: "{{ .Values.secrets.coderOidcClientId }}"
    clientSecret: "{{ .Values.secrets.coderOidcClientSecret }}"
  
  gitlab:
    enabled: true
    url: "https://gitlab.zeizel.localhost"
```

### 3. Set Secrets

Edit `kubernetes/envs/k8s/values/_all.yaml.gotmpl`:

```yaml
secrets:
  coderPostgresPassword: "secure-password"
  coderOidcClientId: "coder-client"
  coderOidcClientSecret: "your-oidc-secret"
  coderGitlabClientId: "your-gitlab-client-id"
  coderGitlabClientSecret: "your-gitlab-secret"
```

### 4. Enable in Environment

Edit `kubernetes/envs/k8s/env.yaml`:

```yaml
apps:
  coder:
    installed: true
```

### 5. Deploy

```bash
cd kubernetes
helmfile -e k8s sync -l name=coder
```

## Configuration

### Core Settings

| Parameter | Description | Default |
|-----------|-------------|---------|
| `coder.replicaCount` | Number of Coder server replicas | `1` |
| `coder.config.accessUrl` | Main Coder URL | `https://coder.localhost` |
| `coder.config.wildcardAccessUrl` | Workspace wildcard URL | `*.workspace.coder.localhost` |
| `coder.config.telemetry` | Enable telemetry | `false` |
| `coder.config.provisionerDaemons` | Number of provisioner daemons | `3` |

### Resources

| Parameter | Description | Default |
|-----------|-------------|---------|
| `resources.requests.cpu` | CPU request | `1` |
| `resources.requests.memory` | Memory request | `2Gi` |
| `resources.limits.cpu` | CPU limit | `2` |
| `resources.limits.memory` | Memory limit | `4Gi` |

### Workspace Defaults

| Parameter | Description | Default |
|-----------|-------------|---------|
| `coder.workspaces.defaultResources.requests.cpu` | Workspace CPU request | `500m` |
| `coder.workspaces.defaultResources.requests.memory` | Workspace memory request | `1Gi` |
| `coder.workspaces.storage.size` | Workspace storage size | `50Gi` |
| `coder.workspaces.inactivityTimeout` | Auto-stop after inactivity | `4h` |
| `coder.workspaces.ttl` | Auto-delete after | `168h` (7 days) |

### OIDC (Authentik)

| Parameter | Description | Default |
|-----------|-------------|---------|
| `coder.oidc.enabled` | Enable OIDC | `false` |
| `coder.oidc.issuerUrl` | OIDC issuer URL | `""` |
| `coder.oidc.clientId` | OIDC client ID | `""` |
| `coder.oidc.clientSecret` | OIDC client secret | `""` |
| `coder.oidc.scopes` | OIDC scopes | `openid profile email groups` |

### GitLab Integration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `coder.gitlab.enabled` | Enable GitLab OAuth | `false` |
| `coder.gitlab.url` | GitLab URL | `""` |
| `coder.gitlab.clientId` | GitLab OAuth client ID | `""` |
| `coder.gitlab.clientSecret` | GitLab OAuth client secret | `""` |

### AgentAPI

| Parameter | Description | Default |
|-----------|-------------|---------|
| `coder.agentapi.enabled` | Enable AgentAPI | `true` |
| `coder.agentapi.tokenLifetime` | API token lifetime | `720h` (30 days) |

### Monitoring

| Parameter | Description | Default |
|-----------|-------------|---------|
| `serviceMonitor.enabled` | Enable Prometheus ServiceMonitor | `true` |
| `serviceMonitor.interval` | Scrape interval | `30s` |

### Auto-scaling

| Parameter | Description | Default |
|-----------|-------------|---------|
| `autoscaling.enabled` | Enable HPA | `false` |
| `autoscaling.minReplicas` | Minimum replicas | `1` |
| `autoscaling.maxReplicas` | Maximum replicas | `3` |
| `autoscaling.targetCPUUtilizationPercentage` | Target CPU % | `80` |

## Post-Installation

### 1. Configure Authentik

See [CODER_SETUP.md](../../../docs/CODER_SETUP.md#authentik-oidc-integration) for detailed instructions.

### 2. Configure GitLab

See [CODER_SETUP.md](../../../docs/CODER_SETUP.md#gitlab-oauth-integration) for detailed instructions.

### 3. Setup Vault (Optional)

```bash
cd kubernetes/charts/coder
./vault-setup.sh
```

### 4. Access Coder

Navigate to `https://coder.zeizel.localhost` and log in via Authentik.

## Usage

### Creating a Workspace

1. Log into Coder
2. Click **Create Workspace**
3. Select a template (Node.js, Python, Go, Docker, K8s)
4. Configure workspace name and optional Git repository
5. Click **Create**

### Connecting AI Agents

See [CODER_SETUP.md](../../../docs/CODER_SETUP.md#ai-agent-integration) for configuration examples.

## Troubleshooting

### Coder Pod Not Starting

```bash
kubectl logs -n code -l app.kubernetes.io/name=coder --tail=100
```

Common issues:
- PostgreSQL connection failed → Check database credentials
- OIDC configuration error → Verify Authentik settings
- Insufficient permissions → Check RBAC configuration

### Workspace Build Failing

```bash
# View workspace logs
coder logs <workspace-name>

# Check workspace pod
kubectl get pods -n code -l coder.workspace=true
```

### AgentAPI Not Working

```bash
# Test API endpoint
curl -H "Authorization: Bearer <token>" \
  https://coder.zeizel.localhost/api/v2/buildinfo
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         User/AI Agent                        │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Traefik Ingress                           │
│  coder.zeizel.localhost | *.workspace.coder.zeizel.localhost│
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      Coder Server                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ UI/API   │  │ Provisioner│ │ AgentAPI │  │ Metrics  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────┬────────────┬────────────┬────────────┬───────────────┘
      │            │            │            │
      ▼            ▼            ▼            ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│PostgreSQL│ │Authentik │ │  GitLab  │ │Prometheus│
└──────────┘ └──────────┘ └──────────┘ └──────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Workspace Pods                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Node.js  │  │  Python  │  │    Go    │  │  Docker  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Monitoring

Access Grafana dashboard:
1. Navigate to `https://grafana.zeizel.localhost`
2. Go to **Dashboards**
3. Open **Coder Metrics**

Key metrics:
- Active workspaces
- Total users
- API request rate
- Workspace resource usage
- Build success rate

## Backup & Recovery

### Database Backup

```bash
# Backup Coder database
kubectl exec -n db postgres-postgresql-0 -- \
  pg_dump -U postgres coder > coder-backup.sql

# Restore
kubectl exec -i -n db postgres-postgresql-0 -- \
  psql -U postgres coder < coder-backup.sql
```

### Workspace Data

Workspace data is stored in PVCs. Back up using your storage provider's snapshot feature.

## Upgrading

```bash
# Update chart version in apps/_others.yaml
# Then sync
cd kubernetes
helmfile -e k8s sync -l name=coder
```

## Uninstalling

```bash
# Disable in env.yaml
# Set coder.installed: false

# Then sync
cd kubernetes
helmfile -e k8s sync -l name=coder
```

**Warning**: This will delete all workspaces and data. Back up first!

## Support

- [Coder Documentation](https://coder.com/docs)
- [Setup Guide](../../../docs/CODER_SETUP.md)
- [GitHub Issues](https://github.com/coder/coder/issues)

## License

This chart is provided under the same license as the Coder project.
