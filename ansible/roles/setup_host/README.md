# Setup Host Role

Prepares the Ansible controller (local host) for deployment.

## Overview

This role:
- Installs required CLI tools
- Configures kubectl
- Sets up Helm and Helmfile
- Configures SOPS encryption

## Requirements

- macOS or Linux workstation
- Homebrew (macOS) or apt (Linux)

## Role Variables

See `defaults/main.yml` for key variables:

| Variable | Description |
|----------|-------------|
| `host_kubectl_version` | kubectl version |
| `host_helm_version` | Helm version |
| `host_helmfile_version` | Helmfile version |
| `host_sops_version` | SOPS version |

## Tools Installed

- kubectl - Kubernetes CLI
- helm - Kubernetes package manager
- helmfile - Declarative Helm
- sops - Secret encryption
- ansible - Automation
- gpg - GPG for SOPS

## Dependencies

None

## Example Playbook

```yaml
- hosts: localhost
  connection: local
  roles:
    - setup_host
```

## Tags

- `setup_host` - Run all host setup
- `setup_host, tools` - Install CLI tools
- `setup_host, kubeconfig` - Configure kubectl
