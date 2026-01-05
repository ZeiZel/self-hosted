---
sidebar_position: 1
---

# Kubernetes

## Multi-cluster setup через Pangolin

Проект поддерживает связь локального и удалённого Kubernetes кластеров через Pangolin VPN.

### Pangolin Client в Kubernetes

Чарт `pangolin-client` позволяет развернуть Pangolin клиента внутри Kubernetes кластера для автоматического подключения к удалённому Pangolin серверу.

**Установка:**

```bash
helm install pangolin-client ./charts/pangolin-client -n infrastructure
```

### Service Discovery между кластерами

Интеграция с Consul позволяет использовать service discovery между локальным и удалённым кластерами через Pangolin VPN.

## Новые сервисы

### Devtron

Kubernetes dashboard и CI/CD платформа с интеграцией ArgoCD, Trivy и Grafana.

### Bytebase

Управление схемами баз данных и версионирование изменений.

### Harbor

Container registry с поддержкой безопасности и сканирования образов.

### Glance

Современный дашборд (замена Dashy) для централизованного доступа ко всем сервисам.
