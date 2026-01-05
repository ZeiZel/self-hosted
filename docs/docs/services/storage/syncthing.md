---
sidebar_position: 1
---

# Syncthing

Syncthing is a continuous file synchronization program that synchronizes files between two or more computers.

## Features

- Real-time file synchronization
- Encrypted transfers
- Cross-platform support
- No central server required
- Version control

## Deployment

### Docker Compose

```bash
cd docker/syncthing
docker-compose up -d
```

### Kubernetes

```bash
helmfile -e k8s apply -l name=syncthing
```

## Configuration

Access the web UI to configure:
- **URL:** `http://localhost:8384` (Docker) or `https://syncthing.<your-domain>` (Kubernetes)
- Default credentials: None (first-time setup required)

## Usage

1. Access the web UI
2. Add a device by sharing the device ID
3. Add folders to sync
4. Share folders with other devices

## Documentation

For more information, visit the [official Syncthing documentation](https://syncthing.net/docs/).

