# OwnCloud

A self-hosted file sync and share server.

[Official Documentation](https://doc.owncloud.com/)

## Quick Start

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. (Optional) Customize settings in `.env`:
   - `OWNCLOUD_DOMAIN`: Your domain name
   - `ADMIN_USERNAME` and `ADMIN_PASSWORD`: Admin credentials
   - `HTTP_PORT`: Port for web interface

3. Start the service:
   ```bash
   docker compose up -d
   ```

4. Access OwnCloud at `http://localhost:8080` (or your configured port)

## Initial Setup

- Default admin credentials are set in `.env`
- Change them immediately after first login
- Configure trusted domains in `.env` if accessing from different domains
