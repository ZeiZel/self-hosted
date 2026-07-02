---
sidebar_position: 4
---

# Quick Start

Get up and running with the self-hosted infrastructure in minutes.

## Quick Start with Docker Compose

For local development and testing:

```bash
cd docker/<service-name>
docker-compose up -d
```

## Quick Start with Kubernetes

For production deployment:

```bash
cd kubernetes
helmfile init --force
helmfile -e k8s apply
```

## Quick Start with Ansible

For automated provisioning, use the `selfhost` CLI (which wraps the phased `ansible/all.yml` playbook):

```bash
selfhost deploy
```

Or run Ansible directly:

```bash
cd ansible
ansible-playbook -i inventory/hosts.ini all.yml
```

## Accessing Services

After deployment, services are accessible through:

- **Gateway API (HTTPRoute):** `https://<service-name>.<your-domain>` (routed by the shared Gateway in the `ingress` namespace, with Traefik as the GatewayClass controller)
- **Local:** `http://localhost:<port>` (for Docker Compose)

## Common Services

- **Glance Dashboard:** `https://glance.<your-domain>`
- **GitLab:** `https://gitlab.<your-domain>`
- **Grafana:** `https://grafana.<your-domain>`
- **Vaultwarden:** `https://vaultwarden.<your-domain>`

## Troubleshooting

If you encounter issues:

1. Check service logs: `kubectl logs <pod-name> -n <namespace>`
2. Verify routes: `kubectl get httproute --all-namespaces`
3. Check service status: `kubectl get pods --all-namespaces`

For more detailed information, see the [Deployment Guides](../deployment/overview.md).

