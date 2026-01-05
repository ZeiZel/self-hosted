# Hashicorp Vault

A tool for securely accessing secrets.

[Official Documentation](https://www.vaultproject.io/docs)

## Quick Start

1. Start the service:
   ```bash
   docker compose up -d
   ```

2. Access Vault at `http://localhost:8200`

## Initial Setup

1. Initialize Vault:
   ```bash
   docker compose exec vault vault operator init
   ```

2. Unseal Vault using the unseal keys from initialization

3. Set the root token for authentication

## Configuration

Edit `./config/config.hcl` to customize Vault configuration.
