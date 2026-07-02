---
sidebar_position: 6
---

# Deployment of Services

After the base infrastructure is deployed, you can proceed to deploy all the remaining services. Helmfile automatically takes into account the dependencies between services and deploys them in the correct order.

## Deployment Order

Thanks to the dependencies in `kubernetes/apps/_others.yaml`, the services are deployed in the following order:

1. **Databases** (PostgreSQL, MongoDB, ValKey, MinIO)
2. **Infrastructure services** (Monitoring, Glance, Harbor, Bytebase, Devtron)
3. **Authorization services** (Authentik)
4. **Productivity services** (Notesnook, Excalidraw, Penpot)
5. **Development services** (GitLab, TeamCity, YouTrack, JetBrains Hub)
6. **Social services** (Stoat, Stalwart)
7. **Data services** (Vaultwarden, Syncthing, Nextcloud)

## Deployment of All Services

### Running the Deployment

Navigate to the directory with the Kubernetes configuration:

```bash
cd kubernetes
```

Run the deployment of all services:

```bash
helmfile -e k8s apply
```

This command will deploy all services, taking dependencies into account. The process may take 30-60 minutes depending on the number of services and the image download speed.

### Status Verification

Check the status of all releases:

```bash
helmfile -e k8s list
```

Check the pod status by namespace:

```bash
kubectl get pods -n db
kubectl get pods -n service
kubectl get pods -n infrastructure
kubectl get pods -n productivity
kubectl get pods -n code
kubectl get pods -n social
kubectl get pods -n data
```

## Databases

### PostgreSQL

PostgreSQL is used by most services for data storage.

**Verification:**

```bash
kubectl get pods -n db -l app=postgres
kubectl get svc -n db -l app=postgres
```

**Connection:**

```bash
kubectl exec -it -n db deployment/postgres -- psql -U postgres
```

### MongoDB

MongoDB is used by Notesnook and Stoat.

**Verification:**

```bash
kubectl get pods -n db -l app=mongodb
```

**Replica set verification:**

```bash
kubectl exec -it -n db deployment/mongodb -- mongosh --eval "rs.status()"
```

### ValKey

ValKey (Redis-compatible) is used for caching and sessions.

**Verification:**

```bash
kubectl get pods -n db -l app=valkey
kubectl exec -it -n db deployment/valkey-master -- valkey-cli ping
```

### MinIO

MinIO is used for S3-compatible object storage.

**Verification:**

```bash
kubectl get pods -n db -l app=minio
kubectl get ingress -n db -l app=minio
```

## Infrastructure Services

### Monitoring (Prometheus, Grafana, Loki)

Monitoring includes Prometheus for collecting metrics, Grafana for visualization, and Loki for logs.

**Verification:**

```bash
kubectl get pods -n service -l app=prometheus
kubectl get pods -n service -l app=grafana
kubectl get pods -n service -l app=loki
```

**Access to Grafana:**

```bash
kubectl get ingress -n service -l app=grafana
```

Usually available at `grafana.local`. The administrator password is stored in the secrets.

### Glance

Glance is a centralized dashboard with links to all services.

**Verification:**

```bash
kubectl get pods -n infrastructure -l app=glance
kubectl get ingress -n infrastructure -l app=glance
```

**Access:** `glance.local`

### Harbor

Harbor is a container registry for storing Docker images.

**Verification:**

```bash
kubectl get pods -n infrastructure -l app=harbor
kubectl get ingress -n infrastructure -l app=harbor
```

**Access:** `harbor.local`

### Bytebase

Bytebase is a database schema management system.

**Verification:**

```bash
kubectl get pods -n infrastructure -l app=bytebase
kubectl get ingress -n infrastructure -l app=bytebase
```

**Access:** `bytebase.local`

### Devtron

Devtron is a Kubernetes dashboard and CI/CD platform.

**Verification:**

```bash
kubectl get pods -n devtroncd -l app=devtron
kubectl get ingress -n devtroncd -l app=devtron
```

**Access:** `devtron.local`

## Authorization Services

### Authentik

Authentik is an SSO (Single Sign-On) solution for authorization across all services.

**Verification:**

```bash
kubectl get pods -n service -l app=authentik
kubectl get ingress -n service -l app=authentik
```

**Access:** `authentik.local`

**Initial setup:** After the first launch, perform the configuration through the web interface (see [Service Configuration](./services-configuration.md#authentik)).

## Productivity Services

### Notesnook

Notesnook is a note-taking system with synchronization.

**Verification:**

```bash
kubectl get pods -n productivity -l app=notesnook
kubectl get ingress -n productivity -l app=notesnook
```

**Access:** `notesnook.local`, `identity.notesnook.local`

### Excalidraw

Excalidraw is a tool for creating diagrams.

**Verification:**

```bash
kubectl get pods -n productivity -l app=excalidraw
kubectl get ingress -n productivity -l app=excalidraw
```

**Access:** `excalidraw.local`

### Penpot

Penpot is a design tool (a Figma alternative).

**Verification:**

```bash
kubectl get pods -n productivity -l app=penpot
kubectl get ingress -n productivity -l app=penpot
```

**Access:** `penpot.local`

## Development Services

### GitLab

GitLab is a version control and CI/CD system.

**Verification:**

```bash
kubectl get pods -n code -l app=gitlab
kubectl get ingress -n code -l app=gitlab
```

**Access:** `gitlab.local`

**Initial setup:** After the first launch, log in as the root user (the password is in the secrets).

### TeamCity

TeamCity is a CI/CD server from JetBrains.

**Verification:**

```bash
kubectl get pods -n code -l app=teamcity
kubectl get ingress -n code -l app=teamcity
```

**Access:** `teamcity.local`

**Initial setup:** Perform the initial configuration through the web interface.

### YouTrack

YouTrack is a project management system from JetBrains.

**Verification:**

```bash
kubectl get pods -n code -l app=youtrack
kubectl get ingress -n code -l app=youtrack
```

**Access:** `youtrack.local`

### JetBrains Hub

JetBrains Hub is the management center for JetBrains services.

**Verification:**

```bash
kubectl get pods -n code -l app=hub
kubectl get ingress -n code -l app=hub
```

**Access:** `hub.local`

## Social Services

### Stoat

Stoat (formerly Revolt) is a chat server (a Discord alternative).

**Verification:**

```bash
kubectl get pods -n social -l app=stoat
kubectl get ingress -n social -l app=stoat
```

**Access:** `stoat.local`

### Stalwart

Stalwart is a mail server.

**Verification:**

```bash
kubectl get pods -n social -l app=stalwart
kubectl get ingress -n social -l app=stalwart
```

**Access:** `stalwart.local`

**Configuration:** Requires the configuration of DNS records (MX, SPF, DKIM, DMARC).

## Data Services

### Vaultwarden

Vaultwarden is a self-hosted server for Bitwarden.

**Verification:**

```bash
kubectl get pods -n data -l app=vaultwarden
kubectl get ingress -n data -l app=vaultwarden
```

**Access:** `vaultwarden.local`

**Initial setup:** Register the first user through the Bitwarden client.

### Syncthing

Syncthing is a file synchronization system.

**Verification:**

```bash
kubectl get pods -n data -l app=syncthing
kubectl get ingress -n data -l app=syncthing
```

**Access:** `syncthing.local`

### Nextcloud

Nextcloud is a cloud file storage system.

**Verification:**

```bash
kubectl get pods -n data -l app=nextcloud
kubectl get ingress -n data -l app=nextcloud
```

**Access:** `nextcloud.local`

**Initial setup:** Log in as the administrator (the password is in the secrets).

## Monitoring the Deployment Process

During the deployment, you can monitor the process:

```bash
# Watch the pod status
watch kubectl get pods --all-namespaces

# Watch the events
kubectl get events --all-namespaces --sort-by='.lastTimestamp'

# Check the logs of a specific service
kubectl logs -n <namespace> -l app=<app-name> -f
```

## Troubleshooting

### Issue: Pods Do Not Start

Check the events:

```bash
kubectl describe pod <pod-name> -n <namespace>
kubectl get events -n <namespace> --sort-by='.lastTimestamp'
```

Check the logs:

```bash
kubectl logs <pod-name> -n <namespace>
```

### Issue: Database Initialization Errors

Check the database status:

```bash
kubectl get pods -n db
kubectl logs -n db <database-pod>
```

Make sure that the databases are fully started before deploying dependent services.

### Issue: Insufficient Resources

Check resource usage:

```bash
kubectl top nodes
kubectl top pods --all-namespaces
```

If necessary, add resources to the nodes or reduce the number of replicas in values.yaml.

### Issue: Image Download Errors

Check the pod status:

```bash
kubectl get pods --all-namespaces | grep ImagePullBackOff
```

Make sure that the nodes can pull images from the registry.

## Next Steps

After successfully deploying all services:

1. [Setting Up the Pangolin and WireGuard Tunnel](./pangolin-setup.md) - configuring the VPN tunnel for accessing the services
2. [Service Configuration](./services-configuration.md) - the initial configuration of each service
