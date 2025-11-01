# Stalwart mailer

[Guide](https://stalw.art/docs/cluster/orchestration/kubernetes)

Manual installation

```bash
helm install stalwart charts/stalwart -n code --create-namespace -f values.yaml
```

### Connect to authentik

Enable LDAP in authentik

```bash
# LDAP on port 389 (Authentik LDAP interface)
# URL: ldap://authentik-ldap.authentik.svc.cluster.local:389
# Base DN: ou=users,dc=authentik,dc=local
# Bind DN: cn=admin,dc=authentik,dc=local
# Bind Password: (password of LDAP)
```

Create Authentik user

```bash
# WebUI Authentik:
# Admin Panel → Users & Groups → Users
# Create user with email for Stalwart
```
