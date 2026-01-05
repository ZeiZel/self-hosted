all:
  children:
    k8s_masters:
      hosts:
%{ for master in k8s_masters ~}
        ${master.name}:
          ansible_host: ${master.ip_address}
          ansible_user: ${master.ssh_user}
          ansible_ssh_private_key_file: ${master.ssh_key}
          k8s_role: master
%{ endfor ~}

    k8s_workers:
      hosts:
%{ for worker in k8s_workers ~}
        ${worker.name}:
          ansible_host: ${worker.ip_address}
          ansible_user: ${worker.ssh_user}
          ansible_ssh_private_key_file: ${worker.ssh_key}
          k8s_role: worker
%{ endfor ~}

    clients:
      hosts:
%{ for client in local_clients ~}
        ${client.name}:
          ansible_host: ${client.ip_address}
          ansible_user: ${client.ssh_user}
          ansible_ssh_private_key_file: ${client.ssh_key}
%{ endfor ~}





