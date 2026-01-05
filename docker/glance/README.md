# Glance

A self-hosted dashboard and monitoring application.

[GitHub Repository](https://github.com/glanceapp/glance)

## Quick Start

1. (Optional) Copy `.env.example` to `.env` and adjust port if needed:
   ```bash
   cp .env.example .env
   ```

2. Start the service:
   ```bash
   docker compose up -d
   ```

3. Access Glance at `http://localhost:5000` (or your configured port)

## Features

- Dashboard creation
- Widget system
- Data visualization
- Self-hosted
- Customizable layouts

## Configuration

Data is stored in `./data` directory. The application will initialize on first start.

