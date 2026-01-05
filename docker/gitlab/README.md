# GitLab

GitLab Community Edition (CE) or Enterprise Edition (EE) - a complete DevOps platform.

[Official Documentation](https://docs.gitlab.com/)

## Quick Start

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Set GitLab home directory (absolute path recommended):
   ```bash
   # Edit .env and set GITLAB_HOME to your desired path
   # Example: GITLAB_HOME=/srv/gitlab
   ```

3. Create GitLab home directory:
   ```bash
   sudo mkdir -p /srv/gitlab
   sudo chown -R $USER:$USER /srv/gitlab
   ```

4. (Optional) Set GitLab version in `.env`:
   ```bash
   GITLAB_VERSION=latest  # or specific version like 17.0.0
   ```

5. Start the service:
   ```bash
   docker compose up -d
   ```

6. Access GitLab at `http://localhost` (or your configured domain)

## Initial Setup

On first start, GitLab will take several minutes to initialize. Check logs:
```bash
docker compose logs -f
```

The initial root password will be shown in the logs or can be retrieved:
```bash
docker compose exec gitlab grep 'Password:' /etc/gitlab/initial_root_password
```
