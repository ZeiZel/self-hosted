# Bytebase

Database schema change and version control for teams.

[Official Documentation](https://www.bytebase.com/docs/get-started/self-host/)

## Quick Start

```bash
cd bytebase
cp .env.example .env  # Optional: customize settings
docker compose up -d
```

## Configuration

The service can be configured using environment variables. Copy `.env.example` to `.env` and modify as needed:

- `PG_LOGIN`: PostgreSQL user for Bytebase (default: bytebase)
- `PG_PASS`: PostgreSQL password for Bytebase (default: bytebase)
- `PG_NAME`: PostgreSQL database name (default: bytebase)
- `PG_PORT`: PostgreSQL port (default: 5432)

## Access

- **Web UI Port**: 8080
- **Container name**: `bytebase`
- **PostgreSQL container**: `bytebase-postgres`

## First Run

After starting the service, access the web UI at `http://localhost:8080` and complete the initial setup.

