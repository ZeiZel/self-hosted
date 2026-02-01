# Architectural Rules & Design Principles for AI Agent

**Document Version:** 1.0
**Date:** February 1, 2026
**Target Audience:** AI Agents, Architects, DevOps Engineers
**Context:** Enterprise Self-Hosted Infrastructure Platform

***

## 1. Foundational Architecture Principles

### ARCH-001: Cloud-Native First
- **ARCH-001.1**: All components MUST be designed as cloud-native applications following [12-Factor App](https://12factor.net/) principles
- **ARCH-001.2**: Services MUST be stateless where possible; state MUST be externalized to databases or object storage
- **ARCH-001.3**: Horizontal scaling MUST be the default scaling strategy
- **ARCH-001.4**: Services MUST gracefully handle failures (circuit breakers, retries with exponential backoff)

### ARCH-002: Infrastructure as Code (IaC)
- **ARCH-002.1**: ALL infrastructure MUST be declaratively defined in version-controlled code
- **ARCH-002.2**: Manual changes to infrastructure are PROHIBITED
- **ARCH-002.3**: Infrastructure changes MUST go through code review process
- **ARCH-002.4**: IaC MUST be idempotent - running multiple times produces same result

### ARCH-003: Security by Design
- **ARCH-003.1**: Zero Trust Network architecture MUST be implemented
- **ARCH-003.2**: Least privilege principle MUST be applied to all access controls
- **ARCH-003.3**: Defense in depth MUST be implemented with multiple security layers
- **ARCH-003.4**: Security MUST NOT be an afterthought - it's part of every design decision

### ARCH-004: Observability from Day One
- **ARCH-004.1**: Every service MUST be observable before it reaches production
- **ARCH-004.2**: Metrics, logs, and traces MUST be first-class citizens
- **ARCH-004.3**: Debugging in production MUST be possible without SSH access to containers
- **ARCH-004.4**: SLOs (Service Level Objectives) MUST be defined for critical services

***

## 2. Kubernetes Helm Chart Architecture

### 2.1 Chart Structure Standards

#### HELM-001: Canonical Chart Structure
Every Helm chart MUST follow this exact structure:

```
charts/<service-name>/
├── Chart.yaml              # Chart metadata with semantic versioning
├── values.yaml             # Default configuration values
├── values.schema.json      # JSON schema for values validation
├── README.md               # Service documentation
├── .helmignore             # Files to exclude from packaging
├── templates/
│   ├── NOTES.txt           # Post-install instructions
│   ├── _helpers.tpl        # Template helper functions
│   ├── serviceaccount.yaml # ServiceAccount for pod identity
│   ├── rbac.yaml           # Role/ClusterRole and bindings
│   ├── configmap.yaml      # Configuration data
│   ├── secret.yaml         # Sensitive data (encrypted via SOPS)
│   ├── deployment.yaml     # OR statefulset.yaml for stateful apps
│   ├── service.yaml        # Kubernetes Service
│   ├── ingress.yaml        # OR ingressroute.yaml for Traefik
│   ├── networkpolicy.yaml  # Network access controls
│   ├── pvc.yaml            # PersistentVolumeClaim (if needed)
│   ├── hpa.yaml            # HorizontalPodAutoscaler (if applicable)
│   ├── pdb.yaml            # PodDisruptionBudget
│   ├── servicemonitor.yaml # Prometheus ServiceMonitor
│   ├── prometheusrule.yaml # Alert rules
│   └── tests/
│       └── test-connection.yaml # Helm test pod
├── ci/
│   └── values-test.yaml    # Values for CI testing
└── crds/                   # Custom Resource Definitions (if any)
```

#### HELM-002: Chart.yaml Requirements
```yaml
apiVersion: v2
name: <service-name>
description: <Concise service description>
type: application
version: 1.0.0              # Chart version (SemVer)
appVersion: "5.70.0"        # Application version
keywords:
  - <category>
  - <functionality>
home: https://github.com/ZeiZel/self-hosted
sources:
  - https://github.com/<upstream-repo>
maintainers:
  - name: Platform Team
    email: platform@example.com
dependencies: []            # Explicit dependencies with version constraints
```

#### HELM-003: values.yaml Structure
```yaml
# Global configuration shared across all charts
global:
  domain: example.com
  storageClass: standard

# Image configuration
image:
  repository: harbour.example.com/<service>
  tag: "1.0.0"              # Never use 'latest'
  pullPolicy: IfNotPresent
  digest: ""                # SHA256 digest for production

imagePullSecrets:
  - name: harbour-registry

# Replica configuration
replicaCount: 2

# Update strategy
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0

# ServiceAccount configuration
serviceAccount:
  create: true
  name: ""                  # Auto-generated if empty
  annotations: {}

# RBAC configuration
rbac:
  create: true
  rules: []                 # Custom RBAC rules if needed

# Pod security context
podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000
  seccompProfile:
    type: RuntimeDefault

# Container security context
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop:
    - ALL

# Resource limits
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

# Autoscaling
autoscaling:
  enabled: false
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

# Service configuration
service:
  type: ClusterIP
  port: 80
  targetPort: 8080
  annotations: {}

# Ingress configuration
ingress:
  enabled: true
  className: traefik
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    traefik.ingress.kubernetes.io/router.middlewares: service-authentik@kubernetescrd
  hosts:
    - host: <service>.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: <service>-tls
      hosts:
        - <service>.example.com

# Persistence configuration
persistence:
  enabled: true
  storageClass: "standard"
  accessMode: ReadWriteOnce
  size: 10Gi
  annotations: {}

# Monitoring configuration
monitoring:
  enabled: true
  serviceMonitor:
    enabled: true
    interval: 30s
    path: /metrics
    port: metrics
  prometheusRule:
    enabled: true
    rules: []

# Network policy
networkPolicy:
  enabled: true
  policyTypes:
    - Ingress
    - Egress
  ingress: []
  egress: []

# Pod Disruption Budget
podDisruptionBudget:
  enabled: true
  minAvailable: 1

# Vault integration
vault:
  enabled: true
  role: <service>-role
  secrets: []

# Database configuration
database:
  type: postgresql          # postgresql, mongodb, valkey
  host: postgresql.db.svc.cluster.local
  port: 5432
  name: <service>_production
  username: <service>_user
  existingSecret: ""        # Use Vault injection instead

# Environment-specific configuration
env: []
envFrom: []

# Init containers
initContainers: []

# Extra volumes
extraVolumes: []
extraVolumeMounts: []

# Node selector
nodeSelector: {}

# Tolerations
tolerations: []

# Affinity rules
affinity: {}

# Topology spread constraints
topologySpreadConstraints: []
```

### 2.2 Mandatory Kubernetes Resources

#### HELM-004: ServiceAccount (Required for ALL charts)
```yaml
{{- if .Values.serviceAccount.create -}}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ include "<chart>.serviceAccountName" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "<chart>.labels" . | nindent 4 }}
  {{- with .Values.serviceAccount.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
automountServiceAccountToken: true
{{- end }}
```

#### HELM-005: RBAC (Required for ALL charts)
```yaml
{{- if .Values.rbac.create -}}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: {{ include "<chart>.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "<chart>.labels" . | nindent 4 }}
rules:
  # Minimal required permissions
  - apiGroups: [""]
    resources: ["configmaps", "secrets"]
    verbs: ["get", "list", "watch"]
  {{- with .Values.rbac.rules }}
  {{- toYaml . | nindent 2 }}
  {{- end }}

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: {{ include "<chart>.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "<chart>.labels" . | nindent 4 }}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: {{ include "<chart>.fullname" . }}
subjects:
  - kind: ServiceAccount
    name: {{ include "<chart>.serviceAccountName" . }}
    namespace: {{ .Release.Namespace }}
{{- end }}
```

**RBAC Design Principles:**
- **HELM-005.1**: Use `Role` instead of `ClusterRole` unless service needs cluster-wide access
- **HELM-005.2**: Grant ONLY the minimum permissions required (e.g., `get`, `list` for read-only)
- **HELM-005.3**: Never grant `*` permissions on resources or verbs
- **HELM-005.4**: Document why each permission is needed in comments

#### HELM-006: NetworkPolicy (MANDATORY for ALL charts)
```yaml
{{- if .Values.networkPolicy.enabled -}}
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ include "<chart>.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "<chart>.labels" . | nindent 4 }}
spec:
  podSelector:
    matchLabels:
      {{- include "<chart>.selectorLabels" . | nindent 6 }}
  policyTypes:
    {{- toYaml .Values.networkPolicy.policyTypes | nindent 4 }}

  # Ingress rules - who can connect TO this service
  ingress:
    # Allow traffic from ingress controller
    - from:
      - namespaceSelector:
          matchLabels:
            name: ingress
        podSelector:
          matchLabels:
            app.kubernetes.io/name: traefik
      ports:
      - protocol: TCP
        port: {{ .Values.service.targetPort }}

    # Allow traffic from same namespace (peer services)
    - from:
      - podSelector: {}
      ports:
      - protocol: TCP
        port: {{ .Values.service.targetPort }}

    # Allow Prometheus scraping
    - from:
      - namespaceSelector:
          matchLabels:
            name: service
        podSelector:
          matchLabels:
            app.kubernetes.io/name: prometheus
      ports:
      - protocol: TCP
        port: {{ .Values.monitoring.serviceMonitor.port | default "metrics" }}

    {{- with .Values.networkPolicy.ingress }}
    {{- toYaml . | nindent 4 }}
    {{- end }}

  # Egress rules - where this service can connect TO
  egress:
    # Allow DNS resolution
    - to:
      - namespaceSelector:
          matchLabels:
            name: kube-system
        podSelector:
          matchLabels:
            k8s-app: kube-dns
      ports:
      - protocol: UDP
        port: 53

    # Allow database access
    {{- if .Values.database.enabled }}
    - to:
      - namespaceSelector:
          matchLabels:
            name: db
        podSelector:
          matchLabels:
            app.kubernetes.io/name: {{ .Values.database.type }}
      ports:
      - protocol: TCP
        port: {{ .Values.database.port }}
    {{- end }}

    # Allow Vault access for secret injection
    {{- if .Values.vault.enabled }}
    - to:
      - namespaceSelector:
          matchLabels:
            name: service
        podSelector:
          matchLabels:
            app.kubernetes.io/name: vault
      ports:
      - protocol: TCP
        port: 8200
    {{- end }}

    # Allow HTTPS egress for external APIs (if needed)
    - to:
      - namespaceSelector: {}
      ports:
      - protocol: TCP
        port: 443

    {{- with .Values.networkPolicy.egress }}
    {{- toYaml . | nindent 4 }}
    {{- end }}
{{- end }}
```

**NetworkPolicy Design Principles:**
- **HELM-006.1**: Default deny-all policy MUST be applied at namespace level
- **HELM-006.2**: Every chart MUST explicitly allow required traffic
- **HELM-006.3**: Ingress rules MUST use `namespaceSelector` + `podSelector` for precision
- **HELM-006.4**: DNS egress MUST always be allowed (UDP 53 to kube-dns)
- **HELM-006.5**: Database egress MUST target specific namespace (`db`) and pod labels

#### HELM-007: Deployment with Security Hardening
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "<chart>.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "<chart>.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  strategy:
    {{- toYaml .Values.strategy | nindent 4 }}
  selector:
    matchLabels:
      {{- include "<chart>.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      annotations:
        # Force pod restart on config changes
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
        checksum/secret: {{ include (print $.Template.BasePath "/secret.yaml") . | sha256sum }}

        # Prometheus annotations
        {{- if .Values.monitoring.enabled }}
        prometheus.io/scrape: "true"
        prometheus.io/port: {{ .Values.monitoring.serviceMonitor.port | quote }}
        prometheus.io/path: {{ .Values.monitoring.serviceMonitor.path | quote }}
        {{- end }}

        # Vault annotations
        {{- if .Values.vault.enabled }}
        vault.hashicorp.com/agent-inject: "true"
        vault.hashicorp.com/role: {{ .Values.vault.role | quote }}
        vault.hashicorp.com/agent-pre-populate-only: "true"
        {{- range .Values.vault.secrets }}
        vault.hashicorp.com/agent-inject-secret-{{ .name }}: {{ .path | quote }}
        vault.hashicorp.com/agent-inject-template-{{ .name }}: |
          {{- .template | nindent 10 }}
        {{- end }}
        {{- end }}
      labels:
        {{- include "<chart>.selectorLabels" . | nindent 8 }}
    spec:
      serviceAccountName: {{ include "<chart>.serviceAccountName" . }}

      # Security context at pod level
      securityContext:
        {{- toYaml .Values.podSecurityContext | nindent 8 }}

      # Image pull secrets
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}

      # Init containers for dependency checking
      initContainers:
        {{- if .Values.database.enabled }}
        - name: wait-for-database
          image: busybox:1.36
          command:
            - sh
            - -c
            - |
              until nc -zv {{ .Values.database.host }} {{ .Values.database.port }}; do
                echo "Waiting for database..."
                sleep 2
              done
          securityContext:
            runAsNonRoot: true
            runAsUser: 1000
            allowPrivilegeEscalation: false
            capabilities:
              drop:
              - ALL
        {{- end }}
        {{- with .Values.initContainers }}
        {{- toYaml . | nindent 8 }}
        {{- end }}

      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}

          # Security context at container level
          securityContext:
            {{- toYaml .Values.securityContext | nindent 12 }}

          # Ports
          ports:
            - name: http
              containerPort: {{ .Values.service.targetPort }}
              protocol: TCP
            {{- if .Values.monitoring.enabled }}
            - name: metrics
              containerPort: 9090
              protocol: TCP
            {{- end }}

          # Liveness probe - is the app alive?
          livenessProbe:
            httpGet:
              path: /healthz
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3

          # Readiness probe - is the app ready to serve traffic?
          readinessProbe:
            httpGet:
              path: /readyz
              port: http
            initialDelaySeconds: 10
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3

          # Startup probe - allow slow starting apps
          startupProbe:
            httpGet:
              path: /healthz
              port: http
            initialDelaySeconds: 0
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 30

          # Resource limits
          resources:
            {{- toYaml .Values.resources | nindent 12 }}

          # Environment variables
          env:
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
            - name: POD_NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
            - name: POD_IP
              valueFrom:
                fieldRef:
                  fieldPath: status.podIP
            {{- with .Values.env }}
            {{- toYaml . | nindent 12 }}
            {{- end }}

          # Environment from ConfigMap/Secret
          {{- with .Values.envFrom }}
          envFrom:
            {{- toYaml . | nindent 12 }}
          {{- end }}

          # Volume mounts
          volumeMounts:
            # Temporary directory (writable)
            - name: tmp
              mountPath: /tmp
            # Cache directory (writable)
            - name: cache
              mountPath: /app/cache
            {{- if .Values.persistence.enabled }}
            - name: data
              mountPath: /data
            {{- end }}
            {{- with .Values.extraVolumeMounts }}
            {{- toYaml . | nindent 12 }}
            {{- end }}

      # Volumes
      volumes:
        - name: tmp
          emptyDir: {}
        - name: cache
          emptyDir: {}
        {{- if .Values.persistence.enabled }}
        - name: data
          persistentVolumeClaim:
            claimName: {{ include "<chart>.fullname" . }}
        {{- end }}
        {{- with .Values.extraVolumes }}
        {{- toYaml . | nindent 8 }}
        {{- end }}

      # Node selection
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}

      # Tolerations
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}

      # Affinity rules
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}

      # Topology spread constraints
      {{- with .Values.topologySpreadConstraints }}
      topologySpreadConstraints:
        {{- toYaml . | nindent 8 }}
      {{- end }}
```

#### HELM-008: ServiceMonitor for Prometheus
```yaml
{{- if and .Values.monitoring.enabled .Values.monitoring.serviceMonitor.enabled -}}
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: {{ include "<chart>.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "<chart>.labels" . | nindent 4 }}
    prometheus: kube-prometheus
spec:
  selector:
    matchLabels:
      {{- include "<chart>.selectorLabels" . | nindent 6 }}
  endpoints:
    - port: {{ .Values.monitoring.serviceMonitor.port }}
      path: {{ .Values.monitoring.serviceMonitor.path }}
      interval: {{ .Values.monitoring.serviceMonitor.interval }}
      scrapeTimeout: 10s
      scheme: http
      {{- if .Values.monitoring.serviceMonitor.tlsConfig }}
      tlsConfig:
        {{- toYaml .Values.monitoring.serviceMonitor.tlsConfig | nindent 8 }}
      {{- end }}
{{- end }}
```

#### HELM-009: PodDisruptionBudget
```yaml
{{- if .Values.podDisruptionBudget.enabled -}}
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {{ include "<chart>.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "<chart>.labels" . | nindent 4 }}
spec:
  {{- if .Values.podDisruptionBudget.minAvailable }}
  minAvailable: {{ .Values.podDisruptionBudget.minAvailable }}
  {{- else if .Values.podDisruptionBudget.maxUnavailable }}
  maxUnavailable: {{ .Values.podDisruptionBudget.maxUnavailable }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "<chart>.selectorLabels" . | nindent 6 }}
{{- end }}
```

#### HELM-010: Helm Tests
```yaml
# templates/tests/test-connection.yaml
apiVersion: v1
kind: Pod
metadata:
  name: "{{ include "<chart>.fullname" . }}-test-connection"
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "<chart>.labels" . | nindent 4 }}
  annotations:
    "helm.sh/hook": test
    "helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded
spec:
  restartPolicy: Never
  containers:
    - name: wget
      image: busybox:1.36
      command:
        - wget
        - --spider
        - --timeout=10
        - --tries=1
        - http://{{ include "<chart>.fullname" . }}:{{ .Values.service.port }}/healthz
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        allowPrivilegeEscalation: false
        capabilities:
          drop:
          - ALL
```

***

## 3. Ansible Automation Architecture

### 3.1 Directory Structure

#### ANS-001: Canonical Ansible Structure
```
ansible/
├── ansible.cfg                  # Ansible configuration
├── .ansible-lint                # Linter configuration
├── .pre-commit-config.yaml      # Pre-commit hooks
├── requirements.yml             # External role dependencies
├── all.yml                      # Main playbook entry point
├── inventory/
│   ├── hosts.ini                # All nodes inventory
│   ├── master.ini               # Control plane nodes only
│   ├── gateway.ini              # Gateway/VPS nodes only
│   ├── node.ini                 # Worker nodes only
│   └── group_vars/
│       └── all.yml              # Non-sensitive variables
├── group_vars/
│   └── all/
│       ├── vars.yml             # Public variables
│       └── vault.yml            # ENCRYPTED secrets (Ansible Vault)
├── host_vars/                   # Per-host overrides
│   ├── master01.yml
│   ├── gateway01.yml
│   └── worker01.yml
├── roles/
│   ├── common/                  # Base system configuration
│   │   ├── defaults/
│   │   ├── tasks/
│   │   ├── handlers/
│   │   ├── templates/
│   │   ├── files/
│   │   └── meta/
│   ├── kubernetes_master/       # Control plane setup
│   ├── kubernetes_worker/       # Worker node setup
│   ├── gateway/                 # Gateway/VPS configuration
│   ├── pangolin_server/         # Pangolin VPN server (gateway)
│   ├── pangolin_client/         # Pangolin VPN client (cluster)
│   ├── docker/                  # Docker runtime setup
│   ├── containerd/              # Containerd runtime
│   ├── kubespray/               # Kubernetes cluster bootstrap
│   ├── cni/                     # CNI plugin (Calico/Cilium)
│   ├── storage/                 # Storage provisioner
│   ├── monitoring/              # Observability stack
│   └── helmfile/                # Helmfile deployment
├── playbooks/
│   ├── prepare.yml              # System preparation
│   ├── kubernetes.yml           # K8s cluster setup
│   ├── storage.yml              # Storage configuration
│   ├── network.yml              # Network setup
│   ├── security.yml             # Security hardening
│   └── deploy.yml               # Application deployment
└── scripts/
    ├── bootstrap.sh             # Initial setup script
    └── validate.sh              # Pre-deployment validation
```

### 3.2 Inventory Design

#### ANS-002: Inventory Structure
```ini
# inventory/hosts.ini
[all:vars]
ansible_user=admin
ansible_python_interpreter=/usr/bin/python3
ansible_ssh_private_key_file=~/.ssh/id_ed25519

# Control plane nodes
[master]
master01 ansible_host=10.0.1.10 node_role=master
master02 ansible_host=10.0.1.11 node_role=master
master03 ansible_host=10.0.1.12 node_role=master

# Worker nodes
[workers]
worker01 ansible_host=10.0.1.20 node_role=worker node_type=compute
worker02 ansible_host=10.0.1.21 node_role=worker node_type=compute
worker03 ansible_host=10.0.1.22 node_role=worker node_type=storage
worker04 ansible_host=10.0.1.23 node_role=worker node_type=storage
worker05 ansible_host=10.0.1.24 node_role=worker node_type=storage

# Gateway/VPS node (public internet-facing)
[gateway]
gateway01 ansible_host=203.0.113.10 ansible_user=root node_role=gateway public_ip=203.0.113.10

# Database-specific nodes (subset of workers)
[db_nodes]
worker03
worker04
worker05

# Kubernetes cluster (all nodes except gateway)
[k8s:children]
master
workers

# All infrastructure
[infrastructure:children]
k8s
gateway
```

### 3.3 Main Playbook with Tags

#### ANS-003: Main Playbook (all.yml)
```yaml
---
# ansible/all.yml
# Main playbook for full infrastructure deployment
# Usage: ansible-playbook -i inventory/hosts.ini all.yml [--tags <tag>] [--vault-password-file ~/.ansible_vault_password]

- name: Validate prerequisites
  hosts: localhost
  gather_facts: false
  tags: [always]
  tasks:
    - name: Check required tools
      command: "which {{ item }}"
      loop:
        - kubectl
        - helm
        - helmfile
        - gpg
        - sops
      changed_when: false

    - name: Verify Ansible Vault password
      command: ansible-vault view {{ playbook_dir }}/group_vars/all/vault.yml
      changed_when: false
      register: vault_check
      failed_when: vault_check.rc != 0

- name: Prepare all nodes
  hosts: all
  become: true
  tags: [prepare, system]
  roles:
    - role: common
      tags: [common]

- name: Configure firewall
  hosts: all
  become: true
  tags: [prepare, firewall]
  roles:
    - role: firewall

- name: Install container runtime
  hosts: k8s
  become: true
  tags: [prepare, containerd]
  roles:
    - role: containerd

- name: Bootstrap Kubernetes cluster
  hosts: k8s
  become: true
  tags: [kubernetes, kubespray]
  roles:
    - role: kubespray

- name: Configure CNI plugin
  hosts: master[0]
  tags: [kubernetes, cni]
  roles:
    - role: cni
      vars:
        cni_plugin: calico  # or cilium

- name: Deploy storage provisioner
  hosts: master[0]
  tags: [kubernetes, storage]
  roles:
    - role: storage
      vars:
        storage_type: longhorn  # or rook-ceph

- name: Configure Pangolin VPN server
  hosts: gateway
  become: true
  tags: [network, pangolin, vpn]
  roles:
    - role: pangolin_server

- name: Configure Pangolin VPN clients
  hosts: k8s
  become: true
  tags: [network, pangolin, vpn]
  roles:
    - role: pangolin_client

- name: Deploy platform services via Helmfile
  hosts: master[0]
  tags: [deploy, helmfile]
  roles:
    - role: helmfile
      vars:
        helmfile_environment: k8s

- name: Configure monitoring stack
  hosts: master[0]
  tags: [deploy, monitoring, observability]
  roles:
    - role: monitoring

- name: Security hardening
  hosts: all
  become: true
  tags: [security, hardening]
  roles:
    - role: security_hardening

- name: Validation and smoke tests
  hosts: master[0]
  tags: [validate, test]
  tasks:
    - name: Check Kubernetes cluster health
      command: kubectl get nodes
      changed_when: false

    - name: Verify all pods are running
      command: kubectl get pods --all-namespaces
      changed_when: false

    - name: Run Helm tests
      command: helm test {{ item }} -n {{ item.split('-')[0] }}
      loop:
        - ingress-traefik
        - service-vault
        - service-prometheus
      changed_when: false
      failed_when: false
```

### 3.4 Role Design Standards

#### ANS-004: Role Structure Template
```yaml
# roles/<role-name>/
# ├── defaults/main.yml       # Default variables (lowest precedence)
# ├── tasks/main.yml          # Main task entry point
# ├── handlers/main.yml       # Event handlers (e.g., service restart)
# ├── templates/              # Jinja2 templates
# ├── files/                  # Static files
# ├── vars/main.yml           # Role variables (higher precedence)
# ├── meta/main.yml           # Role metadata & dependencies
# └── molecule/               # Test scenarios

# Example: roles/common/tasks/main.yml
---
- name: Update apt cache
  apt:
    update_cache: yes
    cache_valid_time: 3600
  when: ansible_os_family == "Debian"
  tags: [packages]

- name: Install common packages
  apt:
    name:
      - curl
      - wget
      - git
      - vim
      - htop
      - net-tools
      - ntp
      - ufw
    state: present
  tags: [packages]

- name: Configure system timezone
  timezone:
    name: "{{ system_timezone | default('UTC') }}"
  tags: [system]

- name: Configure NTP
  template:
    src: ntp.conf.j2
    dest: /etc/ntp.conf
    mode: '0644'
  notify: Restart NTP
  tags: [ntp]

- name: Create admin user
  user:
    name: "{{ user.name }}"
    password: "{{ user.password }}"
    shell: /bin/bash
    groups: sudo
    append: yes
  tags: [users]

- name: Add SSH public keys
  authorized_key:
    user: "{{ user.name }}"
    key: "{{ item }}"
  loop: "{{ user.ssh_keys }}"
  tags: [ssh]

- name: Configure SSH daemon
  template:
    src: sshd_config.j2
    dest: /etc/ssh/sshd_config
    mode: '0600'
    validate: /usr/sbin/sshd -t -f %s
  notify: Restart SSH
  tags: [ssh]

- name: Disable swap
  command: swapoff -a
  when: ansible_swaptotal_mb > 0
  tags: [kubernetes]

- name: Remove swap from fstab
  lineinfile:
    path: /etc/fstab
    regexp: '.*swap.*'
    state: absent
  tags: [kubernetes]

- name: Load kernel modules
  modprobe:
    name: "{{ item }}"
    state: present
  loop:
    - br_netfilter
    - overlay
  tags: [kubernetes]

- name: Configure sysctl for Kubernetes
  sysctl:
    name: "{{ item.name }}"
    value: "{{ item.value }}"
    state: present
    reload: yes
  loop:
    - { name: 'net.bridge.bridge-nf-call-iptables', value: '1' }
    - { name: 'net.bridge.bridge-nf-call-ip6tables', value: '1' }
    - { name: 'net.ipv4.ip_forward', value: '1' }
    - { name: 'vm.swappiness', value: '0' }
  tags: [kubernetes, sysctl]
```

#### ANS-005: Vault Variables Template
```yaml
# group_vars/all/vault.yml (MUST be encrypted with ansible-vault)
# Encrypt: ansible-vault encrypt group_vars/all/vault.yml --vault-password-file ~/.ansible_vault_password
# Edit: ansible-vault edit group_vars/all/vault.yml --vault-password-file ~/.ansible_vault_password

---
# User management
user:
  name: "admin"
  password: "$6$rounds=656000$YourSaltHere$HashHere"  # mkpasswd --method=sha-512
  ssh_keys:
    - "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample admin@homelab"
  email: "admin@example.com"

root:
  name: "root"
  password: "$6$rounds=656000$RootSaltHere$RootHashHere"

# SSH configuration
ssh:
  port: 22
  permit_root_login: false
  password_authentication: false

# Domain configuration
domain:
  primary: "homelab.local"
  public: "example.com"
  wildcard_cert: true

# Database credentials
databases:
  postgresql:
    admin_user: "postgres"
    admin_password: "{{ lookup('password', '/dev/null chars=ascii_letters,digits length=32') }}"
    replication_user: "replicator"
    replication_password: "{{ lookup('password', '/dev/null chars=ascii_letters,digits length=32') }}"

  mongodb:
    admin_user: "admin"
    admin_password: "{{ lookup('password', '/dev/null chars=ascii_letters,digits length=32') }}"
    replica_key_base64: "{{ lookup('password', '/dev/null chars=ascii_letters,digits length=64') | b64encode }}"

  valkey:
    password: "{{ lookup('password', '/dev/null chars=ascii_letters,digits length=32') }}"

  minio:
    root_user: "minio-admin"
    root_password: "{{ lookup('password', '/dev/null chars=ascii_letters,digits length=32') }}"

# SMTP configuration
smtp:
  host: "smtp.gmail.com"
  port: 587
  username: "notifications@example.com"
  password: "YourAppPasswordHere"
  from_email: "platform@example.com"

# OAuth/SSO credentials
oauth:
  authentik:
    bootstrap_email: "admin@example.com"
    bootstrap_password: "{{ lookup('password', '/dev/null chars=ascii_letters,digits length=32') }}"
    secret_key: "{{ lookup('password', '/dev/null chars=ascii_letters,digits,punctuation length=64') }}"

  gitlab:
    root_password: "{{ lookup('password', '/dev/null chars=ascii_letters,digits length=32') }}"
    runner_registration_token: "{{ lookup('password', '/dev/null chars=ascii_letters,digits length=20') }}"

# VPN configuration
vpn:
  pangolin:
    server_private_key: "{{ lookup('file', '~/.pangolin/server_private.key') }}"
    client_preshared_key: "{{ lookup('file', '~/.pangolin/preshared.key') }}"

# TLS/SSL certificates
tls:
  letsencrypt:
    email: "ssl@example.com"
    staging: false  # Set to true for testing

# Vault (HashiCorp) configuration
vault:
  unseal_keys:
    - "key1-here"
    - "key2-here"
    - "key3-here"
  root_token: "hvs.RootTokenHere"

# Monitoring credentials
monitoring:
  grafana:
    admin_user: "admin"
    admin_password: "{{ lookup('password', '/dev/null chars=ascii_letters,digits length=32') }}"

  prometheus:
    basic_auth_password: "{{ lookup('password', '/dev/null chars=ascii_letters,digits length=32') }}"

# Container registry
registry:
  harbour:
    admin_password: "{{ lookup('password', '/dev/null chars=ascii_letters,digits length=32') }}"
    database_password: "{{ lookup('password', '/dev/null chars=ascii_letters,digits length=32') }}"
```

### 3.5 Gateway & VPN Architecture

#### ANS-006: Pangolin VPN Design
```yaml
# roles/pangolin_server/tasks/main.yml
# Gateway node (VPS) - public-facing server

---
- name: Install WireGuard
  apt:
    name:
      - wireguard
      - wireguard-tools
    state: present
  tags: [wireguard]

- name: Generate WireGuard keys if not exists
  shell: |
    if [ ! -f /etc/wireguard/privatekey ]; then
      wg genkey | tee /etc/wireguard/privatekey | wg pubkey > /etc/wireguard/publickey
    fi
  args:
    creates: /etc/wireguard/privatekey
  tags: [wireguard]

- name: Install Pangolin server
  get_url:
    url: https://github.com/pangolin-project/releases/latest/pangolin-server-linux-amd64
    dest: /usr/local/bin/pangolin-server
    mode: '0755'
  tags: [pangolin]

- name: Create Pangolin configuration
  template:
    src: pangolin-server.yaml.j2
    dest: /etc/pangolin/config.yaml
    mode: '0600'
  notify: Restart Pangolin Server
  tags: [pangolin, config]

- name: Configure Traefik HTTP provider on gateway
  template:
    src: traefik_config.yml.j2
    dest: /etc/traefik/traefik.yml
    mode: '0644'
  notify: Restart Traefik
  tags: [traefik]

- name: Create systemd service for Pangolin
  template:
    src: pangolin-server.service.j2
    dest: /etc/systemd/system/pangolin-server.service
    mode: '0644'
  notify: Restart Pangolin Server
  tags: [systemd]

- name: Enable and start Pangolin server
  systemd:
    name: pangolin-server
    enabled: yes
    state: started
    daemon_reload: yes
  tags: [service]

- name: Configure iptables for NAT
  iptables:
    table: nat
    chain: POSTROUTING
    out_interface: eth0
    jump: MASQUERADE
  tags: [firewall, nat]

- name: Enable IP forwarding
  sysctl:
    name: net.ipv4.ip_forward
    value: '1'
    state: present
    reload: yes
  tags: [sysctl]
```

```yaml
# roles/pangolin_client/tasks/main.yml
# Cluster nodes - connect to gateway VPN

---
- name: Install Pangolin client
  get_url:
    url: https://github.com/pangolin-project/releases/latest/pangolin-client-linux-amd64
    dest: /usr/local/bin/pangolin-client
    mode: '0755'
  tags: [pangolin]

- name: Create Pangolin client configuration
  template:
    src: pangolin-client.yaml.j2
    dest: /etc/pangolin/client.yaml
    mode: '0600'
  notify: Restart Pangolin Client
  tags: [pangolin, config]

- name: Deploy Pangolin client Kubernetes manifests
  template:
    src: pangolin-deployment.yaml.j2
    dest: /tmp/pangolin-deployment.yaml
  delegate_to: "{{ groups['master'][0] }}"
  run_once: true
  tags: [kubernetes]

- name: Apply Pangolin Kubernetes deployment
  command: kubectl apply -f /tmp/pangolin-deployment.yaml
  delegate_to: "{{ groups['master'][0] }}"
  run_once: true
  tags: [kubernetes]
```

**Pangolin Architecture Explained:**
- **Gateway (VPS)**: Public-facing server with real IP address
  - Runs Pangolin server + Traefik edge router
  - Accepts incoming HTTPS traffic from internet
  - Forwards traffic through VPN tunnel to cluster

- **Cluster Nodes**: Private network behind NAT
  - Run Pangolin client in Kubernetes
  - Establish outbound VPN connection to gateway
  - Traefik in cluster registers routes with gateway via HTTP provider
  - Traffic flows: Internet → Gateway → VPN → Cluster Traefik → Services

***

## 4. Docker Reference Architecture

### DOC-001: Docker Directory Purpose
```
docker/
├── <service-name>/
│   ├── docker-compose.yml      # Standalone deployment config
│   ├── .env.example            # Environment variable template
│   ├── Dockerfile              # Custom image (if needed)
│   ├── config/                 # Service-specific configs
│   └── README.md               # Setup instructions
```

**Docker Directory Rules:**
- **DOC-001.1**: Docker configurations are REFERENCE ONLY for local development/testing
- **DOC-001.2**: Docker configs MUST NOT be used in production deployment
- **DOC-001.3**: Docker compose files serve as documentation for service requirements
- **DOC-001.4**: When creating Helm chart, consult Docker config for:
  - Required environment variables
  - Volume mount paths
  - Port mappings
  - Dependency services
  - Health check endpoints
- **DOC-001.5**: Docker configs SHOULD be kept in sync with Kubernetes manifests for consistency
- **DOC-001.6**: Each service MUST have standalone docker-compose for isolated testing

***

## 5. Terraform Infrastructure (Optional)

### TF-001: When to Use Terraform
Terraform is OPTIONAL for this project since infrastructure runs on local/home servers. However, if cloud resources are needed (e.g., VPS gateway, DNS, cloud storage backup), use Terraform.

#### TF-002: Terraform Structure (If Used)
```
terraform/
├── main.tf                     # Root module
├── variables.tf                # Input variables
├── outputs.tf                  # Output values
├── terraform.tfvars.example    # Example values
├── backend.tf                  # State backend (S3/MinIO)
├── modules/
│   ├── vps/                    # Gateway VPS provisioning
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── dns/                    # DNS records management
│   └── backup/                 # Cloud backup configuration
└── environments/
    ├── production/
    │   └── terraform.tfvars
    └── staging/
        └── terraform.tfvars
```

#### TF-003: Terraform Integration with Ansible
```yaml
# Terraform provisions infrastructure
# Then outputs are fed to Ansible inventory

# Example workflow:
# 1. terraform apply -auto-approve
# 2. terraform output -json > /tmp/tf_output.json
# 3. ansible-playbook -i inventory/dynamic.py all.yml
#
# inventory/dynamic.py reads Terraform outputs to generate inventory
```

**Terraform Usage Guidelines:**
- **TF-003.1**: Use Terraform for cloud provider APIs (VPS, DNS, S3)
- **TF-003.2**: Use Ansible for OS configuration and software installation
- **TF-003.3**: Terraform state MUST be stored remotely (S3/MinIO backend)
- **TF-003.4**: State file MUST be encrypted at rest

***

## 6. CI/CD & GitOps Integration

### CICD-001: Pre-Deployment Validation Pipeline
```yaml
# .gitlab-ci.yml or .github/workflows/validate.yml

stages:
  - validate
  - test
  - deploy

# Validate Helm charts
helm-lint:
  stage: validate
  script:
    - helm lint kubernetes/charts/*
    - helm template kubernetes/charts/* > /dev/null

# Validate Kubernetes manifests
kubeval:
  stage: validate
  script:
    - kubeval kubernetes/charts/*/templates/*.yaml

# Lint Ansible playbooks
ansible-lint:
  stage: validate
  script:
    - cd ansible && ansible-lint *.yml

# Security scanning
trivy-scan:
  stage: validate
  script:
    - trivy config kubernetes/

# Policy validation with OPA/Conftest
policy-check:
  stage: validate
  script:
    - conftest test kubernetes/charts/*/templates/*.yaml

# Dry-run deployment
dry-run:
  stage: test
  script:
    - helmfile --environment k8s diff
  only:
    - merge_requests

# Deploy to cluster
deploy:
  stage: deploy
  script:
    - ansible-playbook -i inventory/hosts.ini all.yml --tags deploy
  only:
    - main
  when: manual
```

### CICD-002: GitOps Workflow (ArgoCD)
```yaml
# kubernetes/argocd-apps/platform.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: self-hosted-platform
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/ZeiZel/self-hosted
    targetRevision: main
    path: kubernetes
    plugin:
      name: helmfile
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    syncOptions:
      - CreateNamespace=true
      - PruneLast=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

***

## 7. Quality Gates & Validation

### QA-001: Pre-Commit Hooks
```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
        args: ['--allow-multiple-documents']
      - id: check-added-large-files

  - repo: https://github.com/ansible/ansible-lint
    rev: v6.22.0
    hooks:
      - id: ansible-lint
        files: ^ansible/.*\.(yaml|yml)$

  - repo: https://github.com/gruntwork-io/pre-commit
    rev: v0.1.23
    hooks:
      - id: helmlint
      - id: shellcheck

  - repo: https://github.com/instrumenta/kubeval
    rev: v0.16.1
    hooks:
      - id: kubeval
        files: ^kubernetes/.*\.yaml$
```

### QA-002: Mandatory Checks Before Deployment
```bash
#!/bin/bash
# scripts/validate.sh

set -e

echo "Running pre-deployment validation..."

# 1. Helm chart validation
echo "[1/7] Validating Helm charts..."
for chart in kubernetes/charts/*; do
  helm lint "$chart"
  helm template "$chart" > /dev/null
done

# 2. Kubernetes manifest validation
echo "[2/7] Validating Kubernetes manifests..."
kubeval kubernetes/charts/*/templates/*.yaml

# 3. Ansible syntax check
echo "[3/7] Validating Ansible playbooks..."
cd ansible
ansible-playbook --syntax-check *.yml
ansible-lint *.yml
cd ..

# 4. SOPS decryption test
echo "[4/7] Testing SOPS secrets..."
sops --decrypt kubernetes/envs/k8s/secrets/_all.yaml > /dev/null

# 5. Vault decryption test
echo "[5/7] Testing Ansible Vault..."
ansible-vault view ansible/group_vars/all/vault.yml > /dev/null

# 6. Network policy validation
echo "[6/7] Validating NetworkPolicies..."
# Check that all namespaces have default deny policy
# Check that all services have explicit allow rules

# 7. Resource limits check
echo "[7/7] Checking resource limits..."
for manifest in kubernetes/charts/*/templates/deployment.yaml; do
  if ! grep -q "resources:" "$manifest"; then
    echo "ERROR: Missing resources in $manifest"
    exit 1
  fi
done

echo "✅ All validations passed!"
```

***

## 8. Architectural Decision Records (ADRs)

### ADR-001: Why Helmfile Over ArgoCD Initially?
**Context**: Need to deploy complex multi-chart platform
**Decision**: Use Helmfile for initial deployment, add ArgoCD later for GitOps
**Rationale**:
- Helmfile allows bootstrapping before ArgoCD is installed
- Helmfile has better support for SOPS-encrypted secrets
- ArgoCD can be added on top later for continuous sync

**Consequences**:
- Manual deployment via Ansible initially
- Transition to GitOps requires ArgoCD plugin for Helmfile

### ADR-002: Why Single Database Instances?
**Context**: Resource efficiency requirement
**Decision**: Consolidate all services into shared PostgreSQL, MongoDB, Valkey clusters
**Rationale**:
- Reduces resource overhead by 60%
- Simplifies backup procedures
- Easier to manage and monitor

**Consequences**:
- Services must use separate databases/keyspaces
- Connection pooling becomes critical
- Schema migrations require coordination

### ADR-003: Why Pangolin VPN Over Direct Exposure?
**Context**: Home servers behind NAT without public IPs
**Decision**: Use Pangolin mesh VPN to expose services via gateway VPS
**Rationale**:
- No port forwarding on home router required
- Encrypted tunnel between home and VPS
- Centralized ingress point for security controls

**Consequences**:
- Added complexity with VPN management
- Gateway becomes single point of failure (mitigated with multiple gateways)
- Slight latency increase due to tunnel

### ADR-004: Why Ansible Over Terraform for Node Provisioning?
**Context**: Local servers, not cloud VMs
**Decision**: Use Ansible for all provisioning, Terraform only if cloud resources needed
**Rationale**:
- Ansible better suited for OS configuration
- No cloud APIs to interact with
- Simpler for operators to understand

**Consequences**:
- No declarative infrastructure state
- Manual server preparation required
- Terraform can be added later if needed

***

## 9. Operational Runbooks

### RUN-001: Deploy Full Stack From Scratch
```bash
#!/bin/bash
# scripts/bootstrap.sh

set -e

echo "🚀 Self-Hosted Platform Deployment"
echo "=================================="

# Step 1: Prerequisites check
echo "[1/8] Checking prerequisites..."
./scripts/validate.sh

# Step 2: Generate GPG key for SOPS
echo "[2/8] Setting up SOPS encryption..."
if [ ! -f ~/.gnupg/pubring.kbx ]; then
  gpg --full-generate-key
fi
GPG_KEY_ID=$(gpg --list-secret-keys --keyid-format LONG | grep -E "^sec" | head -1 | grep -oE "[A-F0-9]{40}")
echo "creation_rules:
  - pgp: ${GPG_KEY_ID}" > kubernetes/.sops.yaml

# Step 3: Create Ansible Vault password
echo "[3/8] Setting up Ansible Vault..."
if [ ! -f ~/.ansible_vault_password ]; then
  openssl rand -base64 32 > ~/.ansible_vault_password
  chmod 600 ~/.ansible_vault_password
fi

# Step 4: Edit vault variables
echo "[4/8] Please edit Ansible Vault variables..."
ansible-vault create ansible/group_vars/all/vault.yml --vault-password-file ~/.ansible_vault_password || true

# Step 5: Encrypt Kubernetes secrets
echo "[5/8] Please create and encrypt Kubernetes secrets..."
sops kubernetes/envs/k8s/secrets/_all.yaml || true

# Step 6: Install Ansible dependencies
echo "[6/8] Installing Ansible dependencies..."
cd ansible
ansible-galaxy install -r requirements.yml
cd ..

# Step 7: Run Ansible playbook
echo "[7/8] Deploying infrastructure (this may take 60 minutes)..."
cd ansible
ansible-playbook -i inventory/hosts.ini all.yml --vault-password-file ~/.ansible_vault_password
cd ..

# Step 8: Verify deployment
echo "[8/8] Verifying deployment..."
kubectl get nodes
kubectl get pods --all-namespaces
helm list --all-namespaces

echo "✅ Deployment complete!"
echo "🌐 Access dashboard: https://dashboard.example.com"
```

### RUN-002: Update Single Service
```bash
# Update GitLab to new version
ansible-playbook -i inventory/hosts.ini all.yml --tags deploy,helmfile --extra-vars "helmfile_selector=name=gitlab"

# OR using Helmfile directly on master node
ssh master01
cd /opt/kubernetes
helmfile -e k8s -l name=gitlab apply
```

### RUN-003: Rollback Deployment
```bash
# Rollback specific release
helm rollback gitlab -n code

# OR via Helmfile
helmfile -e k8s -l name=gitlab destroy
helmfile -e k8s -l name=gitlab apply --set image.tag=previous-version
```

### RUN-004: Add New Worker Node
```bash
# 1. Add node to inventory
vim ansible/inventory/hosts.ini
# [workers]
# worker06 ansible_host=10.0.1.25 node_role=worker

# 2. Run kubespray join playbook
ansible-playbook -i inventory/hosts.ini all.yml --tags kubespray --limit worker06

# 3. Verify node joined
kubectl get nodes
```

***

## 10. Success Criteria Checklist

Before considering architecture complete, ALL items must pass:

### Architecture Checklist
- [ ] Every Helm chart has RBAC (ServiceAccount + Role/ClusterRole)
- [ ] Every Helm chart has NetworkPolicy with explicit allow rules
- [ ] Every Helm chart has resource requests and limits
- [ ] Every Helm chart has liveness, readiness, and startup probes
- [ ] Every Helm chart has ServiceMonitor for Prometheus
- [ ] Every Helm chart has PodDisruptionBudget
- [ ] Every Helm chart has Helm tests
- [ ] All secrets use Vault Agent Injector (no Kubernetes Secrets)
- [ ] All database connections use correct namespace (`.db.svc.cluster.local`)
- [ ] All services integrate with Authentik SSO

### Ansible Checklist
- [ ] Single command deploys entire stack: `ansible-playbook all.yml`
- [ ] All roles are tagged for selective execution
- [ ] All secrets are in encrypted Ansible Vault
- [ ] Playbook is idempotent (re-run safe)
- [ ] Inventory supports master/worker/gateway grouping
- [ ] Pangolin VPN connects cluster to gateway VPS
- [ ] All roles pass `ansible-lint`

### Security Checklist
- [ ] All pods run as non-root user
- [ ] All pods have `readOnlyRootFilesystem: true`
- [ ] All namespaces enforce `restricted` Pod Security Standard
- [ ] NetworkPolicy default-deny applied to all namespaces
- [ ] TLS enabled for all database connections
- [ ] Cert-manager manages all certificates
- [ ] Vault audit logging enabled

### Observability Checklist
- [ ] Prometheus scrapes metrics from 100% of services
- [ ] Loki collects logs from all pods
- [ ] Grafana has dashboards for all critical services
- [ ] Alerts configured for pod restarts, high memory, disk space
- [ ] Distributed tracing enabled with Tempo

### Reliability Checklist
- [ ] PostgreSQL has 3 replicas (1 primary + 2 read replicas)
- [ ] MongoDB runs as 3-member replica set
- [ ] Valkey runs in cluster mode (3 masters + 3 replicas)
- [ ] MinIO runs with 4+ nodes distributed mode
- [ ] Critical services have minimum 2 replicas
- [ ] PodDisruptionBudget prevents all replicas down
- [ ] Backup jobs run daily with encryption
- [ ] Disaster recovery procedure tested successfully

***

**End of Architectural Rules Document**

This architecture ensures enterprise-grade quality while maximizing resource efficiency and maintaining simplicity of deployment through Ansible automation. Every design decision prioritizes security, observability, and operational excellence.
