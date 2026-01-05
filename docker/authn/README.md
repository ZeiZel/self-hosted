# Authentik

An open-source Identity Provider that unifies all your identity needs.

[Official Documentation](https://docs.goauthentik.io/)

## Quick Start

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Generate secure credentials:
   ```bash
   echo "PG_PASS=$(openssl rand -base64 36 | tr -d '\n')" >> .env
   echo "AUTHENTIK_SECRET_KEY=$(openssl rand -base64 60 | tr -d '\n')" >> .env
   ```

3. (Optional) Enable error reporting:
   ```bash
   echo "AUTHENTIK_ERROR_REPORTING__ENABLED=true" >> .env
   ```

4. Start the service:
   ```bash
   docker compose pull
   docker compose up -d
   ```

5. Access Authentik at `http://localhost:9000` (or your configured port)

## Initial Setup

- Default admin user: `akadmin`
- Check logs for initial password:
  ```bash
  docker compose logs server | grep "password"
  ```
