# Ansible Playbooks

This directory contains Ansible playbooks for automated server setup and deployment.

## Structure

```
ansible/
├── all.yml                 # Main playbook with tags
├── ansible.cfg             # Ansible configuration
├── inventory/
│   ├── hosts.ini.example  # Example inventory file
│   └── hosts.ini          # Real inventory (gitignored)
├── roles/                  # Ansible roles
│   ├── ubuntu_server_setup/  # Ubuntu server security and setup
│   ├── kubespray/           # Kubernetes cluster deployment
│   ├── pangolin_server/     # Pangolin server deployment
│   └── pangolin_client/     # Pangolin client deployment
└── group_vars/            # Group variables
    ├── all.yml            # Common variables
    └── vault.yml          # Encrypted secrets (gitignored)
```

## Prerequisites

1. Install Ansible:
   ```bash
   pip install ansible
   ```

2. Copy inventory example:
   ```bash
   cp inventory/hosts.ini.example inventory/hosts.ini
   ```

3. Edit `inventory/hosts.ini` with your actual host information

4. Edit `group_vars/all.yml` with your configuration values

## Usage

All playbooks are executed from the main `all.yml` file using tags. This allows you to run specific role groups for different hosts.

### Basic Commands

#### 1. Ubuntu Server Setup (Security Hardening)

Configure Ubuntu server with security settings:
- Create new admin user (replaces root)
- Change SSH port to 2678
- Configure fail2ban
- Setup firewall (UFW)
- Disable root login
- Generate and save passwords to vault

```bash
# Setup all hosts
ansible-playbook -i inventory/hosts.ini all.yml --tags server-setup

# Setup specific host
ansible-playbook -i inventory/hosts.ini all.yml --limit server --tags server-setup
```

**Important:** After running server-setup, you'll need to use the new SSH port (2678) and new user for subsequent connections.

#### 2. Install Kubespray (Kubernetes)

Deploy Kubernetes cluster using Kubespray:

```bash
# Deploy to all k8s nodes
ansible-playbook -i inventory/hosts.ini all.yml --tags kubespray

# Deploy to specific nodes
ansible-playbook -i inventory/hosts.ini all.yml --limit k8s_masters --tags kubespray
```

#### 3. Deploy Pangolin Server

Install and configure Pangolin server on VPS:

```bash
# Deploy to all VPS hosts
ansible-playbook -i inventory/hosts.ini all.yml --tags pangolin-server

# Deploy to specific host
ansible-playbook -i inventory/hosts.ini all.yml --limit server --tags pangolin-server
```

#### 4. Deploy Pangolin Client

Install and configure Pangolin client on local/client machines:

```bash
# Deploy to all client hosts
ansible-playbook -i inventory/hosts.ini all.yml --tags pangolin-client

# Deploy to specific host
ansible-playbook -i inventory/hosts.ini all.yml --limit client --tags pangolin-client
```

### Combined Operations

Run multiple role groups for a specific host:

```bash
# Setup server and deploy Pangolin server
ansible-playbook -i inventory/hosts.ini all.yml --limit server --tags server-setup,pangolin-server

# Setup client and deploy Pangolin client
ansible-playbook -i inventory/hosts.ini all.yml --limit client --tags server-setup,pangolin-client
```

### Full Deployment Examples

#### Complete VPS Server Setup

```bash
# 1. Initial server security setup
ansible-playbook -i inventory/hosts.ini all.yml --limit server --tags server-setup

# 2. After updating inventory with new SSH port and user, deploy Pangolin
ansible-playbook -i inventory/hosts.ini all.yml --limit server --tags pangolin-server
```

#### Complete Client Setup

```bash
# 1. Initial client security setup
ansible-playbook -i inventory/hosts.ini all.yml --limit client --tags server-setup

# 2. After updating inventory with new SSH port and user, deploy Pangolin client
ansible-playbook -i inventory/hosts.ini all.yml --limit client --tags pangolin-client
```

## Tags Reference

| Tag | Description | Roles |
|-----|-------------|-------|
| `server-setup` | Ubuntu server security and setup | ubuntu_server_setup |
| `security` | Security hardening | ubuntu_server_setup |
| `ubuntu` | Ubuntu-specific tasks | ubuntu_server_setup |
| `hardening` | System hardening | ubuntu_server_setup |
| `kubespray` | Kubernetes deployment | kubespray |
| `k8s` | Kubernetes tasks | kubespray |
| `kubernetes` | Kubernetes tasks | kubespray |
| `pangolin-server` | Pangolin server deployment | pangolin_server |
| `server` | Server deployment | pangolin_server |
| `pangolin-client` | Pangolin client deployment | pangolin_client |
| `client` | Client deployment | pangolin_client |
| `pangolin` | All Pangolin tasks | pangolin_server, pangolin_client |

## Inventory Configuration

The inventory file (`inventory/hosts.ini`) uses INI format. Example:

```ini
[vps]
server ansible_host=80.90.178.207 ansible_user=root ansible_port=22

[local]
client ansible_host=192.168.31.100 ansible_user=zeizel ansible_port=22

[vps:vars]
pangolin_role=server
pangolin_domain=yourdomain.com
```

After running `server-setup`, update the inventory with the new SSH port and user:

```ini
[vps]
server ansible_host=80.90.178.207 ansible_user=admin ansible_port=2678
```

## Variables

Edit `group_vars/all.yml` to configure:

- `new_user_name`: Name of the new admin user (default: `admin`)
- `ssh_port`: SSH port (default: `2678`)
- `pangolin_domain`: Domain for Pangolin server
- `k8s_cluster_name`: Kubernetes cluster name
- And more...

## Password Management

Passwords are automatically generated and saved to `group_vars/vault.yml` (encrypted with ansible-vault). This file is gitignored for security.

To view/edit vault file:
```bash
ansible-vault edit group_vars/vault.yml
```

## Troubleshooting

### SSH Connection Issues

If you can't connect after changing SSH port:

1. Verify the new port is open:
   ```bash
   ssh -p 2678 admin@your-server-ip
   ```

2. Update inventory with correct port and user

3. Test connection:
   ```bash
   ansible -i inventory/hosts.ini server -m ping
   ```

### Permission Issues

If you encounter permission errors:

1. Ensure the user has sudo access
2. Use `--become` flag (already set in ansible.cfg)
3. Check SSH key is added to the new user

## Additional Resources

- [Ansible Documentation](https://docs.ansible.com/)
- [Kubespray Documentation](https://kubespray.io/)
- [Pangolin Documentation](https://github.com/fosrl/pangolin)

