# Отчет о проверке совместимости сервисов

Дата проверки: 2025-01-27

## Резюме

Проведена проверка совместимости всех сервисов в Helm чартах по 7 основным критериям и дополнительным аспектам. Обнаружено **критических проблем**, требующих исправления для обеспечения корректной работы инфраструктуры.

## 1. Присутствие в Prometheus

### Статус: ❌ КРИТИЧЕСКАЯ ПРОБЛЕМА

**Проблема**: Ни один сервис не имеет аннотаций Prometheus для автоматического обнаружения.

**Детали**:
- Prometheus настроен на использование Kubernetes Service Discovery с аннотациями:
  - `prometheus.io/scrape: "true"`
  - `prometheus.io/port: "<port>"`
  - `prometheus.io/path: "/metrics"` (опционально)
- Проверено 23 deployment файла - аннотации отсутствуют во всех

**Затронутые сервисы** (все):
- authentik
- notesnook (server, identity, sse)
- vaultwarden
- stoat (api, web)
- nextcloud
- stalwart
- gitlab
- teamcity
- youtrack
- excalidraw
- dashy
- syncthing
- bytebase
- glance
- pangolin-client
- hub
- minio
- monitoring (prometheus, grafana, loki)
- postgres
- mongodb
- valkey
- vault

**Рекомендации**:
1. Добавить аннотации Prometheus во все deployment файлы в секции `metadata.annotations`:
```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "<service_port>"
  prometheus.io/path: "/metrics"  # если отличается от /metrics
```

2. Для сервисов, которые не экспортируют метрики, рассмотреть возможность добавления sidecar контейнера с экспортером метрик.

## 2. Регистрация в Consul Service Delivery

### Статус: ⚠️ ЧАСТИЧНО НАСТРОЕНО

**Статус**: Многие сервисы имеют Consul аннотации, но не все.

**Найдено 24 файла с Consul аннотациями**:
- ✅ notesnook (server, identity, sse)
- ✅ vaultwarden
- ✅ stoat (api, web)
- ✅ nextcloud
- ✅ stalwart
- ✅ monitoring (prometheus, grafana, loki)
- ✅ postgres
- ✅ mongodb
- ✅ consul (client)
- ✅ pangolin-client
- ✅ bytebase
- ✅ glance
- ✅ hub
- ✅ gitlab
- ✅ excalidraw
- ✅ dashy
- ✅ syncthing
- ✅ youtrack
- ✅ teamcity
- ✅ vault

**Проблемы**:
1. **Authentik** - не имеет Consul аннотаций в deployment файлах
2. **MinIO** - не имеет Consul аннотаций
3. Не все сервисы имеют правильные теги для группировки

**Рекомендации**:
1. Добавить Consul аннотации в deployment файлы Authentik:
```yaml
annotations:
  consul.hashicorp.com/connect-inject: "true"
  consul.hashicorp.com/connect-service: "authentik"
  consul.hashicorp.com/connect-service-port: "80"
  consul.hashicorp.com/service-tags: "authentik,auth,sso"
```

2. Добавить Consul аннотации в MinIO deployment
3. Проверить, что все сервисы имеют `consul.enabled: true` в values.yaml где необходимо
4. Убедиться, что service-name и service-port указаны корректно

## 3. RBAC для межсервисного взаимодействия

### Статус: ✅ В ОСНОВНОМ НАСТРОЕНО

**Статус**: Большинство сервисов имеют RBAC конфигурации.

**Найдено 44 файла с ServiceAccount/RBAC**:
- ✅ authentik (ServiceAccount, ClusterRole, ClusterRoleBinding)
- ✅ vault (ServiceAccount, ClusterRole для Vault и Injector)
- ✅ vaultwarden (RBAC)
- ✅ stoat (RBAC)
- ✅ nextcloud (RBAC)
- ✅ stalwart (RBAC)
- ✅ gitlab (RBAC)
- ✅ teamcity (RBAC)
- ✅ youtrack (RBAC)
- ✅ excalidraw (RBAC)
- ✅ dashy (RBAC)
- ✅ syncthing (RBAC)
- ✅ postgres (ServiceAccount, ClusterRole, ClusterRoleBinding)
- ✅ mongodb (ServiceAccount)
- ✅ consul (ServiceAccount)
- ✅ monitoring (ServiceAccount для Prometheus)

**Рекомендации**:
1. Проверить, что все сервисы, которые требуют доступа к Kubernetes API, имеют соответствующие права
2. Убедиться, что сервисы, использующие Vault, имеют права на чтение Secrets
3. Проверить NetworkPolicy для изоляции трафика (если используется)

## 4. Видимость в Traefik

### Статус: ✅ В ОСНОВНОМ НАСТРОЕНО

**Статус**: Большинство сервисов имеют Ingress/IngressRoute ресурсы.

**Найдено 22 Ingress файла**:
- ✅ authentik
- ✅ notesnook (Ingress + IngressRoute)
- ✅ vaultwarden
- ✅ stoat
- ✅ nextcloud
- ✅ stalwart
- ✅ gitlab
- ✅ teamcity
- ✅ youtrack
- ✅ excalidraw
- ✅ dashy
- ✅ syncthing
- ✅ bytebase
- ✅ glance
- ✅ pangolin-client (ingress.enabled: false)
- ✅ hub
- ✅ minio
- ✅ monitoring
- ✅ consul
- ✅ vault
- ✅ valkey (ingress.enabled: false)

**Проблемы**:
1. **Pangolin-client** имеет `ingress.enabled: false` - это может быть намеренно, но стоит проверить
2. **Valkey** имеет `ingress.enabled: false` - это нормально для БД, но может быть полезно для мониторинга

**Рекомендации**:
1. Проверить, что все сервисы, которые должны быть доступны извне, имеют `ingress.enabled: true`
2. Убедиться, что все Ingress используют `className: traefik`
3. Проверить корректность host'ов и путей
4. Проверить TLS конфигурацию

## 5. Интеграция Pangolin с Traefik

### Статус: ⚠️ ПРОБЛЕМА

**Проблема**: Traefik в Kubernetes не настроен на использование HTTP provider от Pangolin.

**Детали**:
- В Ansible шаблоне (`ansible/pangolin/roles/pangolin_server/templates/traefik_config.yml.j2`) есть HTTP provider:
  ```yaml
  providers:
    http:
      endpoint: "http://pangolin:3001/api/v1/traefik-config"
      pollInterval: "5s"
  ```
- В Kubernetes конфигурации Traefik (`kubernetes/releases/traefik.yaml.gotmpl`) HTTP provider отсутствует
- Traefik использует только Kubernetes Ingress и IngressRoute

**Рекомендации**:
1. Добавить HTTP provider в конфигурацию Traefik для Kubernetes через ConfigMap или дополнительный файл конфигурации
2. Убедиться, что Pangolin client доступен из Traefik по адресу `http://pangolin-client.<namespace>.svc.cluster.local:3001/api/v1/traefik-config`
3. Проверить connectivity между Traefik и Pangolin client

## 6. Подключения к базам данных

### Статус: ❌ КРИТИЧЕСКАЯ ПРОБЛЕМА

**Проблема**: Множество сервисов используют неправильные namespace в connection strings.

**Правильные namespace для БД**:
- PostgreSQL: `db` (service: `postgresql.db.svc.cluster.local`)
- MongoDB: `db` (service: `mongodb.db.svc.cluster.local`)
- Valkey: `db` (service: `valkey-master.db.svc.cluster.local` или `valkey.db.svc.cluster.local`)
- MinIO: `db` (service: `minio.db.svc.cluster.local:9000`)

### Проблемные сервисы:

#### 1. Authentik
- **Файл**: `kubernetes/charts/authentik/values.yaml`
- **Проблема**: Использует `postgresql.code.svc.cluster.local` и `valkey.code.svc.cluster.local`
- **Исправление**: 
  - `postgresql.code.svc.cluster.local` → `postgresql.db.svc.cluster.local`
  - `valkey.code.svc.cluster.local` → `valkey-master.db.svc.cluster.local`

#### 2. Vaultwarden
- **Файл**: `kubernetes/charts/vaultwarden/values.yaml`
- **Проблема**: Использует `postgresql.code.svc.cluster.local`
- **Исправление**: `postgresql.code.svc.cluster.local` → `postgresql.db.svc.cluster.local`

#### 3. Stoat (Revolt)
- **Файл**: `kubernetes/charts/stoat/values.yaml`
- **Проблема**: Использует `mongodb-revolt.code.svc.cluster.local`, `valkey-master.code.svc.cluster.local`, `minio.code.svc.cluster.local`
- **Исправление**: 
  - `mongodb-revolt.code.svc.cluster.local` → `mongodb.db.svc.cluster.local` (если используется общий MongoDB)
  - `valkey-master.code.svc.cluster.local` → `valkey-master.db.svc.cluster.local`
  - `minio.code.svc.cluster.local:9000` → `minio.db.svc.cluster.local:9000`

#### 4. Nextcloud
- **Файл**: `kubernetes/charts/nextcloud/values.yaml`
- **Проблема**: Использует `postgresql.code.svc.cluster.local` и `valkey-master.code.svc.cluster.local`
- **Исправление**: 
  - `postgresql.code.svc.cluster.local` → `postgresql.db.svc.cluster.local`
  - `valkey-master.code.svc.cluster.local` → `valkey-master.db.svc.cluster.local`

#### 5. Stalwart
- **Файл**: `kubernetes/charts/stalwart/values.yaml`
- **Проблема**: Использует `postgresql.code.svc.cluster.local` и `valkey-master.code.svc.cluster.local`
- **Исправление**: 
  - `postgresql.code.svc.cluster.local` → `postgresql.db.svc.cluster.local`
  - `valkey-master.code.svc.cluster.local` → `valkey-master.db.svc.cluster.local`

#### 6. Excalidraw
- **Файл**: `kubernetes/charts/excalidraw/values.yaml`
- **Проблема**: Использует `postgresql.code.svc.cluster.local` и `minio.code.svc.cluster.local:9000`
- **Исправление**: 
  - `postgresql.code.svc.cluster.local` → `postgresql.db.svc.cluster.local`
  - `minio.code.svc.cluster.local:9000` → `minio.db.svc.cluster.local:9000`

#### 7. Postgres (backup)
- **Файл**: `kubernetes/charts/postgres/values.yaml`
- **Проблема**: Использует `minio.code.svc.cluster.local:9000` для backup
- **Исправление**: `minio.code.svc.cluster.local:9000` → `minio.db.svc.cluster.local:9000`

### Правильно настроенные сервисы:
- ✅ Notesnook: использует `mongo.db.svc.cluster.local` и `minio.db.svc.cluster.local:9000`
- ✅ Bytebase: использует `postgres-0.postgres-headless.db.svc.cluster.local`
- ✅ Harbor: использует `postgres-0.postgres-headless.db.svc.cluster.local` и `valkey-headless.db.svc.cluster.local`
- ✅ Devtron: использует `postgres-0.postgres-headless.db.svc.cluster.local`

**Рекомендации**:
1. Исправить все connection strings, заменив `.code.` на `.db.` для БД
2. Проверить, что все БД созданы в namespace `db`
3. Убедиться, что Service имена соответствуют реальным именам сервисов в namespace `db`
4. Для MongoDB проверить, что replicaSet указан корректно (`rs0`)
5. Для MinIO проверить, что endpoint указывает на правильный порт (9000)

## 7. Секреты в Vault

### Статус: ❌ КРИТИЧЕСКАЯ ПРОБЛЕМА

**Проблема**: Vault Agent Injector включен, но ни один сервис не использует аннотации Vault для инъекции секретов.

**Детали**:
- Vault настроен с `injector.enabled: true`
- Vault Agent Injector имеет RBAC права
- Все сервисы используют Kubernetes Secrets напрямую через `secretRef` и `secretKeyRef`
- Аннотации `vault.hashicorp.com/agent-inject` отсутствуют во всех deployment файлах

**Текущее состояние**:
- Все секреты хранятся в Kubernetes Secrets
- Секреты создаются через templates в `kubernetes/charts/*/templates/secret.yaml`

**Рекомендации**:
1. Определить, какие секреты должны быть в Vault:
   - Пароли БД
   - API ключи
   - TLS сертификаты
   - SMTP credentials
   - OAuth secrets

2. Мигрировать секреты в Vault:
   - Создать policies в Vault для каждого сервиса
   - Создать секреты в Vault по путям, например:
     - `secret/data/authentik/postgresql` - для пароля PostgreSQL Authentik
     - `secret/data/vaultwarden/database` - для connection string Vaultwarden
     - `secret/data/stoat/mongodb` - для MongoDB credentials Stoat

3. Добавить аннотации Vault в deployment файлы:
```yaml
annotations:
  vault.hashicorp.com/agent-inject: "true"
  vault.hashicorp.com/role: "<service-name>"
  vault.hashicorp.com/agent-inject-secret-database: "secret/data/<service>/database"
  vault.hashicorp.com/agent-inject-template-database: |
    {{- with secret "secret/data/<service>/database" -}}
    DATABASE_URL={{ .Data.data.connection_string }}
    {{- end }}
```

4. Обновить deployment файлы, чтобы использовать файлы, созданные Vault Agent, вместо Kubernetes Secrets

## Дополнительные проверки

### 8. Namespace организация

**Статус**: ✅ ПРАВИЛЬНО ОРГАНИЗОВАНО

**Namespace структура**:
- `ingress` - Traefik
- `service` - Consul, Vault, Authentik, Monitoring
- `db` - PostgreSQL, MongoDB, Valkey, MinIO
- `productivity` - Notesnook, Excalidraw
- `code` - GitLab, YouTrack, TeamCity, Hub
- `social` - Stoat, Stalwart
- `data` - Vaultwarden, Syncthing, Nextcloud
- `infrastructure` - Bytebase, Glance, Pangolin-client

**Рекомендации**: Структура namespace логична и хорошо организована.

### 9. Health checks и readiness

**Статус**: ✅ В ОСНОВНОМ НАСТРОЕНО

**Наблюдения**:
- Большинство сервисов имеют liveness и readiness probes
- Probes настроены с разумными задержками и интервалами

**Рекомендации**: Продолжать использовать health checks для всех сервисов.

### 10. Resource limits

**Статус**: ✅ НАСТРОЕНО

**Наблюдения**:
- Все сервисы имеют resource limits и requests
- Лимиты установлены разумно

**Рекомендации**: Продолжать мониторить использование ресурсов и корректировать при необходимости.

### 11. Persistent storage

**Статус**: ✅ НАСТРОЕНО

**Наблюдения**:
- Сервисы, требующие постоянного хранилища, имеют PVC
- StorageClass указан как `standard`

**Рекомендации**: Убедиться, что StorageClass `standard` существует в кластере.

### 12. Service dependencies

**Статус**: ✅ ЧАСТИЧНО НАСТРОЕНО

**Наблюдения**:
- Некоторые сервисы имеют initContainers для ожидания зависимостей:
  - Authentik: wait-for-postgresql, wait-for-valkey
  - Vaultwarden: wait-for-postgresql
  - Notesnook: wait-for-services (identity-server, minio)

**Рекомендации**:
1. Добавить initContainers для всех сервисов, которые зависят от БД
2. Использовать стандартные образы для health checks (postgres:15-alpine, redis:7-alpine, curl)

### 13. Network policies

**Статус**: ⚠️ НЕ ПРОВЕРЕНО

**Наблюдения**: NetworkPolicy ресурсы не найдены в чартах.

**Рекомендации**:
1. Рассмотреть возможность добавления NetworkPolicy для изоляции трафика
2. Убедиться, что разрешены необходимые соединения между сервисами

### 14. DNS resolution

**Статус**: ⚠️ ЧАСТИЧНО ПРАВИЛЬНО

**Проблемы**:
- Многие сервисы используют неправильные namespace в DNS именах (см. раздел 6)

**Рекомендации**:
1. Исправить все DNS имена, используя правильный формат: `<service>.<namespace>.svc.cluster.local`
2. Убедиться, что все Service имена соответствуют реальным именам сервисов

## Приоритет исправлений

### Критический приоритет (блокирует работу):
1. ✅ **Исправить connection strings к БД** - сервисы не смогут подключиться к БД
2. ✅ **Добавить Prometheus аннотации** - мониторинг не будет работать
3. ✅ **Настроить Vault для секретов** - секреты должны быть в Vault согласно требованиям

### Высокий приоритет (важно для функциональности):
4. ⚠️ **Добавить Consul аннотации в Authentik и MinIO** - для полной интеграции с Service Delivery
5. ⚠️ **Настроить HTTP provider Pangolin в Traefik** - для интеграции Pangolin с Traefik

### Средний приоритет (улучшения):
6. ⚠️ **Добавить initContainers для всех зависимостей** - для надежного запуска
7. ⚠️ **Рассмотреть NetworkPolicy** - для безопасности

## Заключение

Инфраструктура в целом хорошо организована, но требует исправления критических проблем с connection strings к БД и настройки мониторинга. После исправления этих проблем все сервисы должны корректно работать вместе.

**Общая оценка**: 6/10
- ✅ Хорошая организация namespace
- ✅ Правильная структура RBAC
- ✅ Настроены Ingress ресурсы
- ❌ Критические проблемы с connection strings
- ❌ Отсутствует мониторинг через Prometheus
- ❌ Секреты не используются из Vault

