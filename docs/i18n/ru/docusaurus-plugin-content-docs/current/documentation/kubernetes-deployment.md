---
sidebar_position: 3
---

# Развёртка Kubernetes кластера

На этом этапе мы развернём Kubernetes кластер на локальном сервере, который будет использоваться для запуска всех сервисов.

## Требования к локальному серверу

Минимальные требования для Kubernetes кластера:

- **Master node:**
  - CPU: 2 ядра
  - RAM: 2 GB
  - Диск: 20 GB
  - ОС: Ubuntu 20.04/22.04 или аналогичная

- **Worker node (каждый):**
  - CPU: 4 ядра
  - RAM: 4 GB
  - Диск: 50 GB
  - ОС: Ubuntu 20.04/22.04 или аналогичная

Рекомендуемые требования для production:

- **Master node:**
  - CPU: 4 ядра
  - RAM: 4 GB
  - Диск: 50 GB

- **Worker node (каждый):**
  - CPU: 8 ядер
  - RAM: 16 GB
  - Диск: 100 GB SSD

Для полнофункционального кластера рекомендуется минимум 3 worker узла.

## Настройка inventory для Kubernetes

Перед развёрткой необходимо настроить inventory файл с информацией о узлах кластера.

Откройте файл `ansible/pangolin/inventory/hosts.yml` и добавьте информацию о ваших Kubernetes узлах:

```yaml
all:
  children:
    k8s_masters:
      hosts:
        k8s-master-1:
          ansible_host: 192.168.1.10
          ansible_user: ubuntu
          ip: 192.168.1.10
        # Добавьте дополнительные master узлы для HA
        # k8s-master-2:
        #   ansible_host: 192.168.1.11
        #   ansible_user: ubuntu
        #   ip: 192.168.1.11

    k8s_workers:
      hosts:
        k8s-worker-1:
          ansible_host: 192.168.1.20
          ansible_user: ubuntu
          ip: 192.168.1.20
        k8s-worker-2:
          ansible_host: 192.168.1.21
          ansible_user: ubuntu
          ip: 192.168.1.21
        # Добавьте дополнительные worker узлы
        # k8s-worker-3:
        #   ansible_host: 192.168.1.22
        #   ansible_user: ubuntu
        #   ip: 192.168.1.22
```

### Настройка переменных Kubespray

Также можно настроить параметры Kubespray в секции `vars`:

```yaml
  vars:
    # Kubespray settings
    k8s_cluster_name: "local-cluster"
    kubespray_install_dir: "/opt/kubespray"
    kubespray_version: "release-2.23"
```

## Развёртка Kubernetes через Kubespray

Развёртка выполняется через Ansible playbook, который использует Kubespray для автоматической установки Kubernetes.

### Выполнение развёртки

Перейдите в директорию с Ansible playbooks:

```bash
cd ansible/pangolin
```

Запустите playbook для развёртки Kubernetes:

```bash
ansible-playbook -i inventory/hosts.yml playbooks/deploy_local_k8s.yml
```

Playbook выполнит следующие действия:

1. **Роль `kubespray`:**
   - Клонирование репозитория Kubespray
   - Подготовка inventory для Kubespray
   - Установка зависимостей (Python, Ansible)
   - Настройка сетевых параметров
   - Запуск Kubespray playbook для установки Kubernetes
   - Проверка работоспособности кластера
   - Настройка kubeconfig для доступа

### Процесс развёртки

Развёртка может занять 15-30 минут в зависимости от количества узлов и скорости сети.

Основные этапы:

1. Подготовка узлов (установка пакетов, настройка системы)
2. Установка container runtime (containerd)
3. Установка kubeadm, kubelet, kubectl
4. Инициализация control plane на master узлах
5. Присоединение worker узлов к кластеру
6. Установка сетевого плагина (Calico/Flannel)
7. Установка CoreDNS
8. Проверка работоспособности

### Что делает Kubespray

Kubespray автоматически:

- Настраивает все необходимые компоненты Kubernetes
- Настраивает сетевой плагин для pod-to-pod коммуникации
- Настраивает DNS через CoreDNS
- Настраивает сертификаты для безопасной коммуникации
- Настраивает высокую доступность (если несколько master узлов)

## Проверка кластера

После завершения развёртки, проверьте статус кластера.

### Получение kubeconfig

Kubeconfig файл будет создан на одной из master машин. Скопируйте его на локальную машину:

```bash
scp ubuntu@k8s-master-1:/home/ubuntu/.kube/config ~/.kube/config
```

Или, если playbook настроил доступ автоматически, проверьте файл:

```bash
cat ~/.kube/config
```

### Проверка узлов

Проверьте статус всех узлов:

```bash
kubectl get nodes
```

Все узлы должны быть в статусе `Ready`:

```
NAME            STATUS   ROLES           AGE   VERSION
k8s-master-1    Ready    control-plane   5m    v1.28.0
k8s-worker-1    Ready    <none>          4m    v1.28.0
k8s-worker-2    Ready    <none>          4m    v1.28.0
```

### Проверка системных подов

Проверьте, что все системные поды запущены:

```bash
kubectl get pods --all-namespaces
```

Все поды в namespace `kube-system` должны быть в статусе `Running`:

```
NAMESPACE     NAME                                      READY   STATUS    RESTARTS   AGE
kube-system   calico-kube-controllers-xxx              1/1     Running   0          5m
kube-system   calico-node-xxx                          1/1     Running   0          5m
kube-system   coredns-xxx                              1/1     Running   0          5m
...
```

## Инициализация Helmfile

После успешной развёртки Kubernetes кластера, необходимо инициализировать Helmfile для управления Helm charts.

Перейдите в директорию с Kubernetes конфигурацией:

```bash
cd kubernetes
```

Инициализируйте Helmfile:

```bash
helmfile init --force
```

Эта команда создаст директорию `.helmfile` с необходимыми конфигурационными файлами:

- `.helmfile/repositories.yaml` - список Helm репозиториев
- `.helmfile/environments.yaml.gotmpl` - настройки окружений
- `.helmfile/releases.yaml.gotmpl` - автоматически генерируемый список релизов

## Настройка Gateway API

Некоторые сервисы требуют Gateway API для работы. Установите Gateway API CRDs:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml
```

Проверьте установку:

```bash
kubectl get crd | grep gateway
```

Должны быть созданы CRDs для Gateway API.

## Устранение неполадок

### Проблема: Узлы не в статусе Ready

Проверьте статус узла:

```bash
kubectl describe node k8s-worker-1
```

Проверьте логи kubelet на узле:

```bash
ssh ubuntu@k8s-worker-1 "sudo journalctl -u kubelet -n 50"
```

### Проблема: Поды не запускаются

Проверьте статус подов:

```bash
kubectl get pods --all-namespaces
kubectl describe pod <pod-name> -n <namespace>
```

Проверьте события:

```bash
kubectl get events --sort-by='.lastTimestamp'
```

### Проблема: Нет доступа к кластеру

Проверьте kubeconfig:

```bash
kubectl config view
kubectl cluster-info
```

Убедитесь, что вы можете подключиться к API серверу:

```bash
kubectl get nodes
```

### Проблема: Сетевая связность между подами

Проверьте статус сетевого плагина:

```bash
kubectl get pods -n kube-system | grep calico  # или flannel, в зависимости от плагина
```

Проверьте сетевые политики:

```bash
kubectl get networkpolicies --all-namespaces
```

## Следующие шаги

После успешной развёртки Kubernetes кластера:

1. [Настройка секретов](./secrets-setup.md) - настройка GPG ключей и SOPS для управления секретами





