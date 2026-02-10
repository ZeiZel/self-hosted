# OpenClaw Docker Reference

Reference Docker Compose configuration for OpenClaw - a self-hosted AI assistant.

> **Note**: This is a reference configuration for development/testing. Production deployments should use the Kubernetes chart at `kubernetes/charts/openclaw`.

## Quick Start

1. Copy environment file:
   ```bash
   cp .env.example .env
   ```

2. Configure API keys in `.env`:
   ```bash
   ANTHROPIC_API_KEY=sk-ant-api03-...
   GATEWAY_TOKEN=$(openssl rand -hex 32)
   ```

3. Start OpenClaw:
   ```bash
   docker compose up -d
   ```

4. Access web UI at http://localhost:18789

## With Nginx Proxy

To run with Nginx reverse proxy (includes SSL termination):

1. Place SSL certificates in `./certs/`:
   - `./certs/cert.pem`
   - `./certs/key.pem`

2. Create `nginx.conf` (see example below)

3. Start with proxy profile:
   ```bash
   docker compose --profile with-proxy up -d
   ```

### Example nginx.conf

```nginx
events {
    worker_connections 1024;
}

http {
    upstream openclaw {
        server openclaw:18789;
    }

    server {
        listen 80;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;

        ssl_certificate /etc/nginx/certs/cert.pem;
        ssl_certificate_key /etc/nginx/certs/key.pem;

        location / {
            proxy_pass http://openclaw;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
```

## Volumes

| Volume | Description |
|--------|-------------|
| `openclaw-config` | Configuration, memory, API keys |
| `openclaw-workspace` | Files accessible to the agent |
| `openclaw-cache` | Browser and cache data |

## Ports

| Port | Description |
|------|-------------|
| 18789 | Web UI |
| 1455 | OAuth callback |

## Security Notes

- Always use strong GATEWAY_TOKEN
- Never expose port 18789 directly to the internet without authentication
- Use Nginx or Traefik with SSL for production
- Consider network isolation for sensitive environments

## Resources

- [OpenClaw Documentation](https://docs.openclaw.ai)
- [Docker Setup Guide](https://docs.openclaw.ai/install/docker)
