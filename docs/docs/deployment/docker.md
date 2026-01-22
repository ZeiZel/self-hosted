---
sidebar_position: 2
---

# Docker Compose Deployment

Deploy services locally using Docker Compose for development and testing.

## Overview

Each service in the `docker/` directory has its own `docker-compose.yml` file, allowing you to deploy services independently.

## Available Services

- `authn/` - Authentik SSO
- `bytebase/` - Database schema management
- `chat/` - Stoat (Revolt) chat server
- `dashy/` - Dashboard (deprecated, use Glance)
- `glance/` - Modern dashboard
- `gitlab/` - GitLab instance
- `kestra/` - Workflow automation
- `mailer/` - Mail server (Stalwart)
- `monitoring/` - Monitoring stack
- `notes/` - Notesnook
- `nextcloud/` - Nextcloud
- `postgresql/` - PostgreSQL database
- `secrets/` - Vault
- `syncthing/` - Syncthing file sync
- `teamcity/` - TeamCity CI/CD
- `trilium/` - Trilium notes
- `valkey/` - Valkey (Redis-compatible cache)
- `vaultwarden/` - Vaultwarden password manager

## Quick Start

### Deploy a Single Service

```bash
cd docker/<service-name>
docker-compose up -d
```

### Deploy Multiple Services

```bash
# Deploy all services
for dir in docker/*/; do
  cd "$dir"
  docker-compose up -d
  cd ../..
done
```

## Configuration

Each service may require environment variables or configuration files:

1. Check the service's `README.md` for specific requirements
2. Copy `.env.example` to `.env` if available
3. Update configuration files as needed

## Accessing Services

Services are typically accessible on:
- `http://localhost:<port>` - Check each service's README for the port
- Some services use Traefik/Caddy for routing

## Stopping Services

```bash
cd docker/<service-name>
docker-compose down
```

## Troubleshooting

### Check Service Logs

```bash
cd docker/<service-name>
docker-compose logs -f
```

### Check Service Status

```bash
docker-compose ps
```

### Restart a Service

```bash
docker-compose restart <service-name>
```

## Next Steps

- [Kubernetes Deployment](./kubernetes) - For production deployments
- [Service Documentation](../services/overview.md) - Learn about each service

