# Logging

Add these secrets to `kubernetes/envs/k8s/secrets/_all.yaml `using SOPS:

Add under secrets:

- elasticPassword — Elasticsearch superuser password
- kibanaEncryptionKey — 32+ char encryption key
- kibanaSavedObjectsKey — 32+ char encryption key
- kibanaReportingKey — 32+ char encryption key
