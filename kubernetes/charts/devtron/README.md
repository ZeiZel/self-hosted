# Devtron Helm Chart

Helm chart wrapper for deploying Devtron Kubernetes dashboard in Kubernetes cluster.
Uses the official Devtron Helm chart as a dependency.

## Installation

First, add the Devtron Helm repository:

```bash
helm repo add devtron https://charts.devtron.ai
helm repo update
```

Then install:

```bash
helm install devtron ./charts/devtron -n devtroncd --create-namespace \
  --set installer.modules={cicd} \
  --set argo-cd.enabled=true \
  --set security.enabled=true \
  --set security.trivy.enabled=true \
  --set notifier.enabled=true \
  --set monitoring.grafana.enabled=true
```

## Configuration

See `values.yaml` for all available configuration options.





