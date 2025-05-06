mkdir -p -m 750 volumes/{youtrack/{data,logs,backups,conf},gitlab/{config,logs,data},notesnook/data,revolt/data,authentik/{db,media},caddy/{data,config}}
chown -R 13001:13001 ./volumes/youtrack