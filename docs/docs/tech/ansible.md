---
sidebar_position: 3
---

# Ansible

А теперь автоматизируем всю подготовку наших серверов к принятию сервисов!

## Роли

### server_security

Роль для базовой безопасности серверов:

- Отключение root логина через SSH
- Создание нового пользователя с sudo правами
- Настройка SSH ключей
- Установка и настройка fail2ban
- Генерация сложных паролей через openssl
- Настройка UFW firewall
- Отключение неиспользуемых сервисов

**Использование:**

```yaml
roles:
  - server_security
```

### kubespray

Роль для автоматической развёртки Kubernetes через kubespray:

- Клонирование kubespray репозитория
- Подготовка inventory для kubespray
- Установка зависимостей (Python, Ansible)
- Настройка сетевых параметров
- Запуск kubespray playbook
- Проверка работоспособности кластера
- Настройка kubeconfig для доступа

**Использование:**

```bash
ansible-playbook playbooks/deploy_local_k8s.yml
```

### client_setup

Роль для настройки клиентских машин:

- Настройка Pangolin клиента
- Конфигурация SSH туннелей через Pangolin
- Настройка безопасного доступа к серверам
- Автоматическая регистрация клиента в Pangolin

**Использование:**

```yaml
roles:
  - client_setup
```

## Playbooks

### deploy_vps.yml

Развёртка Pangolin сервера на VPS с базовой безопасностью.

### deploy_local_k8s.yml

Развёртка Kubernetes кластера на локальном сервере через kubespray.

### deploy_local.yml

Настройка Pangolin клиента на локальной машине.
