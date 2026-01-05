---
sidebar_position: 1
---

# Stoat (Revolt)

Stoat (formerly Revolt) is an open-source Discord alternative with self-hosting support.

## Features

- Real-time messaging
- Voice and video calls
- File sharing
- Server management
- Customizable themes

## Deployment

### Docker Compose

```bash
cd docker/chat
docker-compose up -d
```

The service includes:
- MongoDB database
- Redis for caching
- RabbitMQ for message queuing
- MinIO for file storage
- Caddy for reverse proxy

### Kubernetes

Deployed via Helm chart:

```bash
helmfile -e k8s apply -l name=stoat
```

## Configuration

Generate configuration:

```bash
cd docker/chat
./generate_config.sh
```

## Access

After deployment, access Stoat at:
- **URL:** `https://stoat.<your-domain>`
- **Web Client:** Automatically served by Caddy

## Documentation

For more information, visit the [Stoat GitHub repository](https://github.com/stoatchat/self-hosted).

