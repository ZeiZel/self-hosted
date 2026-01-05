---
sidebar_position: 7
---

# Configuration Pangolin and Wireguard Tunnel

Pangolin - это система для создания VPN туннеля между клиентом (локальная машина) и сервером (VPS), позволяющая безопасно пробрасывать порты и домены. На этом этапе мы настроим Pangolin клиент на локальной машине и подключим его к Pangolin серверу на VPS.

## Обзор архитектуры

Pangolin состоит из двух компонентов:

- **Pangolin Server** (уже развёрнут на VPS) - управляет подключениями клиентов и маршрутизацией
- **Pangolin Client** (Newt) - подключается к серверу и создаёт Wireguard туннель
- **Gerbil** - Wireguard сервер, который обрабатывает VPN соединения
- **Traefik** - reverse proxy на стороне сервера, который проксирует запросы через туннель

## Deployment Pangolin клиента

Pangolin клиент развёртывается на локальной машине, с которой будет осуществляться доступ к сервисам через VPN туннель.

### Configuration inventory

Make sure, что в `ansible/pangolin/inventory/hosts.yml` настроена секция `local`:

```yaml
all:
  children:
    local:
      hosts:
        pangolin_local:
          ansible_host: YOUR_LOCAL_IP  # IP адрес локальной машины (или localhost)
          ansible_user: your_username  # Пользователь на локальной машине
          ansible_port: 22
          ansible_connection: local  # Для локального выполнения

          pangolin_role: client
          pangolin_server_endpoint: "yourdomain.com"  # Домен Pangolin сервера
```

### Выполнение развёртки

Navigate to директорию с Ansible playbooks:

```bash
cd ansible/pangolin
```

Run playbook для развёртки клиента:

```bash
ansible-playbook -i inventory/hosts.yml playbooks/deploy_local.yml
```

Playbook выполнит следующие действия:

1. **Роль `common`** - установка базовых пакетов и настройка системы
2. **Роль `docker`** - установка Docker (если не установлен)
3. **Роль `pangolin_client`** - развёртка Pangolin клиента (Newt)

### Что делает playbook

1. Создаёт директорию для Pangolin клиента (`/opt/pangolin`)
2. Генерирует конфигурационные файлы для Newt
3. Запускает контейнеры через Docker Compose
4. Ожидает подключения к серверу

## Регистрация клиента в Pangolin сервере

После развёртки клиента необходимо зарегистрировать его на сервере через веб-интерфейс Pangolin.

### Доступ к веб-интерфейсу

Откройте веб-интерфейс Pangolin сервера:

```
https://yourdomain.com
```

Войдите используя административные учётные данные, созданные при первоначальной настройке.

### Регистрация клиента

1. Navigate to раздел управления клиентами
2. Создайте нового клиента или найдите существующего
3. Скопируйте конфигурацию клиента (если требуется)
4. Make sure, что клиент авторизован для подключения

### Verification подключения клиента

На локальной машине проверьте логи клиента:

```bash
cd /opt/pangolin
docker-compose logs -f gerbil
```

Вы должны увидеть сообщения о успешном подключении к серверу.

## Verification Wireguard подключения

После регистрации клиента проверьте статус Wireguard туннеля.

### На сервере

Check статус Wireguard на сервере:

```bash
ssh user@your-vps-ip "docker exec gerbil wg show"
```

Вы должны увидеть подключенных клиентов в списке peers.

### На клиенте

Check статус Wireguard на клиенте:

```bash
cd /opt/pangolin
docker exec gerbil wg show
```

Вы должны увидеть активный интерфейс Wireguard и подключение к серверу.

### Verification соединения

Check ping до сервера через туннель:

```bash
ping 10.99.0.1  # IP адрес сервера в Wireguard сети
```

Если ping работает, туннель установлен правильно.

## Configuration маршрутизации портов и доменов

После успешного подключения клиента, можно настроить маршрутизацию портов и доменов.

### Configuration через веб-интерфейс Pangolin

1. Войдите в веб-интерфейс Pangolin
2. Navigate to раздел настройки маршрутизации
3. Добавьте правило для проброса порта/домена:
   - **Внешний домен:** домен, который будет использоваться для доступа
   - **Внутренний адрес:** адрес сервиса на клиентской стороне (например, `service.local:8080`)
   - **Протокол:** HTTP/HTTPS

### Пример конфигурации

Примеры правил маршрутизации:

- `gitlab.local` → `gitlab.code.svc.cluster.local:80`
- `youtrack.local` → `youtrack.code.svc.cluster.local:80`
- `vaultwarden.local` → `vaultwarden.data.svc.cluster.local:80`

### Конфигурация Traefik на сервере

Traefik на сервере автоматически настроен для проксирования запросов через туннель. Make sure, что:

1. Traefik запущен и работает
2. Правила маршрутизации правильно настроены в Pangolin
3. Сертификаты SSL настроены (через Let's Encrypt или вручную)

## Доступ к сервисам через туннель

После настройки маршрутизации, сервисы будут доступны через настроенные домены.

### Verification доступности

Check доступность сервисов:

```bash
# Verification через curl
curl -I https://gitlab.local
curl -I https://youtrack.local
curl -I https://vaultwarden.local
```

### Configuration DNS

Для доступа к сервисам через домены, настройте DNS записи:

**Вариант 1: Использование домена сервера с поддоменами**

```
gitlab.yourdomain.com -> YOUR_VPS_IP
youtrack.yourdomain.com -> YOUR_VPS_IP
vaultwarden.yourdomain.com -> YOUR_VPS_IP
```

**Вариант 2: Использование локального DNS (для разработки)**

Добавьте записи в `/etc/hosts` (или `C:\Windows\System32\drivers\etc\hosts` на Windows):

```
YOUR_VPS_IP gitlab.local
YOUR_VPS_IP youtrack.local
YOUR_VPS_IP vaultwarden.local
```

### Использование Glance для централизованного доступа

После настройки всех сервисов, можно использовать Glance как центральный дашборд:

1. Откройте `glance.local` (или соответствующий домен)
2. Добавьте ссылки на все сервисы
3. Настройте виджеты и кастомизацию

## Configuration SSH туннелей через Pangolin

Pangolin также может использоваться для создания SSH туннелей к сервисам на локальной машине.

### Конфигурация SSH

Роль `client_setup` автоматически настраивает SSH конфигурацию для доступа через туннель.

Check файл `~/.ssh/config`:

```
Host pangolin-tunnel
    HostName yourdomain.com
    User admin
    Port 22
    ProxyCommand ssh -W %h:%p jump-host
    IdentityFile ~/.ssh/id_rsa
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

### Использование SSH туннеля

```bash
# Подключение через туннель
ssh pangolin-tunnel

# Проброс порта через SSH
ssh -L 8080:localhost:8080 pangolin-tunnel
```

## Мониторинг и логирование

### Логи Pangolin клиента

Check логи на локальной машине:

```bash
cd /opt/pangolin
docker-compose logs -f
```

### Логи на сервере

Check логи на сервере:

```bash
ssh user@your-vps-ip "cd /opt/pangolin && docker-compose logs -f"
```

### Статус Wireguard

Check статус соединений:

```bash
# На клиенте
cd /opt/pangolin
docker exec gerbil wg show

# На сервере
ssh user@your-vps-ip "docker exec gerbil wg show"
```

## Troubleshooting

### Issue: Клиент не подключается к серверу

Check логи клиента:

```bash
cd /opt/pangolin
docker-compose logs gerbil
```

Check:
- Правильность домена сервера в конфигурации
- Доступность сервера из сети
- Статус сервера Pangolin

### Issue: Wireguard туннель не работает

Check статус Wireguard:

```bash
docker exec gerbil wg show
```

Make sure, что:
- Порт 51820/UDP открыт в firewall на сервере
- Клиент зарегистрирован на сервере
- Конфигурация Wireguard правильная

### Issue: Домены не резолвятся

Check DNS настройки:

```bash
# Verification DNS резолюции
nslookup gitlab.local
dig gitlab.local

# Verification /etc/hosts
cat /etc/hosts
```

Make sure, что домены правильно настроены в DNS или `/etc/hosts`.

### Issue: Сервисы недоступны через туннель

Check маршрутизацию в Pangolin:

1. Войдите в веб-интерфейс Pangolin
2. Check правила маршрутизации
3. Make sure, что сервисы доступны локально
4. Check логи Traefik на сервере

### Issue: Ошибки SSL сертификатов

Check настройки Let's Encrypt:

```bash
ssh user@your-vps-ip "cd /opt/pangolin && ls -la config/letsencrypt/"
```

Make sure, что:
- Домены правильно настроены
- Порты 80 и 443 открыты
- Let's Encrypt может проверить домен

## Безопасность

### Рекомендации по безопасности

1. **Используйте сильные пароли** для доступа к Pangolin
2. **Ограничьте доступ** к веб-интерфейсу Pangolin (например, через VPN или whitelist IP)
3. **Регулярно обновляйте** компоненты Pangolin
4. **Мониторьте логи** на предмет подозрительной активности
5. **Используйте firewall** для ограничения доступа к портам

### Ротация ключей

Периодически меняйте ключи Wireguard:

1. В веб-интерфейсе Pangolin
2. Перегенерируйте ключи для клиентов
3. Обновите конфигурацию на клиенте
4. Перезапустите клиент

## Next Steps

После успешной настройки Pangolin и Wireguard туннеля:

1. [Настройка сервисов](./services-configuration.md) - первоначальная настройка каждого сервиса
2. [Проверка и мониторинг](./verification.md) - проверка работоспособности всей системы






