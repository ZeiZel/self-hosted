#!/bin/bash
# Скрипт для синхронизации секретов из _all.yaml в Vault
# Использование: ./vault-sync-secrets.sh [service-name]
# Если service-name не указан, синхронизируются все сервисы

set -e

VAULT_ADDR="${VAULT_ADDR:-http://vault.service.svc.cluster.local:8200}"
VAULT_NAMESPACE="${VAULT_NAMESPACE:-service}"
SECRETS_FILE="${SECRETS_FILE:-$(dirname "$0")/../envs/k8s/secrets/_all.yaml}"

# Проверка наличия SOPS
if ! command -v sops &> /dev/null; then
    echo "ОШИБКА: SOPS не установлен. Установите SOPS для работы с зашифрованными секретами."
    exit 1
fi

# Проверка доступности Vault
echo "Проверка доступности Vault..."
if ! kubectl exec -n ${VAULT_NAMESPACE} deployment/vault -- vault status > /dev/null 2>&1; then
    echo "ОШИБКА: Vault недоступен. Убедитесь, что Vault запущен в namespace ${VAULT_NAMESPACE}"
    exit 1
fi

echo "Vault доступен. Продолжаем синхронизацию..."

# Функция для загрузки секретов в Vault
sync_secrets_to_vault() {
    local service=$1
    shift
    local secrets=("$@")
    
    if [ ${#secrets[@]} -eq 0 ]; then
        echo "Предупреждение: Нет секретов для сервиса ${service}"
        return
    fi
    
    echo ""
    echo "=== Синхронизация секретов для сервиса: ${service} ==="
    
    # Формирование команды для Vault
    local vault_cmd="vault kv put secret/${service}/secrets"
    
    for secret_pair in "${secrets[@]}"; do
        local key=$(echo "$secret_pair" | cut -d'=' -f1)
        local value=$(echo "$secret_pair" | cut -d'=' -f2-)
        # Экранирование специальных символов
        value=$(echo "$value" | sed "s/'/\\\'/g")
        vault_cmd="${vault_cmd} ${key}='${value}'"
    done
    
    # Загрузка секретов в Vault
    kubectl exec -n ${VAULT_NAMESPACE} deployment/vault -- sh -c "${vault_cmd}" || {
        echo "ОШИБКА: Не удалось загрузить секреты для ${service}"
        return 1
    }
    
    echo "Секреты для ${service} успешно загружены в Vault"
}

# Декодирование секретов из _all.yaml
echo "Декодирование секретов из ${SECRETS_FILE}..."
DECODED_SECRETS=$(sops -d "${SECRETS_FILE}" 2>/dev/null || {
    echo "ОШИБКА: Не удалось декодировать секреты. Проверьте, что файл зашифрован с помощью SOPS и у вас есть правильный ключ."
    exit 1
})

# Извлечение секретов из YAML
# Используем grep и sed для извлечения значений (работает без yq)
extract_secret() {
    local key=$1
    # Ищем строку с ключом и извлекаем значение после двоеточия
    echo "$DECODED_SECRETS" | grep -E "^\s*${key}:" | sed -E "s/^\s*${key}:\s*(.*)/\1/" | sed "s/^['\"]//" | sed "s/['\"]$//" || echo ""
}

# Маппинг секретов к сервисам
declare -A SERVICE_SECRETS

# Authentik
SERVICE_SECRETS["authentik"]="authentikSecret authentikBootstrapPassword authentikBootstrapToken authentikLdapPassword authentikSamlCert"

# Vaultwarden
SERVICE_SECRETS["vaultwarden"]="vaultwardenEmail vaultwardenPassword"

# Notesnook
SERVICE_SECRETS["notesnook"]="notesnookSecret"

# Stalwart
SERVICE_SECRETS["stalwart"]="stalwartLdapPassword"

# YouTrack
SERVICE_SECRETS["youtrack"]="youtrackGitlabToken"

# GitLab
SERVICE_SECRETS["gitlab"]="gitlabToken gitlabRunnerToken"

# Nextcloud
SERVICE_SECRETS["nextcloud"]="nextcloudAdminPassword"

# MongoDB
SERVICE_SECRETS["mongodb"]="mongoPassword"

# PostgreSQL
SERVICE_SECRETS["postgres"]="postgresPassword pgadminPassword"

# MinIO
SERVICE_SECRETS["minio"]="minioAccessKey minioSecretKey"

# Penpot
SERVICE_SECRETS["penpot"]="penpotApiSecretKey"

# Monitoring (Grafana)
SERVICE_SECRETS["monitoring"]="grafanaPassword"

# Общие секреты (могут использоваться несколькими сервисами)
# SMTP - используется многими сервисами, добавляем в каждый, который может использовать
SERVICE_SECRETS["authentik"]="${SERVICE_SECRETS[authentik]} smtpUsername smtpPassword"
SERVICE_SECRETS["vaultwarden"]="${SERVICE_SECRETS[vaultwarden]} smtpUsername smtpPassword"
SERVICE_SECRETS["stalwart"]="${SERVICE_SECRETS[stalwart]} smtpUsername smtpPassword"

# OIDC - используется для аутентификации
SERVICE_SECRETS["authentik"]="${SERVICE_SECRETS[authentik]} oidcClientId oidcClientSecret"

# Domain - общий для всех сервисов
for service in "${!SERVICE_SECRETS[@]}"; do
    SERVICE_SECRETS["$service"]="${SERVICE_SECRETS[$service]} domain ingressDomain"
done

# Функция для синхронизации конкретного сервиса
sync_service() {
    local service=$1
    local secret_keys=${SERVICE_SECRETS[$service]}
    
    if [ -z "$secret_keys" ]; then
        echo "Предупреждение: Нет маппинга секретов для сервиса ${service}"
        return
    fi
    
    local secrets_array=()
    for key in $secret_keys; do
        local value=$(extract_secret "$key")
        if [ -n "$value" ] && [ "$value" != "null" ]; then
            secrets_array+=("${key}=${value}")
        fi
    done
    
    if [ ${#secrets_array[@]} -gt 0 ]; then
        sync_secrets_to_vault "$service" "${secrets_array[@]}"
    else
        echo "Предупреждение: Нет секретов для сервиса ${service} в файле секретов"
    fi
}

# Основная логика
if [ -n "$1" ]; then
    # Синхронизация конкретного сервиса
    SERVICE=$1
    if [ -z "${SERVICE_SECRETS[$SERVICE]}" ]; then
        echo "ОШИБКА: Неизвестный сервис: ${SERVICE}"
        echo "Доступные сервисы: ${!SERVICE_SECRETS[@]}"
        exit 1
    fi
    sync_service "$SERVICE"
else
    # Синхронизация всех сервисов
    echo "=== Синхронизация всех сервисов ==="
    for service in "${!SERVICE_SECRETS[@]}"; do
        sync_service "$service"
    done
fi

echo ""
echo "=== Синхронизация завершена ==="
echo ""
echo "Проверка секретов в Vault:"
echo "  kubectl exec -n ${VAULT_NAMESPACE} deployment/vault -- vault kv get secret/<service-name>/secrets"

