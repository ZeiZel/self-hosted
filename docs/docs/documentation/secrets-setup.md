---
sidebar_position: 4
---

# Configuration Secrets

All secrets in the project are managed through SOPS (Secrets Operations) using GPG for encryption. This ensures secure storage of passwords, tokens, and other sensitive data in the repository.

## GPG Key Configuration for SOPS

If you have not yet configured your GPG keys, follow the instructions in the [Local Device Preparation](./preparation.md#gpg-key-configuration-for-sops) section.

### Verifying existing keys

Check the list of your GPG keys:

```bash
gpg --list-secret-keys --keyid-format LONG
```

You should see your key. Find a line like:

```
sec   rsa4096/1E89965BF6B3B6D4AA02D096FEB9EA0B2906786F 2024-01-01
```

Where `1E89965BF6B3B6D4AA02D096FEB9EA0B2906786F` is your key ID.

### Configuration .sops.yaml

Make sure that the `.sops.yaml` file in the project root contains your GPG key ID:

```yaml
---
creation_rules:
  - pgp: YOUR_GPG_KEY_ID
```

Replace `YOUR_GPG_KEY_ID` with your key ID.

## Editing Secrets

Secrets are stored in the file `kubernetes/envs/k8s/secrets/_all.yaml`, which is encrypted with SOPS.

### Opening the file for editing

To edit secrets, use `helm secrets edit`:

```bash
cd kubernetes
helm secrets edit envs/k8s/secrets/_all.yaml
```

This command:
1. Decrypts the file using your GPG key
2. Opens it in the editor (determined by the `$EDITOR` variable)
3. Automatically re-encrypts the file after saving

### Alternative method (sops)

You can use sops directly:

```bash
cd kubernetes
sops envs/k8s/secrets/_all.yaml
```

Make sure that the `GPG_TTY` variable is set:

```bash
export GPG_TTY=$(tty)
```

### Secrets file structure

The `_all.yaml` file has the following structure:

```yaml
secrets:
  # Authentik secrets
  authentikSecret: ENC[...]
  authentikBootstrapPassword: ENC[...]
  authentikBootstrapToken: ENC[...]
  authentikLdapPassword: ENC[...]
  authentikSamlCert: ENC[...]

  # SMTP secrets
  smtpUsername: ENC[...]
  smtpPassword: ENC[...]

  # GitLab secrets
  gitlabToken: ENC[...]
  gitlabRunnerToken: ENC[...]

  # Databases
  postgresPassword: ENC[...]
  pgadminPassword: ENC[...]
  mongoPassword: ENC[...]

  # Service secrets
  vaultwardenEmail: ENC[...]
  vaultwardenPassword: ENC[...]
  grafanaPassword: ENC[...]
  notesnookSecret: ENC[...]
  stalwartLdapPassword: ENC[...]
  youtrackGitlabToken: ENC[...]
  nextcloudAdminPassword: ENC[...]
  penpotApiSecretKey: ENC[...]

  # MinIO
  minioAccessKey: ENC[...]
  minioSecretKey: ENC[...]

  # Domains
  domain: ENC[...]
  ingressDomain: ENC[...]
```

### Adding a new secret

1. Open the file for editing:

```bash
helm secrets edit envs/k8s/secrets/_all.yaml
```

2. Add the new secret to the `secrets` section:

```yaml
secrets:
  myNewSecret: "my-secret-value"
```

3. Save the file - SOPS will automatically encrypt the value.

### Editing an existing secret

1. Open the file for editing:

```bash
helm secrets edit envs/k8s/secrets/_all.yaml
```

2. Find the desired secret and change its value (already decrypted):

```yaml
secrets:
  vaultwardenPassword: "new-password-here"
```

3. Save the file - SOPS will automatically encrypt the new value.

## Secrets structure for each service

Below are the main secrets required for each service:

### Authentik

- `authentikSecret` - secret key for signing tokens
- `authentikBootstrapPassword` - bootstrap password
- `authentikBootstrapToken` - bootstrap token
- `authentikLdapPassword` - password for the LDAP connection
- `authentikSamlCert` - certificate for SAML

### Databases

- `postgresPassword` - PostgreSQL superuser password
- `pgadminPassword` - password for pgAdmin
- `mongoPassword` - password for MongoDB

### GitLab

- `gitlabToken` - GitLab API token
- `gitlabRunnerToken` - token for GitLab Runner

### Vaultwarden

- `vaultwardenEmail` - administrator email
- `vaultwardenPassword` - administrator password

### Monitoring

- `grafanaPassword` - Grafana administrator password

### Notesnook

- `notesnookSecret` - secret key for Notesnook

### Stalwart

- `stalwartLdapPassword` - password for the LDAP connection

### YouTrack

- `youtrackGitlabToken` - token for GitLab integration

### Nextcloud

- `nextcloudAdminPassword` - administrator password

### Penpot

- `penpotApiSecretKey` - API secret key

### MinIO

- `minioAccessKey` - access key
- `minioSecretKey` - secret key

### SMTP

- `smtpUsername` - SMTP username
- `smtpPassword` - SMTP password

### Domains

- `domain` - primary domain
- `ingressDomain` - ingress domain

## Synchronizing Secrets with Vault

After deploying Vault (see [Base Infrastructure Deployment](./infrastructure-deployment.md)), secrets can be synchronized with Vault for centralized management.

### Using the synchronization script

The `vault-sync-secrets.sh` script synchronizes secrets from `_all.yaml` into Vault:

```bash
cd kubernetes/scripts
chmod +x vault-sync-secrets.sh
./vault-sync-secrets.sh
```

To synchronize a specific service:

```bash
./vault-sync-secrets.sh vaultwarden
./vault-sync-secrets.sh authentik
```

### What the script does

1. Decrypts secrets from `_all.yaml` using SOPS
2. Loads secrets into Vault at the path `secret/<service>/secrets`
3. Secrets become available to services through the Vault Agent Injector

### Verifying synchronization

After synchronization, check the secrets in Vault:

```bash
kubectl exec -n service deployment/vault -- vault kv get secret/vaultwarden/secrets
```

## Security

### Storing GPG keys

- Store your private GPG key in a secure location
- Do not commit the private key to the repository
- Use a key with a passphrase
- Regularly make backups of your keys

### Secrets rotation

It is recommended to change secrets regularly:

1. Open the file for editing
2. Change the secret values
3. Save the file
4. Synchronize with Vault (if used)
5. Restart the services to apply the changes

### Multiple keys

For team work, you can use multiple GPG keys:

```yaml
---
creation_rules:
  - pgp: >-
      KEY1_ID,
      KEY2_ID,
      KEY3_ID
```

All specified keys will be able to decrypt and encrypt files.

## Troubleshooting

### Issue: Cannot decrypt the file

Check that your GPG key is available:

```bash
gpg --list-secret-keys
```

Check that the key is specified in `.sops.yaml`:

```bash
cat .sops.yaml
```

### Issue: GPG_TTY is not set

Set the environment variable:

```bash
export GPG_TTY=$(tty)
echo 'export GPG_TTY=$(tty)' >> ~/.bashrc  # or ~/.zshrc
```

### Issue: SOPS cannot find the key

Check the file metadata:

```bash
sops envs/k8s/secrets/_all.yaml --metadata
```

Make sure that your key is specified in the metadata.

## Next Steps

After configuring secrets:

1. [Base Infrastructure Deployment](./infrastructure-deployment.md) - deploy the base services (Traefik, Consul, Vault)
</content>
</invoke>
