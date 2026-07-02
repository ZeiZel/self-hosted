---
sidebar_position: 3
---

# Deployment Kubernetes Cluster

At this stage we will deploy a Kubernetes cluster on the local server, which will be used to run all services.

## Requirements for the local server

Minimum requirements for the Kubernetes cluster:

- **Master node:**
  - CPU: 2 cores
  - RAM: 2 GB
  - Disk: 20 GB
  - OS: Ubuntu 20.04/22.04 or similar

- **Worker node (each):**
  - CPU: 4 cores
  - RAM: 4 GB
  - Disk: 50 GB
  - OS: Ubuntu 20.04/22.04 or similar

Recommended requirements for production:

- **Master node:**
  - CPU: 4 cores
  - RAM: 4 GB
  - Disk: 50 GB

- **Worker node (each):**
  - CPU: 8 cores
  - RAM: 16 GB
  - Disk: 100 GB SSD

For a fully featured cluster, a minimum of 3 worker nodes is recommended.

## Configuration of the inventory for Kubernetes

Before deployment, you need to configure the inventory file with information about the cluster nodes.

Copy `ansible/inventory/hosts.example.ini` to `ansible/inventory/hosts.ini` and add information about your Kubernetes nodes (INI format):

```ini
[masters]
master ansible_host=192.168.1.10 ansible_user=admin ansible_port=22
# Add additional master nodes for HA

[workers]
worker-1 ansible_host=192.168.1.20 ansible_user=admin ansible_port=22
# worker-2 ansible_host=192.168.1.21 ansible_user=admin ansible_port=22
# Add additional worker nodes
```

By default a single control-plane node is deployed (single control-plane); additional nodes can be added and removed later via `selfhost node add` / `selfhost node remove` (kubespray is used).

### Configuration of Kubespray variables

You can also configure Kubespray parameters in `ansible/group_vars/all/vars.yml`:

```yaml
# Kubespray settings
k8s_cluster_name: "local-cluster"
kubespray_install_dir: "/opt/kubespray"
```

## Deployment Kubernetes via Kubespray

Deployment is performed via an Ansible playbook that uses Kubespray to automatically install Kubernetes.

### Running the deployment

The recommended way is through the `selfhost` CLI, which wraps the Ansible run:

```bash
selfhost deploy
```

Or run Ansible directly. Everything is executed through the single `ansible/all.yml` playbook using tags:

```bash
cd ansible
ansible-playbook -i inventory/hosts.ini all.yml --tags kubespray
```

The playbook will perform the following actions:

1. **The `kubespray` role:**
   - Cloning the Kubespray repository
   - Preparing the inventory for Kubespray
   - Installing dependencies (Python, Ansible)
   - Configuring network parameters
   - Running the Kubespray playbook to install Kubernetes
   - Verifying cluster health
   - Configuring kubeconfig for access

### The deployment process

Deployment can take 15-30 minutes depending on the number of nodes and network speed.

Main stages:

1. Preparing the nodes (installing packages, configuring the system)
2. Installing the container runtime (containerd)
3. Installing kubeadm, kubelet, kubectl
4. Initializing the control plane on the master nodes
5. Joining the worker nodes to the cluster
6. Installing the network plugin (Calico/Flannel)
7. Installing CoreDNS
8. Health check

### What Kubespray does

Kubespray automatically:

- Configures all the necessary Kubernetes components
- Configures the network plugin for pod-to-pod communication
- Configures DNS through CoreDNS
- Configures certificates for secure communication
- Configures high availability (if there are multiple master nodes)

## Verification of the cluster

After deployment is complete, check the cluster status.

### Getting the kubeconfig

The kubeconfig file will be created on one of the master machines. Copy it to your local machine:

```bash
scp ubuntu@k8s-master-1:/home/ubuntu/.kube/config ~/.kube/config
```

Or, if the playbook configured access automatically, check the file:

```bash
cat ~/.kube/config
```

### Verification of nodes

Check the status of all nodes:

```bash
kubectl get nodes
```

All nodes should be in the `Ready` status:

```
NAME            STATUS   ROLES           AGE   VERSION
k8s-master-1    Ready    control-plane   5m    v1.28.0
k8s-worker-1    Ready    <none>          4m    v1.28.0
k8s-worker-2    Ready    <none>          4m    v1.28.0
```

### Verification of system pods

Check that all system pods are running:

```bash
kubectl get pods --all-namespaces
```

All pods in the `kube-system` namespace should be in the `Running` status:

```
NAMESPACE     NAME                                      READY   STATUS    RESTARTS   AGE
kube-system   calico-kube-controllers-xxx              1/1     Running   0          5m
kube-system   calico-node-xxx                          1/1     Running   0          5m
kube-system   coredns-xxx                              1/1     Running   0          5m
...
```

## Helmfile initialization

After the Kubernetes cluster has been deployed successfully, you need to initialize Helmfile to manage the Helm charts.

Navigate to the directory with the Kubernetes configuration:

```bash
cd kubernetes
```

Initialize Helmfile:

```bash
helmfile init --force
```

This command will create the `.helmfile` directory with the necessary configuration files:

- `.helmfile/repositories.yaml` - list of Helm repositories
- `.helmfile/environments.yaml.gotmpl` - environment settings
- `.helmfile/releases.yaml.gotmpl` - automatically generated list of releases

## Configuration Gateway API

Some services require the Gateway API to work. Install the Gateway API CRDs:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml
```

Check the installation:

```bash
kubectl get crd | grep gateway
```

The CRDs for the Gateway API should be created.

## Troubleshooting

### Issue: Nodes not in Ready status

Check the node status:

```bash
kubectl describe node k8s-worker-1
```

Check the kubelet logs on the node:

```bash
ssh ubuntu@k8s-worker-1 "sudo journalctl -u kubelet -n 50"
```

### Issue: Pods not starting

Check the pod status:

```bash
kubectl get pods --all-namespaces
kubectl describe pod <pod-name> -n <namespace>
```

Check the events:

```bash
kubectl get events --sort-by='.lastTimestamp'
```

### Issue: No access to the cluster

Check the kubeconfig:

```bash
kubectl config view
kubectl cluster-info
```

Make sure that you can connect to the API server:

```bash
kubectl get nodes
```

### Issue: Network connectivity between pods

Check the status of the network plugin:

```bash
kubectl get pods -n kube-system | grep calico  # or flannel, depending on the plugin
```

Check the network policies:

```bash
kubectl get networkpolicies --all-namespaces
```

## Next Steps

After the Kubernetes cluster has been deployed successfully:

1. [Secrets setup](./secrets-setup.md) - configuring GPG keys and SOPS for secrets management
