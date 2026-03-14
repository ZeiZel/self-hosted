# VERT Helm Chart

A Helm chart for deploying VERT - File converter service.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+

## Installation

```bash
helm install vert ./vert -n utilities -f values.yaml
```

## Configuration

The following table lists the configurable parameters and their default values.

### Image Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `image.repository` | VERT image repository | `ghcr.io/vert-sh/vert` |
| `image.tag` | Image tag | `latest` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |

### Service Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `service.type` | Service type | `ClusterIP` |
| `service.port` | Service port | `3000` |
| `service.targetPort` | Target port | `80` |

### Resources

| Parameter | Description | Default |
|-----------|-------------|---------|
| `resources.limits.cpu` | CPU limit | `300m` |
| `resources.limits.memory` | Memory limit | `256Mi` |
| `resources.requests.cpu` | CPU request | `50m` |
| `resources.requests.memory` | Memory request | `64Mi` |

### Ingress Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ingress.enabled` | Enable ingress | `true` |
| `ingress.className` | Ingress class | `traefik` |
| `ingress.host` | Host name | `vert.localhost` |

### Health Checks

| Parameter | Description | Default |
|-----------|-------------|---------|
| `probes.liveness.enabled` | Enable liveness probe | `true` |
| `probes.liveness.path` | Liveness path | `/` |
| `probes.readiness.enabled` | Enable readiness probe | `true` |
| `probes.readiness.path` | Readiness path | `/` |

## Features

- Web-based file converter
- Support for multiple formats
- Image conversion
- Document conversion
- Video conversion
- Audio conversion
- Batch processing

## Supported Formats

- Images: PNG, JPG, WEBP, GIF, BMP, TIFF
- Documents: PDF, DOCX, TXT
- Audio: MP3, WAV, OGG, FLAC
- Video: MP4, WEBM, AVI

## Vault Secret Paths

This chart does not require Vault secrets.

## License

This Helm chart is open source and available under the MIT License.
