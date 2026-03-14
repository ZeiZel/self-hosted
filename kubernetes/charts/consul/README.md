# Consul Helm Chart

A Helm chart for deploying HashiCorp Consul - Service mesh and key-value store.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- Persistent storage (local-path or similar)

## Installation

```bash
helm install consul ./consul -n service -f values.yaml
```

## Configuration

The following table lists the configurable parameters and their default values.

### Image Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `image.repository` | Consul image repository | `hashicorp/consul` |
| `image.tag` | Image tag | `1.18.2` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |

### Server Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `server.enabled` | Enable server mode | `true` |
| `server.replicas` | Number of server replicas | `1` |
| `server.bootstrapExpect` | Expected bootstrap servers | `1` |
| `server.storage` | Storage size for server | `1Gi` |

### Service Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `service.type` | Service type | `ClusterIP` |
| `service.ports.http` | HTTP port | `8500` |
| `service.ports.grpc` | gRPC port | `8502` |
| `service.ports.dns` | DNS port | `8600` |

### UI Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ui.enabled` | Enable Consul UI | `true` |

### Persistence

| Parameter | Description | Default |
|-----------|-------------|---------|
| `persistence.enabled` | Enable persistence | `true` |
| `persistence.storageClass` | Storage class | `local-path` |
| `persistence.size` | PVC size | `1Gi` |

## Features

- Service mesh and service discovery
- Key-value store for configuration
- Health checking
- Multi-datacenter support
- ACL support
- Web UI

## Vault Secret Paths

This chart does not require Vault secrets by default. If ACL tokens are needed:

```
secret/data/consul/acl-token
```

## License

This Helm chart is open source and available under the MIT License.
