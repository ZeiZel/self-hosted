# Ansible

На один из серверов нужно установить proxmox, чтобы поднять на виртуалках k8s кластер

Roles:
- [x] setup_host
- [x] setup_server
  - gateway
  - master
  - node
- [x] docker
- [ ] security
- [ ] kubespray
- [ ] infrastructure
  - base
    - namespace
    - traefik
    - vault
    - consul
  - apps
    - stoat
    - swalwart
    - youtrack
    - hub
    - teamcity
    - authentik
    - vaultwarden
- [ ] pangolin
  - gateway
  - node
