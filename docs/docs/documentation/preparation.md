---
sidebar_position: 1
---

# Подготовка локального устройства

Перед началом развёртки инфраструктуры необходимо подготовить локальное устройство для управления всей системой. На этом устройстве будут устанавливаться инструменты для работы с Ansible, Terraform, Kubernetes и другими компонентами.

## Установка необходимых инструментов

### Ansible

Ansible используется для автоматизации развёртки и настройки серверов.

**macOS:**
```bash
brew install ansible
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install -y ansible
```

**Проверка установки:**
```bash
ansible --version
```

### Terraform

Terraform используется для управления инфраструктурой и генерации inventory файлов.

**macOS:**
```bash
brew install terraform
```

**Linux:**
```bash
# Скачайте последнюю версию с https://www.terraform.io/downloads
wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
unzip terraform_1.6.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/
```

**Проверка установки:**
```bash
terraform --version
```

### kubectl

Kubectl - инструмент командной строки для работы с Kubernetes кластером.

**macOS:**
```bash
brew install kubectl
```

**Linux:**
```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
```

**Проверка установки:**
```bash
kubectl version --client
```

### Helm

Helm - менеджер пакетов для Kubernetes.

**macOS:**
```bash
brew install helm
```

**Linux:**
```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

**Проверка установки:**
```bash
helm version
```

### Helmfile

Helmfile - инструмент для управления множеством Helm charts.

**macOS:**
```bash
brew install helmfile
```

**Linux:**
```bash
wget https://github.com/helmfile/helmfile/releases/download/v0.155.0/helmfile_0.155.0_linux_amd64.tar.gz
tar -xzf helmfile_0.155.0_linux_amd64.tar.gz
sudo mv helmfile /usr/local/bin/
```

**Проверка установки:**
```bash
helmfile version
```

### Helm Secrets Plugin

Плагин для работы с зашифрованными секретами через SOPS.

```bash
helm plugin install https://github.com/jkroepke/helm-secrets
```

**Проверка установки:**
```bash
helm plugin list
```

### GPG и SOPS

GPG используется для шифрования секретов, SOPS - для работы с зашифрованными файлами.

**macOS:**
```bash
brew install gpg sops
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install -y gnupg sops
```

**Проверка установки:**
```bash
gpg --version
sops --version
```

### Docker (опционально)

Docker может использоваться для локальной разработки и тестирования.

**macOS:**
```bash
brew install --cask docker
```

**Linux:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

**Проверка установки:**
```bash
docker --version
```

## Настройка SSH ключей

Для доступа к удалённым серверам необходимо настроить SSH ключи.

### Генерация SSH ключа

Если у вас ещё нет SSH ключа:

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

Следуйте инструкциям и сохраните ключ в стандартном расположении `~/.ssh/id_ed25519`.

### Добавление ключа в SSH агент

**macOS:**
```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

**Linux:**
```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

### Копирование публичного ключа на сервер

После получения доступа к VPS серверу, скопируйте публичный ключ:

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@your-vps-ip
```

Или вручную:

```bash
cat ~/.ssh/id_ed25519.pub | ssh user@your-vps-ip "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

## Настройка GPG ключей для SOPS

SOPS использует GPG для шифрования секретов.

### Генерация GPG ключа

```bash
gpg --full-generate-key
```

Выберите:
- Тип ключа: RSA and RSA (default)
- Размер ключа: 4096
- Срок действия: можно выбрать 0 (без срока)
- Реальное имя и email

### Экспорт публичного ключа

После генерации ключа, экспортируйте его для использования в SOPS:

```bash
gpg --list-secret-keys --keyid-format LONG
```

Найдите строку вида `sec   rsa4096/XXXXXXXXXXXX 2024-01-01`, где `XXXXXXXXXXXX` - это ID ключа.

Экспортируйте публичный ключ:

```bash
gpg --armor --export YOUR_KEY_ID > my-gpg-key.pub
```

Сохраните этот ключ - он понадобится для настройки `.sops.yaml`.

### Настройка GPG_TTY

Для работы GPG в терминале установите переменную окружения:

```bash
echo 'export GPG_TTY=$(tty)' >> ~/.bashrc  # или ~/.zshrc
source ~/.bashrc  # или source ~/.zshrc
```

## Клонирование репозитория

Клонируйте репозиторий проекта:

```bash
git clone https://github.com/your-username/self-hosted.git
cd self-hosted
```

## Настройка .sops.yaml

Создайте файл `.sops.yaml` в корне проекта для автоматической работы с секретами:

```yaml
---
creation_rules:
  - pgp: YOUR_GPG_KEY_ID
```

Замените `YOUR_GPG_KEY_ID` на ID вашего GPG ключа, который вы получили ранее.

Пример файла `.sops.yaml`:
```yaml
---
creation_rules:
  - pgp: 1E89965BF6B3B6D4AA02D096FEB9EA0B2906786F
```

## Проверка доступа к удалённому серверу (VPS)

Перед развёрткой убедитесь, что у вас есть:

1. **IP адрес VPS сервера**
2. **SSH доступ к серверу**
3. **Права root или пользователя с sudo правами**

Проверьте доступ:

```bash
ssh user@your-vps-ip
```

Если подключение успешно, вы готовы к следующему шагу - настройке удалённого устройства.

## Проверка всех установленных инструментов

Убедитесь, что все инструменты установлены правильно:

```bash
echo "=== Проверка установленных инструментов ==="
ansible --version
terraform --version
kubectl version --client
helm version
helmfile version
helm plugin list
gpg --version
sops --version
docker --version  # если установлен
```

Все инструменты должны быть установлены и готовы к работе.

## Следующие шаги

После завершения подготовки локального устройства, переходите к:

1. [Подключение и настройка удалённого устройства](./vps-setup.md) - настройка VPS сервера и развёртка Pangolin





