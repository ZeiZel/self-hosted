# Server Role

Base server configuration and security hardening.

## Overview

This role:
- Updates system packages
- Configures SSH security
- Sets up UFW firewall
- Creates user accounts
- Installs base packages

## Requirements

- Ubuntu 20.04+ server
- SSH access with sudo privileges

## Role Variables

See `defaults/main.yml` for key variables:

| Variable | Description |
|----------|-------------|
| `server_hostname` | Server hostname |
| `server_timezone` | System timezone |
| `server_packages` | Base packages to install |
| `server_users` | Users to create |
| `ssh_port` | SSH port (default: 22) |
| `ufw_enabled` | Enable UFW firewall |
| `ufw_allowed_ports` | Ports to allow through firewall |

## Security Hardening

- SSH: Key-only authentication, no root login
- Firewall: Default deny, explicit allows
- Fail2ban: Brute-force protection
- Automatic security updates

## Dependencies

None

## Example Playbook

```yaml
- hosts: all
  roles:
    - server
  tags: [prepare]
```

## Tags

- `prepare` - Run all server preparation
- `server, packages` - Install packages
- `server, security` - Security hardening
- `server, users` - User management
- `server, firewall` - Firewall configuration

## Firewall Rules

Default allowed ports:
- 22 (SSH)
- 80 (HTTP)
- 443 (HTTPS)
- 6443 (Kubernetes API)
- 51820 (WireGuard)
