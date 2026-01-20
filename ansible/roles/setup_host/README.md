# Setup Host Role

This Ansible role prepares a local host machine (macOS or Linux) for deploying self-hosted infrastructure. It installs Homebrew, required development tools, and configures SSH for secure remote access.

## Requirements

- **Operating System**: macOS (Intel/Apple Silicon) or Linux (Ubuntu, Debian, Fedora, etc.)
- **Ansible**: 2.20.1 or higher
- **Internet Connection**: Required for downloading packages
- **User Privileges**: Must have sudo/admin access

## Ansible Collections

This role requires the following Ansible collections:

```bash
ansible-galaxy collection install community.general
```

Or install all project requirements:

```bash
ansible-galaxy install -r requirements.yml
```

## What This Role Does

### 1. **Homebrew Installation**
- Detects OS type and architecture
- Installs Homebrew if not already present
- Configures shell environment (`.bashrc`, `.zshrc`, `.zprofile`)
- Updates Homebrew to latest version

### 2. **Development Tools Installation**

Installs the following tools via Homebrew:
- **Git**: Version control system
- **Python3**: Required for Ansible and automation scripts
- **Ansible**: Infrastructure automation tool
- **kubectl**: Kubernetes command-line tool
- **Helm**: Kubernetes package manager
- **Helmfile**: Declarative Helm chart management

### 3. **SSH Configuration**
- Verifies SSH client is installed
- Generates Ed25519 SSH key pair (if not exists)
- Sets proper permissions on SSH directory and keys
- Creates SSH config with recommended settings
- Displays public key for copying to remote servers

### 4. **Installation Verification**
- Checks all installed tools are working
- Displays version information
- Provides summary of installed components

## Role Variables

All variables are defined in [`defaults/main.yml`](defaults/main.yml) and can be overridden in your playbook or inventory.

### Homebrew Configuration

```yaml
# Automatically detects correct path based on OS and architecture
homebrew_install_path: "{{ '/opt/homebrew' if ansible_os_family == 'Darwin' and ansible_architecture == 'arm64' else '/usr/local' if ansible_os_family == 'Darwin' else '/home/linuxbrew/.linuxbrew' }}"
```

### Tools to Install

```yaml
setup_host_tools:
  - git
  - python3
  - ansible
  - kubectl
  - helm
  - helmfile
```

### SSH Configuration

```yaml
# SSH key settings
setup_host_ssh_key_name: id_ed25519
setup_host_ssh_key_type: ed25519
setup_host_ssh_key_comment: "{{ ansible_user }}@{{ ansible_hostname }}"

# Create/update SSH config file
setup_host_create_ssh_config: true
```

### Verification

```yaml
# Run verification tasks after installation
setup_host_verify_installation: true
```

## Usage

### Basic Usage

Run the role using the main playbook:

```bash
cd ansible
ansible-playbook all.yml --tags setup_host
```

Or run it directly:

```bash
ansible-playbook -i inventory/host.ini all.yml
```

### Advanced Usage

#### Override Default Variables

Create a custom vars file or override in playbook:

```yaml
- name: Setup Host
  hosts: local
  become: true
  roles:
    - role: setup_host
      vars:
        setup_host_tools:
          - git
          - python3
          - ansible
        setup_host_ssh_key_type: rsa
        setup_host_ssh_key_size: 4096
```

#### Skip Verification

```bash
ansible-playbook all.yml --tags setup_host --skip-tags verify
```

#### Only Install Specific Tools

```yaml
- role: setup_host
  vars:
    setup_host_tools:
      - ansible
      - kubectl
```

## Tags

This role supports the following tags for selective execution:

- `setup_host`: Run all setup_host tasks
- `homebrew`: Only install/update Homebrew
- `dependencies`: Only install development tools
- `ssh`: Only configure SSH
- `verify`: Only run verification tasks

### Examples

Install only Homebrew:
```bash
ansible-playbook all.yml --tags homebrew
```

Install tools and configure SSH:
```bash
ansible-playbook all.yml --tags dependencies,ssh
```

## Dependencies

This role has no dependencies on other Ansible roles.

## Example Inventory

Create `inventory/host.ini`:

```ini
[local]
localhost ansible_connection=local
```

## Platform Support

- **macOS**: 
  - Intel (x86_64): Homebrew installed to `/usr/local`
  - Apple Silicon (arm64): Homebrew installed to `/opt/homebrew`
- **Linux**:
  - Ubuntu 20.04+
  - Debian 10+
  - Fedora 35+
  - Other distributions supported by Linuxbrew

## Post-Installation

After running this role:

1. **Copy SSH Public Key**: The role displays your SSH public key. Copy it to remote servers:
   ```bash
   ssh-copy-id -i ~/.ssh/id_ed25519.pub user@remote-host
   ```

2. **Verify Installation**: Check all tools are working:
   ```bash
   brew --version
   ansible --version
   kubectl version --client
   helm version
   ```

3. **Configure Ansible Collections**: Install required collections:
   ```bash
   ansible-galaxy install -r requirements.yml
   ```

4. **Proceed with Infrastructure**: You can now run other playbooks to deploy infrastructure:
   ```bash
   ansible-playbook all.yml
   ```

## Troubleshooting

### Homebrew Installation Fails

If Homebrew installation fails, try manual installation:

**macOS:**
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**Linux:**
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
```

### Path Issues

If commands aren't found after installation, reload your shell:

```bash
# For bash
source ~/.bashrc

# For zsh
source ~/.zshrc
```

### Permission Errors

Ensure you have sudo privileges:

```bash
sudo -v
```

### SSH Key Already Exists

The role won't overwrite existing SSH keys. To generate a new key, either:
1. Remove the old key: `rm ~/.ssh/id_ed25519*`
2. Use a different key name by setting `setup_host_ssh_key_name`

## License

MIT

## Author

Lvov Valery
