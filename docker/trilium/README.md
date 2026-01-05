# Trilium Notes

A hierarchical note taking application with focus on building large personal knowledge bases.

[Official Documentation](https://github.com/zadam/trilium)
[GitHub Repository](https://github.com/zadam/trilium)

## Quick Start

1. (Optional) Copy `.env.example` to `.env` and adjust port if needed:
   ```bash
   cp .env.example .env
   ```

2. Start the service:
   ```bash
   docker compose up -d
   ```

3. Access Trilium at `http://localhost:8080` (or your configured port)

## Initial Setup

1. On first access, you'll be prompted to create an account
2. Set up your username and password
3. Start creating your knowledge base

## Features

- Hierarchical note organization
- Rich text editing with markdown support
- Code syntax highlighting
- Note cloning and templating
- Scripting support
- Full-text search
- Note encryption
- Sync between devices

## Data Storage

All notes and data are stored in `./data` directory.

