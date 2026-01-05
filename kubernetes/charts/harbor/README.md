# Harbor Helm Chart

Helm chart wrapper for deploying Harbor container registry in Kubernetes cluster.
Uses the official Harbor Helm chart as a dependency.

## Installation

First, add the Harbor Helm repository:

```bash
helm repo add harbor https://helm.goharbor.io
helm repo update
```

Then install:

```bash
helm install harbor ./charts/harbor -n infrastructure --create-namespace
```

## Configuration

See `values.yaml` for all available configuration options.





