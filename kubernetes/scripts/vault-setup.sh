#!/bin/bash
# Скрипт для настройки Vault для работы с Kubernetes и миграции секретов
# Использование: ./vault-setup.sh

set -e

VAULT_ADDR="${VAULT_ADDR:-http://vault.service.svc.cluster.local:8200}"
VAULT_NAMESPACE="${VAULT_NAMESPACE:-service}"

echo "=== Настройка Vault для Kubernetes ==="

# Проверка доступности Vault
echo "Проверка доступности Vault..."
if ! kubectl exec -n ${VAULT_NAMESPACE} deployment/vault -- vault status > /dev/null 2>&1; then
    echo "ОШИБКА: Vault недоступен. Убедитесь, что Vault запущен в namespace ${VAULT_NAMESPACE}"
    exit 1
fi

echo "Vault доступен. Продолжаем настройку..."

# 1. Включение Kubernetes auth method
echo ""
echo "1. Включение Kubernetes auth method..."
kubectl exec -n ${VAULT_NAMESPACE} deployment/vault -- vault auth enable kubernetes || echo "Kubernetes auth уже включен"

# 2. Получение токена ServiceAccount для Vault
echo ""
echo "2. Настройка Kubernetes auth..."
KUBERNETES_HOST=$(kubectl config view --raw --minify --flatten -o jsonpath='{.clusters[].cluster.server}')
KUBERNETES_CA_CERT=$(kubectl config view --raw --minify --flatten -o jsonpath='{.clusters[].cluster.certificate-authority-data}' | base64 -d)
SA_TOKEN=$(kubectl -n ${VAULT_NAMESPACE} get secret $(kubectl -n ${VAULT_NAMESPACE} get sa vault -o jsonpath='{.secrets[0].name}') -o jsonpath='{.data.token}' | base64 -d)

# Настройка Kubernetes auth
kubectl exec -n ${VAULT_NAMESPACE} deployment/vault -- sh -c "
vault write auth/kubernetes/config \
    token_reviewer_jwt=\"${SA_TOKEN}\" \
    kubernetes_host=\"${KUBERNETES_HOST}\" \
    kubernetes_ca_cert=\"${KUBERNETES_CA_CERT}\"
"

# 3. Включение KV secrets engine (если еще не включен)
echo ""
echo "3. Включение KV secrets engine..."
kubectl exec -n ${VAULT_NAMESPACE} deployment/vault -- vault secrets enable -path=secret kv-v2 || echo "KV engine уже включен"

# 4. Создание policies для сервисов
echo ""
echo "4. Создание policies для сервисов..."

# Функция для создания policy
create_policy() {
    local service=$1
    local policy_name=$2
    
    echo "Создание policy для ${service}..."
    kubectl exec -n ${VAULT_NAMESPACE} deployment/vault -- sh -c "
vault policy write ${policy_name} - <<EOF
path \"secret/data/${service}/*\" {
  capabilities = [\"read\"]
}
EOF
" || echo "Policy ${policy_name} уже существует"
}

# 5. Создание ролей для Kubernetes auth
echo ""
echo "5. Создание ролей для Kubernetes auth..."

create_role() {
    local service=$1
    local service_account=$2
    local namespace=$3
    local policy=$4
    
    echo "Создание роли для ${service} (ServiceAccount: ${service_account}, Namespace: ${namespace})..."
    kubectl exec -n ${VAULT_NAMESPACE} deployment/vault -- sh -c "
vault write auth/kubernetes/role/${service} \
    bound_service_account_names=${service_account} \
    bound_service_account_namespaces=${namespace} \
    policies=${policy} \
    ttl=1h
" || echo "Роль ${service} уже существует"
}

# Маппинг сервисов: service_name -> [service_account, namespace, vault_policy]
# Исключаем базовые сервисы: namespaces, traefik, consul, vault
declare -A SERVICE_MAP=(
    ["authentik"]="authentik service authentik"
    ["vaultwarden"]="vaultwarden data vaultwarden"
    ["stoat"]="revolt social stoat"
    ["owncloud"]="owncloud data owncloud"
    ["stalwart"]="stalwart social stalwart"
    ["notesnook"]="notesnook-server productivity notesnook"
    ["gitlab"]="gitlab code gitlab"
    ["teamcity"]="teamcity code teamcity"
    ["youtrack"]="youtrack code youtrack"
    ["excalidraw"]="excalidraw productivity excalidraw"
    ["bytebase"]="bytebase infrastructure bytebase"
    ["hub"]="hub code hub"
    ["penpot"]="penpot productivity penpot"
    ["valkey"]="valkey db valkey"
    ["postgres"]="postgres db postgres"
    ["minio"]="minio db minio"
    ["mongodb"]="mongodb db mongodb"
    ["monitoring"]="monitoring service monitoring"
    ["glance"]="glance infrastructure glance"
    ["devtron"]="devtron devtroncd devtron"
    ["harbor"]="harbor infrastructure harbor"
    ["pangolin-client"]="pangolin-client infrastructure pangolin-client"
    ["syncthing"]="syncthing data syncthing"
    ["cert-manager"]="cert-manager service cert-manager"
)

# Создание policies и ролей для всех сервисов
for service in "${!SERVICE_MAP[@]}"; do
    IFS=' ' read -r service_account namespace policy <<< "${SERVICE_MAP[$service]}"
    
    # Создание policy
    create_policy "${service}" "${policy}"
    
    # Создание роли
    create_role "${service}" "${service_account}" "${namespace}" "${policy}"
done

echo ""
echo "=== Настройка Vault завершена ==="
echo ""
echo "Следующие шаги:"
echo "1. Создайте секреты в Vault используя скрипт vault-migrate-secrets.sh"
echo "2. Обновите deployment файлы, включив vault.enabled: true в values.yaml"
echo "3. Примените изменения через helmfile"

