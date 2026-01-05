# TeamCity

A powerful continuous integration and deployment server.

[Official Documentation](https://www.jetbrains.com/help/teamcity/)

## Quick Start

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. (Optional) Set versions in `.env`:
   ```bash
   PG_VERSION=16
   TEAMCITY_VERSION=latest
   ```

3. Start the service:
   ```bash
   docker compose up -d
   ```

4. Access TeamCity at `http://localhost:8112`

## Initial Setup

- TeamCity will initialize on first start (may take a few minutes)
- Follow the web interface setup wizard
- Agents will automatically connect to the server
