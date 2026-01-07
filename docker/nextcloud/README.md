# Nextcloud

A self-hosted file sync and share server.

[Official Documentation](https://docs.nextcloud.com/)

## Quick Start

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. (Optional) Customize settings in `.env`:
   - `NEXTCLOUD_DOMAIN`: Your domain name
   - `NEXTCLOUD_TRUSTED_DOMAINS`: Trusted domains (comma-separated)
   - `ADMIN_USERNAME` and `ADMIN_PASSWORD`: Admin credentials
   - `HTTP_PORT`: Port for web interface
   - `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`: PostgreSQL database credentials
   - `NEXTCLOUD_VERSION`: Nextcloud image version (default: latest)

3. Start the service:
   ```bash
   docker compose up -d
   ```

4. Access Nextcloud at `http://localhost:8080` (or your configured port)

## Initial Setup

- Default admin credentials are set in `.env`
- Change them immediately after first login
- Configure trusted domains in `.env` if accessing from different domains

