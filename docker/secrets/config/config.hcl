ui = true
disable_mlock = "true"

storage "raft" {
  path    = "/vault/data"
  node_id = "node1"
}

listener "tcp" {
  address       = "0.0.0.0:8200"
  cluster_address = "0.0.0.0:8201"
  tls_disable   = "false"
  tls_cert_file = "/certs/fullchain.crt"
  tls_key_file  = "/certs/key.key"
}

api_addr     = "https://vault.local:8200"
cluster_addr = "https://vault.local:8201"
