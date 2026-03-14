# MeTube Helm Chart

A Helm chart for deploying MeTube - YouTube downloader web UI.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- Persistent storage for downloads (local-path or similar)

## Installation

```bash
helm install metube ./metube -n utilities -f values.yaml
```

## Configuration

The following table lists the configurable parameters and their default values.

### Image Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `image.repository` | MeTube image repository | `ghcr.io/alexta69/metube` |
| `image.tag` | Image tag | `latest` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |

### Service Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `service.type` | Service type | `ClusterIP` |
| `service.port` | Service port | `8081` |
| `service.targetPort` | Target port | `8081` |

### MeTube Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `metube.outputTemplate` | Output filename template | `%(title)s.%(ext)s` |
| `metube.defaultRes` | Default resolution | `1080` |
| `metube.darkMode` | Enable dark mode | `true` |

### Persistence

| Parameter | Description | Default |
|-----------|-------------|---------|
| `persistence.enabled` | Enable persistence | `true` |
| `persistence.storageClass` | Storage class | `local-path` |
| `persistence.size` | PVC size | `10Gi` |
| `persistence.mountPath` | Mount path | `/downloads` |

### Resources

| Parameter | Description | Default |
|-----------|-------------|---------|
| `resources.limits.cpu` | CPU limit | `500m` |
| `resources.limits.memory` | Memory limit | `256Mi` |
| `resources.requests.cpu` | CPU request | `100m` |
| `resources.requests.memory` | Memory request | `64Mi` |

## Features

- Web-based YouTube downloader
- Support for multiple video formats
- Playlist download support
- Dark mode
- Queue management
- Persistent storage for downloads

## Vault Secret Paths

This chart does not require Vault secrets.

## License

This Helm chart is open source and available under the MIT License.
