# Namespaces Chart

Production-ready Helm chart for creating and managing Kubernetes namespaces with proper Helm ownership annotations.

## Installation

```bash
helm install namespaces ./charts/namespaces
--namespace default
--create-namespace
```

## Features

- ✅ Proper Helm ownership annotations (`meta.helm.sh/*`)
- ✅ Standard Kubernetes labels (`app.kubernetes.io/*`)
- ✅ Namespace descriptions and documentation
- ✅ Global and namespace-specific labels
- ✅ Easy enable/disable per namespace
- ✅ Timestamp tracking
- ✅ Compatible with helmfile

## Namespaces Created

- **ingress**: Traefik, Ingress Controllers
- **service**: Consul, Vault, Authentik, Monitoring
- **db**: PostgreSQL, MongoDB, Redis, MinIO
- **productivity**: Notesnook, Excalidraw
- **code**: GitLab, YouTrack, TeamCity, Hub
- **social**: Stoat, Stalwart Mail
- **data**: Vaultwarden, Syncthing, Nextcloud
- **auth**: Authentication services
- **monitoring**: Prometheus, Grafana, Loki

## Usage

### Customize values

Override namespaces to create

```YAML
namespaces:
  ingress:
    enabled: true
  service:
    enabled: true
  db:
    enabled: true

# ... other namespaces
```

## Verification

Check namespaces created

```bash
kubectl get namespaces --show-labels
```

Check Helm annotations

```bash
kubectl get namespace ingress -o yaml
```

Check all namespaces managed by this release

```bash
helm list -A | grep namespaces
```

## Cleanup

Delete all namespaces managed by this chart

```bash
helm uninstall namespaces -n default
```

Or with helmfile

```bash
helmfile -e k8s -l name=namespaces destroy
```
