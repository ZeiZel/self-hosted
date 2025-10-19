# Stalwart mailer

[Guide](https://stalw.art/docs/cluster/orchestration/docker-swarm)

Complete mail server

Start with swarm

```bash
docker node update --label-add mail=true <NODE-ID>
docker stack deploy -c docker-compose.yml stalwart-mail
docker stack ps stalwart-mail
```
