# Bytebase Database Setup Guide

This guide explains how to connect and manage databases using Bytebase in your Kubernetes cluster.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Accessing Bytebase](#accessing-bytebase)
- [Initial Setup](#initial-setup)
- [Connecting PostgreSQL](#connecting-postgresql)
- [Connecting MongoDB](#connecting-mongodb)
- [Database Management](#database-management)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before connecting databases to Bytebase, ensure:

1. **Bytebase is deployed** and running in the `infrastructure` namespace
2. **Databases are deployed** and healthy in the `db` namespace:
   - PostgreSQL (3 replicas)
   - MongoDB (3 replicas, ReplicaSet rs0)
3. **Database users and databases are created** for the applications you want to manage

## Accessing Bytebase

### Via Ingress

Access Bytebase UI at:
```
https://bytebase.{{ infra.host }}
```

Replace `{{ infra.host }}` with your actual domain configured in the Helm values.

### Via Port Forward

If ingress is not configured:
```bash
kubectl port-forward -n infrastructure svc/bytebase 8080:8080
```

Then access: http://localhost:8080

### Initial Login

On first access, Bytebase will prompt you to:
1. Create an admin account
2. Set up your workspace
3. Configure your organization

## Initial Setup

### 1. Create Workspace

When you first log in to Bytebase:

1. **Set Workspace Name**: Choose a name for your organization (e.g., "Self-Hosted Infrastructure")
2. **Set Admin Email**: Your email address for admin account
3. **Set Admin Password**: Choose a secure password
4. **Complete Setup**: Click "Create Workspace"

### 2. Configure Environment

Bytebase uses environments to separate different deployment stages:

1. Navigate to **Settings** → **Environments**
2. Default environments (Dev, Test, Prod) are already created
3. Customize if needed or create additional environments

## Connecting PostgreSQL

### Prerequisites

Ensure PostgreSQL database and user for Bytebase exist:

```bash
# Connect to PostgreSQL
kubectl exec -it -n db postgres-postgresql-0 -- psql -U postgres

# Create database (if not exists)
CREATE DATABASE <your_database_name>;

# Create user with password
CREATE USER <your_username> WITH PASSWORD '<secure_password>';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE <your_database_name> TO <your_username>;

# For schema management, also grant:
GRANT ALL PRIVILEGES ON SCHEMA public TO <your_username>;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO <your_username>;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO <your_username>;

# Exit
\q
```

### Add PostgreSQL Instance to Bytebase

1. **Navigate to Databases** → Click "**Add Instance**"

2. **Fill in Connection Details**:
   ```
   Instance Name: PostgreSQL Production
   Environment: Production (or appropriate environment)
   Database Type: PostgreSQL
   ```

3. **Connection Information**:
   ```
   Host: postgres-0.postgres-headless.db.svc.cluster.local
   Port: 5432
   Username: <your_username>
   Password: <your_password>
   Database: postgres (for connection)
   SSL: Prefer (or Disable if not configured)
   ```

4. **Advanced Settings** (Optional):
   - **Use PgBouncer** (for connection pooling):
     ```
     Host: pgbouncer.db.svc.cluster.local
     Port: 6432
     ```

5. **Test Connection**: Click "Test Connection" to verify connectivity

6. **Save**: Click "Create" to save the instance

### Add Databases from Instance

After adding the instance:

1. Navigate to the instance you just created
2. Click "**Sync Schema**" to discover all databases
3. Select databases you want to manage
4. Assign them to appropriate projects

## Connecting MongoDB

### Prerequisites

MongoDB authentication is currently disabled in your configuration. If you enable it:

```bash
# Connect to MongoDB
kubectl exec -it -n db mongodb-0 -- mongosh

# Switch to admin database
use admin

# Create admin user
db.createUser({
  user: "admin",
  pwd: "<secure_password>",
  roles: ["root"]
})

# Create application user
use <your_database_name>
db.createUser({
  user: "<your_username>",
  pwd: "<secure_password>",
  roles: [
    { role: "readWrite", db: "<your_database_name>" },
    { role: "dbAdmin", db: "<your_database_name>" }
  ]
})

// Exit
exit
```

### Add MongoDB Instance to Bytebase

1. **Navigate to Databases** → Click "**Add Instance**"

2. **Fill in Connection Details**:
   ```
   Instance Name: MongoDB Production
   Environment: Production
   Database Type: MongoDB
   ```

3. **Connection Information**:

   **Without Authentication** (current configuration):
   ```
   Connection String: mongodb://mongodb.db.svc.cluster.local:27017/?replicaSet=rs0
   ```

   **With Authentication** (if enabled):
   ```
   Connection String: mongodb://<username>:<password>@mongodb.db.svc.cluster.local:27017/<database>?replicaSet=rs0&authSource=admin
   ```

   Or fill in separately:
   ```
   Host: mongodb.db.svc.cluster.local
   Port: 27017
   Username: <your_username>
   Password: <your_password>
   Database: admin (or your database)
   Replica Set: rs0
   ```

4. **Test Connection**: Click "Test Connection" to verify

5. **Save**: Click "Create"

## Database Management

### Creating Projects

Projects in Bytebase group related databases together:

1. Navigate to **Projects** → Click "**New Project**"
2. Fill in project details:
   - **Project Name**: e.g., "E-commerce Application"
   - **Key**: e.g., "ECOMM"
   - **Description**: Brief description
3. Click "**Create**"

### Assigning Databases to Projects

1. Navigate to the database you want to assign
2. Click "**Transfer**"
3. Select the target project
4. Confirm transfer

### Schema Migration

Bytebase supports multiple migration workflows:

#### 1. UI-Based Migration

1. Navigate to your project
2. Click "**Alter Schema**"
3. Select target database(s)
4. Write your SQL migration:
   ```sql
   -- Example: Create a new table
   CREATE TABLE users (
     id SERIAL PRIMARY KEY,
     username VARCHAR(255) NOT NULL UNIQUE,
     email VARCHAR(255) NOT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   
   -- Add index
   CREATE INDEX idx_users_email ON users(email);
   ```
5. Click "**Preview**" to check the changes
6. Click "**Create**" to submit the migration

#### 2. GitOps Integration

Configure GitOps for automated migrations from version control:

1. Navigate to **Settings** → **Version Control**
2. Connect your Git repository
3. Configure webhook for automatic migrations
4. Commit SQL files to trigger deployments

#### 3. API-Based Migration

Use Bytebase API for programmatic migrations (see Bytebase API documentation).

### Schema Sync

Keep Bytebase schema in sync with actual database:

1. Navigate to database
2. Click "**Sync Schema**"
3. Bytebase will update its schema metadata

### SQL Review

Bytebase can enforce SQL review rules:

1. Navigate to **Settings** → **SQL Review**
2. Enable review rules:
   - Naming conventions
   - No DROP TABLE in production
   - Require WHERE clause for DELETE
   - Index recommendations
3. Apply rules to environments

### Rollback

If a migration causes issues:

1. Navigate to the migration issue
2. Click "**Rollback**"
3. Bytebase will generate reverse SQL (if possible)
4. Review and execute rollback

## Best Practices

### 1. Environment Separation

- Use **Dev** environment for development databases
- Use **Test** environment for staging databases
- Use **Prod** environment for production databases

### 2. Database Naming

Follow consistent naming conventions:
```
<environment>_<application>_<purpose>
Examples:
- prod_ecommerce_main
- test_analytics_warehouse
- dev_api_users
```

### 3. User Permissions

Create dedicated database users for each application:
- Don't use superuser accounts for applications
- Grant minimum required privileges
- Use separate users for Bytebase vs. application access

### 4. Migration Reviews

- Always preview migrations before execution
- Use staging environment to test migrations first
- Have migrations reviewed by team members
- Keep migrations small and incremental

### 5. Backup Before Migrations

Before running migrations in production:
```bash
# Manual PostgreSQL backup
kubectl exec -n db postgres-postgresql-0 -- \
  pg_dump -U postgres -d <database_name> > backup_$(date +%Y%m%d_%H%M%S).sql
```

Automated backups are configured in PostgreSQL (daily at 2 AM).

### 6. Documentation

Document every schema change:
- Add clear descriptions to migration issues
- Include rationale for changes
- Link to related tickets/issues

### 7. Monitoring

Monitor database changes through:
- Bytebase activity log
- Database audit logs
- Prometheus metrics for schema changes

## Troubleshooting

### Cannot Connect to Database

**Problem**: "Connection failed" error

**Solutions**:

1. **Verify database is running**:
   ```bash
   kubectl get pods -n db
   kubectl logs -n db <database-pod>
   ```

2. **Check network connectivity**:
   ```bash
   # Test from Bytebase pod
   kubectl exec -n infrastructure deployment/bytebase -- \
     nc -zv postgres-0.postgres-headless.db.svc.cluster.local 5432
   ```

3. **Verify credentials**:
   ```bash
   # Test PostgreSQL connection
   kubectl exec -n db postgres-postgresql-0 -- \
     psql -U <username> -d <database> -c "SELECT 1"
   ```

4. **Check NetworkPolicies** (if configured):
   ```bash
   kubectl get networkpolicies -n db
   kubectl get networkpolicies -n infrastructure
   ```

### Bytebase Pod Not Starting

**Problem**: Bytebase pod in CrashLoopBackOff

**Solutions**:

1. **Check logs**:
   ```bash
   kubectl logs -n infrastructure deployment/bytebase --previous
   ```

2. **Verify PostgreSQL backend**:
   Bytebase stores its metadata in PostgreSQL. Ensure the `bytebase` database exists:
   ```bash
   kubectl exec -n db postgres-postgresql-0 -- \
     psql -U postgres -c "\l" | grep bytebase
   ```

3. **Check secrets**:
   ```bash
   kubectl get secret -n infrastructure bytebase-secrets -o yaml
   ```

### Migration Fails

**Problem**: Migration fails with error

**Solutions**:

1. **Check SQL syntax**: Verify SQL is valid for your database
2. **Check permissions**: Ensure user has sufficient privileges
3. **Check constraints**: Verify no FK/unique constraint violations
4. **Review logs**: Check database logs for detailed error

### Schema Sync Not Working

**Problem**: Schema not updating in Bytebase

**Solutions**:

1. **Manual sync**:
   - Navigate to database
   - Click "Sync Schema"

2. **Check permissions**:
   User needs SELECT privileges on information_schema:
   ```sql
   GRANT SELECT ON information_schema TO <username>;
   ```

### Performance Issues

**Problem**: Bytebase UI is slow

**Solutions**:

1. **Check resource limits**:
   ```bash
   kubectl describe pod -n infrastructure <bytebase-pod>
   ```

2. **Increase resources** in values.yaml:
   ```yaml
   resources:
     limits:
       cpu: 2000m      # Increase from 1000m
       memory: 4Gi     # Increase from 2Gi
   ```

3. **Check database backend**:
   Ensure Bytebase's PostgreSQL backend is performing well

## Integration with Other Services

### Authentik SSO

Configure Bytebase to use Authentik for authentication:

1. In Authentik, create OAuth2/OIDC provider for Bytebase
2. In Bytebase:
   - Navigate to **Settings** → **SSO**
   - Configure OIDC with Authentik endpoints
   - Set redirect URI: `https://bytebase.{{ infra.host }}/oauth/callback`

### Consul Service Discovery

Bytebase is already registered with Consul (configured in values.yaml):
```yaml
consul:
  enabled: true
  tags:
    - bytebase
    - database
```

Check registration:
```bash
kubectl exec -n service consul-0 -- consul catalog services
```

### Monitoring Integration

Bytebase exposes Prometheus metrics (configured in deployment):
```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "8080"
  prometheus.io/path: "/metrics"
```

View metrics in Grafana dashboard (see [MONITORING_SETUP.md](./MONITORING_SETUP.md)).

## Advanced Configuration

### Custom SQL Review Rules

Create custom rules for your organization:

1. Navigate to **Settings** → **SQL Review**
2. Click "**Create Template**"
3. Configure rules (examples):
   ```
   - Table must have primary key
   - Column names must be snake_case
   - No SELECT * in production
   - Require EXPLAIN for queries >100 rows
   ```

### Webhook Notifications

Configure webhooks for migration events:

1. Navigate to **Settings** → **Webhooks**
2. Add webhook URL (e.g., Slack, Discord, custom endpoint)
3. Select events to notify:
   - Migration succeeded
   - Migration failed
   - Schema changed

### Backup Integration

Configure Bytebase to track backups:

1. Navigate to **Settings** → **Backup**
2. Configure backup storage (S3/MinIO):
   ```
   Endpoint: http://minio.db.svc.cluster.local:9000
   Bucket: bytebase-backups
   Access Key: <minio-access-key>
   Secret Key: <minio-secret-key>
   ```

## Database-Specific Notes

### PostgreSQL

**Supported Features**:
- ✅ Schema migrations
- ✅ Rollback support
- ✅ Query review
- ✅ Schema synchronization
- ✅ Backup integration

**Connection via PgBouncer**:
For better connection pooling, use PgBouncer:
```
Host: pgbouncer.db.svc.cluster.local
Port: 6432
```

**PgAdmin Integration**:
Use PgAdmin alongside Bytebase for administrative tasks:
```
URL: pgadmin.{{ infra.host }}.localhost
```

### MongoDB

**Supported Features**:
- ✅ Schema migrations (collections, indexes)
- ✅ Schema synchronization
- ⚠️ Limited rollback support (manual)
- ⚠️ Query review (basic)

**ReplicaSet Considerations**:
- Always include `?replicaSet=rs0` in connection string
- Write operations go to primary automatically
- Read preference can be configured

**Schema Changes**:
MongoDB is schemaless, but Bytebase can manage:
- Collection creation/deletion
- Index management
- Validation rules
- Aggregation pipelines as "views"

## Security Considerations

### Network Security

Databases are in `db` namespace, Bytebase in `infrastructure`:
- Consider implementing NetworkPolicies to restrict access
- Use TLS/SSL for connections in production
- Rotate credentials regularly

### Access Control

Configure role-based access in Bytebase:
1. **Developer**: Can create/edit migrations
2. **Reviewer**: Can approve migrations
3. **DBA**: Can rollback, manage instances
4. **Owner**: Full access

### Audit Trail

Bytebase maintains complete audit trail:
- All schema changes are logged
- User actions are tracked
- Query history is available

Review audit logs:
1. Navigate to **Settings** → **Audit Log**
2. Filter by user, action, date range
3. Export logs for compliance

## Next Steps

1. ✅ Connect PostgreSQL and MongoDB instances
2. ✅ Create projects for your applications
3. ✅ Set up SQL review rules
4. ✅ Configure GitOps integration (optional)
5. ✅ Set up webhook notifications
6. ✅ Train team on migration workflows
7. ✅ Document your schema change process

## Additional Resources

- [Bytebase Documentation](https://www.bytebase.com/docs/)
- [PostgreSQL Best Practices](https://www.postgresql.org/docs/current/index.html)
- [MongoDB Schema Design](https://www.mongodb.com/docs/manual/data-modeling/)
- [Database Status Report](./DATABASE_STATUS_REPORT.md)
- [Monitoring Setup Guide](./MONITORING_SETUP.md)

## Support

For issues or questions:
1. Check Bytebase logs: `kubectl logs -n infrastructure deployment/bytebase`
2. Check database logs: `kubectl logs -n db <database-pod>`
3. Review [Troubleshooting](#troubleshooting) section
4. Consult [Bytebase Community](https://github.com/bytebase/bytebase/discussions)
