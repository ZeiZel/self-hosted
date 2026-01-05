---
sidebar_position: 2
---

# Vault

HashiCorp Vault is a tool for securely accessing secrets.

## Features

- Secrets management
- Encryption as a service
- Access control
- Audit logging
- Dynamic secrets

## Deployment

### Docker Compose

```bash
cd docker/secrets
docker-compose up -d
```

### Kubernetes

```bash
helmfile -e k8s apply -l name=vault
```

## Configuration

Initial setup:
1. Initialize Vault: `vault operator init`
2. Unseal Vault with unseal keys
3. Configure authentication methods

Access at:
- **URL:** `http://localhost:8200` (Docker) or `https://vault.<your-domain>` (Kubernetes)

## Documentation

For more information, visit the [official Vault documentation](https://developer.hashicorp.com/vault/docs).

