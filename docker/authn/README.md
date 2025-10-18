# Authentik

[Guide](https://docs.goauthentik.io/install-config/install/docker-compose/)

Generate secure data:

```bash
echo "PG_PASS=$(openssl rand -base64 36 | tr -d '\n')" >> .env
echo "AUTHENTIK_SECRET_KEY=$(openssl rand -base64 60 | tr -d '\n')" >> .env
```

Enable logging:

```bash
echo "AUTHENTIK_ERROR_REPORTING__ENABLED=true" >> .env
```

Start

```bash
docker compose pull
docker compose up -d
```
