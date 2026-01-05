---
sidebar_position: 10
---

# Resources and Requirements

This section describes the resource requirements for deploying the entire infrastructure.

## VPS Requirements

The VPS server is used to host the Pangolin server, which provides a VPN tunnel and reverse proxy for accessing services.

### Minimum Requirements

- **CPU:** 2 cores
- **RAM:** 2 GB
- **Disk:** 20 GB SSD
- **OS:** Ubuntu 20.04/22.04 or Debian 11/12
- **Network:** Static IP address, minimum 100 Mbps
- **Open ports:**
  - 22 (SSH)
  - 80 (HTTP) - for Let's Encrypt
  - 443 (HTTPS)
  - 51820/UDP (WireGuard)

### Recommended Requirements

- **CPU:** 4 cores
- **RAM:** 4 GB
- **Disk:** 40 GB SSD
- **Network:** Static IP, 1 Gbps

### Additional Requirements

- **Domain:** It is recommended to have a domain for working with Let's Encrypt
- **DNS:** Ability to configure DNS records (A, MX, TXT)

## Local Server Requirements (Kubernetes)

The local server is used to host the Kubernetes cluster with all services.

### Minimum Requirements for Master Node

- **CPU:** 2 cores
- **RAM:** 2 GB
- **Disk:** 20 GB SSD
- **OS:** Ubuntu 20.04/22.04 or similar
- **Network:** Stable internet connection

### Minimum Requirements for Worker Node

- **CPU:** 4 cores
- **RAM:** 4 GB
- **Disk:** 50 GB SSD
- **OS:** Ubuntu 20.04/22.04 or similar
- **Network:** Stable internet connection

### Recommended Requirements for Master Node

- **CPU:** 4 cores
- **RAM:** 4 GB
- **Disk:** 50 GB SSD
- **HA:** 3 master nodes for high availability

### Recommended Requirements for Worker Node

- **CPU:** 8 cores
- **RAM:** 16 GB
- **Disk:** 100 GB SSD
- **Quantity:** Minimum 3 worker nodes

### Storage Requirements

- **Storage Class:** It is recommended to use SSD storage
- **Minimum volume:** 200 GB for all persistent volumes
- **Recommended volume:** 500 GB+

### Network Requirements

- **Local network:** All nodes must be on the same network
- **Bandwidth:** Minimum 1 Gbps between nodes
- **Latency:** Low latency between nodes (< 1ms)

## Local Machine Requirements (Management)

The local machine is used to manage the entire infrastructure through Ansible, Terraform, kubectl, and other tools.

### Operating System

- **macOS:** 10.15+ (recommended)
- **Linux:** Ubuntu 20.04+ or similar distribution
- **Windows:** Windows 10/11 with WSL2 (Ubuntu)

### Installed Tools

All tools must be installed (see [Local Device Preparation](./preparation.md)):

- **Ansible:** 2.9+
- **Terraform:** 1.0+
- **kubectl:** 1.28+
- **Helm:** 3.8+
- **Helmfile:** 0.155+
- **Docker:** 20.10+ (optional, for local development)
- **GPG:** 2.2+
- **SOPS:** 3.7+

### Network Requirements

- **SSH access:** Access to VPS and Kubernetes nodes
- **Internet:** For downloading images and packages
- **Bandwidth:** Minimum 10 Mbps for comfortable work

### System Requirements

- **RAM:** 8 GB (recommended)
- **Disk:** 20 GB free space
- **CPU:** 2+ cores

## Detailed Service Resource Requirements

### Databases

#### PostgreSQL

- **CPU:** 1-2 cores
- **RAM:** 1-2 GB
- **Disk:** 20-50 GB (depends on data volume)
- **Replicas:** 3 (for HA)

#### MongoDB

- **CPU:** 1-2 cores
- **RAM:** 2-4 GB
- **Disk:** 20-50 GB
- **Replica Set:** 3 nodes

#### ValKey

- **CPU:** 0.5-1 core
- **RAM:** 512 MB - 1 GB
- **Disk:** 5-10 GB
- **Architecture:** Replication (1 master + 2 replicas)

#### MinIO

- **CPU:** 1-2 cores
- **RAM:** 1-2 GB
- **Disk:** 50-500 GB (depends on storage volume)

### Infrastructure Services

#### Traefik

- **CPU:** 0.5-1 core
- **RAM:** 256-512 MB
- **Replicas:** 2-3 (for HA)

#### Consul

- **CPU:** 0.5-1 core
- **RAM:** 512 MB - 1 GB
- **Replicas:** 3-5 (for HA)

#### Vault

- **CPU:** 1-2 cores
- **RAM:** 512 MB - 1 GB
- **Disk:** 10-20 GB
- **Replicas:** 3 (for HA)

#### Prometheus

- **CPU:** 1-2 cores
- **RAM:** 2-4 GB
- **Disk:** 50-200 GB (depends on retention)

#### Grafana

- **CPU:** 0.5-1 core
- **RAM:** 512 MB - 1 GB
- **Disk:** 5-10 GB

#### Loki

- **CPU:** 1-2 cores
- **RAM:** 2-4 GB
- **Disk:** 50-200 GB (depends on retention)

### Applications

#### GitLab

- **CPU:** 4-8 cores
- **RAM:** 8-16 GB
- **Disk:** 50-200 GB

#### TeamCity

- **CPU:** 2-4 cores (server) + 2-4 cores per agent
- **RAM:** 2-4 GB (server) + 2-4 GB per agent
- **Disk:** 20-50 GB (server) + 10-20 GB per agent

#### YouTrack

- **CPU:** 2-4 cores
- **RAM:** 2-4 GB
- **Disk:** 20-50 GB

#### Vaultwarden

- **CPU:** 0.5-1 core
- **RAM:** 512 MB - 1 GB
- **Disk:** 10-50 GB (depends on number of users)

#### Notesnook

- **CPU:** 1-2 cores (server + identity + SSE)
- **RAM:** 2-4 GB
- **Disk:** 10-50 GB

#### Authentik

- **CPU:** 1-2 cores
- **RAM:** 1-2 GB
- **Disk:** 10-20 GB

## Total Requirements

### Minimum Configuration (for testing)

**VPS:**
- 2 CPU, 2 GB RAM, 20 GB disk

**Kubernetes (1 master + 1 worker):**
- Master: 2 CPU, 2 GB RAM, 20 GB disk
- Worker: 4 CPU, 4 GB RAM, 50 GB disk
- **Total:** 6 CPU, 6 GB RAM, 70 GB disk

**Recommendation:** Suitable only for testing, not for production.

### Recommended Configuration (for production)

**VPS:**
- 4 CPU, 4 GB RAM, 40 GB disk

**Kubernetes (3 masters + 3 workers):**
- Masters: 3 × (4 CPU, 4 GB RAM, 50 GB disk) = 12 CPU, 12 GB RAM, 150 GB disk
- Workers: 3 × (8 CPU, 16 GB RAM, 100 GB disk) = 24 CPU, 48 GB RAM, 300 GB disk
- **Total:** 36 CPU, 60 GB RAM, 450 GB disk

**Recommendation:** Optimal configuration for a fully functional production system.

### Scaling

For larger loads, you can:
- Add additional worker nodes
- Increase resources on existing nodes
- Use horizontal pod scaling
- Configure autoscaling

## Cost Estimation

### VPS (approximately)

- Minimum: $10-20/month
- Recommended: $20-40/month

### Local Server (approximately)

- Minimum configuration: $500-1000 (one-time)
- Recommended configuration: $2000-5000 (one-time)

Or you can use cloud services (AWS, GCP, Azure) with similar requirements.

## Resource Optimization

### Optimization Recommendations

1. **Use SSD** for all disks
2. **Configure pod resources** in values.yaml according to actual needs
3. **Enable horizontal scaling** for applications
4. **Use resource quotas** to limit resource usage
5. **Configure node affinity** for optimal pod placement
6. **Regularly clean up** unused images and data

### Resource Usage Monitoring

Regularly check resource usage:

```bash
kubectl top nodes
kubectl top pods --all-namespaces
```

Use Grafana to visualize resource usage and plan scaling.

## Next Steps

After assessing requirements:

1. Prepare necessary equipment
2. Configure network
3. Start with [Local Device Preparation](./preparation.md)




