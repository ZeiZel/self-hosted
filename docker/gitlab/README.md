# Gitlab

Change version in `docker-compose.yml`

```YML
gitlab/gitlab-ee:<version>-ee.0
```

Create `HOME`

```bash
sudo mkdir -p /srv/gitlab
export GITLAB_HOME=/srv/gitlab
```

Start

```bash
docker compose up
```
