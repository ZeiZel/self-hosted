#!/bin/bash

set -euo pipefail

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Переменные для управления этапами
SKIP_TERRAFORM=false
SKIP_ANSIBLE=false
SKIP_K8S=false
SKIP_GPG=false
NON_INTERACTIVE=false
TERRAFORM_ONLY=false
ANSIBLE_ONLY=false
K8S_ONLY=false

# Пути к директориям проекта (относительно скрипта)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
TERRAFORM_DIR="${PROJECT_ROOT}/terraform"
ANSIBLE_DIR="${PROJECT_ROOT}/ansible/pangolin"
K8S_DIR="${PROJECT_ROOT}/kubernetes"

# Логирование
LOG_FILE="${PROJECT_ROOT}/install.log"
exec 1> >(tee -a "${LOG_FILE}")
exec 2> >(tee -a "${LOG_FILE}" >&2)

# Функции для вывода
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Функция помощи
show_help() {
    cat << EOF
Использование: $0 [OPTIONS]

Автоматизированная установка инфраструктуры с использованием Terraform, Ansible и Kubernetes.

OPTIONS:
    --terraform-only       Выполнить только Terraform
    --ansible-only         Выполнить только Ansible
    --k8s-only             Выполнить только Kubernetes deployment
    --skip-terraform       Пропустить Terraform
    --skip-ansible         Пропустить Ansible
    --skip-k8s             Пропустить Kubernetes
    --skip-gpg             Пропустить настройку GPG/SOPS
    --non-interactive      Неинтерактивный режим (использовать существующие конфиги)
    --help                 Показать эту справку

Примеры:
    $0                                    # Полная интерактивная установка
    $0 --skip-terraform                  # Пропустить Terraform, использовать существующий inventory
    $0 --terraform-only                  # Выполнить только Terraform
    $0 --non-interactive                 # Использовать существующие конфиги без вопросов

EOF
}

# Парсинг аргументов командной строки
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --terraform-only)
                TERRAFORM_ONLY=true
                SKIP_ANSIBLE=true
                SKIP_K8S=true
                shift
                ;;
            --ansible-only)
                ANSIBLE_ONLY=true
                SKIP_TERRAFORM=true
                SKIP_K8S=true
                shift
                ;;
            --k8s-only)
                K8S_ONLY=true
                SKIP_TERRAFORM=true
                SKIP_ANSIBLE=true
                shift
                ;;
            --skip-terraform)
                SKIP_TERRAFORM=true
                shift
                ;;
            --skip-ansible)
                SKIP_ANSIBLE=true
                shift
                ;;
            --skip-k8s)
                SKIP_K8S=true
                shift
                ;;
            --skip-gpg)
                SKIP_GPG=true
                shift
                ;;
            --non-interactive)
                NON_INTERACTIVE=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                log_error "Неизвестный аргумент: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Проверка зависимостей
check_dependencies() {
    log_info "Проверка зависимостей..."
    
    local missing_deps=()
    local deps=("terraform" "ansible" "kubectl" "helm" "helmfile" "gpg" "sops" "ssh")
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing_deps+=("$dep")
        fi
    done
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_error "Отсутствуют следующие зависимости: ${missing_deps[*]}"
        log_info "Инструкции по установке:"
        log_info "  macOS: brew install terraform ansible kubectl helm gpg sops"
        log_info "  Linux: см. документацию в docs/docs/documentation/preparation.md"
        exit 1
    fi
    
    log_success "Все зависимости установлены"
}

# Валидация IP адреса
validate_ip() {
    local ip=$1
    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        IFS='.' read -ra ADDR <<< "$ip"
        for i in "${ADDR[@]}"; do
            if [[ $i -gt 255 ]]; then
                return 1
            fi
        done
        return 0
    fi
    return 1
}

# Валидация SSH ключа
validate_ssh_key() {
    local key_path=$1
    if [ ! -f "$key_path" ]; then
        # Попробуем расширить ~
        key_path="${key_path/#\~/$HOME}"
        if [ ! -f "$key_path" ]; then
            return 1
        fi
    fi
    # Проверка прав доступа
    local perms=$(stat -f "%OLp" "$key_path" 2>/dev/null || stat -c "%a" "$key_path" 2>/dev/null)
    if [ "$perms" != "600" ] && [ "$perms" != "400" ]; then
        log_warning "SSH ключ должен иметь права 600 или 400. Текущие права: $perms"
        read -p "Исправить права автоматически? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            chmod 600 "$key_path"
            log_success "Права исправлены"
        fi
    fi
    echo "$key_path"
}

# Проверка SSH подключения
check_ssh_connection() {
    local user=$1
    local ip=$2
    local key=$3
    
    log_info "Проверка SSH подключения к ${user}@${ip}..."
    
    if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -i "$key" "${user}@${ip}" "echo 'Connection successful'" &> /dev/null; then
        log_success "SSH подключение успешно"
        return 0
    else
        log_error "Не удалось подключиться к ${user}@${ip}"
        return 1
    fi
}

# Глобальные массивы для хранения информации о серверах
declare -a LOCAL_SERVERS=()
declare -a LOCAL_CLIENTS=()
declare -a VPS_SERVERS=()

# Интерактивный сбор информации о локальных серверах
collect_local_servers() {
    if [ "$NON_INTERACTIVE" = true ]; then
        log_info "Неинтерактивный режим: пропуск сбора информации о серверах"
        return 0
    fi
    
    local servers=()
    
    log_info "Сбор информации о локальных серверах (K8s masters/workers)..."
    log_info "Нажмите Enter без ввода, чтобы завершить добавление серверов"
    
    while true; do
        echo
        read -p "Добавить локальный сервер? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            break
        fi
        
        read -p "Имя сервера: " name
        [ -z "$name" ] && continue
        
        read -p "IP адрес: " ip
        if ! validate_ip "$ip"; then
            log_error "Неверный IP адрес"
            continue
        fi
        
        read -p "SSH пользователь: " user
        [ -z "$user" ] && continue
        
        read -p "Путь к SSH ключу [~/.ssh/id_rsa]: " key
        key=${key:-~/.ssh/id_rsa}
        key=$(validate_ssh_key "$key")
        if [ $? -ne 0 ]; then
            log_error "SSH ключ не найден: $key"
            continue
        fi
        
        read -p "Роль (master/worker) [worker]: " role
        role=${role:-worker}
        if [ "$role" != "master" ] && [ "$role" != "worker" ]; then
            log_warning "Неверная роль, используется worker"
            role="worker"
        fi
        
        read -p "Hostname [${name}.local]: " hostname
        hostname=${hostname:-${name}.local}
        
        # Проверка SSH подключения
        if check_ssh_connection "$user" "$ip" "$key"; then
            servers+=("${name}|${hostname}|${ip}|${role}|${user}|${key}")
            log_success "Сервер $name добавлен"
        else
            log_warning "Сервер $name не добавлен из-за проблем с SSH"
            read -p "Продолжить без проверки? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                servers+=("${name}|${hostname}|${ip}|${role}|${user}|${key}")
            fi
        fi
    done
    
    # Сохранение в глобальную переменную
    LOCAL_SERVERS=("${servers[@]}")
    
    if [ ${#LOCAL_SERVERS[@]} -eq 0 ]; then
        log_info "Локальные серверы не добавлены"
    else
        log_success "Добавлено локальных серверов: ${#LOCAL_SERVERS[@]}"
    fi
}

# Интерактивный сбор информации о локальных клиентах
collect_local_clients() {
    if [ "$NON_INTERACTIVE" = true ]; then
        log_info "Неинтерактивный режим: пропуск сбора информации о клиентах"
        return 0
    fi
    
    local clients=()
    
    log_info "Сбор информации о локальных клиентах (dev machines)..."
    
    while true; do
        echo
        read -p "Добавить локальный клиент? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            break
        fi
        
        read -p "Имя клиента: " name
        [ -z "$name" ] && continue
        
        read -p "IP адрес: " ip
        if ! validate_ip "$ip"; then
            log_error "Неверный IP адрес"
            continue
        fi
        
        read -p "SSH пользователь: " user
        [ -z "$user" ] && continue
        
        read -p "Путь к SSH ключу [~/.ssh/id_rsa]: " key
        key=${key:-~/.ssh/id_rsa}
        key=$(validate_ssh_key "$key")
        if [ $? -ne 0 ]; then
            log_error "SSH ключ не найден: $key"
            continue
        fi
        
        read -p "Hostname [${name}.local]: " hostname
        hostname=${hostname:-${name}.local}
        
        # Проверка SSH подключения
        if check_ssh_connection "$user" "$ip" "$key"; then
            clients+=("${name}|${hostname}|${ip}|${user}|${key}")
            log_success "Клиент $name добавлен"
        else
            log_warning "Клиент $name не добавлен из-за проблем с SSH"
            read -p "Продолжить без проверки? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                clients+=("${name}|${hostname}|${ip}|${user}|${key}")
            fi
        fi
    done
    
    LOCAL_CLIENTS=("${clients[@]}")
    
    if [ ${#LOCAL_CLIENTS[@]} -eq 0 ]; then
        log_info "Локальные клиенты не добавлены"
    else
        log_success "Добавлено локальных клиентов: ${#LOCAL_CLIENTS[@]}"
    fi
}

# Интерактивный сбор информации о VPS серверах
collect_vps_servers() {
    if [ "$NON_INTERACTIVE" = true ]; then
        log_info "Неинтерактивный режим: пропуск сбора информации о VPS"
        return 0
    fi
    
    local vps_servers=()
    
    log_info "Сбор информации о VPS серверах (для Pangolin)..."
    
    while true; do
        echo
        read -p "Добавить VPS сервер? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            break
        fi
        
        read -p "Имя сервера: " name
        [ -z "$name" ] && continue
        
        read -p "IP адрес: " ip
        if ! validate_ip "$ip"; then
            log_error "Неверный IP адрес"
            continue
        fi
        
        read -p "SSH пользователь: " user
        [ -z "$user" ] && continue
        
        read -p "Путь к SSH ключу [~/.ssh/id_rsa]: " key
        key=${key:-~/.ssh/id_rsa}
        key=$(validate_ssh_key "$key")
        if [ $? -ne 0 ]; then
            log_error "SSH ключ не найден: $key"
            continue
        fi
        
        read -p "Домен для Pangolin (опционально): " domain
        read -p "Email администратора (опционально): " email
        
        # Проверка SSH подключения
        if check_ssh_connection "$user" "$ip" "$key"; then
            vps_servers+=("${name}|${ip}|${user}|${key}|${domain}|${email}")
            log_success "VPS сервер $name добавлен"
        else
            log_warning "VPS сервер $name не добавлен из-за проблем с SSH"
            read -p "Продолжить без проверки? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                vps_servers+=("${name}|${ip}|${user}|${key}|${domain}|${email}")
            fi
        fi
    done
    
    VPS_SERVERS=("${vps_servers[@]}")
    
    if [ ${#VPS_SERVERS[@]} -eq 0 ]; then
        log_info "VPS серверы не добавлены"
    else
        log_success "Добавлено VPS серверов: ${#VPS_SERVERS[@]}"
    fi
}

# Настройка GPG/SOPS
setup_gpg_sops() {
    if [ "$SKIP_GPG" = true ]; then
        log_info "Пропуск настройки GPG/SOPS"
        return 0
    fi
    
    log_info "Настройка GPG/SOPS..."
    
    # Проверка существующих ключей
    local gpg_keys=$(gpg --list-secret-keys --keyid-format LONG 2>/dev/null | grep -E "^sec" | head -1)
    
    if [ -z "$gpg_keys" ]; then
        log_warning "GPG ключ не найден"
        if [ "$NON_INTERACTIVE" = false ]; then
            read -p "Создать новый GPG ключ? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                log_info "Создание GPG ключа..."
                log_info "Следуйте инструкциям на экране"
                gpg --full-generate-key
                gpg_keys=$(gpg --list-secret-keys --keyid-format LONG 2>/dev/null | grep -E "^sec" | head -1)
            else
                log_warning "Пропуск создания GPG ключа. Убедитесь, что ключ настроен вручную."
                return 0
            fi
        else
            log_warning "Неинтерактивный режим: пропуск создания GPG ключа"
            return 0
        fi
    fi
    
    # Извлечение ID ключа
    local key_id=$(echo "$gpg_keys" | grep -oE "[A-F0-9]{40}")
    
    if [ -z "$key_id" ]; then
        log_error "Не удалось извлечь ID GPG ключа"
        return 1
    fi
    
    log_success "Найден GPG ключ: $key_id"
    
    # Настройка .sops.yaml
    local sops_file="${K8S_DIR}/.sops.yaml"
    if [ ! -f "$sops_file" ] || ! grep -q "$key_id" "$sops_file" 2>/dev/null; then
        log_info "Настройка .sops.yaml..."
        cat > "$sops_file" << EOF
---
creation_rules:
  - pgp: ${key_id}
EOF
        log_success ".sops.yaml настроен"
    else
        log_info ".sops.yaml уже настроен"
    fi
    
    # Проверка наличия файла секретов
    local secrets_file="${K8S_DIR}/envs/k8s/secrets/_all.yaml"
    if [ ! -f "$secrets_file" ]; then
        log_warning "Файл секретов не найден: $secrets_file"
        log_info "Создание пустого файла секретов..."
        mkdir -p "$(dirname "$secrets_file")"
        echo "secrets:" > "$secrets_file"
        sops -e -i "$secrets_file" 2>/dev/null || log_warning "Не удалось зашифровать файл секретов. Убедитесь, что SOPS настроен правильно."
    fi
    
    log_success "GPG/SOPS настроен"
}

# Генерация terraform.tfvars
generate_terraform_config() {
    log_info "Генерация конфигурации Terraform..."
    
    local tfvars_file="${TERRAFORM_DIR}/terraform.tfvars"
    local tfvars_backup="${TERRAFORM_DIR}/terraform.tfvars.backup"
    
    # Резервное копирование существующего файла
    if [ -f "$tfvars_file" ]; then
        log_info "Создание резервной копии существующего terraform.tfvars..."
        cp "$tfvars_file" "$tfvars_backup"
    fi
    
    # Генерация конфигурации
    cat > "$tfvars_file" << 'EOF'
# Terraform configuration generated by install.sh
# DO NOT EDIT MANUALLY - this file will be overwritten by install.sh

local_servers = [
EOF
    
    # Добавление локальных серверов
    if [ ${#LOCAL_SERVERS[@]} -eq 0 ]; then
        log_info "Нет локальных серверов для добавления в Terraform"
    else
        for server in "${LOCAL_SERVERS[@]}"; do
            IFS='|' read -r name hostname ip role user key <<< "$server"
            # Расширение ~ в пути к ключу
            key="${key/#\~/$HOME}"
            cat >> "$tfvars_file" << EOF
  {
    name       = "${name}"
    hostname   = "${hostname}"
    ip_address = "${ip}"
    role       = "${role}"
    ssh_user   = "${user}"
    ssh_key    = "${key}"
  },
EOF
        done
    fi
    
    cat >> "$tfvars_file" << 'EOF'
]

local_clients = [
EOF
    
    # Добавление локальных клиентов
    if [ ${#LOCAL_CLIENTS[@]} -eq 0 ]; then
        log_info "Нет локальных клиентов для добавления в Terraform"
    else
        for client in "${LOCAL_CLIENTS[@]}"; do
            IFS='|' read -r name hostname ip user key <<< "$client"
            # Расширение ~ в пути к ключу
            key="${key/#\~/$HOME}"
            cat >> "$tfvars_file" << EOF
  {
    name       = "${name}"
    hostname   = "${hostname}"
    ip_address = "${ip}"
    ssh_user   = "${user}"
    ssh_key    = "${key}"
  },
EOF
        done
    fi
    
    cat >> "$tfvars_file" << 'EOF'
]
EOF
    
    log_success "Конфигурация Terraform сгенерирована: $tfvars_file"
}

# Обновление Ansible inventory для VPS
update_ansible_inventory_vps() {
    if [ ${#VPS_SERVERS[@]} -eq 0 ]; then
        log_info "Нет VPS серверов для обновления inventory"
        return 0
    fi
    
    log_info "Обновление Ansible inventory для VPS..."
    
    local inventory_file="${ANSIBLE_DIR}/inventory/hosts.yml"
    local inventory_backup="${ANSIBLE_DIR}/inventory/hosts.yml.backup"
    
    # Создание директории, если не существует
    mkdir -p "$(dirname "$inventory_file")"
    
    # Резервное копирование
    if [ -f "$inventory_file" ]; then
        cp "$inventory_file" "$inventory_backup"
        log_info "Создана резервная копия: $inventory_backup"
    fi
    
    # Если файл не существует, создаем базовую структуру
    if [ ! -f "$inventory_file" ]; then
        cat > "$inventory_file" << 'EOF'
all:
  children:
    vps:
      hosts:
    local:
      hosts:
    k8s_masters:
      hosts:
    k8s_workers:
      hosts:
    clients:
      hosts:
  vars:
    pangolin_version: "latest"
    gerbil_version: "latest"
EOF
    fi
    
    # Простое обновление: добавляем VPS серверы в секцию vps
    # Более сложная логика потребует yq или python
    local temp_file=$(mktemp)
    
    # Копируем все до секции vps
    awk '/^    vps:/{exit}1' "$inventory_file" > "$temp_file" 2>/dev/null || head -1 "$inventory_file" > "$temp_file" 2>/dev/null || echo "all:" > "$temp_file"
    
    # Добавляем секцию VPS
    echo "    vps:" >> "$temp_file"
    echo "      hosts:" >> "$temp_file"
    
    for vps in "${VPS_SERVERS[@]}"; do
        IFS='|' read -r name ip user key domain email <<< "$vps"
        key="${key/#\~/$HOME}"
        echo "        ${name}:" >> "$temp_file"
        echo "          ansible_host: ${ip}" >> "$temp_file"
        echo "          ansible_user: ${user}" >> "$temp_file"
        echo "          ansible_port: 22" >> "$temp_file"
        echo "          ansible_ssh_private_key_file: ${key}" >> "$temp_file"
        echo "" >> "$temp_file"
        echo "          pangolin_role: server" >> "$temp_file"
        if [ -n "$domain" ] && [ "$domain" != "" ]; then
            echo "          pangolin_domain: \"${domain}\"" >> "$temp_file"
        else
            echo "          pangolin_domain: \"yourdomain.com\"" >> "$temp_file"
        fi
        if [ -n "$email" ] && [ "$email" != "" ]; then
            echo "          pangolin_admin_email: \"${email}\"" >> "$temp_file"
        else
            echo "          pangolin_admin_email: \"admin@yourdomain.com\"" >> "$temp_file"
        fi
        echo "" >> "$temp_file"
    done
    
    # Добавляем остальную часть файла после секции vps (если есть)
    if grep -q "^    local:" "$inventory_file" 2>/dev/null; then
        awk '/^    local:/{p=1} p' "$inventory_file" >> "$temp_file" 2>/dev/null
    else
        # Добавляем базовую структуру, если её нет
        cat >> "$temp_file" << 'EOF'
    local:
      hosts:
    k8s_masters:
      hosts:
    k8s_workers:
      hosts:
    clients:
      hosts:
  vars:
    pangolin_version: "latest"
    gerbil_version: "latest"
EOF
    fi
    
    mv "$temp_file" "$inventory_file"
    
    log_success "Ansible inventory обновлен для VPS"
}

# Выполнение Terraform
run_terraform() {
    if [ "$SKIP_TERRAFORM" = true ]; then
        log_info "Пропуск Terraform"
        return 0
    fi
    
    log_info "Запуск Terraform..."
    
    cd "$TERRAFORM_DIR"
    
    # Инициализация
    log_info "Инициализация Terraform..."
    if ! terraform init; then
        log_error "Ошибка инициализации Terraform"
        return 1
    fi
    
    # Планирование
    log_info "Планирование изменений Terraform..."
    if [ "$NON_INTERACTIVE" = false ]; then
        terraform plan
        echo
        read -p "Применить изменения Terraform? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_warning "Применение Terraform отменено"
            return 0
        fi
    fi
    
    # Применение
    log_info "Применение изменений Terraform..."
    if ! terraform apply -auto-approve; then
        log_error "Ошибка применения Terraform"
        return 1
    fi
    
    log_success "Terraform выполнен успешно"
    
    # Проверка генерации inventory
    local inventory_file="${ANSIBLE_DIR}/inventory/hosts.yml"
    if [ -f "$inventory_file" ]; then
        log_success "Ansible inventory сгенерирован: $inventory_file"
    else
        log_warning "Ansible inventory не найден после Terraform"
    fi
}

# Выполнение Ansible playbooks
run_ansible() {
    if [ "$SKIP_ANSIBLE" = true ]; then
        log_info "Пропуск Ansible"
        return 0
    fi
    
    log_info "Запуск Ansible playbooks..."
    
    cd "$ANSIBLE_DIR"
    
    # Проверка inventory
    local inventory_file="${ANSIBLE_DIR}/inventory/hosts.yml"
    if [ ! -f "$inventory_file" ]; then
        log_error "Ansible inventory не найден: $inventory_file"
        log_info "Запустите Terraform сначала или создайте inventory вручную"
        return 1
    fi
    
    # Deploy local (базовая настройка)
    # Проверяем наличие хостов в inventory, а не только в массивах
    local has_local_hosts=false
    if command -v ansible-inventory &> /dev/null; then
        if ansible-inventory -i inventory/hosts.yml --list 2>/dev/null | grep -q "local\|clients"; then
            has_local_hosts=true
        fi
    fi
    # Если ansible-inventory недоступен, проверяем массивы
    if [ "$has_local_hosts" = false ] && ([ ${#LOCAL_SERVERS[@]} -gt 0 ] || [ ${#LOCAL_CLIENTS[@]} -gt 0 ]); then
        has_local_hosts=true
    fi
    
    if [ "$has_local_hosts" = true ]; then
        log_info "Выполнение deploy_local.yml..."
        if ! ansible-playbook -i inventory/hosts.yml playbooks/deploy_local.yml; then
            log_error "Ошибка выполнения deploy_local.yml"
            return 1
        fi
        log_success "deploy_local.yml выполнен"
    else
        log_info "Нет локальных хостов для deploy_local.yml"
    fi
    
    # Deploy local K8s (если есть k8s серверы)
    # Проверяем наличие k8s хостов в inventory
    local has_k8s=false
    if command -v ansible-inventory &> /dev/null; then
        if ansible-inventory -i inventory/hosts.yml --list 2>/dev/null | grep -q "k8s_masters\|k8s_workers"; then
            has_k8s=true
        fi
    fi
    
    # Также проверяем массивы на случай, если inventory еще не обновлен
    if [ "$has_k8s" = false ]; then
        for server in "${LOCAL_SERVERS[@]}"; do
            IFS='|' read -r name hostname ip role user key <<< "$server"
            if [ "$role" = "master" ] || [ "$role" = "worker" ]; then
                has_k8s=true
                break
            fi
        done
    fi
    
    if [ "$has_k8s" = true ]; then
        log_info "Выполнение deploy_local_k8s.yml..."
        if [ "$NON_INTERACTIVE" = false ]; then
            read -p "Развернуть Kubernetes кластер? Это может занять 15-30 минут. (y/n) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_warning "Развёртка Kubernetes отменена"
                return 0
            fi
        fi
        
        if ! ansible-playbook -i inventory/hosts.yml playbooks/deploy_local_k8s.yml; then
            log_error "Ошибка выполнения deploy_local_k8s.yml"
            return 1
        fi
        log_success "deploy_local_k8s.yml выполнен"
    fi
    
    # Deploy VPS (если есть VPS серверы)
    # Проверяем наличие VPS хостов в inventory
    local has_vps=false
    if command -v ansible-inventory &> /dev/null; then
        if ansible-inventory -i inventory/hosts.yml --list 2>/dev/null | grep -q "vps"; then
            has_vps=true
        fi
    fi
    
    # Также проверяем массив
    if [ "$has_vps" = false ] && [ ${#VPS_SERVERS[@]} -gt 0 ]; then
        has_vps=true
    fi
    
    if [ "$has_vps" = true ]; then
        log_info "Выполнение deploy_vps.yml..."
        if ! ansible-playbook -i inventory/hosts.yml playbooks/deploy_vps.yml; then
            log_error "Ошибка выполнения deploy_vps.yml"
            return 1
        fi
        log_success "deploy_vps.yml выполнен"
    else
        log_info "Нет VPS серверов для deploy_vps.yml"
    fi
    
    log_success "Все Ansible playbooks выполнены успешно"
}

# Развёртка Kubernetes сервисов
deploy_kubernetes() {
    if [ "$SKIP_K8S" = true ]; then
        log_info "Пропуск развёртки Kubernetes"
        return 0
    fi
    
    log_info "Развёртка Kubernetes сервисов..."
    
    cd "$K8S_DIR"
    
    # Проверка доступа к кластеру
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Не удалось подключиться к Kubernetes кластеру"
        log_info "Убедитесь, что:"
        log_info "  1. Kubernetes кластер развёрнут через Ansible"
        log_info "  2. kubeconfig настроен правильно (~/.kube/config)"
        return 1
    fi
    
    log_success "Подключение к Kubernetes кластеру установлено"
    
    # Инициализация helmfile
    log_info "Инициализация Helmfile..."
    if ! helmfile init --force; then
        log_error "Ошибка инициализации Helmfile"
        return 1
    fi
    log_success "Helmfile инициализирован"
    
    # Установка Gateway API
    log_info "Установка Gateway API CRDs..."
    if ! kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml; then
        log_error "Ошибка установки Gateway API"
        return 1
    fi
    log_success "Gateway API установлен"
    
    # Настройка Vault (если скрипт существует)
    local vault_setup_script="${K8S_DIR}/scripts/vault-setup.sh"
    if [ -f "$vault_setup_script" ]; then
        log_info "Настройка Vault..."
        if [ "$NON_INTERACTIVE" = false ]; then
            read -p "Настроить Vault? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                bash "$vault_setup_script" || log_warning "Ошибка настройки Vault (можно настроить позже)"
            fi
        else
            bash "$vault_setup_script" || log_warning "Ошибка настройки Vault (можно настроить позже)"
        fi
    fi
    
    # Развёртка базовой инфраструктуры
    log_info "Развёртка базовой инфраструктуры через Helmfile..."
    if [ "$NON_INTERACTIVE" = false ]; then
        read -p "Развернуть все сервисы? Это может занять некоторое время. (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_warning "Развёртка сервисов отменена"
            return 0
        fi
    fi
    
    if ! helmfile -e k8s apply; then
        log_error "Ошибка развёртки через Helmfile"
        return 1
    fi
    
    log_success "Kubernetes сервисы развёрнуты успешно"
    
    # Показ статуса
    log_info "Статус развёрнутых сервисов:"
    kubectl get pods --all-namespaces | head -20
}

# Главная функция
main() {
    log_info "=== Автоматизированная установка инфраструктуры ==="
    log_info "Лог файл: $LOG_FILE"
    echo
    
    # Парсинг аргументов
    parse_args "$@"
    
    # Проверка зависимостей
    check_dependencies
    
    # Сбор информации о серверах
    if [ "$SKIP_TERRAFORM" = false ] && [ "$NON_INTERACTIVE" = false ]; then
        collect_local_servers
        collect_local_clients
        collect_vps_servers
    fi
    
    # Настройка GPG/SOPS
    if [ "$TERRAFORM_ONLY" = false ] && [ "$ANSIBLE_ONLY" = false ]; then
        setup_gpg_sops
    fi
    
    # Terraform
    if [ "$SKIP_TERRAFORM" = false ]; then
        # Генерируем конфигурацию только если есть серверы для добавления
        if [ "$NON_INTERACTIVE" = false ]; then
            if [ ${#LOCAL_SERVERS[@]} -gt 0 ] || [ ${#LOCAL_CLIENTS[@]} -gt 0 ]; then
                generate_terraform_config
            fi
            if [ ${#VPS_SERVERS[@]} -gt 0 ]; then
                update_ansible_inventory_vps
            fi
        else
            # В неинтерактивном режиме проверяем существующие конфиги
            if [ ! -f "${TERRAFORM_DIR}/terraform.tfvars" ]; then
                log_warning "terraform.tfvars не найден. Пропуск Terraform."
            else
                log_info "Использование существующего terraform.tfvars"
            fi
        fi
        run_terraform
    fi
    
    # Ansible
    if [ "$SKIP_ANSIBLE" = false ]; then
        run_ansible
    fi
    
    # Kubernetes
    if [ "$SKIP_K8S" = false ]; then
        deploy_kubernetes
    fi
    
    log_success "=== Установка завершена ==="
    log_info "Проверьте логи в файле: $LOG_FILE"
}

# Запуск главной функции
main "$@"
