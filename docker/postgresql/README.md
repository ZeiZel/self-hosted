# PostgreSQL

A powerful, open source object-relational database system.

## Quick Start

```bash
cd postgresql
cp .env.example .env  # Optional: customize settings
docker compose up -d
```

## Configuration

The service can be configured using environment variables. Copy `.env.example` to `.env` and modify as needed:

- `POSTGRESQL_OUT_PORT`: External port mapping (default: 5432)
- `PG_LOGIN`: Database user (default: postgres)
- `PG_PASS`: Database password (default: postgres)
- `PG_NAME`: Database name (default: postgres)

## Access

- **Port**: 5432 (or as configured in `POSTGRESQL_OUT_PORT`)
- **Container name**: `vw-postgres`

