# Apps Role

Post-installation configuration for all deployed applications.

## Overview

This role handles:
- Waiting for applications to become ready
- Initial configuration via APIs
- Credential generation and storage
- SSO integration setup
- Inter-service connections

## Requirements

- Kubernetes cluster running
- Applications deployed via Helm
- Vault unsealed and accessible
- Network connectivity to services

## Role Variables

See `defaults/main.yml` for full list. Key variables:

| Variable | Description |
|----------|-------------|
| `apps_credentials_dir` | Directory for storing generated credentials |
| `apps_validate_certs` | Whether to validate TLS certificates |
| `*_url` | Service URLs (e.g., `vault_url`, `gitlab_url`) |
| `*_wait_timeout` | Timeout for service readiness |
| `*_credentials_file` | Path to store service credentials |

## Credentials Storage

Generated credentials are stored in `{{ playbook_dir }}/.credentials/`:
- `vault-keys.json` - Vault unseal keys and root token
- `gitlab-credentials.txt` - GitLab admin credentials
- `hub-credentials.txt` - JetBrains Hub credentials
- etc.

**Warning**: This directory must be in `.gitignore` and secured appropriately.

## Dependencies

- `infrastructure` role (deploys applications)
- HashiCorp Vault (secrets management)
- Authentik (SSO provider)

## Example Playbook

```yaml
- hosts: k8s_masters
  roles:
    - apps
  tags: [apps]
```

## Tags

- `apps` - Run all app configuration
- `vault` - Configure Vault
- `authentik` - Configure Authentik SSO
- `gitlab` - Configure GitLab
- `databases` - Configure database access

## Task Flow

1. Wait for Vault to be ready
2. Initialize and unseal Vault (if first run)
3. Configure Authentik SSO
4. Configure each application:
   - Wait for readiness
   - Create admin accounts
   - Configure OAuth/OIDC
   - Store credentials
