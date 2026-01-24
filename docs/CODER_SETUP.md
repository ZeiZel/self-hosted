# Coder Setup Guide

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Authentik OIDC Integration](#authentik-oidc-integration)
4. [GitLab OAuth Integration](#gitlab-oauth-integration)
5. [Vault Secrets Configuration](#vault-secrets-configuration)
6. [PostgreSQL Database Setup](#postgresql-database-setup)
7. [Creating Your First Workspace](#creating-your-first-workspace)
8. [AI Agent Integration](#ai-agent-integration)
9. [Troubleshooting](#troubleshooting)

## Overview

Coder is a self-hosted remote development environment platform that provides:
- Browser-based VS Code (code-server)
- Multiple workspace templates (Node.js, Python, Go, Docker, Kubernetes)
- SSO authentication via Authentik
- GitLab integration for repository access
- AgentAPI for AI coding assistants
- Automatic resource scaling

## Prerequisites

Before setting up Coder, ensure you have:

- Kubernetes cluster with kubectl access
- Helmfile installed
- Access to Authentik admin panel
- Access to GitLab admin panel
- PostgreSQL database access
- Vault access (if using Vault for secrets)

## Authentik OIDC Integration

### Step 1: Create OAuth Provider in Authentik

1. Log into Authentik admin panel: `https://authentik.zeizel.localhost/if/admin/`

2. Navigate to **Applications → Providers** and click **Create**

3. Select **OAuth2/OpenID Provider**

4. Configure the provider:
   ```yaml
   Name: Coder
   Authentication Flow: default-authentication-flow
   Authorization Flow: default-provider-authorization-implicit-consent
   
   Client Type: Confidential
   Client ID: <generate or use: coder-client>
   Client Secret: <generate strong secret>
   
   Redirect URIs:
     - https://coder.zeizel.localhost/api/v2/users/oidc/callback
   
   Scopes:
     - openid
     - profile
     - email
     - groups
   
   Subject Mode: Based on User's UUID
   Include claims in id_token: Yes
   ```

5. Click **Create** and save the Client ID and Client Secret

### Step 2: Create Application in Authentik

1. Navigate to **Applications → Applications** and click **Create**

2. Configure the application:
   ```yaml
   Name: Coder
   Slug: coder
   Provider: Coder (select the provider created above)
   Launch URL: https://coder.zeizel.localhost
   ```

3. Click **Create**

### Step 3: Configure Group Mappings

1. Navigate to **Directory → Groups**

2. Create or edit groups:
   - **coder-admins**: Users who can manage all workspaces
   - **coder-users**: Regular users who can create their own workspaces

3. Assign users to appropriate groups

### Step 4: Update Coder Secrets

Add the OIDC credentials to your environment values:

```yaml
# kubernetes/envs/k8s/values/_all.yaml.gotmpl
secrets:
  coderOidcClientId: "coder-client"
  coderOidcClientSecret: "<client-secret-from-authentik>"
```

### Step 5: Deploy or Update Coder

```bash
cd kubernetes
helmfile -e k8s sync -l name=coder
```

### Step 6: Test OIDC Login

1. Navigate to `https://coder.zeizel.localhost`
2. Click **Login with OIDC**
3. Authenticate via Authentik
4. You should be redirected back to Coder dashboard

## GitLab OAuth Integration

### Step 1: Create OAuth Application in GitLab

1. Log into GitLab: `https://gitlab.zeizel.localhost`

2. Navigate to **Admin Area → Applications**

3. Create a new application:
   ```yaml
   Name: Coder
   Redirect URI: https://coder.zeizel.localhost/api/v2/gitauth/gitlab/callback
   
   Scopes:
     ☑ api
     ☑ read_user
     ☑ read_repository
     ☑ write_repository
   
   Confidential: Yes
   ```

4. Click **Save application**

5. Copy the Application ID and Secret

### Step 2: Update Coder Secrets

```yaml
# kubernetes/envs/k8s/values/_all.yaml.gotmpl
secrets:
  coderGitlabClientId: "<application-id-from-gitlab>"
  coderGitlabClientSecret: "<secret-from-gitlab>"
```

### Step 3: Update Coder Deployment

```bash
cd kubernetes
helmfile -e k8s sync -l name=coder
```

### Step 4: Link GitLab Account

1. Log into Coder
2. Go to **Account Settings → Git Authentication**
3. Click **Connect GitLab**
4. Authorize the application in GitLab
5. Your GitLab account is now linked

## Vault Secrets Configuration

### Step 1: Create Vault Policy for Coder

```bash
# Connect to Vault
export VAULT_ADDR="https://vault.zeizel.localhost"
vault login

# Create policy
vault policy write coder - <<EOF
path "secret/data/coder/*" {
  capabilities = ["read", "list"]
}
EOF
```

### Step 2: Create Kubernetes Auth Role

```bash
vault write auth/kubernetes/role/coder \
  bound_service_account_names=coder \
  bound_service_account_namespaces=code \
  policies=coder \
  ttl=24h
```

### Step 3: Store Secrets in Vault

```bash
# Store PostgreSQL password
vault kv put secret/coder/secrets \
  postgres_password="<secure-password>" \
  oidc_client_secret="<authentik-client-secret>" \
  gitlab_client_secret="<gitlab-client-secret>" \
  provisioner_psk="<generate-random-string>"
```

### Step 4: Enable Vault in Coder Release

```yaml
# kubernetes/releases/coder.yaml.gotmpl
vault:
  enabled: true
  role: "coder"
```

## PostgreSQL Database Setup

The database is automatically created if you have the init script configured.

### Manual Setup (if needed)

```bash
# Connect to PostgreSQL
kubectl exec -it -n db postgres-postgresql-0 -- psql -U postgres

# Create database and user
CREATE DATABASE coder;
CREATE USER coder WITH ENCRYPTED PASSWORD '<your-password>';
GRANT ALL PRIVILEGES ON DATABASE coder TO coder;

# Exit
\q
```

### Verify Database Connection

```bash
# Get Coder pod name
kubectl get pods -n code -l app.kubernetes.io/name=coder

# Check logs
kubectl logs -n code <coder-pod-name> | grep -i postgres
```

You should see: `"Connected to PostgreSQL"`

## Creating Your First Workspace

### Step 1: Access Coder

Navigate to `https://coder.zeizel.localhost` and log in via Authentik

### Step 2: Create Workspace

1. Click **Create Workspace**

2. Select a template:
   - **Node.js**: For JavaScript/TypeScript projects
   - **Python**: For Python projects
   - **Go**: For Go projects
   - **Docker**: For Docker-based development
   - **Kubernetes**: For Kubernetes development

3. Configure workspace:
   ```yaml
   Name: my-workspace
   Template: nodejs-template
   Git Repository: https://gitlab.zeizel.localhost/my-group/my-project.git (optional)
   ```

4. Click **Create**

5. Wait for workspace to build (1-3 minutes)

### Step 3: Access Workspace

Once the workspace is running:

1. Click on your workspace name
2. Click **VS Code** to open the browser-based IDE
3. Your development environment is ready!

### Step 4: Configure Git in Workspace

Open terminal in VS Code and configure Git:

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# If you linked GitLab, credentials are already configured
git clone https://gitlab.zeizel.localhost/my-group/my-project.git
```

## AI Agent Integration

Coder's AgentAPI enables AI coding assistants to interact with your workspaces.

### Supported AI Agents

- **Claude Code** (Anthropic)
- **Goose** (Block)
- **Aider** (Paul Gauthier)
- **Cursor AI**
- **GitHub Copilot Workspace**

### Step 1: Generate API Token

1. Log into Coder
2. Go to **Account Settings → Tokens**
3. Click **Create Token**
4. Configure:
   ```yaml
   Name: AI Agent Token
   Lifetime: 30 days
   Scope: All workspaces
   ```
5. Copy the generated token

### Step 2: Configure AI Agent

#### For Aider

```bash
export CODER_URL="https://coder.zeizel.localhost"
export CODER_SESSION_TOKEN="<your-token>"
export CODER_WORKSPACE="my-workspace"

aider --coder
```

#### For Claude Code

Create `~/.claude-code/config.json`:

```json
{
  "coder": {
    "url": "https://coder.zeizel.localhost",
    "token": "<your-token>",
    "workspace": "my-workspace"
  }
}
```

#### For Cursor AI

1. Open Cursor settings
2. Navigate to **Coder Integration**
3. Enter:
   - URL: `https://coder.zeizel.localhost`
   - Token: `<your-token>`
   - Workspace: `my-workspace`

### Step 3: Test AgentAPI

```bash
# Test connection
curl -H "Authorization: Bearer <your-token>" \
  https://coder.zeizel.localhost/api/v2/workspaces/my-workspace/agent/info

# Expected response:
{
  "agent": {
    "id": "...",
    "status": "connected",
    "version": "..."
  }
}
```

### AgentAPI Endpoints

- **File Read**: `GET /api/v2/workspaces/{workspace}/agent/file/read?path=...`
- **File Write**: `POST /api/v2/workspaces/{workspace}/agent/file/write`
- **Execute Command**: `POST /api/v2/workspaces/{workspace}/agent/exec`
- **Terminal**: `WS /api/v2/workspaces/{workspace}/agent/terminal`
- **Git Operations**: `/api/v2/workspaces/{workspace}/agent/git/*`

## Troubleshooting

### Coder Not Starting

```bash
# Check Coder logs
kubectl logs -n code -l app.kubernetes.io/name=coder --tail=100

# Common issues:
# 1. PostgreSQL connection failed
#    - Verify database credentials
#    - Check if database exists
#    - Verify network connectivity

# 2. OIDC configuration error
#    - Verify Authentik provider settings
#    - Check redirect URI matches exactly
#    - Verify client ID and secret
```

### Workspace Build Failing

```bash
# Check workspace build logs
coder logs <workspace-name>

# Common issues:
# 1. Insufficient resources
#    - Increase CPU/Memory in template
#    - Check node capacity

# 2. Image pull errors
#    - Verify image exists
#    - Check registry credentials

# 3. PVC creation failed
#    - Check storage class exists
#    - Verify available storage
```

### OIDC Login Not Working

1. Verify redirect URI in Authentik matches:
   ```
   https://coder.zeizel.localhost/api/v2/users/oidc/callback
   ```

2. Check Coder configuration:
   ```bash
   kubectl get configmap -n code coder-config -o yaml
   ```

3. Verify OIDC issuer URL is accessible:
   ```bash
   curl https://authentik.zeizel.localhost/application/o/coder/.well-known/openid-configuration
   ```

### GitLab Integration Not Working

1. Verify OAuth application redirect URI:
   ```
   https://coder.zeizel.localhost/api/v2/gitauth/gitlab/callback
   ```

2. Check GitLab OAuth scopes include:
   - `api`
   - `read_user`
   - `read_repository`
   - `write_repository`

3. Test GitLab connectivity from workspace:
   ```bash
   # In workspace terminal
   curl https://gitlab.zeizel.localhost
   ```

### AgentAPI Not Responding

1. Verify AgentAPI is enabled:
   ```bash
   kubectl get configmap -n code coder-agentapi-config -o yaml
   ```

2. Check workspace agent status:
   ```bash
   coder list --column="name,status,agent"
   ```

3. Test API endpoint:
   ```bash
   curl -H "Authorization: Bearer <token>" \
     https://coder.zeizel.localhost/api/v2/buildinfo
   ```

### Performance Issues

1. Check resource usage:
   ```bash
   kubectl top pods -n code
   ```

2. Scale up Coder if needed:
   ```bash
   kubectl scale deployment -n code coder --replicas=2
   ```

3. Review workspace resource limits:
   ```bash
   kubectl describe pod -n code <workspace-pod>
   ```

## Monitoring

### Prometheus Metrics

Coder exposes metrics at `:2112/metrics`:

```bash
# Port-forward to access metrics
kubectl port-forward -n code svc/coder 2112:2112

# View metrics
curl http://localhost:2112/metrics
```

### Grafana Dashboard

Access the Coder dashboard in Grafana:

1. Navigate to `https://grafana.zeizel.localhost`
2. Go to **Dashboards**
3. Open **Coder Metrics**

Key metrics:
- Active workspaces
- Total users
- API request rate
- Workspace CPU/Memory usage
- Build success rate

## Additional Resources

- [Coder Documentation](https://coder.com/docs)
- [Coder GitHub](https://github.com/coder/coder)
- [Template Examples](https://github.com/coder/coder/tree/main/examples/templates)
- [AgentAPI Specification](https://github.com/coder/coder/blob/main/docs/api/agentapi.md)

## Support

For issues or questions:
1. Check logs: `kubectl logs -n code -l app.kubernetes.io/name=coder`
2. Review events: `kubectl get events -n code --sort-by='.lastTimestamp'`
3. Consult Coder documentation
4. Open issue in project repository
