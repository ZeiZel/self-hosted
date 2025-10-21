# Home center

## Services

- 🌐 Caddy — reverse proxy + HTTPS
- 🎯 Dashy — center dashboard
- 🧠 Jetbrains Hub - YouTrack, Hub, Teamcity
- 📊 Grafana + Prometheus — monitoring
- 📦 ELK (Elasticsearch, Logstash, Kibana) — logging
- 🧭 Consul (+ Fabio, Register and Prometheus exporter) — discovery
- 🔑 Vault — secret vault
- 🤫 Vaultwarden - collect passwords
- 💬 Revolt — community (Maybe Matrix Element)
- 🛠 GitLab — CI/CD + Git-repo
- 📝 Notesnook (notesnook-sync-server) — notes
- 🔐 Authentik — SSO authn
- ☁️ Syncthing (or ownCloud if find sync-server) - synchronise data in cloud

## Stack

- k8s (kubernetes, helm, helmfile)
- ansible
- docker (as k8s driver, local docker compose)
- terraform
- vagrant
- Caddy

## How to start

WIP...

### Init helmfile

```bash
helmfile init --force
```

### Create keys

```bash
helm plugin install https://github.com/jkroepke/helm-secrets

brew install gpg sops

gpg --gen-key

sops -p <generated_public_key> secrets.yml

<set_private_vars>

PG_TTY=$(tty)
export GPG_TTY

helm secrets edit secrets.yml

mv secrets.yml ./k8s/envs/k8s/secrets/_all.yaml
```

Put ur `<generated_public_key>` into `.sops.yaml` for easy decrypt and encrypt secrets

`.sops.yaml`
```YAML
---
creation_rules:
  - pgp: "<generated_public_key>"
```

### Start project

```bash
helmfile -e k8s apply
```

Sync any changes in charts

```bash
helm sync
```

## Troubleshooting

If docker image can't access to file, you should change ownership for folder

```bash
sudo chown -R $(id -un):$(id -gn) ~/data
```
