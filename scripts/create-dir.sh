mkdir -p -m 750 \
  ../volumes/{youtrack/{data,logs,backups,conf}, \
  gitlab/{config,logs,data,var/opt/gitlab,var/log/gitlab,etc/gitlab-runner,var/run/docker.sock}, \
  notesnook/data,revolt/data,authentik/{db,media}, \
  caddy/{data,config}}
sudo chown -R 13001:13001 ../volumes/youtrack
sudo chown -R 65534:65534 ../volumes/prometheus
sudo chown -R 472:472 ../volumes/grafana
