output "local_servers" {
  description = "Information about configured local servers"
  value = {
    masters = local.k8s_masters
    workers = local.k8s_workers
  }
}

output "local_clients" {
  description = "Information about configured local clients"
  value = var.local_clients
}

output "ansible_inventory_updated" {
  description = "Ansible inventory has been updated"
  value       = true
}





