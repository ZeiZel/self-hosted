---
sidebar_position: 2
---

# ownCloud

ownCloud is a file sharing and collaboration platform for self-hosting.

## Features

- File storage and sharing
- Collaboration tools
- Calendar and contacts
- Document editing
- Mobile apps

## Deployment

### Docker Compose

```bash
cd docker/own-cloud
docker-compose up -d
```

### Kubernetes

```bash
helmfile -e k8s apply -l name=owncloud
```

## Configuration

Default credentials:
- **Username:** admin
- **Password:** admin (change on first login)

Access at:
- **URL:** `http://localhost:8080` (Docker) or `https://owncloud.<your-domain>` (Kubernetes)

## Documentation

For more information, visit the [official ownCloud documentation](https://doc.owncloud.com/).

