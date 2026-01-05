# Миграция секретов в Vault

Этот документ описывает процесс миграции всех секретов из Kubernetes Secrets в Vault для централизованного управления секретами.

## Преимущества использования Vault

1. **Централизованное управление** - все секреты в одном месте
2. **Динамические секреты** - возможность ротации паролей
3. **Аудит** - полная история доступа к секретам
4. **Шифрование** - секреты хранятся в зашифрованном виде
5. **Политики доступа** - гранулярный контроль доступа

## Архитектура

```
┌─────────────┐
│   Service   │
│  (Pod)      │
└──────┬──────┘
       │
       │ Vault Agent Injector
       │ (sidecar container)
       ▼
┌─────────────┐
│    Vault    │
│   Server    │
└─────────────┘
```

Vault Agent Injector автоматически инжектирует sidecar контейнер в поды с аннотациями Vault, который получает секреты и делает их доступными для основного контейнера.

## Порядок развертывания

Helmfile автоматически развертывает сервисы в правильном порядке благодаря зависимостям в `kubernetes/apps/_others.yaml`:

1. **Namespaces** - создание всех необходимых namespace
2. **Traefik + Consul** - базовые сервисы для маршрутизации и service discovery
3. **Vault** - система управления секретами (использует секреты из `_all.yaml`)
4. **Все остальные сервисы** - зависят от Vault и получают секреты из него

**Важно:** Секреты самого Vault (root token, unseal keys) остаются в `kubernetes/envs/k8s/secrets/_all.yaml` и не хранятся в Vault. Все остальные секреты должны быть в Vault.

## Процесс миграции

### Шаг 1: Развертывание инфраструктуры

Разверните базовую инфраструктуру:
```bash
helmfile -e k8s apply
```

Helmfile автоматически развернет сервисы в правильном порядке.

### Шаг 2: Инициализация и настройка Vault

1. Убедитесь, что Vault запущен и доступен:
```bash
kubectl get pods -n service -l app=vault
```

2. Инициализируйте Vault (если еще не инициализирован):
```bash
kubectl exec -n service deployment/vault -- vault operator init
```

3. Распечатайте Vault (unseal):
```bash
# Используйте ключи из инициализации
kubectl exec -n service deployment/vault -- vault operator unseal <unseal-key>
```

4. Запустите скрипт настройки:
```bash
cd kubernetes/scripts
chmod +x vault-setup.sh
./vault-setup.sh
```

Этот скрипт автоматически:
- Включает Kubernetes auth method
- Создает policies для всех сервисов из `_others.yaml`
- Создает роли Kubernetes Auth для всех сервисов

### Шаг 3: Синхронизация секретов

Для синхронизации секретов из `_all.yaml` в Vault используйте новый скрипт `vault-sync-secrets.sh`:

```bash
# Синхронизация всех сервисов
./vault-sync-secrets.sh

# Или синхронизация конкретного сервиса
./vault-sync-secrets.sh authentik
./vault-sync-secrets.sh vaultwarden
```

**Примечание:** Скрипт `vault-sync-secrets.sh` читает зашифрованные секреты из `_all.yaml` (через SOPS) и загружает их в Vault. Это предпочтительный способ миграции секретов.

Альтернативно, для миграции из существующих Kubernetes Secrets можно использовать `vault-migrate-secrets.sh`:

```bash
# Миграция секретов конкретного сервиса из Kubernetes Secrets
./vault-migrate-secrets.sh authentik
```

### Шаг 4: Включение Vault в сервисах

Для каждого сервиса:

1. Включите Vault в `values.yaml`:
```yaml
vault:
  enabled: true
```

2. Deployment файлы уже содержат аннотации Vault (добавлены автоматически)

3. Примените изменения:
```bash
helmfile -e k8s apply
```

## Структура секретов в Vault

Секреты хранятся по следующей структуре:
```
secret/data/<service-name>/secrets
```

Например:
- `secret/data/authentik/secrets` - все секреты Authentik
- `secret/data/vaultwarden/secrets` - все секреты Vaultwarden
- `secret/data/stoat/secrets` - все секреты Stoat

## Примеры секретов

### Authentik
```bash
vault kv put secret/authentik/secrets \
  AUTHENTIK_SECRET_KEY="your-secret-key" \
  AUTHENTIK_POSTGRESQL__PASSWORD="postgres-password" \
  AUTHENTIK_REDIS__PASSWORD="redis-password" \
  AUTHENTIK_EMAIL__PASSWORD="email-password"
```

### Vaultwarden
```bash
vault kv put secret/vaultwarden/secrets \
  DATABASE_URL="postgresql://user:pass@host:5432/db" \
  ADMIN_TOKEN="admin-token" \
  DOMAIN="https://vaultwarden.local" \
  MAIL_PASSWORD="mail-password"
```

### Stoat (Revolt)
```bash
vault kv put secret/stoat/secrets \
  MONGO_URL="mongodb://user:pass@host:27017/db" \
  REDIS_URL="redis://host:6379/0" \
  S3_ACCESS_KEY="minio-access-key" \
  S3_SECRET_KEY="minio-secret-key"
```

## Аннотации Vault в Deployment

Каждый deployment файл содержит аннотации для Vault Agent Injector:

```yaml
annotations:
  vault.hashicorp.com/agent-inject: "true"
  vault.hashicorp.com/role: "<service-name>"
  vault.hashicorp.com/agent-inject-secret-secrets: "secret/data/<service>/secrets"
  vault.hashicorp.com/agent-inject-template-secrets: |
    {{- with secret "secret/data/<service>/secrets" -}}
    {{- range $key, $value := .Data.data -}}
    {{ $key }}={{ $value }}
    {{- end -}}
    {{- end }}
```

Секреты инжектируются в файл `/vault/secrets/secrets` в формате `KEY=VALUE`, который может быть загружен через `envFrom` или прочитан приложением.

## Проверка работы

1. Проверьте, что Vault Agent Injector работает:
```bash
kubectl get pods -n <namespace> -l app=<service>
# Должен быть sidecar контейнер vault-agent
```

2. Проверьте логи Vault Agent:
```bash
kubectl logs <pod-name> -c vault-agent -n <namespace>
```

3. Проверьте, что секреты доступны в поде:
```bash
kubectl exec <pod-name> -n <namespace> -c <main-container> -- cat /vault/secrets/secrets
```

## Откат миграции

Если нужно вернуться к Kubernetes Secrets:

1. Отключите Vault в `values.yaml`:
```yaml
vault:
  enabled: false
```

2. Примените изменения:
```bash
helmfile -e k8s apply
```

3. Kubernetes Secrets остаются на месте и будут использоваться снова

## Безопасность

1. **Храните unseal keys в безопасном месте** - используйте внешний key management system
2. **Используйте TLS для Vault** - настройте TLS в production
3. **Ограничьте доступ к Vault** - используйте NetworkPolicy
4. **Регулярно ротируйте секреты** - настройте автоматическую ротацию
5. **Мониторьте доступ** - используйте audit logging

## Troubleshooting

### Vault Agent не инжектируется

1. Проверьте, что Vault Agent Injector запущен:
```bash
kubectl get pods -n service -l app=vault-agent-injector
```

2. Проверьте аннотации в deployment:
```bash
kubectl get deployment <service> -n <namespace> -o yaml | grep vault
```

3. Проверьте MutatingWebhookConfiguration:
```bash
kubectl get mutatingwebhookconfiguration vault-agent-injector-cfg
```

### Секреты не доступны в поде

1. Проверьте логи Vault Agent:
```bash
kubectl logs <pod-name> -c vault-agent -n <namespace>
```

2. Проверьте, что роль существует в Vault:
```bash
kubectl exec -n service deployment/vault -- vault read auth/kubernetes/role/<service-name>
```

3. Проверьте, что секрет существует в Vault:
```bash
kubectl exec -n service deployment/vault -- vault kv get secret/<service-name>/secrets
```

### Ошибки аутентификации

1. Проверьте ServiceAccount:
```bash
kubectl get sa <service-name> -n <namespace>
```

2. Проверьте привязку роли:
```bash
kubectl exec -n service deployment/vault -- vault read auth/kubernetes/role/<service-name>
```

3. Проверьте policy:
```bash
kubectl exec -n service deployment/vault -- vault policy read <service-name>
```

## Дополнительные ресурсы

- [Vault Kubernetes Auth](https://www.vaultproject.io/docs/auth/kubernetes)
- [Vault Agent Injector](https://www.vaultproject.io/docs/platform/k8s/injector)
- [Vault Policies](https://www.vaultproject.io/docs/concepts/policies)

