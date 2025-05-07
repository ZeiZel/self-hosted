mkdir -p -m 750 volumes/{youtrack/{data,logs,backups,conf},gitlab/{config,logs,data,var/opt/gitlab,var/log/gitlab,etc/gitlab-runner,var/run/docker.sock},notesnook/data,revolt/data,authentik/{db,media},caddy/{data,config}}
chown -R 13001:13001 ./volumes/youtrack
