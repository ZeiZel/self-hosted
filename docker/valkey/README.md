# Valkey

A high-performance key-value store (Redis fork).

## Quick Start

```bash
cd valkey
docker compose up -d
```

## Configuration

Valkey uses a configuration file located at `conf/valkey.conf`. You can customize the configuration by editing this file.

## Access

- **Port**: 6379
- **Container name**: `valkey`
- **Hostname**: `valkey`

## Usage

Connect to Valkey using the Valkey CLI:

```bash
docker exec -it valkey valkey-cli
```

## Configuration File

The configuration file is mounted from `./conf/valkey.conf`. Edit this file to customize Valkey settings according to your needs.

