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

## Troubleshooting

If docker image can't access to file, you should change ownership for folder

```bash
sudo chown -R $(id -un):$(id -gn) ~/data
```
