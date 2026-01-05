---
sidebar_position: 5
---

# Развёртка базовой инфраструктуры

На этом этапе мы развернём базовые инфраструктурные компоненты, которые необходимы для работы всех остальных сервисов: Traefik (ingress controller), Consul (service discovery), и Vault (управление секретами).

## Порядок развёртывания

Helmfile автоматически развернёт сервисы в правильном порядке благодаря зависимостям, определённым в `kubernetes/apps/_others.yaml`. Порядок следующий:

1. **Namespaces** - создание всех необходимых namespace
2. **Traefik** - ingress controller для маршрутизации трафика
3. **Consul** - service discovery и service mesh
4. **Vault** - система управления секретами

Все остальные сервисы зависят от этих базовых компонентов.

## Развёртка базовых сервисов

### Выполнение развёртки

Перейдите в директорию с Kubernetes конфигурацией:

```bash
cd kubernetes
```

Убедитесь, что Helmfile инициализирован (см. [Развёртка Kubernetes кластера](./kubernetes-deployment.md#инициализация-helmfile)):

```bash
helmfile init --force
```

Запустите развёртку базовой инфраструктуры:

```bash
helmfile -e k8s apply
```

Эта команда:
1. Прочитает все конфигурации из `releases/` и `envs/k8s/`
2. Применит зависимости между сервисами
3. Развернёт сервисы в правильном порядке
4. Создаст все необходимые ресурсы в Kubernetes

### Проверка статуса

Проверьте список всех релизов:

```bash
helmfile -e k8s list
```

Проверьте статус подов:

```bash
kubectl get pods --all-namespaces
```

Убедитесь, что все системные поды запущены:

```bash
kubectl get pods -n ingress
kubectl get pods -n service
```

## Traefik

Traefik - современный reverse proxy и load balancer, используемый как ingress controller.

### Проверка Traefik

Проверьте статус подов Traefik:

```bash
kubectl get pods -n ingress -l app.kubernetes.io/name=traefik
```

Проверьте сервисы:

```bash
kubectl get svc -n ingress
```

### Проверка ingress

После развёртки других сервисов, проверьте ingress:

```bash
kubectl get ingress --all-namespaces
```

## Consul

Consul обеспечивает service discovery, health checking и service mesh функциональность.

### Проверка Consul

Проверьте статус подов Consul:

```bash
kubectl get pods -n service -l app=consul
```

Проверьте UI Consul (если включен):

```bash
kubectl get ingress -n service -l app=consul
```

Доступ к Consul UI обычно по адресу `consul.local` (зависит от конфигурации).

## Vault

Vault - система управления секретами с централизованным хранением и политиками доступа.

### Инициализация Vault

После развёртки Vault необходимо его инициализировать.

#### 1. Проверка доступности

Убедитесь, что Vault запущен:

```bash
kubectl get pods -n service -l app=vault
```

Все поды должны быть в статусе `Running`.

#### 2. Инициализация Vault

Инициализируйте Vault (выполняется только один раз):

```bash
kubectl exec -n service deployment/vault -- vault operator init
```

Команда вернёт:
- **Unseal Keys** (5 ключей) - используйте любые 3 из 5 для распечатывания
- **Initial Root Token** - корневой токен для первоначальной настройки

**ВАЖНО:** Сохраните эти ключи в безопасном месте! Без них вы не сможете получить доступ к Vault.

Пример вывода:

```
Unseal Key 1: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Unseal Key 2: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Unseal Key 3: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Unseal Key 4: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Unseal Key 5: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

Initial Root Token: s.xxxxxxxxxxxxxxxxxxxxx
```

#### 3. Распечатывание Vault (Unseal)

Для работы Vault необходимо распечатать его, используя unseal ключи. Нужно использовать минимум 3 из 5 ключей.

Для каждого пода Vault выполните unseal:

```bash
# Получите список подов Vault
kubectl get pods -n service -l app=vault

# Для каждого пода выполните unseal (минимум 3 раза с разными ключами)
kubectl exec -n service vault-0 -- vault operator unseal <unseal-key-1>
kubectl exec -n service vault-0 -- vault operator unseal <unseal-key-2>
kubectl exec -n service vault-0 -- vault operator unseal <unseal-key-3>

# Повторите для других подов (vault-1, vault-2, если есть)
```

Проверьте статус:

```bash
kubectl exec -n service deployment/vault -- vault status
```

Статус должен показать `Sealed: false`.

#### 4. Настройка Vault для Kubernetes

Запустите скрипт настройки Vault:

```bash
cd kubernetes/scripts
chmod +x vault-setup.sh
./vault-setup.sh
```

Этот скрипт автоматически:
- Включает Kubernetes auth method
- Настраивает подключение к Kubernetes API
- Создаёт policies для всех сервисов
- Создаёт роли Kubernetes Auth для всех сервисов

#### 5. Вход в Vault

Войдите в Vault используя root token:

```bash
kubectl exec -n service deployment/vault -- vault login <initial-root-token>
```

Или через UI:

```bash
# Получите URL для доступа к Vault UI
kubectl get ingress -n service -l app=vault
```

Откройте URL в браузере (обычно `vault.local`) и войдите используя root token.

#### 6. Смена root token (рекомендуется)

После первоначальной настройки рекомендуется сменить root token:

```bash
kubectl exec -n service deployment/vault -- vault auth enable userpass
kubectl exec -n service deployment/vault -- vault write auth/userpass/users/admin \
  password=<new-password> policies=root
```

Затем используйте новый пользователь для входа вместо root token.

### Синхронизация секретов с Vault

После настройки Vault, синхронизируйте секреты из `_all.yaml`:

```bash
cd kubernetes/scripts
./vault-sync-secrets.sh
```

Для синхронизации конкретного сервиса:

```bash
./vault-sync-secrets.sh authentik
./vault-sync-secrets.sh vaultwarden
```

Подробнее о работе с секретами см. [Настройка секретов](./secrets-setup.md#синхронизация-секретов-с-vault).

## Автоматическое распечатывание Vault

Для автоматического распечатывания Vault после перезапуска можно использовать Vault Auto-unseal или хранить unseal ключи в Kubernetes Secrets (менее безопасно, но проще).

Рекомендуется настроить автоматическое распечатывание для production окружений.

## Проверка работы базовой инфраструктуры

После развёртки всех компонентов, проверьте:

### Traefik

```bash
# Проверка подов
kubectl get pods -n ingress

# Проверка сервисов
kubectl get svc -n ingress

# Проверка ingress routes
kubectl get ingressroute --all-namespaces
```

### Consul

```bash
# Проверка подов
kubectl get pods -n service -l app=consul

# Проверка сервисов в Consul
kubectl exec -n service deployment/consul -- consul members
```

### Vault

```bash
# Проверка статуса
kubectl exec -n service deployment/vault -- vault status

# Проверка списка секретов
kubectl exec -n service deployment/vault -- vault kv list secret/
```

## Устранение неполадок

### Проблема: Traefik не запускается

Проверьте логи:

```bash
kubectl logs -n ingress -l app.kubernetes.io/name=traefik
```

Проверьте конфигурацию:

```bash
kubectl get configmap -n ingress
kubectl describe pod -n ingress -l app.kubernetes.io/name=traefik
```

### Проблема: Consul не может подключиться к узлам

Проверьте сетевые политики:

```bash
kubectl get networkpolicies -n service
```

Проверьте логи:

```bash
kubectl logs -n service -l app=consul
```

### Проблема: Vault запечатан (Sealed)

Выполните unseal:

```bash
kubectl exec -n service deployment/vault -- vault operator unseal <unseal-key>
```

Нужно выполнить минимум 3 раза с разными ключами.

### Проблема: Не могу синхронизировать секреты

Проверьте, что Vault распечатан:

```bash
kubectl exec -n service deployment/vault -- vault status
```

Проверьте права доступа:

```bash
kubectl exec -n service deployment/vault -- vault auth list
```

## Следующие шаги

После успешной развёртки базовой инфраструктуры:

1. [Развёртка сервисов](./services-deployment.md) - развёртка всех остальных сервисов (базы данных, приложения, мониторинг)





