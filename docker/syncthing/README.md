# Syncthing

A continuous file synchronization program.

[Official Documentation](https://docs.syncthing.net/)

## Quick Start

1. Start the service:
   ```bash
   docker compose up -d
   ```

2. Access Syncthing web UI at `http://localhost:8384`

## Initial Setup

1. Open the web UI and complete the setup wizard
2. Add devices by exchanging device IDs
3. Configure folders to sync

## Configuration

- Configuration files are stored in `./config`
- Data is stored in `./data` volume
- Backups are stored in `./backup` volume

## Metrics

If you've configured the API key, metrics are available at `http://localhost:9639/metrics`
