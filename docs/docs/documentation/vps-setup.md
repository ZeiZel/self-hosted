---
sidebar_position: 2
---

# Connecting and Configuring Remote Device (VPS)

At this stage, we will configure a remote VPS server where the Pangolin server will be deployed to establish a Wireguard tunnel and access services.

## VPS Requirements

Minimum requirements for VPS server:

- **CPU:** 2 cores
- **RAM:** 2 GB
- **Disk:** 20 GB SSD
- **OS:** Ubuntu 20.04/22.04 or Debian 11/12
- **Network:** Static IP address
- **Open ports:**
  - 22 (SSH)
  - 80 (HTTP)
  - 443 (HTTPS)
  - 51820/UDP (WireGuard)

Recommended requirements for production:

- **CPU:** 4 cores
- **RAM:** 4 GB
- **Disk:** 40 GB SSD

## Inventory Configuration

Before deployment, you need to configure the inventory file with your VPS parameters.

Copy `ansible/inventory/hosts.example.ini` to `ansible/inventory/hosts.ini` and configure the `[vps]` group (INI format):

```ini
[vps]
# VPS gateway for the Pangolin server
server ansible_host=YOUR_VPS_IP_ADDRESS ansible_user=root ansible_port=22
```

### Variable Configuration

Configure global variables in `ansible/group_vars/all/vars.yml` (Pangolin domain, admin email, versions, WireGuard and security settings), for example:

```yaml
pangolin_domain: "yourdomain.com"
pangolin_admin_email: "admin@yourdomain.com"
pangolin_version: "latest"
gerbil_version: "latest"
traefik_version: "v3.4.0"

pangolin_install_dir: "/opt/pangolin"

wireguard_network: "10.99.0.0/24"
wireguard_server_ip: "10.99.0.1"
wireguard_port: 51820

# Security settings
new_user_name: "admin"
fail2ban_dest_email: "admin@yourdomain.com"
fail2ban_ssh_maxretry: 5
fail2ban_ssh_bantime: 3600
fail2ban_ssh_findtime: 600
```

## Deploying Pangolin Server on VPS

Deployment is performed through an Ansible playbook that automatically:

1. Configures basic server security
2. Installs necessary packages
3. Installs Docker
4. Deploys Pangolin server
5. Configures firewall

### Executing Deployment

The recommended entry point is the `selfhost` CLI, which wraps the Ansible run:

```bash
selfhost gateway setup
```

Or run Ansible directly. Everything lives in the single phased `ansible/all.yml` playbook, scoped with tags:

```bash
cd ansible
ansible-playbook -i inventory/hosts.ini all.yml --tags gateway
```

The playbook will execute the following roles:

- `server` - security configuration (disabling root SSH, creating new user, configuring fail2ban, firewall)
- `docker` - Docker installation
- `pangolin` - Pangolin gateway deployment

### What the Playbook Does

1. **Security Configuration:**
   - Creating a new user with sudo rights
   - Configuring SSH keys
   - Configuring fail2ban for brute force protection
   - Configuring UFW firewall
   - Opening necessary ports

2. **System Package Installation:**
   - System update
   - Installing necessary packages (curl, gnupg, python3-pip, ufw, wireguard)
   - Configuring sysctl for WireGuard (IP forwarding)

3. **Docker Installation:**
   - Installing Docker CE
   - Adding user to docker group
   - Configuring Docker Compose

4. **Pangolin Deployment:**
   - Creating directories for Pangolin (`/opt/pangolin`)
   - Generating configuration files
   - Deployment via Docker Compose
   - Waiting for service readiness

## Checking Pangolin Operation

After deployment completion, check container status:

```bash
ssh user@your-vps-ip "cd /opt/pangolin && docker-compose ps"
```

The following containers should be running:
- `pangolin` - main Pangolin service
- `gerbil` - WireGuard server
- `traefik` - reverse proxy

Check Pangolin logs:

```bash
ssh user@your-vps-ip "cd /opt/pangolin && docker-compose logs pangolin"
```

## Initial Pangolin Configuration via Web Interface

After successful Pangolin deployment, you need to perform initial configuration through the web interface.

1. **Open Web Interface:**

Navigate to: `https://yourdomain.com/auth/initial-setup`

Or, if the domain is not yet configured, by IP: `https://YOUR_VPS_IP`

2. **Perform Initial Configuration:**

- Create an administrative account
- Configure basic parameters
- Save configuration

3. **Check API Availability:**

```bash
curl https://yourdomain.com/api/v1/
```

You should receive a response from the Pangolin API.

## Checking Wireguard Tunnel

After configuring Pangolin, you can check WireGuard status:

```bash
ssh user@your-vps-ip "docker exec gerbil wg show"
```

You should see the WireGuard interface with server settings.

### DNS Record Configuration

To work with a domain, configure a DNS record:

**A record:**
```
yourdomain.com -> YOUR_VPS_IP
```

**Or, if using a subdomain:**
```
pangolin.yourdomain.com -> YOUR_VPS_IP
```

After configuring DNS, wait a few minutes for changes to propagate.

## Troubleshooting

### Issue: Pangolin Won't Start

Check logs:

```bash
ssh user@your-vps-ip "cd /opt/pangolin && docker-compose logs"
```

Check port availability:

```bash
ssh user@your-vps-ip "sudo netstat -tulpn | grep -E '3001|51820|80|443'"
```

### Issue: Cannot Connect via HTTPS

Make sure:
- Domain is correctly configured in DNS
- Ports 80 and 443 are open in firewall
- Traefik is running and working

Check Traefik logs:

```bash
ssh user@your-vps-ip "cd /opt/pangolin && docker-compose logs traefik"
```

### Issue: WireGuard Not Working

Check WireGuard status:

```bash
ssh user@your-vps-ip "docker exec gerbil wg show"
```

Make sure port 51820/UDP is open:

```bash
ssh user@your-vps-ip "sudo ufw status | grep 51820"
```

## Next Steps

After successfully configuring VPS and Pangolin server:

1. [Kubernetes Cluster Deployment](./kubernetes-deployment.md) - configuring local Kubernetes cluster for services




