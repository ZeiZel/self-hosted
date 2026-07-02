---
sidebar_position: 7
---

# Configuration Pangolin and Wireguard Tunnel

Pangolin is a system for creating a VPN tunnel between a client (local machine) and a server (VPS), allowing you to securely forward ports and domains. At this stage we will configure the Pangolin client on the local machine and connect it to the Pangolin server on the VPS.

## Architecture Overview

Pangolin consists of two components:

- **Pangolin Server** (already deployed on the VPS) - manages client connections and routing
- **Pangolin Client** (Newt) - connects to the server and creates a Wireguard tunnel
- **Gerbil** - the Wireguard server that handles VPN connections
- **Traefik** - the reverse proxy on the server side that proxies requests through the tunnel

## Deployment Pangolin client

The Pangolin client is deployed on the local machine from which the services will be accessed through the VPN tunnel.

### Configuration inventory

Make sure that the `[local]` group is configured in `ansible/inventory/hosts.ini` (INI format):

```ini
[local]
127.0.0.1 ansible_user=your_username ansible_connection=local
```

The Pangolin server domain (`pangolin_server_endpoint`) is set in `ansible/group_vars/all/vars.yml`.

### Running the deployment

The recommended way is through the `selfhost` CLI:

```bash
selfhost vpn setup
```

Or run Ansible directly:

```bash
cd ansible
ansible-playbook -i inventory/hosts.ini vpn-client.yml
```

The playbook will perform the following actions:

1. **The `server` role** - installs base packages and configures the system
2. **The `docker` role** - installs Docker (if not already installed)
3. **The `wireguard-client` role** - deploys the Pangolin client (Newt)

### What the playbook does

1. Creates a directory for the Pangolin client (`/opt/pangolin`)
2. Generates configuration files for Newt
3. Starts the containers via Docker Compose
4. Waits for the connection to the server

## Registering the client on the Pangolin server

After deploying the client, you need to register it on the server through the Pangolin web interface.

### Accessing the web interface

Open the Pangolin server web interface:

```
https://yourdomain.com
```

Log in using the administrative credentials created during the initial setup.

### Registering the client

1. Navigate to the client management section
2. Create a new client or find an existing one
3. Copy the client configuration (if required)
4. Make sure that the client is authorized to connect

### Verification of the client connection

On the local machine, check the client logs:

```bash
cd /opt/pangolin
docker-compose logs -f gerbil
```

You should see messages about a successful connection to the server.

## Verification Wireguard connection

After registering the client, check the status of the Wireguard tunnel.

### On the server

Check the Wireguard status on the server:

```bash
ssh user@your-vps-ip "docker exec gerbil wg show"
```

You should see the connected clients in the peers list.

### On the client

Check the Wireguard status on the client:

```bash
cd /opt/pangolin
docker exec gerbil wg show
```

You should see an active Wireguard interface and a connection to the server.

### Verification of the connection

Check the ping to the server through the tunnel:

```bash
ping 10.99.0.1  # IP address of the server in the Wireguard network
```

If the ping works, the tunnel is set up correctly.

## Configuration of port and domain routing

After the client connects successfully, you can configure port and domain routing.

### Configuration through the Pangolin web interface

1. Log in to the Pangolin web interface
2. Navigate to the routing settings section
3. Add a rule to forward a port/domain:
   - **External domain:** the domain that will be used for access
   - **Internal address:** the address of the service on the client side (for example, `service.local:8080`)
   - **Protocol:** HTTP/HTTPS

### Configuration example

Example routing rules:

- `gitlab.local` → `gitlab.code.svc.cluster.local:80`
- `youtrack.local` → `youtrack.code.svc.cluster.local:80`
- `vaultwarden.local` → `vaultwarden.data.svc.cluster.local:80`

### Traefik configuration on the server

Traefik on the server is automatically configured to proxy requests through the tunnel. Make sure that:

1. Traefik is running and working
2. The routing rules are correctly configured in Pangolin
3. SSL certificates are configured (through Let's Encrypt or manually)

## Accessing services through the tunnel

After configuring routing, the services will be accessible through the configured domains.

### Verification of availability

Check the availability of the services:

```bash
# Verification through curl
curl -I https://gitlab.local
curl -I https://youtrack.local
curl -I https://vaultwarden.local
```

### Configuration DNS

To access the services through domains, configure the DNS records:

**Option 1: Using the server domain with subdomains**

```
gitlab.yourdomain.com -> YOUR_VPS_IP
youtrack.yourdomain.com -> YOUR_VPS_IP
vaultwarden.yourdomain.com -> YOUR_VPS_IP
```

**Option 2: Using local DNS (for development)**

Add entries to `/etc/hosts` (or `C:\Windows\System32\drivers\etc\hosts` on Windows):

```
YOUR_VPS_IP gitlab.local
YOUR_VPS_IP youtrack.local
YOUR_VPS_IP vaultwarden.local
```

### Using Glance for centralized access

After configuring all services, you can use Glance as a central dashboard:

1. Open `glance.local` (or the corresponding domain)
2. Add links to all services
3. Configure widgets and customization

## Configuration SSH tunnels through Pangolin

Pangolin can also be used to create SSH tunnels to services on the local machine.

### SSH configuration

The `local-access` role automatically configures the SSH configuration for access through the tunnel.

Check the `~/.ssh/config` file:

```
Host pangolin-tunnel
    HostName yourdomain.com
    User admin
    Port 22
    ProxyCommand ssh -W %h:%p jump-host
    IdentityFile ~/.ssh/id_rsa
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

### Using the SSH tunnel

```bash
# Connecting through the tunnel
ssh pangolin-tunnel

# Forwarding a port through SSH
ssh -L 8080:localhost:8080 pangolin-tunnel
```

## Monitoring and logging

### Pangolin client logs

Check the logs on the local machine:

```bash
cd /opt/pangolin
docker-compose logs -f
```

### Logs on the server

Check the logs on the server:

```bash
ssh user@your-vps-ip "cd /opt/pangolin && docker-compose logs -f"
```

### Wireguard status

Check the status of the connections:

```bash
# On the client
cd /opt/pangolin
docker exec gerbil wg show

# On the server
ssh user@your-vps-ip "docker exec gerbil wg show"
```

## Troubleshooting

### Issue: The client does not connect to the server

Check the client logs:

```bash
cd /opt/pangolin
docker-compose logs gerbil
```

Check:
- The correctness of the server domain in the configuration
- The reachability of the server from the network
- The status of the Pangolin server

### Issue: The Wireguard tunnel does not work

Check the Wireguard status:

```bash
docker exec gerbil wg show
```

Make sure that:
- Port 51820/UDP is open in the firewall on the server
- The client is registered on the server
- The Wireguard configuration is correct

### Issue: Domains do not resolve

Check the DNS settings:

```bash
# Verification of DNS resolution
nslookup gitlab.local
dig gitlab.local

# Verification of /etc/hosts
cat /etc/hosts
```

Make sure that the domains are correctly configured in DNS or `/etc/hosts`.

### Issue: Services are not accessible through the tunnel

Check the routing in Pangolin:

1. Log in to the Pangolin web interface
2. Check the routing rules
3. Make sure that the services are accessible locally
4. Check the Traefik logs on the server

### Issue: SSL certificate errors

Check the Let's Encrypt settings:

```bash
ssh user@your-vps-ip "cd /opt/pangolin && ls -la config/letsencrypt/"
```

Make sure that:
- The domains are correctly configured
- Ports 80 and 443 are open
- Let's Encrypt can verify the domain

## Security

### Security recommendations

1. **Use strong passwords** for access to Pangolin
2. **Restrict access** to the Pangolin web interface (for example, through a VPN or IP whitelist)
3. **Regularly update** the Pangolin components
4. **Monitor the logs** for suspicious activity
5. **Use a firewall** to restrict access to ports

### Key rotation

Periodically change the Wireguard keys:

1. In the Pangolin web interface
2. Regenerate the keys for the clients
3. Update the configuration on the client
4. Restart the client

## Next Steps

After successfully configuring the Pangolin and Wireguard tunnel:

1. [Services configuration](./services-configuration.md) - initial configuration of each service
2. [Verification and monitoring](./verification.md) - checking the health of the entire system
