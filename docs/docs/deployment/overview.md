---
sidebar_position: 1
---

# Deployment Overview

This infrastructure supports multiple deployment methods, each suited for different use cases.

## Deployment Methods

### Docker Compose

Best for:
- Local development
- Quick testing
- Single-server deployments

**Location:** `docker/` directory

Each service has its own `docker-compose.yml` file for easy deployment.

### Kubernetes

Best for:
- Production environments
- High availability
- Scalability

**Location:** `kubernetes/` directory

Uses Helm charts and Helmfile for orchestration.

### Ansible

Best for:
- Automated provisioning
- Configuration management
- Multi-server deployments

**Location:** `ansible/pangolin/` directory

### Terraform

Best for:
- Infrastructure as Code
- Cloud provisioning
- Resource management

**Location:** `terraform/` directory

## Quick Links

- [Docker Compose Deployment](./docker) - Local development setup
- [Kubernetes Deployment](./kubernetes) - Production deployment
- [Ansible Setup](./ansible) - Automated provisioning
- [Terraform Infrastructure](./terraform) - Infrastructure as Code

## Choosing a Deployment Method

| Method | Use Case | Complexity | Scalability |
|--------|----------|------------|-------------|
| Docker Compose | Development, Testing | Low | Limited |
| Kubernetes | Production | High | Excellent |
| Ansible | Automation | Medium | Good |
| Terraform | Cloud Infrastructure | Medium | Excellent |

## Next Steps

Choose your deployment method and follow the specific guide:

1. [Docker Compose](./docker) - Start here for local development
2. [Kubernetes](./kubernetes) - For production deployments
3. [Ansible](./ansible) - For automated setup
4. [Terraform](./terraform) - For infrastructure provisioning

