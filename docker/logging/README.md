# Logging

```bash
docker compose up setup
docker compose up
```

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
