locals {
  # Group servers by role
  k8s_masters = [for server in var.local_servers : server if server.role == "master"]
  k8s_workers = [for server in var.local_servers : server if server.role == "worker"]
  
  # All local machines
  all_local_machines = concat(var.local_servers, var.local_clients)
}





