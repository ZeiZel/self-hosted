---
sidebar_position: 2
---

# Requirements

This section describes the resource requirements for deploying the entire infrastructure.

## VPS Requirements

The VPS server is used to host the Pangolin server, which provides a VPN tunnel and reverse proxy for accessing services.

### Minimum Requirements

- **CPU:** 2 cores
- **RAM:** 2 GB
- **Disk:** 20 GB SSD
- **OS:** Ubuntu 20.04/22.04 or Debian 11/12
- **Network:** Static IP address, minimum 100 Mbps
- **Open Ports:**
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

- **Domain:** Recommended to have a domain for Let's Encrypt
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

## Local Machine Requirements (Management)

The local machine is used to manage the entire infrastructure through Ansible, Terraform, kubectl, and other tools.

### Operating System

- **macOS:** 10.15+ (recommended)
- **Linux:** Ubuntu 20.04+ or similar distribution
- **Windows:** Windows 10/11 with WSL2 (Ubuntu)

### Required Tools

All tools must be installed:

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

## Total Requirements Summary

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

