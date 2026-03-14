# GitLab Ingress Helm Chart

A Helm chart for deploying Traefik IngressRoutes and Middlewares for GitLab.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- Traefik installed
- GitLab deployed (via official Helm chart or operator)

## Installation

```bash
helm install gitlab-ingress ./gitlab-ingress -n code -f values.yaml
```

## Description

This chart creates the necessary Traefik ingress routes and middlewares to expose GitLab services including:

- GitLab Web UI
- GitLab Registry
- GitLab SSH
- GitLab Pages (if enabled)

## Configuration

The following table lists the configurable parameters and their default values.

### Ingress Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ingress.enabled` | Enable ingress | `true` |
| `ingress.className` | Ingress class | `traefik` |
| `ingress.annotations` | Ingress annotations | `{}` |

### GitLab Hosts

| Parameter | Description | Default |
|-----------|-------------|---------|
| `gitlab.host` | GitLab web host | `gitlab.local` |
| `registry.host` | Registry host | `registry.local` |
| `pages.host` | Pages wildcard host | `*.pages.local` |

### TLS Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `tls.enabled` | Enable TLS | `true` |
| `tls.secretName` | TLS secret name | `gitlab-tls` |

### Middleware Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `middleware.rateLimit.enabled` | Enable rate limiting | `true` |
| `middleware.headers.customRequestHeaders` | Custom headers | `{}` |

## Features

- IngressRoute for GitLab web interface
- IngressRoute for Container Registry
- TCP IngressRoute for SSH access
- Support for GitLab Pages
- Rate limiting middleware
- Security headers middleware

## Dependencies

- Traefik ingress controller
- GitLab instance (external or in-cluster)
- cert-manager (for automatic TLS certificates)

## License

This Helm chart is open source and available under the MIT License.
