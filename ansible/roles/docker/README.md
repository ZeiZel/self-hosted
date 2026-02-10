# Docker Role

Installs Docker CE and Docker Compose plugin on Ubuntu servers.

## Requirements

- Ubuntu 20.04+ (uses apt)
- SSH access with sudo privileges

## Role Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `docker_packages` | See defaults | List of Docker packages to install |
| `docker_service_enabled` | `true` | Enable Docker service on boot |
| `docker_service_state` | `started` | Docker service state |
| `docker_add_user_to_group` | `true` | Add ansible_user to docker group |
| `docker_auto_reboot` | `true` | Reboot if required after installation |

## Dependencies

None

## Example Playbook

```yaml
- hosts: servers
  roles:
    - docker
```

## Tags

- `docker` - Run all Docker installation tasks

## Notes

- Installs Docker from official Docker repository
- Adds GPG key and configures apt repository
- Adds current user to docker group (may require logout/login)
- Automatically reboots if system requires it
