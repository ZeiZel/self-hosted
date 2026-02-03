## Infrastructure Role

Ansible role for orchestrating Helmfile-based Kubernetes infrastructure deployment with nested tag support for granular control.

## Overview

This role automates the deployment of a complete Kubernetes infrastructure stack using Helmfile, with a strict dependency chain:

**Base Infrastructure** (sequential):
1. Namespaces → 2. Traefik → 3. Consul → 4. Vault (+ unseal) → 5. cert-manager → 6. Authentik

**Application Services** (parallel):
- Stoat (Revolt chat)
- Stalwart (mail server)
- YouTrack (issue tracker)
- Hub (JetBrains SSO)
- TeamCity (CI/CD)
- Vaultwarden (password manager)

## Architecture

```
Prerequisites → Base Infrastructure → Applications → Verification
      ↓                  ↓                  ↓              ↓
  helm/helmfile    traefik/vault       stoat/hub    pod health
  SOPS/GPG         consul/cert-mgr     teamcity     helm tests
  kubeconfig       authentik           vaultwarden  services
```

## Requirements

- Kubernetes cluster (deployed via kubespray role)
- Kubectl with valid kubeconfig
- Ansible 2.20.1 or higher
- Helmfile charts in `kubernetes/` directory
- SOPS GPG key for secrets decryption

## Role Variables

### Defaults (`defaults/main.yml`)

```yaml
# Paths
kubernetes_path: "{{ lookup('env', 'HOME') }}/projects/self-hosted/kubernetes"
kubeconfig_path: "{{ lookup('env', 'HOME') }}/.kube/config"

# Helmfile configuration
helmfile_environment: "k8s"
helmfile_timeout: 600
helmfile_concurrency: 4

# Tool versions
helm_version: "v3.17.0"
helmfile_version: "0.169.1"
sops_version: "3.9.3"

# Vault configuration
vault_address: "http://vault.service.svc.cluster.local:8200"
vault_init_secret_shares: 5
vault_init_secret_threshold: 3
```

## Dependencies

- Role: `kubespray` (Kubernetes cluster must exist)
- Role: `storage` (storage class configured)

## Tag System

The role uses nested tags for selective deployment:

```yaml
infrastructure (role)
├── prerequisites (tag)
│   ├── kubectl
│   ├── helm
│   ├── helmfile
│   └── sops
├── base (tag)
│   ├── namespace
│   ├── traefik
│   ├── consul
│   ├── vault
│   ├── unseal
│   ├── cert-manager
│   └── authentik
├── apps (tag)
│   ├── stoat
│   ├── stalwart
│   ├── youtrack
│   ├── hub
│   ├── teamcity
│   └── vaultwarden
└── verify (tag)
```

## Example Playbook

### Full Deployment

```yaml
- hosts: k8s_masters[0]
  roles:
    - role: infrastructure
```

### Base Infrastructure Only

```yaml
- hosts: k8s_masters[0]
  roles:
    - role: infrastructure
      tags: [base]
```

### Single Service

```yaml
- hosts: k8s_masters[0]
  roles:
    - role: infrastructure
      tags: [vault]
```

## Usage Examples

### Deploy Everything

```bash
ansible-playbook -i inventory/master.ini all.yml --tags infrastructure
```

### Deploy Base Only

```bash
ansible-playbook -i inventory/master.ini all.yml --tags base
```

### Deploy Specific Service

```bash
ansible-playbook -i inventory/master.ini all.yml --tags vault
```

### Deploy Applications

```bash
ansible-playbook -i inventory/master.ini all.yml --tags apps
```

### Verify Deployment

```bash
ansible-playbook -i inventory/master.ini all.yml --tags verify
```

### Skip Verification

```bash
ansible-playbook -i inventory/master.ini all.yml --tags infrastructure --skip-tags verify
```

## Vault Unsealing

### First-Time Initialization

On first deployment, Vault will be automatically initialized. Unseal keys and root token will be saved to:
```
~/.vault-keys-<timestamp>.txt
```

**CRITICAL:** Store these keys securely! Update `ansible/group_vars/all/vault.yml`:

```yaml
vault:
  vault:
    unseal_keys:
      - "key1..."
      - "key2..."
      - "key3..."
    root_token: "token..."
```

### Automatic Unsealing

After initial setup, the role automatically unseals Vault using keys from Ansible Vault:

1. Checks Vault status
2. Applies 3 unseal keys
3. Verifies Vault is operational

## Deployment Order

**Critical:** Services must deploy in this order due to dependencies:

1. **Namespaces** - Create all required namespaces
2. **Traefik** - Ingress controller (all services need this)
3. **Consul** - Service mesh & KV store
4. **Vault** - Secrets management (unsealed automatically)
5. **cert-manager** - TLS certificate automation
6. **Authentik** - SSO provider
7. **Applications** - Deploy in parallel (all depend on base)

## Troubleshooting

### Helm Releases Stuck

```bash
# List releases
helm list -A

# Delete stuck release
helm delete <release> -n <namespace>

# Re-run deployment
ansible-playbook -i inventory/master.ini all.yml --tags <service>
```

### Vault Sealed After Restart

```bash
# Re-run unseal task
ansible-playbook -i inventory/master.ini all.yml --tags unseal
```

### Pod Not Starting

```bash
# Check pod logs
kubectl logs -n <namespace> <pod>

# Check events
kubectl describe pod -n <namespace> <pod>

# Check helm release
helm history <release> -n <namespace>
```

### SOPS Decryption Failure

```bash
# Verify GPG key imported
gpg --list-secret-keys

# Test decryption
sops -d kubernetes/envs/k8s/secrets/_all.yaml

# Import key
gpg --import ~/.gnupg/sops-key.asc
```

### Helmfile Apply Fails

```bash
# Run diff to see changes
cd kubernetes
helmfile -e k8s diff --selector name=<service>

# Check specific release
helmfile -e k8s status --selector name=<service>

# Apply with debug
helmfile -e k8s apply --selector name=<service> --debug
```

## Files Created

```
infrastructure/
├── defaults/main.yml          # Default variables
├── handlers/main.yml          # Service handlers
├── meta/main.yml              # Role metadata
├── tasks/
│   ├── main.yml               # Task router
│   ├── prerequisites.yml      # Tool installation
│   ├── base.yml               # Base infrastructure
│   ├── apps.yml               # Application services
│   ├── vault_unseal.yml       # Vault unsealing
│   └── verify.yml             # Deployment verification
└── README.md                  # This file
```

## Verification Checks

The verify task performs:

- ✓ All required namespaces exist
- ✓ All pods in Running state
- ✓ Traefik ingress accessible
- ✓ Consul cluster healthy
- ✓ Vault unsealed and operational
- ✓ cert-manager ready
- ✓ Authentik ready
- ✓ Helm releases deployed
- ✓ No CrashLoopBackOff pods
- ✓ PVCs bound

## Integration

This role integrates with:

- **kubespray** - Provides Kubernetes cluster
- **storage** - Provides StorageClass for PVCs
- **monitoring** - Prometheus/Grafana stack
- **security** - NetworkPolicy, RBAC

## License

MIT

## Author

Lvov Valery
