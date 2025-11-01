# Vaultwarden

Selfhosted server for Bitwarden

```bash
helm install vaultwarden charts/vaultwarden -n data --create-namespace -f values.yaml
```

## Actions

### Register new user

```bash
# You can disable auto registration for security reasons
# SIGNUPS_ALLOWED: false

# Admin panel
# https://vaultwarden.local/admin

# API
curl -X POST https://vaultwarden.local/api/accounts/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "masterPasswordHash": "...",
    "key": "..."
  }'
```

### Check status

```bash
# logs Vaultwarden
kubectl logs -n code -f deployment/vaultwarden

# Check status
kubectl get pods -n code -l app=vaultwarden

# Check connectivity to PostgreSQL
kubectl exec -it -n code deployment/vaultwarden -- \
  psql -h postgresql.code.svc.cluster.local -U vaultwarden -d vaultwarden -c "SELECT 1"
```

### Manual backup

```bash
# Backup data Vaultwarden
kubectl exec -it -n code deployment/vaultwarden -- \
  tar czf /data/backup-$(date +%Y%m%d).tar.gz /data

# Download backup locally
kubectl cp code/vaultwarden-pod:/data/backup-*.tar.gz ./backup.tar.gz
```
