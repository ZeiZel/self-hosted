# OpenClaw Helm Chart

Self-hosted AI assistant that can execute tasks like managing calendars, browsing the web, organizing files, and running terminal commands.

## Prerequisites

- Kubernetes 1.25+
- Helm 3.0+
- PV provisioner support in the underlying infrastructure
- Vault for secrets management (API keys)

## Installation

```bash
helm install openclaw ./kubernetes/charts/openclaw -n automation
```

## Configuration

### Required Secrets (via Vault)

Configure these secrets in Vault at `secret/data/openclaw/secrets`:

| Key | Description |
|-----|-------------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `OPENAI_API_KEY` | OpenAI API key (optional) |
| `GATEWAY_TOKEN` | OpenClaw gateway authentication token |

### Values

| Parameter | Description | Default |
|-----------|-------------|---------|
| `image.repository` | Image repository | `alpine/openclaw` |
| `image.tag` | Image tag | `1.0.0` |
| `openclaw.replicaCount` | Number of replicas | `1` |
| `openclaw.service.port` | Web UI port | `18789` |
| `openclaw.service.oauthPort` | OAuth callback port | `1455` |
| `persistence.config.size` | Config volume size | `10Gi` |
| `persistence.workspace.size` | Workspace volume size | `50Gi` |
| `resources.requests.memory` | Memory request | `1Gi` |
| `resources.limits.memory` | Memory limit | `4Gi` |

## Vault Setup

1. Create policy:
```hcl
path "secret/data/openclaw/*" {
  capabilities = ["read"]
}
```

2. Create role:
```bash
vault write auth/kubernetes/role/openclaw \
  bound_service_account_names=openclaw \
  bound_service_account_namespaces=automation \
  policies=openclaw \
  ttl=1h
```

3. Store secrets:
```bash
vault kv put secret/openclaw/secrets \
  ANTHROPIC_API_KEY="sk-..." \
  GATEWAY_TOKEN="..."
```

## Network Access

OpenClaw requires outbound HTTPS access to LLM provider APIs (api.anthropic.com, api.openai.com, etc.). The NetworkPolicy allows this by default.

## References

- [OpenClaw Documentation](https://docs.openclaw.ai)
- [Docker Setup Guide](https://docs.openclaw.ai/install/docker)
