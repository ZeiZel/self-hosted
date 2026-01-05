---
sidebar_position: 8
---

# Настройка сервисов

После развёртки всех сервисов необходимо выполнить первоначальную настройку каждого из них. В этом разделе описана настройка основных сервисов.

## Vault

Vault уже настроен на этапе развёртки базовой инфраструктуры (см. [Развёртка базовой инфраструктуры](./infrastructure-deployment.md#vault)).

### Дополнительная настройка

#### Настройка политик доступа

После базовой настройки можно создать дополнительные политики для более гранулярного контроля доступа:

```bash
kubectl exec -n service deployment/vault -- vault policy write <policy-name> - <<EOF
path "secret/data/<service>/*" {
  capabilities = ["read", "list"]
}
EOF
```

#### Интеграция с Kubernetes

Интеграция с Kubernetes уже настроена скриптом `vault-setup.sh`. Дополнительные настройки можно выполнить через веб-интерфейс или CLI.

## Authentik

Authentik - SSO решение для единого входа во все сервисы.

### Первоначальный вход

1. Откройте веб-интерфейс Authentik:
   ```
   https://authentik.local
   ```

2. Войдите используя bootstrap токен (если это первый запуск):
   - Токен находится в секретах (`authentikBootstrapToken`)

3. Создайте административный аккаунт:
   - Email: укажите ваш email
   - Пароль: создайте надёжный пароль
   - Сохраните учётные данные

### Настройка источников пользователей

1. Перейдите в раздел "Directory" → "Users"
2. Создайте пользователей вручную или настройте LDAP/Active Directory
3. Настройте группы пользователей

### Настройка провайдеров

#### OAuth2/OIDC провайдер

1. Перейдите в "Applications" → "Providers"
2. Создайте новый OAuth2/OIDC Provider:
   - Name: название провайдера
   - Authorization flow: выберите flow
   - Client ID и Client Secret: сгенерируйте автоматически

#### SAML провайдер

1. Создайте SAML Provider:
   - Настройте Entity ID
   - Укажите Service Provider binding
   - Настройте атрибуты

### Интеграция с другими сервисами

Настройте интеграцию Authentik с:
- GitLab (через OAuth2)
- YouTrack (через SAML)
- Grafana (через OAuth2)
- И другими сервисами

Для каждого сервиса:
1. Создайте Provider в Authentik
2. Создайте Application в Authentik
3. Настройте сервис для использования Authentik (см. документацию конкретного сервиса)

## Vaultwarden

Vaultwarden - self-hosted сервер для Bitwarden.

### Первый вход

1. Откройте веб-интерфейс:
   ```
   https://vaultwarden.local
   ```

2. Зарегистрируйте первого пользователя:
   - Нажмите "Create account"
   - Заполните форму регистрации
   - Создайте мастер-пароль

### Регистрация пользователей

По умолчанию регистрация открыта. Для её отключения:

1. Откройте административную панель:
   ```
   https://vaultwarden.local/admin
   ```

2. Войдите используя admin token (из секретов)

3. Отключите регистрацию:
   - Settings → General → Signups allowed: Off

### Настройка административной панели

1. Войдите в админ панель (`/admin`)
2. Используйте admin token из секретов
3. Настройте:
   - Email уведомления
   - Приглашения пользователей
   - Политики безопасности

### Настройка email уведомлений

В секретах настройте:
- `vaultwardenEmail` - email для отправки
- SMTP настройки (через Authentik или внешний SMTP)

### Использование через клиент

1. Скачайте клиент Bitwarden (Desktop, Mobile, Browser extension)
2. В настройках сервера укажите:
   ```
   Server URL: https://vaultwarden.local
   ```
3. Войдите используя созданный аккаунт

## YouTrack

YouTrack - система управления проектами от JetBrains.

### Первый запуск

1. Откройте веб-интерфейс:
   ```
   https://youtrack.local
   ```

2. Дождитесь завершения инициализации (может занять несколько минут)

3. Войдите с учётными данными:
   - По умолчанию: `admin` / `admin`
   - Смените пароль при первом входе

### Интеграция с JetBrains Hub

1. Настройте JetBrains Hub (см. раздел Hub)
2. В YouTrack перейдите в Settings → Hub
3. Укажите URL Hub сервера:
   ```
   https://hub.local
   ```
4. Выполните подключение

### Настройка проектов

1. Создайте первый проект:
   - Projects → Create Project
   - Выберите шаблон проекта
   - Настройте поля и workflow

2. Настройте интеграции:
   - Git (GitLab, GitHub)
   - CI/CD (TeamCity)
   - Другие сервисы

### Настройка интеграции с GitLab

1. В GitLab создайте Personal Access Token
2. В YouTrack: Settings → Integrations → GitLab
3. Укажите URL GitLab и токен
4. Настройте синхронизацию коммитов и issues

## TeamCity

TeamCity - CI/CD сервер от JetBrains.

### Первая настройка

1. Откройте веб-интерфейс:
   ```
   https://teamcity.local
   ```

2. Примите лицензионное соглашение

3. Настройте базу данных:
   - Используется внешний PostgreSQL (уже настроен)
   - TeamCity автоматически подключится к базе

4. Создайте административный аккаунт

### Подключение к базе данных

База данных уже настроена в values.yaml. Проверьте подключение:

```bash
kubectl exec -n code deployment/teamcity-server -- psql -h postgresql.db.svc.cluster.local -U teamcity -d teamcity -c "SELECT 1"
```

### Настройка build агентов

1. Перейдите в Administration → Agents
2. Build агенты автоматически подключаются (если включены в конфигурации)
3. Авторизуйте агентов для работы
4. Проверьте статус: Agents должны быть "Authorized" и "Connected"

### Интеграция с GitLab

1. В GitLab создайте Personal Access Token
2. В TeamCity: Administration → Integrations → GitLab
3. Настройте подключение:
   - GitLab URL: `https://gitlab.local`
   - Personal Access Token: токен из GitLab
4. Создайте проект, подключённый к GitLab репозиторию

## GitLab

GitLab - система контроля версий и CI/CD.

### Первый вход

1. Откройте веб-интерфейс:
   ```
   https://gitlab.local
   ```

2. Войдите с root пользователем:
   - Username: `root`
   - Пароль: находится в секретах (`gitlabToken` или установите через консоль)

3. Смените пароль при первом входе

### Настройка SSH ключей

1. Сгенерируйте SSH ключ (если ещё нет):
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```

2. Скопируйте публичный ключ:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```

3. В GitLab: User Settings → SSH Keys
4. Вставьте публичный ключ и сохраните

### Настройка CI/CD

1. Создайте первый проект
2. Добавьте `.gitlab-ci.yml` в репозиторий
3. Настройте GitLab Runner (если используется)

### Интеграция с внешними сервисами

Настройте интеграцию с:
- YouTrack (для связи issues)
- TeamCity (для CI/CD)
- Authentik (для SSO)

## Notesnook

Notesnook - система для ведения заметок.

### Проверка MongoDB replica set

Перед использованием убедитесь, что MongoDB replica set настроен:

```bash
kubectl exec -it -n db deployment/mongodb -- mongosh --eval "rs.status()"
```

Если replica set не настроен, инициализируйте его:

```bash
kubectl exec -it -n db deployment/mongodb -- mongosh --eval "rs.initiate()"
```

### Настройка MinIO buckets

1. Проверьте доступность MinIO:
   ```bash
   kubectl get ingress -n db -l app=minio
   ```

2. Войдите в MinIO консоль (обычно `minio.local`)
3. Создайте bucket для Notesnook:
   - Bucket name: `notesnook` или `attachments`
   - Настройте права доступа

### Первый вход через клиент

1. Скачайте клиент Notesnook (Desktop, Mobile, Web)
2. В настройках укажите сервер:
   ```
   Server URL: https://notesnook.local
   Identity Server: https://identity.notesnook.local
   ```
3. Создайте аккаунт
4. Начните синхронизацию заметок

## Stoat

Stoat (ранее Revolt) - чат-сервер.

### Первый запуск

1. Откройте веб-интерфейс:
   ```
   https://stoat.local
   ```

2. Зарегистрируйте первого пользователя (администратора)

3. Создайте первый сервер

### Настройка серверов

1. В интерфейсе создайте сервер
2. Пригласите пользователей
3. Настройте каналы и роли
4. Настройте интеграции (боты, вебхуки)

## Stalwart

Stalwart - почтовый сервер.

### Настройка домена

1. В настройках Stalwart укажите ваш домен:
   ```
   Domain: mail.yourdomain.com
   ```

### Настройка DNS записей

Настройте следующие DNS записи для вашего домена:

**MX запись:**
```
yourdomain.com.  MX  10  mail.yourdomain.com.
```

**A запись для mail:**
```
mail.yourdomain.com.  A  YOUR_VPS_IP
```

**SPF запись:**
```
yourdomain.com.  TXT  "v=spf1 mx a ip4:YOUR_VPS_IP ~all"
```

**DKIM запись:**
Получите DKIM ключ из Stalwart и добавьте TXT запись:
```
default._domainkey.yourdomain.com.  TXT  "v=DKIM1; k=rsa; p=..."
```

**DMARC запись:**
```
_dmarc.yourdomain.com.  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com"
```

### Интеграция с Authentik

1. В Authentik создайте LDAP провайдер
2. В Stalwart настройте подключение к LDAP:
   - LDAP Server: `authentik.service.svc.cluster.local`
   - Port: 389 (или 636 для LDAPS)
   - Base DN: настройте согласно Authentik

## Glance

Glance - централизованный дашборд.

### Настройка виджетов

1. Откройте веб-интерфейс:
   ```
   https://glance.local
   ```

2. Войдите (если требуется авторизация)

3. Добавьте виджеты:
   - Перетащите виджеты на дашборд
   - Настройте размер и позицию

### Добавление ссылок на сервисы

1. Добавьте новый виджет "Ссылки"
2. Добавьте ссылки на все ваши сервисы:
   - GitLab: `https://gitlab.local`
   - YouTrack: `https://youtrack.local`
   - Grafana: `https://grafana.local`
   - И другие

### Кастомизация

1. Настройте тему (цвета, фон)
2. Добавьте свои виджеты
3. Настройте layout (сетку, размеры)

## Monitoring (Grafana)

Grafana - система визуализации метрик.

### Первый вход

1. Откройте веб-интерфейс:
   ```
   https://grafana.local
   ```

2. Войдите с учётными данными:
   - Username: `admin`
   - Password: из секретов (`grafanaPassword`)

3. Смените пароль при первом входе

### Настройка дашбордов

1. Импортируйте готовые дашборды:
   - Dashboard → Import
   - Выберите из библиотеки или импортируйте JSON

2. Создайте свои дашборды:
   - Dashboard → New Dashboard
   - Добавьте панели (графики, таблицы, статистика)

### Настройка алертов

1. Создайте каналы уведомлений:
   - Alerting → Notification channels
   - Настройте email, Slack, и другие каналы

2. Создайте правила алертов:
   - Alerting → Alert rules
   - Настройте условия и уведомления

### Подключение к Prometheus

Grafana автоматически подключается к Prometheus. Проверьте:

1. Configuration → Data Sources
2. Убедитесь, что Prometheus добавлен
3. URL: `http://prometheus.service.svc.cluster.local:9090`

## Harbor

Harbor - container registry.

### Первый вход

1. Откройте веб-интерфейс:
   ```
   https://harbor.local
   ```

2. Войдите с учётными данными:
   - Username: `admin`
   - Password: из секретов

3. Смените пароль при первом входе

### Настройка проектов

1. Создайте проект:
   - Projects → New Project
   - Настройте права доступа

2. Настройте репликацию (если нужно)

### Интеграция с CI/CD

1. Настройте Robot Accounts для автоматизации
2. Используйте credentials в CI/CD пайплайнах:
   ```yaml
   # GitLab CI пример
   docker login harbor.local -u robot-account -p token
   ```

## Bytebase

Bytebase - система управления схемами баз данных.

### Первый вход

1. Откройте веб-интерфейс:
   ```
   https://bytebase.local
   ```

2. Создайте административный аккаунт

### Подключение баз данных

1. Environments → Add Environment
2. Instances → Add Instance
3. Подключите базы данных:
   - PostgreSQL: `postgresql.db.svc.cluster.local:5432`
   - Укажите учётные данные
   - Проверьте подключение

### Настройка проектов

1. Projects → New Project
2. Настройте схему базы данных
3. Создайте миграции
4. Настройте синхронизацию с Git

## Резюме настройки

После настройки всех сервисов:

1. Убедитесь, что все сервисы доступны через их домены
2. Проверьте интеграции между сервисами
3. Настройте мониторинг и алерты
4. Создайте резервные копии критических данных
5. Настройте автоматические обновления (если требуется)

## Следующие шаги

После завершения настройки всех сервисов:

1. [Проверка и мониторинг](./verification.md) - проверка работоспособности всей системы





