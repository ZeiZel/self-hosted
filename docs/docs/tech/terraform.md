---
sidebar_position: 4
---

# Terraform

Terraform используется для управления инфраструктурой, включая локальные машины.

## Управление локальными машинами

Terraform конфигурация поддерживает управление локальными серверами и клиентами:

- Локальные серверы (Kubernetes master/worker nodes)
- Локальные клиенты (разработческие машины)
- Автоматическая генерация Ansible inventory

## Конфигурация

Создайте файл `terraform.tfvars` на основе `terraform.tfvars.example`:

```hcl
local_servers = [
  {
    name       = "k8s-master-1"
    hostname   = "k8s-master-1.local"
    ip_address = "192.168.1.10"
    role       = "master"
    ssh_user   = "admin"
    ssh_key    = "~/.ssh/id_rsa"
  }
]

local_clients = [
  {
    name       = "dev-machine-1"
    hostname   = "dev-machine-1.local"
    ip_address = "192.168.1.20"
    ssh_user   = "developer"
    ssh_key    = "~/.ssh/id_rsa"
  }
]
```

## Использование

```bash
# Инициализация
terraform init

# Планирование
terraform plan

# Применение
terraform apply

# Обновление Ansible inventory
terraform apply -auto-approve
```

Terraform автоматически обновит Ansible inventory файл на основе конфигурации.
