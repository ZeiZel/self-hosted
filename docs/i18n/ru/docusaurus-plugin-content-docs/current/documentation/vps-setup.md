---
sidebar_position: 2
---

# Подключение и настройка удалённого устройства (VPS)

На этом этапе мы настроим удалённый VPS сервер, на котором будет развёрнут Pangolin сервер для организации Wireguard туннеля и доступа к сервисам.

## Требования к VPS

Минимальные требования для VPS сервера:

- **CPU:** 2 ядра
- **RAM:** 2 GB
- **Диск:** 20 GB SSD
- **ОС:** Ubuntu 20.04/22.04 или Debian 11/12
- **Сеть:** Статический IP адрес
- **Открытые порты:**
  - 22 (SSH)
  - 80 (HTTP)
  - 443 (HTTPS)
  - 51820/UDP (WireGuard)

Рекомендуемые требования для production:

- **CPU:** 4 ядра
- **RAM:** 4 GB
- **Диск:** 40 GB SSD

## Настройка inventory

Перед развёрткой необходимо настроить inventory файл с параметрами вашего VPS.

Откройте файл `ansible/pangolin/inventory/hosts.yml` и настройте секцию `vps`:

```yaml
all:
  children:
    vps:
      hosts:
        pangolin_vps:
          ansible_host: YOUR_VPS_IP_ADDRESS  # Замените на IP вашего VPS
          ansible_user: root  # или другой пользователь с sudo правами
          ansible_port: 22

          pangolin_role: server
          pangolin_domain: "yourdomain.com"  # Ваш домен для Pangolin
          pangolin_admin_email: "admin@yourdomain.com"  # Email администратора
```

### Настройка переменных

Также можно настроить глобальные переменные в том же файле (секция `vars`):

```yaml
  vars:
    pangolin_version: "latest"
    gerbil_version: "latest"
    traefik_version: "v3.4.0"

    pangolin_install_dir: "/opt/pangolin"

    wireguard_network: "10.99.0.0/24"
    wireguard_server_ip: "10.99.0.1"
    wireguard_port: 51820

    # Security settings
    new_user_name: "admin"
    fail2ban_dest_email: "admin@yourdomain.com"
    fail2ban_ssh_maxretry: 5
    fail2ban_ssh_bantime: 3600
    fail2ban_ssh_findtime: 600
```

## Развёртка Pangolin сервера на VPS

Развёртка выполняется через Ansible playbook, который автоматически:

1. Настраивает базовую безопасность сервера
2. Устанавливает необходимые пакеты
3. Устанавливает Docker
4. Развёртывает Pangolin сервер
5. Настраивает firewall

### Выполнение развёртки

Перейдите в директорию с Ansible playbooks:

```bash
cd ansible/pangolin
```

Запустите playbook для развёртки VPS:

```bash
ansible-playbook -i inventory/hosts.yml playbooks/deploy_vps.yml
```

Playbook выполнит следующие роли:

- `server_security` - настройка безопасности (отключение root SSH, создание нового пользователя, настройка fail2ban, firewall)
- `common` - установка базовых пакетов, настройка системы
- `docker` - установка Docker
- `pangolin_server` - развёртка Pangolin сервера

### Что делает playbook

1. **Настройка безопасности:**
   - Создание нового пользователя с sudo правами
   - Настройка SSH ключей
   - Настройка fail2ban для защиты от брутфорса
   - Настройка UFW firewall
   - Открытие необходимых портов

2. **Установка системных пакетов:**
   - Обновление системы
   - Установка необходимых пакетов (curl, gnupg, python3-pip, ufw, wireguard)
   - Настройка sysctl для WireGuard (IP forwarding)

3. **Установка Docker:**
   - Установка Docker CE
   - Добавление пользователя в группу docker
   - Настройка Docker Compose

4. **Развёртка Pangolin:**
   - Создание директорий для Pangolin (`/opt/pangolin`)
   - Генерация конфигурационных файлов
   - Развёртка через Docker Compose
   - Ожидание готовности сервиса

## Проверка работы Pangolin

После завершения развёртки, проверьте статус контейнеров:

```bash
ssh user@your-vps-ip "cd /opt/pangolin && docker-compose ps"
```

Должны быть запущены контейнеры:
- `pangolin` - основной сервис Pangolin
- `gerbil` - WireGuard сервер
- `traefik` - reverse proxy

Проверьте логи Pangolin:

```bash
ssh user@your-vps-ip "cd /opt/pangolin && docker-compose logs pangolin"
```

## Начальная настройка Pangolin через веб-интерфейс

После успешной развёртки Pangolin, необходимо выполнить первоначальную настройку через веб-интерфейс.

1. **Откройте веб-интерфейс:**

Перейдите по адресу: `https://yourdomain.com/auth/initial-setup`

Или, если домен ещё не настроен, по IP: `https://YOUR_VPS_IP`

2. **Выполните первоначальную настройку:**

- Создайте административный аккаунт
- Настройте базовые параметры
- Сохраните конфигурацию

3. **Проверьте доступность API:**

```bash
curl https://yourdomain.com/api/v1/
```

Должен вернуться ответ от API Pangolin.

## Проверка Wireguard туннеля

После настройки Pangolin, можно проверить статус WireGuard:

```bash
ssh user@your-vps-ip "docker exec gerbil wg show"
```

Вы должны увидеть интерфейс WireGuard с настройками сервера.

### Настройка DNS записи

Для работы с доменом, настройте DNS запись:

**A запись:**
```
yourdomain.com -> YOUR_VPS_IP
```

**Или, если используете поддомен:**
```
pangolin.yourdomain.com -> YOUR_VPS_IP
```

После настройки DNS подождите несколько минут для распространения изменений.

## Устранение неполадок

### Проблема: Pangolin не запускается

Проверьте логи:

```bash
ssh user@your-vps-ip "cd /opt/pangolin && docker-compose logs"
```

Проверьте доступность портов:

```bash
ssh user@your-vps-ip "sudo netstat -tulpn | grep -E '3001|51820|80|443'"
```

### Проблема: Не могу подключиться по HTTPS

Убедитесь, что:
- Домен правильно настроен в DNS
- Порты 80 и 443 открыты в firewall
- Traefik запущен и работает

Проверьте логи Traefik:

```bash
ssh user@your-vps-ip "cd /opt/pangolin && docker-compose logs traefik"
```

### Проблема: WireGuard не работает

Проверьте статус WireGuard:

```bash
ssh user@your-vps-ip "docker exec gerbil wg show"
```

Убедитесь, что порт 51820/UDP открыт:

```bash
ssh user@your-vps-ip "sudo ufw status | grep 51820"
```

## Следующие шаги

После успешной настройки VPS и Pangolin сервера:

1. [Развёртка Kubernetes кластера](./kubernetes-deployment.md) - настройка локального Kubernetes кластера для сервисов





