---
sidebar_position: 1
---

# Local Device Preparation

Before starting infrastructure deployment, you need to prepare a local device for managing the entire system. This device will have tools installed for working with Ansible, Terraform, Kubernetes, and other components.

## Installing Required Tools

### Ansible

Ansible is used for automating deployment and server configuration.

**macOS:**
```bash
brew install ansible
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install -y ansible
```

**Installation Check:**
```bash
ansible --version
```

### Terraform

Terraform is used for infrastructure management and inventory file generation.

**macOS:**
```bash
brew install terraform
```

**Linux:**
```bash
# Download the latest version from https://www.terraform.io/downloads
wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
unzip terraform_1.6.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/
```

**Installation Check:**
```bash
terraform --version
```

### kubectl

Kubectl is a command-line tool for working with Kubernetes clusters.

**macOS:**
```bash
brew install kubectl
```

**Linux:**
```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
```

**Installation Check:**
```bash
kubectl version --client
```

### Helm

Helm is a package manager for Kubernetes.

**macOS:**
```bash
brew install helm
```

**Linux:**
```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

**Installation Check:**
```bash
helm version
```

### Helmfile

Helmfile is a tool for managing multiple Helm charts.

**macOS:**
```bash
brew install helmfile
```

**Linux:**
```bash
wget https://github.com/helmfile/helmfile/releases/download/v0.155.0/helmfile_0.155.0_linux_amd64.tar.gz
tar -xzf helmfile_0.155.0_linux_amd64.tar.gz
sudo mv helmfile /usr/local/bin/
```

**Installation Check:**
```bash
helmfile version
```

### Helm Secrets Plugin

Plugin for working with encrypted secrets via SOPS.

```bash
helm plugin install https://github.com/jkroepke/helm-secrets
```

**Installation Check:**
```bash
helm plugin list
```

### GPG and SOPS

GPG is used for encrypting secrets, SOPS is for working with encrypted files.

**macOS:**
```bash
brew install gpg sops
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install -y gnupg sops
```

**Installation Check:**
```bash
gpg --version
sops --version
```

### Docker (optional)

Docker can be used for local development and testing.

**macOS:**
```bash
brew install --cask docker
```

**Linux:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

**Installation Check:**
```bash
docker --version
```

## SSH Key Configuration

You need to configure SSH keys to access remote servers.

### SSH Key Generation

If you don't have an SSH key yet:

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

Follow the instructions and save the key in the standard location `~/.ssh/id_ed25519`.

### Adding Key to SSH Agent

**macOS:**
```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

**Linux:**
```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

### Copying Public Key to Server

After gaining access to the VPS server, copy the public key:

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@your-vps-ip
```

Or manually:

```bash
cat ~/.ssh/id_ed25519.pub | ssh user@your-vps-ip "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

## GPG Key Configuration for SOPS

SOPS uses GPG for encrypting secrets.

### GPG Key Generation

```bash
gpg --full-generate-key
```

Choose:
- Key type: RSA and RSA (default)
- Key size: 4096
- Expiration: you can choose 0 (no expiration)
- Real name and email

### Exporting Public Key

After generating the key, export it for use in SOPS:

```bash
gpg --list-secret-keys --keyid-format LONG
```

Find a line like `sec   rsa4096/XXXXXXXXXXXX 2024-01-01`, where `XXXXXXXXXXXX` is the key ID.

Export the public key:

```bash
gpg --armor --export YOUR_KEY_ID > my-gpg-key.pub
```

Save this key - it will be needed for configuring `.sops.yaml`.

### GPG_TTY Configuration

For GPG to work in the terminal, set the environment variable:

```bash
echo 'export GPG_TTY=$(tty)' >> ~/.bashrc  # or ~/.zshrc
source ~/.bashrc  # or source ~/.zshrc
```

## Cloning the Repository

Clone the project repository:

```bash
git clone https://github.com/your-username/self-hosted.git
cd self-hosted
```

## .sops.yaml Configuration

Create a `.sops.yaml` file in the project root for automatic secret management:

```yaml
---
creation_rules:
  - pgp: YOUR_GPG_KEY_ID
```

Replace `YOUR_GPG_KEY_ID` with your GPG key ID that you obtained earlier.

Example `.sops.yaml` file:
```yaml
---
creation_rules:
  - pgp: 1E89965BF6B3B6D4AA02D096FEB9EA0B2906786F
```

## Checking Remote Server (VPS) Access

Before deployment, make sure you have:

1. **VPS server IP address**
2. **SSH access to the server**
3. **Root rights or user with sudo rights**

Check access:

```bash
ssh user@your-vps-ip
```

If the connection is successful, you are ready for the next step - remote device configuration.

## Checking All Installed Tools

Make sure all tools are installed correctly:

```bash
echo "=== Checking Installed Tools ==="
ansible --version
terraform --version
kubectl version --client
helm version
helmfile version
helm plugin list
gpg --version
sops --version
docker --version  # if installed
```

All tools should be installed and ready to use.

## Next Steps

After completing local device preparation, proceed to:

1. [Connecting and Configuring Remote Device](./vps-setup.md) - VPS server configuration and Pangolin deployment




