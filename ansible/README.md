# Ansible automation

- setup_host
- server
- docker
- pangolin
- kubespray
- apps
  - infrastructure
  - services
- backup

## Последовательность действий

- [ ] Установить Proxmox на удалённый/локальный сервер
- [ ] Загрузить туда руками образ с Ubuntu
- [ ] поднять руками Ubuntu (установка)
- [ ] Настроить подключение к ethernet или wifi (netplan пропуск сети через gateway в виде proxmox)
- [ ] Проверить подключение к ним с хоста (если gateway на `192.168.100.`, то берём id хоста и устанавливаем: `192.168.100.102` для id 102)
- [ ] поставить kubespray на машины
- [ ] связать их в один кластер
- [ ] установить на отдельной машине OpenEBS
- [ ] установить backup сервис Velero
- [ ] поднять базовые сервисы (namespace + traefik + pangolin)
- [ ] перейти к VPS и настроить его
- [ ] поднять pangolin на удалённом сервере
- [ ] проверить туннель от сервера до VPS
