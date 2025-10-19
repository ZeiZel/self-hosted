# Vaultwarden

[Reference](https://github.com/vineethmn/vaultwarden-docker-compose)

Build `.env` with filled parameters from `.env.example`

Gen passwd for admin token and pass into env

```bash
echo "ADMIN_TOKEN=$(openssl rand -base64 48 | tr -d '\n' )" >> .env
```

Start compose

```bash
dokcer compose up
```
