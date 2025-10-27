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

sops -p <generated_public_key> k8s/envs/k8s/secrets/_all.yaml

<set_private_vars>

PG_TTY=$(tty)
export GPG_TTY

helm secrets edit k8s/envs/k8s/secrets/_all.yaml
```

Put ur `<generated_public_key>` into `.sops.yaml` for easy decrypt and encrypt secrets

`.sops.yaml`
```YAML
---
creation_rules:
  - pgp: <generated_public_key>
```

### Start project

```bash
helmfile -e k8s apply
```

Sync any changes in charts

```bash
helm sync
```

## How to work with it

1. All helm repos is placed in `.helmfile/repositories.yaml`
2. List of releases auto generate by `.helmfile/releases.yml.gotmpl`
3.

### Add repo

### Add new env

Create new env by sample

```
envs
└── k8s
    ├── secrets
    │   ├── _all.yaml
    │   └── README.md
    └── values
        ├── _all.yaml.gotmpl
        └── README.md
    └── env.yaml
```

Add env into `.helmfile`

`.helmfile/environments.yaml`
```YML
environments:
  k8s:
    <<: *default
```

### Run env in namespace

Run environment `k8s` in `k8s-env-namespace` namespace

```bash
helmfile -e k8s -n k8s-env-namespace apply
```

## Troubleshooting

If docker image can't access to file, you should change ownership for folder

```bash
sudo chown -R $(id -un):$(id -gn) ~/data
```

## Original idea

- [zam-zam - base](https://github.com/zam-zam/helmfile-examples)
- [zam-zam - external](https://github.com/zam-zam/zzamzam-k8s/blob/master/envs/k8s/env.yaml)
