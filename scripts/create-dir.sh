sudo mkdir -p -m 750 ${PWD}/volumes/gitlab/{config,logs,data,var/opt/gitlab,var/log/gitlab,etc/gitlab-runner,var/run/docker.sock}
sudo mkdir -p -m 750 ${PWD}/volumes/notesnook/data
sudo mkdir -p -m 750 ${PWD}/volumes/revolt/data
sudo mkdir -p -m 750 ${PWD}/volumes/caddy/{data,config}
sudo mkdir -p -m 750 ${PWD}/volumes/authentik/{db,media}
sudo mkdir -p -m 750 ${PWD}/volumes/youtrack/{data,logs,backups,conf}
sudo mkdir -p -m 750 ${PWD}/volumes/prometheus
sudo mkdir -p -m 750 ${PWD}/volumes/grafana
sudo mkdir -p -m 750 ${PWD}/volumes/elasticsearch

sudo chown -R 998:998 {$PWD}/volumes/gitlab
sudo chown -R 13001:13001 ${PWD}/volumes/youtrack
sudo chown -R 65534:65534 ${PWD}/volumes/prometheus
sudo chown -R 472:472 ${PWD}/volumes/grafana
sudo chown -R 1000:1000 ${PWD}/volumes/elasticsearch

# on macos docker have no access to any folder
# sudo chmod -R 777 ~/projects/self-hosted/volumes
