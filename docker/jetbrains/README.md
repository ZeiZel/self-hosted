# JetBrains Tools

Docker Compose configurations for JetBrains development tools.

## YouTrack

Issue tracking and project management tool.

[Official Documentation](https://www.jetbrains.com/help/youtrack/)

### Quick Start

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. (Optional) Customize port in `.env`:
   ```bash
   YOUTRACK_OUT_PORT=8080
   ```

3. Start the service:
   ```bash
   docker compose -f youtrack-compose.yml up -d
   ```

4. Access YouTrack at `http://localhost:8080` (or your configured port)

### Getting Access Key

On first start, get the configuration wizard token:

```bash
docker compose -f youtrack-compose.yml exec youtrack sh
cat /opt/youtrack/conf/internal/services/configurationWizard/wizard_token.txt
```

Use this token in the web interface to complete setup.

## Hub

JetBrains Hub for centralized user management and authentication.

### Quick Start

```bash
docker compose -f hub-compose.yml up -d
```
