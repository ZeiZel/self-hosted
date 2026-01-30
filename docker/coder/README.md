# Coder

Remote development environments on your infrastructure. Provision cloud or on-prem compute with Terraform and connect via IDE, terminal, or browser.

[Official Documentation](https://coder.com/docs/)
[GitHub Repository](https://github.com/coder/coder)

## Quick Start

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. (Optional) Customize settings in `.env`:
   - Database credentials
   - Coder access URL
   - Port configuration

3. Start the service:
   ```bash
   docker compose up -d
   ```

4. Access Coder at `http://localhost:7080` (or your configured port)

## Initial Setup

On first launch Coder will prompt you to create the initial admin account via the web UI.

## Features

- Remote development environments
- Terraform-based workspace templates
- IDE support (VS Code, JetBrains)
- Web terminal and browser IDE
- Git integration
- Role-based access control
- Audit logging

## Configuration

- PostgreSQL data is stored in the `postgres-data` volume
- Coder home directory is stored in the `coder-home` volume
- Docker socket is mounted to allow Coder to manage Docker-based workspaces
- Edit `.env` to customize database credentials and access URL
- Set `CODER_ACCESS_URL` to your server's external IP or domain for production use
