---
sidebar_position: 9
---

# Проверка и мониторинг

После развёртки и настройки всех сервисов необходимо проверить работоспособность всей системы и настроить мониторинг.

## Проверка статуса подов

Проверьте статус всех подов во всех namespace:

```bash
kubectl get pods --all-namespaces
```

Все поды должны быть в статусе `Running`. Если есть поды в статусе `Pending`, `Error`, или `CrashLoopBackOff`, проверьте их логи:

```bash
kubectl describe pod <pod-name> -n <namespace>
kubectl logs <pod-name> -n <namespace>
```

### Проверка по namespace

Проверьте каждый namespace отдельно:

```bash
# Базы данных
kubectl get pods -n db

# Сервисы
kubectl get pods -n service

# Инфраструктура
kubectl get pods -n infrastructure

# Продуктивность
kubectl get pods -n productivity

# Код
kubectl get pods -n code

# Социальные сервисы
kubectl get pods -n social

# Данные
kubectl get pods -n data

# Ingress
kubectl get pods -n ingress
```

## Проверка сервисов

Проверьте статус всех сервисов:

```bash
kubectl get svc --all-namespaces
```

Убедитесь, что все сервисы имеют ClusterIP и правильные порты.

### Проверка endpoint'ов

Проверьте, что у сервисов есть активные endpoints:

```bash
kubectl get endpoints --all-namespaces
```

## Проверка Ingress

Проверьте все Ingress ресурсы:

```bash
kubectl get ingress --all-namespaces
```

Убедитесь, что:
- Все ingress правильно настроены
- Домены указывают на правильные сервисы
- TLS сертификаты настроены

### Проверка конкретного ingress

```bash
kubectl describe ingress <ingress-name> -n <namespace>
```

## Проверка подключения через Pangolin

### Проверка статуса Wireguard

На клиенте:

```bash
cd /opt/pangolin
docker exec gerbil wg show
```

На сервере:

```bash
ssh user@your-vps-ip "docker exec gerbil wg show"
```

### Проверка ping через туннель

```bash
ping 10.99.0.1  # IP сервера в Wireguard сети
```

### Проверка доступности сервисов через туннель

Проверьте доступность сервисов через домены:

```bash
curl -I https://gitlab.local
curl -I https://youtrack.local
curl -I https://vaultwarden.local
curl -I https://grafana.local
```

Все сервисы должны отвечать HTTP 200 или редирект на страницу входа.

## Проверка доступности сервисов через домены

### Проверка DNS резолюции

```bash
nslookup gitlab.local
dig gitlab.local
```

### Проверка через curl

Проверьте каждый сервис:

```bash
# GitLab
curl -I https://gitlab.local

# YouTrack
curl -I https://youtrack.local

# TeamCity
curl -I https://teamcity.local

# Vaultwarden
curl -I https://vaultwarden.local

# Grafana
curl -I https://grafana.local

# Authentik
curl -I https://authentik.local

# Glance
curl -I https://glance.local
```

### Проверка SSL сертификатов

```bash
openssl s_client -connect gitlab.local:443 -servername gitlab.local < /dev/null
```

Убедитесь, что сертификаты действительны и не истекли.

## Использование Glance для централизованного доступа

### Открытие Glance

Откройте веб-интерфейс Glance:

```
https://glance.local
```

### Проверка ссылок

Убедитесь, что все ссылки в Glance ведут на правильные сервисы и работают.

### Настройка виджетов

Добавьте виджеты для мониторинга:
- Статус сервисов
- Метрики использования ресурсов
- Последние события

## Мониторинг через Grafana

### Открытие Grafana

Откройте веб-интерфейс Grafana:

```
https://grafana.local
```

### Проверка подключения к Prometheus

1. Configuration → Data Sources
2. Убедитесь, что Prometheus подключен
3. Test connection - должно быть "Data source is working"

### Проверка дашбордов

1. Dashboard → Browse
2. Убедитесь, что дашборды отображают данные
3. Проверьте метрики:
   - CPU использование
   - Память
   - Сеть
   - Диск

### Создание кастомных дашбордов

Создайте дашборды для мониторинга:
- Статус подов
- Использование ресурсов кластера
- Доступность сервисов
- Метрики приложений

## Логирование через Loki

### Проверка Loki

```bash
kubectl get pods -n service -l app=loki
```

### Подключение Loki к Grafana

1. В Grafana: Configuration → Data Sources
2. Add data source → Loki
3. URL: `http://loki.service.svc.cluster.local:3100`
4. Test & Save

### Просмотр логов

1. Explore → Loki
2. Выберите namespace и pod
3. Просмотрите логи

## Проверка баз данных

### PostgreSQL

```bash
# Проверка статуса
kubectl get pods -n db -l app=postgres

# Подключение
kubectl exec -it -n db deployment/postgres -- psql -U postgres

# Проверка баз данных
kubectl exec -it -n db deployment/postgres -- psql -U postgres -c "\l"
```

### MongoDB

```bash
# Проверка статуса
kubectl get pods -n db -l app=mongodb

# Проверка replica set
kubectl exec -it -n db deployment/mongodb -- mongosh --eval "rs.status()"
```

### ValKey

```bash
# Проверка статуса
kubectl get pods -n db -l app=valkey

# Проверка подключения
kubectl exec -it -n db deployment/valkey-master -- valkey-cli ping
```

## Проверка Vault

### Статус Vault

```bash
kubectl exec -n service deployment/vault -- vault status
```

Убедитесь, что статус: `Sealed: false`

### Проверка секретов

```bash
# Список секретов
kubectl exec -n service deployment/vault -- vault kv list secret/

# Просмотр секрета
kubectl exec -n service deployment/vault -- vault kv get secret/vaultwarden/secrets
```

## Проверка Consul

### Статус Consul

```bash
kubectl get pods -n service -l app=consul
```

### Члены кластера

```bash
kubectl exec -n service deployment/consul -- consul members
```

### UI Consul

Откройте веб-интерфейс Consul (если включен):

```
https://consul.local
```

## Мониторинг ресурсов

### Использование ресурсов узлов

```bash
kubectl top nodes
```

### Использование ресурсов подов

```bash
kubectl top pods --all-namespaces
```

### Детальная информация о ресурсах

```bash
kubectl describe node <node-name>
```

## Проверка событий

Проверьте последние события в кластере:

```bash
kubectl get events --all-namespaces --sort-by='.lastTimestamp' | tail -50
```

Обратите внимание на события типа `Warning` или `Error`.

## Настройка алертов

### Алерты в Grafana

1. Alerting → Alert rules
2. Создайте правила для:
   - Высокое использование CPU/памяти
   - Недоступность сервисов
   - Ошибки в логах
   - Проблемы с дисками

### Каналы уведомлений

Настройте каналы уведомлений:
- Email
- Slack
- Discord
- PagerDuty

## Резервное копирование

### Проверка резервных копий

Убедитесь, что настроено резервное копирование:
- Баз данных (PostgreSQL, MongoDB)
- Persistent volumes
- Конфигурации (Helm charts, secrets)

### Тестирование восстановления

Периодически проверяйте возможность восстановления из резервных копий.

## Чек-лист проверки

Используйте этот чек-лист для проверки системы:

- [ ] Все поды в статусе Running
- [ ] Все сервисы имеют активные endpoints
- [ ] Все ingress правильно настроены
- [ ] Wireguard туннель работает
- [ ] Все домены резолвятся и доступны
- [ ] SSL сертификаты действительны
- [ ] Glance показывает все сервисы
- [ ] Grafana подключена к Prometheus
- [ ] Loki собирает логи
- [ ] Базы данных работают
- [ ] Vault распечатан и доступен
- [ ] Consul работает
- [ ] Ресурсы используются разумно
- [ ] Настроены алерты
- [ ] Настроено резервное копирование

## Устранение проблем

### Поды не запускаются

1. Проверьте события: `kubectl describe pod <pod-name> -n <namespace>`
2. Проверьте логи: `kubectl logs <pod-name> -n <namespace>`
3. Проверьте ресурсы: `kubectl describe node`
4. Проверьте persistent volumes: `kubectl get pv, pvc`

### Сервисы недоступны

1. Проверьте ingress: `kubectl describe ingress -n <namespace>`
2. Проверьте DNS: `nslookup <domain>`
3. Проверьте SSL: `openssl s_client -connect <domain>:443`
4. Проверьте логи Traefik: `kubectl logs -n ingress -l app=traefik`

### Проблемы с базами данных

1. Проверьте статус: `kubectl get pods -n db`
2. Проверьте логи: `kubectl logs -n db <db-pod>`
3. Проверьте подключение: попробуйте подключиться к БД
4. Проверьте persistent volumes

## Следующие шаги

После проверки системы:

1. Настройте регулярные проверки
2. Настройте автоматические алерты
3. Настройте резервное копирование
4. Документируйте особенности вашей установки





