---
sidebar_position: 8
---

# Configuration of Services

After all services have been deployed, you need to perform the initial configuration of each of them. This section describes the configuration of the core services.

## Vault

Vault is already configured during the base infrastructure deployment stage (see [Base Infrastructure Deployment](./infrastructure-deployment.md#vault)).

### Additional Configuration

#### Configure access policies

After the basic setup, you can create additional policies for more granular access control:

```bash
kubectl exec -n service deployment/vault -- vault policy write <policy-name> - <<EOF
path "secret/data/<service>/*" {
  capabilities = ["read", "list"]
}
EOF
```

#### Kubernetes integration

The Kubernetes integration is already configured by the `vault-setup.sh` script. Additional settings can be applied through the web interface or the CLI.

## Authentik

Authentik is an SSO solution for single sign-on across all services.

### First login

1. Open the Authentik web interface:
   ```
   https://authentik.local
   ```

2. Log in using the bootstrap token (if this is the first launch):
   - The token is stored in the secrets (`authentikBootstrapToken`)

3. Create an administrator account:
   - Email: enter your email
   - Password: create a strong password
   - Save the credentials

### Configure user sources

1. Navigate to the "Directory" → "Users" section
2. Create users manually or configure LDAP/Active Directory
3. Configure user groups

### Configure providers

#### OAuth2/OIDC provider

1. Navigate to "Applications" → "Providers"
2. Create a new OAuth2/OIDC Provider:
   - Name: the provider name
   - Authorization flow: select a flow
   - Client ID and Client Secret: generate them automatically

#### SAML provider

1. Create a SAML Provider:
   - Configure the Entity ID
   - Specify the Service Provider binding
   - Configure the attributes

### Integration with other services

Configure Authentik integration with:
- GitLab (via OAuth2)
- YouTrack (via SAML)
- Grafana (via OAuth2)
- And other services

For each service:
1. Create a Provider in Authentik
2. Create an Application in Authentik
3. Configure the service to use Authentik (see the documentation for the specific service)

## Vaultwarden

Vaultwarden is a self-hosted server for Bitwarden.

### First login

1. Open the web interface:
   ```
   https://vaultwarden.local
   ```

2. Register the first user:
   - Click "Create account"
   - Fill in the registration form
   - Create a master password

### User registration

By default, registration is open. To disable it:

1. Open the admin panel:
   ```
   https://vaultwarden.local/admin
   ```

2. Log in using the admin token (from the secrets)

3. Disable registration:
   - Settings → General → Signups allowed: Off

### Configure the admin panel

1. Log in to the admin panel (`/admin`)
2. Use the admin token from the secrets
3. Configure:
   - Email notifications
   - User invitations
   - Security policies

### Configure email notifications

In the secrets, configure:
- `vaultwardenEmail` - the sender email address
- SMTP settings (via Authentik or an external SMTP)

### Using it through a client

1. Download the Bitwarden client (Desktop, Mobile, Browser extension)
2. In the server settings, specify:
   ```
   Server URL: https://vaultwarden.local
   ```
3. Log in using the account you created

## YouTrack

YouTrack is a project management system by JetBrains.

### First launch

1. Open the web interface:
   ```
   https://youtrack.local
   ```

2. Wait for initialization to finish (it may take several minutes)

3. Log in with the credentials:
   - Default: `admin` / `admin`
   - Change the password on first login

### Integration with JetBrains Hub

1. Configure JetBrains Hub (see the Hub section)
2. In YouTrack, go to Settings → Hub
3. Specify the Hub server URL:
   ```
   https://hub.local
   ```
4. Complete the connection

### Configure projects

1. Create your first project:
   - Projects → Create Project
   - Choose a project template
   - Configure fields and workflow

2. Configure integrations:
   - Git (GitLab, GitHub)
   - CI/CD (TeamCity)
   - Other services

### Configure GitLab integration

1. In GitLab, create a Personal Access Token
2. In YouTrack: Settings → Integrations → GitLab
3. Specify the GitLab URL and the token
4. Configure the synchronization of commits and issues

## TeamCity

TeamCity is a CI/CD server by JetBrains.

### Initial setup

1. Open the web interface:
   ```
   https://teamcity.local
   ```

2. Accept the license agreement

3. Configure the database:
   - An external PostgreSQL is used (already configured)
   - TeamCity will connect to the database automatically

4. Create an administrator account

### Database connection

The database is already configured in values.yaml. Check the connection:

```bash
kubectl exec -n code deployment/teamcity-server -- psql -h postgresql.db.svc.cluster.local -U teamcity -d teamcity -c "SELECT 1"
```

### Configure build agents

1. Navigate to Administration → Agents
2. Build agents connect automatically (if enabled in the configuration)
3. Authorize the agents to start working
4. Check the status: the Agents must be "Authorized" and "Connected"

### GitLab integration

1. In GitLab, create a Personal Access Token
2. In TeamCity: Administration → Integrations → GitLab
3. Configure the connection:
   - GitLab URL: `https://gitlab.local`
   - Personal Access Token: the token from GitLab
4. Create a project connected to the GitLab repository

## GitLab

GitLab is a version control and CI/CD system.

### First login

1. Open the web interface:
   ```
   https://gitlab.local
   ```

2. Log in with the root user:
   - Username: `root`
   - Password: stored in the secrets (`gitlabToken`) or set it via the console

3. Change the password on first login

### Configure SSH keys

1. Generate an SSH key (if you don't have one yet):
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```

2. Copy the public key:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```

3. In GitLab: User Settings → SSH Keys
4. Paste the public key and save

### Configure CI/CD

1. Create your first project
2. Add a `.gitlab-ci.yml` file to the repository
3. Configure a GitLab Runner (if used)

### Integration with external services

Configure integration with:
- YouTrack (to link issues)
- TeamCity (for CI/CD)
- Authentik (for SSO)

## Notesnook

Notesnook is a note-taking system.

### Verify the MongoDB replica set

Before use, make sure the MongoDB replica set is configured:

```bash
kubectl exec -it -n db deployment/mongodb -- mongosh --eval "rs.status()"
```

If the replica set is not configured, initialize it:

```bash
kubectl exec -it -n db deployment/mongodb -- mongosh --eval "rs.initiate()"
```

### Configure MinIO buckets

1. Check that MinIO is available:
   ```bash
   kubectl get ingress -n db -l app=minio
   ```

2. Log in to the MinIO console (usually `minio.local`)
3. Create a bucket for Notesnook:
   - Bucket name: `notesnook` or `attachments`
   - Configure the access permissions

### First login through a client

1. Download the Notesnook client (Desktop, Mobile, Web)
2. In the settings, specify the server:
   ```
   Server URL: https://notesnook.local
   Identity Server: https://identity.notesnook.local
   ```
3. Create an account
4. Start synchronizing your notes

## Stoat

Stoat (formerly Revolt) is a chat server.

### First launch

1. Open the web interface:
   ```
   https://stoat.local
   ```

2. Register the first user (the administrator)

3. Create your first server

### Configure servers

1. Create a server in the interface
2. Invite users
3. Configure channels and roles
4. Configure integrations (bots, webhooks)

## Stalwart

Stalwart is a mail server.

### Configure the domain

1. In the Stalwart settings, specify your domain:
   ```
   Domain: mail.yourdomain.com
   ```

### Configure DNS records

Configure the following DNS records for your domain:

**MX record:**
```
yourdomain.com.  MX  10  mail.yourdomain.com.
```

**A record for mail:**
```
mail.yourdomain.com.  A  YOUR_VPS_IP
```

**SPF record:**
```
yourdomain.com.  TXT  "v=spf1 mx a ip4:YOUR_VPS_IP ~all"
```

**DKIM record:**
Get the DKIM key from Stalwart and add a TXT record:
```
default._domainkey.yourdomain.com.  TXT  "v=DKIM1; k=rsa; p=..."
```

**DMARC record:**
```
_dmarc.yourdomain.com.  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com"
```

### Integration with Authentik

1. In Authentik, create an LDAP provider
2. In Stalwart, configure the connection to LDAP:
   - LDAP Server: `authentik.service.svc.cluster.local`
   - Port: 389 (or 636 for LDAPS)
   - Base DN: configure it according to Authentik

## Glance

Glance is a centralized dashboard.

### Configure widgets

1. Open the web interface:
   ```
   https://glance.local
   ```

2. Log in (if authentication is required)

3. Add widgets:
   - Drag widgets onto the dashboard
   - Configure the size and position

### Adding links to services

1. Add a new "Links" widget
2. Add links to all your services:
   - GitLab: `https://gitlab.local`
   - YouTrack: `https://youtrack.local`
   - Grafana: `https://grafana.local`
   - And others

### Customization

1. Configure the theme (colors, background)
2. Add your own widgets
3. Configure the layout (grid, sizes)

## Monitoring (Grafana)

Grafana is a metrics visualization system.

### First login

1. Open the web interface:
   ```
   https://grafana.local
   ```

2. Log in with the credentials:
   - Username: `admin`
   - Password: from the secrets (`grafanaPassword`)

3. Change the password on first login

### Configure dashboards

1. Import ready-made dashboards:
   - Dashboard → Import
   - Choose one from the library or import a JSON

2. Create your own dashboards:
   - Dashboard → New Dashboard
   - Add panels (graphs, tables, statistics)

### Configure alerts

1. Create notification channels:
   - Alerting → Notification channels
   - Configure email, Slack, and other channels

2. Create alert rules:
   - Alerting → Alert rules
   - Configure the conditions and notifications

### Connecting to Prometheus

Grafana connects to Prometheus automatically. Check:

1. Configuration → Data Sources
2. Make sure Prometheus is added
3. URL: `http://prometheus.service.svc.cluster.local:9090`

## Harbor

Harbor is a container registry.

### First login

1. Open the web interface:
   ```
   https://harbor.local
   ```

2. Log in with the credentials:
   - Username: `admin`
   - Password: from the secrets

3. Change the password on first login

### Configure projects

1. Create a project:
   - Projects → New Project
   - Configure the access permissions

2. Configure replication (if needed)

### Integration with CI/CD

1. Configure Robot Accounts for automation
2. Use the credentials in CI/CD pipelines:
   ```yaml
   # GitLab CI example
   docker login harbor.local -u robot-account -p token
   ```

## Bytebase

Bytebase is a database schema management system.

### First login

1. Open the web interface:
   ```
   https://bytebase.local
   ```

2. Create an administrator account

### Connecting databases

1. Environments → Add Environment
2. Instances → Add Instance
3. Connect the databases:
   - PostgreSQL: `postgresql.db.svc.cluster.local:5432`
   - Enter the credentials
   - Check the connection

### Configure projects

1. Projects → New Project
2. Configure the database schema
3. Create migrations
4. Configure synchronization with Git

## Configuration Summary

After configuring all services:

1. Make sure all services are reachable through their domains
2. Check the integrations between services
3. Configure monitoring and alerts
4. Create backups of critical data
5. Configure automatic updates (if needed)

## Next Steps

After completing the configuration of all services:

1. [Verification and Monitoring](./verification.md) - verifying that the entire system is operational
