# Kestra

An infinitely scalable, event-driven, declarative orchestration and scheduling platform.

[Official Documentation](https://kestra.io/docs/)
[GitHub Repository](https://github.com/kestra-io/kestra)

## Quick Start

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. (Optional) Customize settings in `.env`:
   - Database credentials
   - Kestra username and password
   - Port configuration

3. Start the service:
   ```bash
   docker compose up -d
   ```

4. Access Kestra at `http://localhost:8080` (or your configured port)

## Initial Setup

- Default username: `[email protected]`
- Default password: `kestra`
- Change these credentials in `.env` file for production use

## Features

- Workflow orchestration
- Event-driven execution
- Plugin system
- REST API
- Web UI
- Task scheduling
- Flow execution monitoring

## Configuration

- Data is stored in `kestra-data` volume
- PostgreSQL database stores workflows and execution history
- Edit `.env` to customize database and authentication settings

