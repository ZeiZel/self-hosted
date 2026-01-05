---
sidebar_position: 1
---

# GitLab

GitLab is a complete DevOps platform with Git repository, CI/CD, and project management.

## Features

- Git repository hosting
- CI/CD pipelines
- Issue tracking
- Code review
- Container registry
- Wiki and documentation

## Deployment

### Docker Compose

```bash
cd docker/gitlab
docker-compose up -d
```

### Kubernetes

```bash
helmfile -e k8s apply -l name=gitlab
```

## Configuration

Initial setup:
1. Access GitLab at `https://gitlab.<your-domain>`
2. Set root password on first login
3. Configure SMTP for email notifications (optional)

## Resource Requirements

GitLab requires significant resources:
- **CPU:** 4-8 cores
- **RAM:** 8-16 GB
- **Disk:** 50-200 GB

## Documentation

For more information, visit the [official GitLab documentation](https://docs.gitlab.com/).

