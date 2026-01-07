#!/bin/bash
# Скрипт для миграции секретов из Kubernetes Secrets в Vault
# Использование: ./vault-migrate-secrets.sh [service-name]

set -e

VAULT_ADDR="${VAULT_ADDR:-http://vault.service.svc.cluster.local:8200}"
VAULT_NAMESPACE="${VAULT_NAMESPACE:-service}"

# Функция для создания секрета в Vault
create_vault_secret() {
    local service=$1
    local path=$2
    local data=$3
    
    echo "Создание секрета: secret/data/${service}/${path}"
    kubectl exec -n ${VAULT_NAMESPACE} deployment/vault -- sh -c "
vault kv put secret/${service}/${path} ${data}
"
}

# Функция для миграции секрета из Kubernetes Secret
migrate_k8s_secret() {
    local namespace=$1
    local secret_name=$2
    local service=$3
    local path=$4
    
    echo ""
    echo "=== Миграция секрета ${secret_name} из namespace ${namespace} ==="
    
    # Получение данных из Kubernetes Secret
    local secret_data=$(kubectl get secret -n ${namespace} ${secret_name} -o json | jq -r '.data')
    
    if [ -z "$secret_data" ] || [ "$secret_data" = "null" ]; then
        echo "Предупреждение: Secret ${secret_name} не найден в namespace ${namespace}"
        return
    fi
    
    # Преобразование данных в формат для Vault
    local vault_data=""
    for key in $(echo "$secret_data" | jq -r 'keys[]'); do
        local value=$(echo "$secret_data" | jq -r ".[\"${key}\"]" | base64 -d)
        # Экранирование специальных символов
        value=$(echo "$value" | sed "s/'/\\\'/g")
        vault_data="${vault_data} ${key}='${value}'"
    done
    
    create_vault_secret "${service}" "${path}" "${vault_data}"
}

# Миграция секретов для конкретного сервиса или всех
if [ -n "$1" ]; then
    SERVICE=$1
    echo "Миграция секретов для сервиса: ${SERVICE}"
    
    case $SERVICE in
        authentik)
            migrate_k8s_secret "service" "authentik-secrets" "authentik" "secrets"
            ;;
        vaultwarden)
            migrate_k8s_secret "data" "vaultwarden-secrets" "vaultwarden" "secrets"
            ;;
        stoat|revolt)
            migrate_k8s_secret "social" "revolt-secrets" "stoat" "secrets"
            ;;
        nextcloud)
            migrate_k8s_secret "data" "nextcloud-secrets" "nextcloud" "secrets"
            ;;
        stalwart)
            migrate_k8s_secret "social" "stalwart-secrets" "stalwart" "secrets"
            ;;
        notesnook)
            migrate_k8s_secret "productivity" "notesnook-env" "notesnook" "secrets"
            ;;
        gitlab)
            migrate_k8s_secret "code" "gitlab-secrets" "gitlab" "secrets"
            ;;
        teamcity)
            migrate_k8s_secret "code" "teamcity-secrets" "teamcity" "secrets"
            ;;
        youtrack)
            migrate_k8s_secret "code" "youtrack-secrets" "youtrack" "secrets"
            ;;
        excalidraw)
            migrate_k8s_secret "productivity" "excalidraw-secrets" "excalidraw" "secrets"
            ;;
        bytebase)
            migrate_k8s_secret "infrastructure" "bytebase-secrets" "bytebase" "secrets"
            ;;
        *)
            echo "Неизвестный сервис: ${SERVICE}"
            echo "Доступные сервисы: authentik, vaultwarden, stoat, nextcloud, stalwart, notesnook, gitlab, teamcity, youtrack, excalidraw, bytebase"
            exit 1
            ;;
    esac
else
    echo "=== Миграция всех секретов ==="
    echo "Для миграции конкретного сервиса используйте: $0 <service-name>"
    echo ""
    echo "Доступные сервисы:"
    echo "  - authentik"
    echo "  - vaultwarden"
    echo "  - stoat"
    echo "  - nextcloud"
    echo "  - stalwart"
    echo "  - notesnook"
    echo "  - gitlab"
    echo "  - teamcity"
    echo "  - youtrack"
    echo "  - excalidraw"
    echo "  - bytebase"
    echo ""
    echo "Пример: $0 authentik"
fi

echo ""
echo "=== Миграция завершена ==="

