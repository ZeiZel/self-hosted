---
sidebar_position: 3
---

# Kubernetes Deployment

Deploy the entire infrastructure to Kubernetes using Helm and Helmfile.

## Prerequisites

- Kubernetes cluster (1.28+)
- kubectl configured
- Helm 3.8+ installed
- Helmfile 0.155+ installed
- Helm Secrets plugin installed

## Initial Setup

### 1. Initialize Helmfile

```bash
cd kubernetes
helmfile init --force
```

### 2. Install Gateway API

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml
```

### 3. Setup GPG/SOPS

```bash
# Create GPG key
gpg --full-generate-key

# Get key ID
GPG_KEY_ID=$(gpg --list-secret-keys --keyid-format LONG | grep -E "^sec" | head -1 | grep -oE "[A-F0-9]{40}")

# Configure .sops.yaml
cat > .sops.yaml << EOF
---
creation_rules:
  - pgp: ${GPG_KEY_ID}
EOF

# Set GPG_TTY
export GPG_TTY=$(tty)
```

### 4. Configure Secrets

Edit encrypted secrets:

```bash
helm secrets edit envs/k8s/secrets/_all.yaml
```

## Deployment

### Deploy All Services

```bash
helmfile -e k8s apply
```

### Deploy Specific Service

```bash
helmfile -e k8s apply -l name=<service-name>
```

### List Deployed Services

```bash
helmfile -e k8s list
```

## Available Services

All services are defined in `releases/` directory:

- `authentik.yaml.gotmpl` - Authentik SSO
- `bytebase.yaml.gotmpl` - Bytebase
- `consul.yaml.gotmpl` - Consul
- `dashy.yaml.gotmpl` - Dashy dashboard
- `gitlab.yaml.gotmpl` - GitLab
- `glance.yaml.gotmpl` - Glance dashboard
- `monitoring.yaml.gotmpl` - Monitoring stack
- `notesnook.yaml.gotmpl` - Notesnook
- `postgres.yaml.gotmpl` - PostgreSQL
- `stoat.yaml.gotmpl` - Stoat chat
- `vault.yaml.gotmpl` - Vault
- `vaultwarden.yaml.gotmpl` - Vaultwarden
- And more...

## Configuration

### Environment-Specific Values

Values are organized in `envs/k8s/`:
- `values/_all.yaml.gotmpl` - Common values
- `secrets/_all.yaml` - Encrypted secrets
- `env.yaml` - Environment configuration

### Chart Values

Each service has its chart in `charts/` with default values in `values.yaml`.

## Verification

### Check Pods

```bash
kubectl get pods --all-namespaces
```

### Check Services

```bash
kubectl get services --all-namespaces
```

### Check Ingress

```bash
kubectl get ingress --all-namespaces
```

## Updating Services

### Sync Changes

```bash
helmfile -e k8s sync
```

### Upgrade Specific Service

```bash
helmfile -e k8s apply -l name=<service-name>
```

## Troubleshooting

### View Logs

```bash
kubectl logs <pod-name> -n <namespace>
```

### Describe Pod

```bash
kubectl describe pod <pod-name> -n <namespace>
```

### Check Events

```bash
kubectl get events --all-namespaces --sort-by='.lastTimestamp'
```

## Next Steps

- [Ansible Deployment](./ansible) - Automated provisioning
- [Service Documentation](../services/overview.md) - Learn about services

