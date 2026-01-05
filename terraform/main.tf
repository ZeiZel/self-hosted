# Terraform configuration for managing local infrastructure
# This configuration manages local servers and clients for self-hosted infrastructure

# Generate Ansible inventory from Terraform variables
resource "local_file" "ansible_inventory" {
  content = templatefile("${path.module}/templates/inventory.yml.tpl", {
    k8s_masters = local.k8s_masters
    k8s_workers = local.k8s_workers
    local_clients = var.local_clients
  })
  filename = var.ansible_inventory_path
}

# Prepare local servers for Kubernetes deployment
resource "null_resource" "prepare_local_servers" {
  count = length(var.local_servers)
  
  triggers = {
    server_config = jsonencode(var.local_servers[count.index])
  }

  provisioner "local-exec" {
    command = <<-EOT
      echo "Preparing local server: ${var.local_servers[count.index].name}"
      # Verify SSH connectivity
      ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
        -i ${var.local_servers[count.index].ssh_key} \
        ${var.local_servers[count.index].ssh_user}@${var.local_servers[count.index].ip_address} \
        "echo 'Connection successful'"
    EOT
  }
}

# Prepare local clients
resource "null_resource" "prepare_local_clients" {
  count = length(var.local_clients)
  
  triggers = {
    client_config = jsonencode(var.local_clients[count.index])
  }

  provisioner "local-exec" {
    command = <<-EOT
      echo "Preparing local client: ${var.local_clients[count.index].name}"
      # Verify SSH connectivity
      ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
        -i ${var.local_clients[count.index].ssh_key} \
        ${var.local_clients[count.index].ssh_user}@${var.local_clients[count.index].ip_address} \
        "echo 'Connection successful'"
    EOT
  }
}

# Legacy AWS instance (kept for backward compatibility)
# Can be removed if not needed
# provider "aws" {
#   region = "us-east-1"
# }
#
# resource "aws_instance" "dev" {
#   ami           = "ami-0c02fb55956c7d316" # Ubuntu 20.04
#   instance_type = "t2.micro"
#
#   tags = {
#     Name = "TerraformDev"
#   }
# }
