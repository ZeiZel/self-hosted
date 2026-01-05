---
sidebar_position: 4
---

# Configuration Secrets

Все секреты в проекте управляются через SOPS (Secrets Operations) с использованием GPG для шифрования. Это обеспечивает безопасное хранение паролей, токенов и других чувствительных данных в репозитории.

## Configuration GPG ключей для SOPS

Если вы ещё не настроили GPG ключи, следуйте инструкциям из раздела [Подготовка локального устройства](./preparation.md#настройка-gpg-ключей-для-sops).

### Verification существующих ключей

Check список ваших GPG ключей:

```bash
gpg --list-secret-keys --keyid-format LONG
```

Вы должны увидеть ваш ключ. Найдите строку вида:

```
sec   rsa4096/1E89965BF6B3B6D4AA02D096FEB9EA0B2906786F 2024-01-01
```

Где `1E89965BF6B3B6D4AA02D096FEB9EA0B2906786F` - это ID вашего ключа.

### Configuration .sops.yaml

Make sure, что файл `.sops.yaml` в корне проекта содержит ID вашего GPG ключа:

```yaml
---
creation_rules:
  - pgp: YOUR_GPG_KEY_ID
```

Замените `YOUR_GPG_KEY_ID` на ID вашего ключа.

## Редактирование Secrets

Секреты хранятся в файле `kubernetes/envs/k8s/secrets/_all.yaml`, который зашифрован через SOPS.

### Открытие файла для редактирования

Для редактирования секретов используйте `helm secrets edit`:

```bash
cd kubernetes
helm secrets edit envs/k8s/secrets/_all.yaml
```

Эта команда:
1. Расшифрует файл используя ваш GPG ключ
2. Откроет его в редакторе (определяется переменной `$EDITOR`)
3. После сохранения автоматически зашифрует файл обратно

### Альтернативный способ (sops)

Можно использовать sops напрямую:

```bash
cd kubernetes
sops envs/k8s/secrets/_all.yaml
```

Make sure, что переменная `GPG_TTY` установлена:

```bash
export GPG_TTY=$(tty)
```

### Структура файла Secrets

Файл `_all.yaml` имеет следующую структуру:

```yaml
secrets:
  # Authentik секреты
  authentikSecret: ENC[...]
  authentikBootstrapPassword: ENC[...]
  authentikBootstrapToken: ENC[...]
  authentikLdapPassword: ENC[...]
  authentikSamlCert: ENC[...]

  # SMTP секреты
  smtpUsername: ENC[...]
  smtpPassword: ENC[...]

  # GitLab секреты
  gitlabToken: ENC[...]
  gitlabRunnerToken: ENC[...]

  # Базы данных
  postgresPassword: ENC[...]
  pgadminPassword: ENC[...]
  mongoPassword: ENC[...]

  # Секреты сервисов
  vaultwardenEmail: ENC[...]
  vaultwardenPassword: ENC[...]
  grafanaPassword: ENC[...]
  notesnookSecret: ENC[...]
  stalwartLdapPassword: ENC[...]
  youtrackGitlabToken: ENC[...]
  owncloudAdminPassword: ENC[...]
  penpotApiSecretKey: ENC[...]

  # MinIO
  minioAccessKey: ENC[...]
  minioSecretKey: ENC[...]

  # Домены
  domain: ENC[...]
  ingressDomain: ENC[...]
```

### Добавление нового секрета

1. Откройте файл для редактирования:

```bash
helm secrets edit envs/k8s/secrets/_all.yaml
```

2. Добавьте новый секрет в секцию `secrets`:

```yaml
secrets:
  myNewSecret: "my-secret-value"
```

3. Сохраните файл - SOPS автоматически зашифрует значение.

### Редактирование существующего секрета

1. Откройте файл для редактирования:

```bash
helm secrets edit envs/k8s/secrets/_all.yaml
```

2. Найдите нужный секрет и измените его значение (уже расшифрованное):

```yaml
secrets:
  vaultwardenPassword: "new-password-here"
```

3. Сохраните файл - SOPS автоматически зашифрует новое значение.

## Структура Secrets для каждого сервиса

Ниже приведены основные секреты, которые требуются для каждого сервиса:

### Authentik

- `authentikSecret` - секретный ключ для подписи токенов
- `authentikBootstrapPassword` - пароль для начальной загрузки
- `authentikBootstrapToken` - токен для начальной загрузки
- `authentikLdapPassword` - пароль для LDAP подключения
- `authentikSamlCert` - сертификат для SAML

### Базы данных

- `postgresPassword` - пароль суперпользователя PostgreSQL
- `pgadminPassword` - пароль для pgAdmin
- `mongoPassword` - пароль для MongoDB

### GitLab

- `gitlabToken` - токен API GitLab
- `gitlabRunnerToken` - токен для GitLab Runner

### Vaultwarden

- `vaultwardenEmail` - email администратора
- `vaultwardenPassword` - пароль администратора

### Мониторинг

- `grafanaPassword` - пароль администратора Grafana

### Notesnook

- `notesnookSecret` - секретный ключ для Notesnook

### Stalwart

- `stalwartLdapPassword` - пароль для LDAP подключения

### YouTrack

- `youtrackGitlabToken` - токен для интеграции с GitLab

### OwnCloud

- `owncloudAdminPassword` - пароль администратора

### Penpot

- `penpotApiSecretKey` - секретный ключ API

### MinIO

- `minioAccessKey` - ключ доступа
- `minioSecretKey` - секретный ключ

### SMTP

- `smtpUsername` - имя пользователя SMTP
- `smtpPassword` - пароль SMTP

### Домены

- `domain` - основной домен
- `ingressDomain` - домен для ingress

## Синхронизация Secrets с Vault

После развёртки Vault (см. [Развёртка базовой инфраструктуры](./infrastructure-deployment.md)), секреты можно синхронизировать с Vault для централизованного управления.

### Использование скрипта синхронизации

Скрипт `vault-sync-secrets.sh` синхронизирует секреты из `_all.yaml` в Vault:

```bash
cd kubernetes/scripts
chmod +x vault-sync-secrets.sh
./vault-sync-secrets.sh
```

Для синхронизации конкретного сервиса:

```bash
./vault-sync-secrets.sh vaultwarden
./vault-sync-secrets.sh authentik
```

### Что делает скрипт

1. Расшифровывает секреты из `_all.yaml` используя SOPS
2. Загружает секреты в Vault по пути `secret/<service>/secrets`
3. Секреты доступны сервисам через Vault Agent Injector

### Verification синхронизации

После синхронизации проверьте секреты в Vault:

```bash
kubectl exec -n service deployment/vault -- vault kv get secret/vaultwarden/secrets
```

## Безопасность

### Хранение GPG ключей

- Храните приватный GPG ключ в безопасном месте
- Не коммитьте приватный ключ в репозиторий
- Используйте ключ с парольной фразой
- Регулярно делайте резервные копии ключей

### Ротация Secrets

Рекомендуется регулярно менять секреты:

1. Откройте файл для редактирования
2. Измените значения секретов
3. Сохраните файл
4. Синхронизируйте с Vault (если используется)
5. Перезапустите сервисы для применения изменений

### Множественные ключи

Для командной работы можно использовать несколько GPG ключей:

```yaml
---
creation_rules:
  - pgp: >-
      KEY1_ID,
      KEY2_ID,
      KEY3_ID
```

Все указанные ключи смогут расшифровывать и шифровать файлы.

## Troubleshooting

### Issue: Не могу расшифровать файл

Check, что ваш GPG ключ доступен:

```bash
gpg --list-secret-keys
```

Check, что ключ указан в `.sops.yaml`:

```bash
cat .sops.yaml
```

### Issue: GPG_TTY не установлена

Установите переменную окружения:

```bash
export GPG_TTY=$(tty)
echo 'export GPG_TTY=$(tty)' >> ~/.bashrc  # или ~/.zshrc
```

### Issue: SOPS не может найти ключ

Check метаданные файла:

```bash
sops envs/k8s/secrets/_all.yaml --metadata
```

Make sure, что ваш ключ указан в метаданных.

## Next Steps

После настройки секретов:

1. [Развёртка базовой инфраструктуры](./infrastructure-deployment.md) - развёртка базовых сервисов (Traefik, Consul, Vault)


