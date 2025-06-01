sudo mkdir -p -m 750 \
  ${PWD}/volumes/{youtrack/{data,logs,backups,conf}, \
  gitlab/{config,logs,data,var/opt/gitlab,var/log/gitlab,etc/gitlab-runner,var/run/docker.sock}, \
  notesnook/data,revolt/data,authentik/{db,media}, \
  caddy/{data,config}}
sudo chown -R 13001:13001 ${PWD}/volumes/youtrack
sudo chown -R 65534:65534 ${PWD}/volumes/prometheus
sudo chown -R 472:472 ${PWD}/volumes/grafana
sudo chown -R 1000:1000 ${PWD}/volumes/elasticsearch
