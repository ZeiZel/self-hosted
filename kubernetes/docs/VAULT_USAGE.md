# Использование Vault для секретов

## Обзор

Все сервисы настроены для работы с Vault через Vault Agent Injector. Секреты могут храниться либо в Kubernetes Secrets (по умолчанию), либо в Vault (при включении).

**Важно:** Секреты самого Vault (root token, unseal keys) остаются в `kubernetes/envs/k8s/secrets/_all.yaml` и не хранятся в Vault. Все остальные секреты должны быть в Vault.

## Порядок развертывания

Helmfile автоматически развертывает сервисы в правильном порядке:

1. **Namespaces** - создание всех необходимых namespace
2. **Traefik + Consul** - базовые сервисы для маршрутизации и service discovery
3. **Vault** - система управления секретами (использует секреты из `_all.yaml`)
4. **Все остальные сервисы** - зависят от Vault и получают секреты из него

Порядок контролируется через зависимости `needs` в `kubernetes/apps/_others.yaml`.

## Как это работает

1. **Vault Agent Injector** - автоматически инжектирует sidecar контейнер в поды с аннотациями Vault
2. **Sidecar контейнер** - получает секреты из Vault и создает файл `/vault/secrets/secrets` в формате `KEY=VALUE`
3. **Приложение** - может читать секреты из файла или использовать их как environment variables

## Включение Vault для сервиса

### Шаг 1: Развертывание инфраструктуры

Разверните базовую инфраструктуру (namespaces, traefik, consul, vault):
```bash
helmfile -e k8s apply
```

Helmfile автоматически развернет сервисы в правильном порядке благодаря зависимостям.

### Шаг 2: Настройка Vault

После развертывания Vault выполните скрипт настройки:
```bash
cd kubernetes/scripts
chmod +x vault-setup.sh
./vault-setup.sh
```

Этот скрипт автоматически:
- Включает Kubernetes auth method
- Создает policies для всех сервисов
- Создает роли Kubernetes Auth для всех сервисов

### Шаг 3: Синхронизация секретов

Синхронизируйте секреты из `_all.yaml` в Vault:
```bash
# Синхронизация всех сервисов
./vault-sync-secrets.sh

# Или синхронизация конкретного сервиса
./vault-sync-secrets.sh authentik
./vault-sync-secrets.sh vaultwarden
```

**Примечание:** Скрипт `vault-sync-secrets.sh` читает зашифрованные секреты из `_all.yaml` (через SOPS) и загружает их в Vault. Секреты самого Vault остаются только в `_all.yaml`.

### Шаг 4: Включение Vault в сервисе

В `values.yaml` сервиса установите:
```yaml
vault:
  enabled: true
```

### Шаг 5: Применение изменений

```bash
helmfile -e k8s apply
```

## Формат секретов в Vault

Секреты хранятся в Vault по пути:
```
secret/data/<service-name>/secrets
```

Формат данных в Vault (KV v2):
```json
{
  "data": {
    "KEY1": "value1",
    "KEY2": "value2",
    ...
  }
}
```

## Использование секретов в приложениях

### Вариант 1: Чтение из файла

Vault Agent создает файл `/vault/secrets/secrets` в формате:
```
KEY1=value1
KEY2=value2
...
```

Приложение может читать этот файл при старте.

### Вариант 2: Environment variables (рекомендуется)

Для автоматической загрузки секретов как environment variables, используйте initContainer или обновите приложение для чтения файла.

Пример initContainer:
```yaml
initContainers:
  - name: load-vault-secrets
    image: busybox
    command:
      - sh
      - -c
      - |
        if [ -f /vault/secrets/secrets ]; then
          export $(cat /vault/secrets/secrets | xargs)
        fi
```

### Вариант 3: Прямая инжекция переменных

Vault Agent может инжектировать секреты напрямую как environment variables через аннотации:
```yaml
annotations:
  vault.hashicorp.com/agent-inject-secret-database: "secret/data/service/database"
  vault.hashicorp.com/agent-inject-template-database: |
    {{- with secret "secret/data/service/database" -}}
    export DATABASE_URL="{{ .Data.data.connection_string }}"
    {{- end }}
```

## Список сервисов с поддержкой Vault

Все следующие сервисы имеют поддержку Vault:

- ✅ authentik
- ✅ vaultwarden
- ✅ stoat (revolt)
- ✅ nextcloud
- ✅ stalwart
- ✅ notesnook
- ✅ gitlab
- ✅ teamcity
- ✅ youtrack
- ✅ excalidraw
- ✅ bytebase
- ✅ dashy
- ✅ syncthing
- ✅ hub
- ✅ glance

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

3. Проверьте секреты в поде:
```bash
kubectl exec <pod-name> -n <namespace> -c <main-container> -- cat /vault/secrets/secrets
```

## Откат к Kubernetes Secrets

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

Kubernetes Secrets остаются на месте и будут использоваться снова.

## Дополнительная информация

См. полную документацию: [VAULT_MIGRATION.md](VAULT_MIGRATION.md)

