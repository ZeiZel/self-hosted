# Notesnook

A privacy-focused, open-source note-taking app with end-to-end encryption.

[Official Documentation](https://docs.notesnook.com/)

## Quick Start

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update URLs in `.env` with your public domain:
   ```bash
   AUTH_SERVER_PUBLIC_URL=http://your-domain:8011
   NOTESNOOK_APP_PUBLIC_URL=http://your-domain:3000
   ```

3. Start the service:
   ```bash
   docker compose up -d
   ```

4. Access services:
   - Identity Server: `http://localhost:8011`
   - Notesnook Server: `http://localhost:8010`
   - MinIO Console: `http://localhost:9000`

## Connecting Client

After starting the server, connect to it through your Notesnook client using the server URL configured in `.env`.
