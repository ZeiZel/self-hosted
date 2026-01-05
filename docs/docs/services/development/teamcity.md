---
sidebar_position: 2
---

# TeamCity

TeamCity is a CI/CD server and build management tool from JetBrains.

## Features

- Build automation
- Continuous integration
- Test reporting
- Deployment automation
- Integration with JetBrains tools

## Deployment

### Docker Compose

```bash
cd docker/teamcity
docker-compose up -d
```

### Kubernetes

```bash
helmfile -e k8s apply -l name=teamcity
```

## Configuration

Access at:
- **URL:** `http://localhost:8111` (Docker) or `https://teamcity.<your-domain>` (Kubernetes)

Initial setup:
1. Accept license agreement
2. Create administrator account
3. Configure build agents

## Documentation

For more information, visit the [official TeamCity documentation](https://www.jetbrains.com/help/teamcity/).

