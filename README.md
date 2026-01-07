# Home center

## Services

- 🌐 Traefik — reverse proxy + HTTPS
- Pangolin - connect through VPN between machines
- ~~Dashy~~ **Glance** — center dashboard with high customizable
- 🧠 Jetbrains - YouTrack, Hub, Teamcity
- 📊 Grafana + Prometheus — monitoring
- 📦 ELK (Elasticsearch, Logstash, Kibana) — logging
- 🧭 Consul (+ Fabio, Register and Prometheus exporter) — discovery
- 🔑 Vault — secret vault
- 🤫 Vaultwarden - collect passwords
- 💬 Stoat (prev Revolt) — community
- 🛠 GitLab — CI/CD + Git-repo
- 📝 Notesnook (notesnook-sync-server) — notes
- 🔐 Authentik — SSO authn
- ☁️ Syncthing (or Nextcloud if find sync-server) - synchronise data in cloud

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



```bash
helmfile -e k8s list
```

## How to work with it

1. All helm repos is placed in `.helmfile/repositories.yaml`
2. List of releases auto generate by `.helmfile/releases.yml.gotmpl`
3.

### Add repo

### Add values

#### Releases

Тут находятся общие для всех окружений параметры определённого релиза чарта

#### Values:

Тут находятся параметры для релизов чартов по окружениям.
Они перетирают то, что находится в `releases`.

#### Secrets:

Тут в зашифрованном виде задаются параметры helm чарта, которые оверрайдят:
- и общие параметры
- и параметры окружения из values

#### Chart values

Их мы задаём в самом чарте и особого смысла выносить их в окружение нет

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

## Quick Start (Manual Setup)

Быстрый запуск проекта без использования `install.sh`. Предполагается, что у вас настроен SSH config с хостами `server` и `vps`.

### 1. Настройка Terraform

Создайте `terraform/terraform.tfvars`:

```bash
cat > terraform/terraform.tfvars << 'EOF'
local_servers = [
  {
    name       = "server"
    hostname   = "server.local"
    ip_address = "192.168.31.100"
    role       = "master"
    ssh_user   = "zeizel"
    ssh_key    = "~/.ssh/id_rsa"
  }
]

local_clients = []
EOF
```

### 2. Запуск Terraform

```bash
cd terraform
terraform init
terraform plan
terraform apply -auto-approve
cd ..
```

### 3. Настройка Ansible Inventory для VPS

Обновите `ansible/pangolin/inventory/hosts.yml`, добавив VPS в секцию `vps`:

```yaml
vps:
  hosts:
    pangolin_vps:
      ansible_host: 80.90.178.207
      ansible_user: root
      ansible_port: 22
      pangolin_role: server
      pangolin_domain: "yourdomain.com"  # Замените на ваш домен
      pangolin_admin_email: "admin@yourdomain.com"  # Замените на ваш email
```

### 4. Настройка GPG/SOPS (если еще не настроено)

```bash
# Создать GPG ключ (если еще нет)
gpg --full-generate-key

# Получить ID ключа
GPG_KEY_ID=$(gpg --list-secret-keys --keyid-format LONG | grep -E "^sec" | head -1 | grep -oE "[A-F0-9]{40}")

# Настроить .sops.yaml
cat > kubernetes/.sops.yaml << EOF
---
creation_rules:
  - pgp: ${GPG_KEY_ID}
EOF

# Настроить GPG_TTY
export GPG_TTY=$(tty)
```

### 5. Развёртка через Ansible

```bash
cd ansible/pangolin

# Базовая настройка локального сервера
ansible-playbook -i inventory/hosts.yml playbooks/deploy_local.yml

# Развёртка Kubernetes кластера (если есть k8s серверы)
ansible-playbook -i inventory/hosts.yml playbooks/deploy_local_k8s.yml

# Развёртка VPS (Pangolin server)
ansible-playbook -i inventory/hosts.yml playbooks/deploy_vps.yml

cd ../..
```

### 6. Развёртка Kubernetes сервисов

```bash
cd kubernetes

# Инициализация helmfile
helmfile init --force

# Установка Gateway API
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml

# Настройка Vault (опционально)
./scripts/vault-setup.sh

# Развёртка всех сервисов
helmfile -e k8s apply

cd ..
```

### Полный блок команд (копировать и выполнить)

```bash
# 1. Terraform конфигурация
cat > terraform/terraform.tfvars << 'EOF'
local_servers = [
  {
    name       = "server"
    hostname   = "server.local"
    ip_address = "192.168.31.100"
    role       = "master"
    ssh_user   = "zeizel"
    ssh_key    = "~/.ssh/id_rsa"
  }
]
local_clients = []
EOF

# 2. Terraform
cd terraform && terraform init && terraform apply -auto-approve && cd ..

# 3. Ansible - базовая настройка
cd ansible/pangolin && ansible-playbook -i inventory/hosts.yml playbooks/deploy_local.yml && cd ../..

# 4. Ansible - Kubernetes (если нужно)
cd ansible/pangolin && ansible-playbook -i inventory/hosts.yml playbooks/deploy_local_k8s.yml && cd ../..

# 5. Ansible - VPS (если нужно)
cd ansible/pangolin && ansible-playbook -i inventory/hosts.yml playbooks/deploy_vps.yml && cd ../..

# 6. Kubernetes - инициализация
cd kubernetes && helmfile init --force && cd ..

# 7. Kubernetes - Gateway API
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml

# 8. Kubernetes - развёртка сервисов
cd kubernetes && helmfile -e k8s apply && cd ..
```

**Примечание:** Перед выполнением убедитесь, что:
- Настроен SSH config с хостами `server` и `vps`
- Настроен GPG ключ для SOPS (см. раздел "Create keys" выше)
- Обновлен `ansible/pangolin/inventory/hosts.yml` с правильными данными VPS

## Original idea

- [zam-zam - base](https://github.com/zam-zam/helmfile-examples)
- [zam-zam - external](https://github.com/zam-zam/zzamzam-k8s/blob/master/envs/k8s/env.yaml)
