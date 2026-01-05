# Vaultwarden

Unofficial Bitwarden-compatible server written in Rust, formerly known as bitwarden_rs.

[Official Documentation](https://github.com/dani-garcia/vaultwarden)

## Quick Start

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Generate admin token:
   ```bash
   echo "ADMIN_TOKEN=$(openssl rand -base64 48 | tr -d '\n')" >> .env
   ```

3. (Optional) Configure SMTP settings in `.env` for email notifications

4. Start the service:
   ```bash
   docker compose up -d
   ```

5. Access Vaultwarden at `http://localhost:9445`

## Configuration

- Default admin panel: `http://localhost:9445/admin`
- Use the `ADMIN_TOKEN` from `.env` to access the admin panel
- Configure SMTP in `.env` to enable email notifications
