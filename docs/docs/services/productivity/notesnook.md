---
sidebar_position: 1
---

# Notesnook

Notesnook is an open-source, end-to-end encrypted note-taking application with real-time synchronization.

## Features

- End-to-end encryption
- Real-time synchronization across devices
- Rich text editor
- Offline support
- Self-hosted sync server

## Deployment

### Docker Compose

```bash
cd docker/notes
docker-compose up -d
```

### Kubernetes

The Notesnook service is deployed via Helm chart:

```bash
helmfile -e k8s apply -l name=notesnook
```

## Configuration

The service requires MongoDB for data storage and MinIO for file storage.

## Access

After deployment, access Notesnook at:
- **URL:** `https://notesnook.<your-domain>`
- **Port:** 8010 (API), 8011 (Identity), 8012 (SSE)

## Documentation

For more information, visit the [official Notesnook documentation](https://notesnook.com/).

