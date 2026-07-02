---
sidebar_position: 9
---

# Verification and Monitoring

After deploying and configuring all services, you need to verify that the entire system is working and set up monitoring.

## Verifying Pod Status

Check the status of all pods across all namespaces:

```bash
kubectl get pods --all-namespaces
```

All pods should be in the `Running` state. If there are pods in the `Pending`, `Error`, or `CrashLoopBackOff` state, check their logs:

```bash
kubectl describe pod <pod-name> -n <namespace>
kubectl logs <pod-name> -n <namespace>
```

### Verification by Namespace

Check each namespace separately:

```bash
# Databases
kubectl get pods -n db

# Services
kubectl get pods -n service

# Infrastructure
kubectl get pods -n infrastructure

# Productivity
kubectl get pods -n productivity

# Code
kubectl get pods -n code

# Social services
kubectl get pods -n social

# Data
kubectl get pods -n data

# Ingress
kubectl get pods -n ingress
```

## Verification of Services

Check the status of all services:

```bash
kubectl get svc --all-namespaces
```

Make sure that all services have a ClusterIP and the correct ports.

### Verifying Endpoints

Check that the services have active endpoints:

```bash
kubectl get endpoints --all-namespaces
```

## Verifying Ingress

Check all Ingress resources:

```bash
kubectl get ingress --all-namespaces
```

Make sure that:
- All ingresses are configured correctly
- Domains point to the correct services
- TLS certificates are configured

### Verifying a Specific Ingress

```bash
kubectl describe ingress <ingress-name> -n <namespace>
```

## Verifying Connectivity via Pangolin

### Verifying Wireguard Status

On the client:

```bash
cd /opt/pangolin
docker exec gerbil wg show
```

On the server:

```bash
ssh user@your-vps-ip "docker exec gerbil wg show"
```

### Verifying Ping Through the Tunnel

```bash
ping 10.99.0.1  # Server IP in the Wireguard network
```

### Verifying Service Availability Through the Tunnel

Check service availability via domains:

```bash
curl -I https://gitlab.local
curl -I https://youtrack.local
curl -I https://vaultwarden.local
curl -I https://grafana.local
```

All services should respond with HTTP 200 or a redirect to the login page.

## Verifying Service Availability via Domains

### Verifying DNS Resolution

```bash
nslookup gitlab.local
dig gitlab.local
```

### Verifying via curl

Check each service:

```bash
# GitLab
curl -I https://gitlab.local

# YouTrack
curl -I https://youtrack.local

# TeamCity
curl -I https://teamcity.local

# Vaultwarden
curl -I https://vaultwarden.local

# Grafana
curl -I https://grafana.local

# Authentik
curl -I https://authentik.local

# Glance
curl -I https://glance.local
```

### Verifying SSL Certificates

```bash
openssl s_client -connect gitlab.local:443 -servername gitlab.local < /dev/null
```

Make sure that the certificates are valid and have not expired.

## Using Glance for Centralized Access

### Opening Glance

Open the Glance web interface:

```
https://glance.local
```

### Verifying Links

Make sure that all links in Glance point to the correct services and work.

### Configuring Widgets

Add widgets for monitoring:
- Service status
- Resource usage metrics
- Recent events

## Monitoring via Grafana

### Opening Grafana

Open the Grafana web interface:

```
https://grafana.local
```

### Verifying the Connection to Prometheus

1. Configuration → Data Sources
2. Make sure that Prometheus is connected
3. Test connection - it should say "Data source is working"

### Verifying Dashboards

1. Dashboard → Browse
2. Make sure that the dashboards display data
3. Check the metrics:
   - CPU usage
   - Memory
   - Network
   - Disk

### Creating Custom Dashboards

Create dashboards for monitoring:
- Pod status
- Cluster resource usage
- Service availability
- Application metrics

## Logging via Loki

### Verifying Loki

```bash
kubectl get pods -n service -l app=loki
```

### Connecting Loki to Grafana

1. In Grafana: Configuration → Data Sources
2. Add data source → Loki
3. URL: `http://loki.service.svc.cluster.local:3100`
4. Test & Save

### Viewing Logs

1. Explore → Loki
2. Select a namespace and pod
3. View the logs

## Verifying Databases

### PostgreSQL

```bash
# Verify status
kubectl get pods -n db -l app=postgres

# Connect
kubectl exec -it -n db deployment/postgres -- psql -U postgres

# Verify databases
kubectl exec -it -n db deployment/postgres -- psql -U postgres -c "\l"
```

### MongoDB

```bash
# Verify status
kubectl get pods -n db -l app=mongodb

# Verify replica set
kubectl exec -it -n db deployment/mongodb -- mongosh --eval "rs.status()"
```

### ValKey

```bash
# Verify status
kubectl get pods -n db -l app=valkey

# Verify connection
kubectl exec -it -n db deployment/valkey-master -- valkey-cli ping
```

## Verifying Vault

### Vault Status

```bash
kubectl exec -n service deployment/vault -- vault status
```

Make sure that the status is: `Sealed: false`

### Verifying Secrets

```bash
# List Secrets
kubectl exec -n service deployment/vault -- vault kv list secret/

# View a secret
kubectl exec -n service deployment/vault -- vault kv get secret/vaultwarden/secrets
```

## Verifying Consul

### Consul Status

```bash
kubectl get pods -n service -l app=consul
```

### Cluster Members

```bash
kubectl exec -n service deployment/consul -- consul members
```

### Consul UI

Open the Consul web interface (if enabled):

```
https://consul.local
```

## Resource Monitoring

### Node Resource Usage

```bash
kubectl top nodes
```

### Pod Resource Usage

```bash
kubectl top pods --all-namespaces
```

### Detailed Resource Information

```bash
kubectl describe node <node-name>
```

## Verifying Events

Check the latest events in the cluster:

```bash
kubectl get events --all-namespaces --sort-by='.lastTimestamp' | tail -50
```

Pay attention to events of type `Warning` or `Error`.

## Configuring Alerts

### Alerts in Grafana

1. Alerting → Alert rules
2. Create rules for:
   - High CPU/memory usage
   - Service unavailability
   - Errors in logs
   - Disk problems

### Notification Channels

Configure notification channels:
- Email
- Slack
- Discord
- PagerDuty

## Backups

### Verifying Backups

Make sure that backups are configured for:
- Databases (PostgreSQL, MongoDB)
- Persistent volumes
- Configuration (Helm charts, secrets)

### Testing Restores

Periodically test the ability to restore from backups.

## Verification Checklist

Use this checklist to verify the system:

- [ ] All pods are in the Running state
- [ ] All services have active endpoints
- [ ] All ingresses are configured correctly
- [ ] The Wireguard tunnel is working
- [ ] All domains resolve and are reachable
- [ ] SSL certificates are valid
- [ ] Glance shows all services
- [ ] Grafana is connected to Prometheus
- [ ] Loki is collecting logs
- [ ] Databases are working
- [ ] Vault is unsealed and available
- [ ] Consul is working
- [ ] Resources are used reasonably
- [ ] Alerts are configured
- [ ] Backups are configured

## Troubleshooting

### Pods Don't Start

1. Check events: `kubectl describe pod <pod-name> -n <namespace>`
2. Check logs: `kubectl logs <pod-name> -n <namespace>`
3. Check resources: `kubectl describe node`
4. Check persistent volumes: `kubectl get pv, pvc`

### Services Are Unavailable

1. Check ingress: `kubectl describe ingress -n <namespace>`
2. Check DNS: `nslookup <domain>`
3. Check SSL: `openssl s_client -connect <domain>:443`
4. Check Traefik logs: `kubectl logs -n ingress -l app=traefik`

### Database Problems

1. Check status: `kubectl get pods -n db`
2. Check logs: `kubectl logs -n db <db-pod>`
3. Check connectivity: try connecting to the database
4. Check persistent volumes

## Next Steps

After verifying the system:

1. Set up regular checks
2. Configure automatic alerts
3. Configure backups
4. Document the specifics of your installation




