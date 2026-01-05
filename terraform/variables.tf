variable "local_servers" {
  description = "List of local servers (Kubernetes nodes)"
  type = list(object({
    name        = string
    hostname    = string
    ip_address  = string
    role        = string # master or worker
    ssh_user    = string
    ssh_key     = string
  }))
  default = []
}

variable "local_clients" {
  description = "List of local client machines"
  type = list(object({
    name        = string
    hostname    = string
    ip_address  = string
    ssh_user    = string
    ssh_key     = string
  }))
  default = []
}

variable "ansible_inventory_path" {
  description = "Path to Ansible inventory file"
  type        = string
  default     = "../ansible/pangolin/inventory/hosts.yml"
}

variable "ansible_playbook_path" {
  description = "Path to Ansible playbook directory"
  type        = string
  default     = "../ansible/pangolin/playbooks"
}





