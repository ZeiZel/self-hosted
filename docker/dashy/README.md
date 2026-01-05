# Dashy

A self-hosted dashboard for your homelab.

[Official Documentation](https://dashy.to/)

## Quick Start

1. (Optional) Copy `.env.example` to `.env` and adjust port if needed:
   ```bash
   cp .env.example .env
   ```

2. Start the service:
   ```bash
   docker compose up -d
   ```

3. Access Dashy at `http://localhost:8080` (or your configured port)

## Configuration

Edit `./config/conf.yml` to customize your dashboard layout and widgets.
