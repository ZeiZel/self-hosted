# Home center

## Services

- 🌐 Caddy — reverse proxy + HTTPS
- 🎯 Dashy — center dashboard
- 🧠 YouTrack — task tracking
- 📊 Grafana + Prometheus — monitoring
- 📦 ELK (Elasticsearch, Logstash, Kibana) — logging
- 🧭 Consul (+ Fabio, Register and Prometheus exporter) — discovery
- 🔑 Vault — secret vault
- 🤫 Vaultwarden - collect passwords
- 💬 Revolt — community (Maybe Matrix Element)
- 🛠 GitLab — CI/CD + Git-repo
- 📝 Notesnook (notesnook-sync-server) — notes
- 🔐 Authentik — SSO authn
- ☁️ Syncthing (or ownCloud if find sync-server) - synchronise data in cloud

## Stack

- k8s
- ansible
- docker (as k8s driver)
- terraform
- vagrant
- Caddy

## How to start

### Prerequisites

```bash
sudo chmod +x ./create-dir.sh
sudo chmod +x ./create-ossl-key.sh
sudo chmod +x ./generate-revolt-config.sh
```

and run

### Locally

For oneline execution, we need node or bun installed on PC and run

```bash
npm run all
```

That's all what we need to run all services locally

### Deployment (WIP)

Requirements:
- At least 2 servers
- Python

## Plans

- [ ] notesnook + server
- [ ] gitlab + ci/cd
- [ ] authentik for SSO by OIDC
- [ ] revolt deploy with all services
- [ ] wrap to k8s
- [ ] automate preconfigure servers with ansible
- [ ] terraform server resources and vagrantifyed server machienes

## Fast docs and links

- [Selfhosted](https://github.com/awesome-selfhosted/awesome-selfhosted?tab=readme-ov-file#database-management)
- [PG connect](https://www.postgresql.org/docs/current/libpq-connect.html#:~:text=The%20URI%20scheme%20designator%20can%20be%20either%20postgresql%3A//%20or%20postgres%3A//.%20Each%20of%20the%20remaining%20URI%20parts%20is%20optional.%20The%20following%20examples%20illustrate%20valid%20URI%20syntax%3A)
- [Deploy notesnook](https://monogr.ph/66add1680f119badfa65686f/)
- [Vars in Caddyfile](https://caddy.community/t/variables-in-caddyfile/15685)
- [Install Gitlab](https://docs.gitlab.com/install/docker/installation/#install-gitlab-by-using-docker-compose)
- [Install Authentik](https://docs.goauthentik.io/docs/install-config/install/docker-compose)
- [Monitoring](https://github.com/Einsteinish/Docker-Compose-Prometheus-and-Grafana/blob/master/docker-compose.yml)
- [Start at ELK](https://habr.com/ru/articles/671344/)
- [Start H-Vault](https://gist.github.com/Mishco/b47b341f852c5934cf736870f0b5da81)
- [Revolt](https://github.com/revoltchat/self-hosted)

## How to?

### get elastic token for kibana auth

Generate inside in running docker container

```bash
docker exec -it elasticsearch bash
# delete old token if exists
bin/elasticsearch-service-tokens delete elastic/kibana kibana-token
# generate new token
bin/elasticsearch-service-tokens create elastic/kibana kibana-token
exit
```

Next you can place it into `kibana.yml` config by `elasticsearch.serviceAccountToken` field OR `ELASTICSEARCH_SERVICEACCOUNTTOKEN` env of Kibana service
