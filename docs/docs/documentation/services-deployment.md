---
sidebar_position: 6
---

# Deployment of Services

После развёртки базовой инфраструктуры можно приступить к развёртке всех остальных сервисов. Helmfile автоматически учтёт зависимости между сервисами и развернёт их в правильном порядке.

## Порядок развёртывания

Благодаря зависимостям в `kubernetes/apps/_others.yaml`, сервисы развернутся в следующем порядке:

1. **Базы данных** (PostgreSQL, MongoDB, ValKey, MinIO)
2. **Инфраструктурные сервисы** (Monitoring, Glance, Harbor, Bytebase, Devtron)
3. **Сервисы авторизации** (Authentik)
4. **Сервисы продуктивности** (Notesnook, Excalidraw, Penpot)
5. **Сервисы разработки** (GitLab, TeamCity, YouTrack, JetBrains Hub)
6. **Социальные сервисы** (Stoat, Stalwart)
7. **Сервисы данных** (Vaultwarden, Syncthing, ownCloud)

## Deployment всех of Services

### Выполнение развёртки

Navigate to директорию с Kubernetes конфигурацией:

```bash
cd kubernetes
```

Run развёртку всех сервисов:

```bash
helmfile -e k8s apply
```

Эта команда развернёт все сервисы, учитывая зависимости. Процесс может занять 30-60 минут в зависимости от количества сервисов и скорости загрузки образов.

### Verification статуса

Check статус всех релизов:

```bash
helmfile -e k8s list
```

Check статус подов по namespace:

```bash
kubectl get pods -n db
kubectl get pods -n service
kubectl get pods -n infrastructure
kubectl get pods -n productivity
kubectl get pods -n code
kubectl get pods -n social
kubectl get pods -n data
```

## Базы данных

### PostgreSQL

PostgreSQL используется большинством сервисов для хранения данных.

**Проверка:**

```bash
kubectl get pods -n db -l app=postgres
kubectl get svc -n db -l app=postgres
```

**Подключение:**

```bash
kubectl exec -it -n db deployment/postgres -- psql -U postgres
```

### MongoDB

MongoDB используется Notesnook и Stoat.

**Проверка:**

```bash
kubectl get pods -n db -l app=mongodb
```

**Проверка replica set:**

```bash
kubectl exec -it -n db deployment/mongodb -- mongosh --eval "rs.status()"
```

### ValKey

ValKey (Redis-compatible) используется для кэширования и сессий.

**Проверка:**

```bash
kubectl get pods -n db -l app=valkey
kubectl exec -it -n db deployment/valkey-master -- valkey-cli ping
```

### MinIO

MinIO используется для S3-совместимого объектного хранилища.

**Проверка:**

```bash
kubectl get pods -n db -l app=minio
kubectl get ingress -n db -l app=minio
```

## Инфраструктурные сервисы

### Monitoring (Prometheus, Grafana, Loki)

Мониторинг включает Prometheus для сбора метрик, Grafana для визуализации и Loki для логов.

**Проверка:**

```bash
kubectl get pods -n service -l app=prometheus
kubectl get pods -n service -l app=grafana
kubectl get pods -n service -l app=loki
```

**Доступ к Grafana:**

```bash
kubectl get ingress -n service -l app=grafana
```

Обычно доступен по адресу `grafana.local`. Пароль администратора находится в секретах.

### Glance

Glance - централизованный дашборд со ссылками на все сервисы.

**Проверка:**

```bash
kubectl get pods -n infrastructure -l app=glance
kubectl get ingress -n infrastructure -l app=glance
```

**Доступ:** `glance.local`

### Harbor

Harbor - container registry для хранения Docker образов.

**Проверка:**

```bash
kubectl get pods -n infrastructure -l app=harbor
kubectl get ingress -n infrastructure -l app=harbor
```

**Доступ:** `harbor.local`

### Bytebase

Bytebase - система управления схемами баз данных.

**Проверка:**

```bash
kubectl get pods -n infrastructure -l app=bytebase
kubectl get ingress -n infrastructure -l app=bytebase
```

**Доступ:** `bytebase.local`

### Devtron

Devtron - Kubernetes dashboard и CI/CD платформа.

**Проверка:**

```bash
kubectl get pods -n devtroncd -l app=devtron
kubectl get ingress -n devtroncd -l app=devtron
```

**Доступ:** `devtron.local`

## Сервисы авторизации

### Authentik

Authentik - SSO (Single Sign-On) решение для авторизации во всех сервисах.

**Проверка:**

```bash
kubectl get pods -n service -l app=authentik
kubectl get ingress -n service -l app=authentik
```

**Доступ:** `authentik.local`

**Начальная настройка:** После первого запуска выполните настройку через веб-интерфейс (см. [Настройка сервисов](./services-configuration.md#authentik)).

## Сервисы продуктивности

### Notesnook

Notesnook - система для ведения заметок с синхронизацией.

**Проверка:**

```bash
kubectl get pods -n productivity -l app=notesnook
kubectl get ingress -n productivity -l app=notesnook
```

**Доступ:** `notesnook.local`, `identity.notesnook.local`

### Excalidraw

Excalidraw - инструмент для создания диаграмм.

**Проверка:**

```bash
kubectl get pods -n productivity -l app=excalidraw
kubectl get ingress -n productivity -l app=excalidraw
```

**Доступ:** `excalidraw.local`

### Penpot

Penpot - инструмент для дизайна (аналог Figma).

**Проверка:**

```bash
kubectl get pods -n productivity -l app=penpot
kubectl get ingress -n productivity -l app=penpot
```

**Доступ:** `penpot.local`

## Сервисы разработки

### GitLab

GitLab - система контроля версий и CI/CD.

**Проверка:**

```bash
kubectl get pods -n code -l app=gitlab
kubectl get ingress -n code -l app=gitlab
```

**Доступ:** `gitlab.local`

**Начальная настройка:** После первого запуска войдите с root пользователем (пароль в секретах).

### TeamCity

TeamCity - CI/CD сервер от JetBrains.

**Проверка:**

```bash
kubectl get pods -n code -l app=teamcity
kubectl get ingress -n code -l app=teamcity
```

**Доступ:** `teamcity.local`

**Начальная настройка:** Выполните первоначальную настройку через веб-интерфейс.

### YouTrack

YouTrack - система управления проектами от JetBrains.

**Проверка:**

```bash
kubectl get pods -n code -l app=youtrack
kubectl get ingress -n code -l app=youtrack
```

**Доступ:** `youtrack.local`

### JetBrains Hub

JetBrains Hub - центр управления сервисами JetBrains.

**Проверка:**

```bash
kubectl get pods -n code -l app=hub
kubectl get ingress -n code -l app=hub
```

**Доступ:** `hub.local`

## Социальные сервисы

### Stoat

Stoat (ранее Revolt) - чат-сервер (аналог Discord).

**Проверка:**

```bash
kubectl get pods -n social -l app=stoat
kubectl get ingress -n social -l app=stoat
```

**Доступ:** `stoat.local`

### Stalwart

Stalwart - почтовый сервер.

**Проверка:**

```bash
kubectl get pods -n social -l app=stalwart
kubectl get ingress -n social -l app=stalwart
```

**Доступ:** `stalwart.local`

**Настройка:** Требует настройки DNS записей (MX, SPF, DKIM, DMARC).

## Сервисы данных

### Vaultwarden

Vaultwarden - self-hosted сервер для Bitwarden.

**Проверка:**

```bash
kubectl get pods -n data -l app=vaultwarden
kubectl get ingress -n data -l app=vaultwarden
```

**Доступ:** `vaultwarden.local`

**Начальная настройка:** Зарегистрируйте первого пользователя через клиент Bitwarden.

### Syncthing

Syncthing - система синхронизации файлов.

**Проверка:**

```bash
kubectl get pods -n data -l app=syncthing
kubectl get ingress -n data -l app=syncthing
```

**Доступ:** `syncthing.local`

### ownCloud

ownCloud - система облачного хранения файлов.

**Проверка:**

```bash
kubectl get pods -n data -l app=owncloud
kubectl get ingress -n data -l app=owncloud
```

**Доступ:** `owncloud.local`

**Начальная настройка:** Войдите с администратором (пароль в секретах).

## Мониторинг процесса развёртки

Во время развёртки можно мониторить процесс:

```bash
# Следить за статусом подов
watch kubectl get pods --all-namespaces

# Следить за событиями
kubectl get events --all-namespaces --sort-by='.lastTimestamp'

# Проверять логи конкретного сервиса
kubectl logs -n <namespace> -l app=<app-name> -f
```

## Troubleshooting

### Issue: Поды не запускаются

Check события:

```bash
kubectl describe pod <pod-name> -n <namespace>
kubectl get events -n <namespace> --sort-by='.lastTimestamp'
```

Check логи:

```bash
kubectl logs <pod-name> -n <namespace>
```

### Issue: Ошибки инициализации баз данных

Check статус баз данных:

```bash
kubectl get pods -n db
kubectl logs -n db <database-pod>
```

Make sure, что базы данных полностью запущены перед развёрткой зависимых сервисов.

### Issue: Недостаточно ресурсов

Check использование ресурсов:

```bash
kubectl top nodes
kubectl top pods --all-namespaces
```

При необходимости добавьте ресурсы на узлы или уменьшите количество реплик в values.yaml.

### Issue: Ошибки загрузки образов

Check статус подов:

```bash
kubectl get pods --all-namespaces | grep ImagePullBackOff
```

Make sure, что узлы могут загружать образы из registry.

## Next Steps

После успешной развёртки всех сервисов:

1. [Настройка Pangolin и Wireguard туннеля](./pangolin-setup.md) - настройка VPN туннеля для доступа к сервисам
2. [Настройка сервисов](./services-configuration.md) - первоначальная настройка каждого сервиса






