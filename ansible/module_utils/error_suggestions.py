# -*- coding: utf-8 -*-
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
"""
Error suggestion database for Ansible error reporting.

Provides intelligent suggestions for common error patterns encountered
during Ansible playbook execution. Suggestions include diagnostic steps
and recommended fixes.

Usage:
    from ansible.module_utils.error_suggestions import get_suggestion, SuggestionResult

    result = get_suggestion("Unable to locate package docker-ce")
    print(result.suggestion)
    for step in result.steps:
        print(f"  - {step}")
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class SuggestionResult:
    """Result of error pattern matching with suggestion details."""
    category: str
    suggestion: str
    steps: list[str] = field(default_factory=list)
    severity: str = "error"
    documentation_url: Optional[str] = None

    def format(self) -> str:
        """Format suggestion as human-readable text."""
        lines = [self.suggestion, ""]
        if self.steps:
            lines.append("Recommended steps:")
            for i, step in enumerate(self.steps, 1):
                lines.append(f"  {i}. {step}")
        if self.documentation_url:
            lines.append("")
            lines.append(f"Documentation: {self.documentation_url}")
        return "\n".join(lines)


# Comprehensive error pattern database
# Each entry maps a regex pattern to a SuggestionResult
SUGGESTIONS: dict[str, dict] = {
    # ==========================================================================
    # PACKAGE MANAGEMENT ERRORS
    # ==========================================================================
    r"Unable to locate package": {
        "category": "package_not_found",
        "suggestion": "The requested package was not found in configured repositories.",
        "steps": [
            "Run 'apt update' to refresh package lists",
            "Verify the repository is correctly added to sources.list",
            "Check package name spelling (use 'apt-cache search <name>')",
            "For Docker packages, ensure docker.list exists in /etc/apt/sources.list.d/",
        ],
        "severity": "error",
    },
    r"No package matching .* is available": {
        "category": "package_not_found",
        "suggestion": "Package not available in configured repositories.",
        "steps": [
            "Run 'apt update' to refresh package cache",
            "Verify repository is added: 'apt-cache policy <package>'",
            "Check if package name is correct for this OS/version",
            "Add required repository if missing",
        ],
        "severity": "error",
    },
    r"Package .* has no installation candidate": {
        "category": "package_unavailable",
        "suggestion": "Package exists but has no installable version.",
        "steps": [
            "Check if package is available for your architecture",
            "Verify repository provides packages for your OS version",
            "Try specifying a different package version",
            "Check 'apt-cache madison <package>' for available versions",
        ],
        "severity": "error",
    },
    r"dpkg.*error processing": {
        "category": "dpkg_error",
        "suggestion": "Package installation was interrupted or failed.",
        "steps": [
            "Run 'dpkg --configure -a' to fix interrupted installs",
            "Check 'dpkg -l | grep -E \"^.i\"' for broken packages",
            "Try 'apt --fix-broken install'",
            "Review /var/log/dpkg.log for detailed errors",
        ],
        "severity": "error",
    },
    r"apt.*lock|Could not get lock": {
        "category": "apt_locked",
        "suggestion": "Another package manager process is running.",
        "steps": [
            "Wait for the other process to complete",
            "Check running apt processes: 'ps aux | grep apt'",
            "If stuck, kill process: 'pkill -9 apt'",
            "Remove lock files if stale: 'rm /var/lib/apt/lists/lock'",
        ],
        "severity": "warning",
    },
    r"E: Unmet dependencies": {
        "category": "dependency_error",
        "suggestion": "Package dependencies cannot be satisfied.",
        "steps": [
            "Run 'apt --fix-broken install'",
            "Try 'apt install -f' to fix dependencies",
            "Check for conflicting packages",
            "Consider removing conflicting package first",
        ],
        "severity": "error",
    },

    # ==========================================================================
    # CONNECTION AND NETWORK ERRORS
    # ==========================================================================
    r"Connection refused": {
        "category": "connection_refused",
        "suggestion": "Target service is not accepting connections on the specified port.",
        "steps": [
            "Verify the service is running on the target host",
            "Check if firewall allows traffic on the port",
            "Verify the correct port number is being used",
            "Check service logs for startup failures",
        ],
        "severity": "error",
    },
    r"Connection timed out": {
        "category": "connection_timeout",
        "suggestion": "Connection attempt timed out waiting for response.",
        "steps": [
            "Check network connectivity: ping <host>",
            "Verify firewall rules allow traffic",
            "Increase timeout value in task configuration",
            "Check if target host is overloaded",
        ],
        "severity": "error",
    },
    r"Name or service not known|Could not resolve hostname": {
        "category": "dns_resolution_failed",
        "suggestion": "DNS resolution failed for the target hostname.",
        "steps": [
            "Check DNS configuration in /etc/resolv.conf",
            "Verify hostname spelling in inventory",
            "Try using IP address instead of hostname",
            "Check if internal DNS server is reachable",
        ],
        "severity": "error",
    },
    r"Network is unreachable": {
        "category": "network_unreachable",
        "suggestion": "No network route to the destination.",
        "steps": [
            "Check routing table: 'ip route'",
            "Verify default gateway is configured",
            "Check if network interface is up: 'ip link'",
            "Verify VPN connection if accessing private network",
        ],
        "severity": "error",
    },
    r"No route to host": {
        "category": "no_route",
        "suggestion": "Network path to host does not exist or is blocked.",
        "steps": [
            "Check network connectivity between hosts",
            "Verify firewall rules on intermediate nodes",
            "Check if target host is on the same network segment",
            "Review VPN or tunnel configuration if applicable",
        ],
        "severity": "error",
    },
    r"curl.*connection refused|wget.*connection refused": {
        "category": "http_connection_refused",
        "suggestion": "HTTP server not accepting connections.",
        "steps": [
            "Check if web server is running",
            "Verify correct port (80/443)",
            "Check SSL/TLS certificate if using HTTPS",
            "Review firewall rules for HTTP traffic",
        ],
        "severity": "error",
    },

    # ==========================================================================
    # SSH AND AUTHENTICATION ERRORS
    # ==========================================================================
    r"Permission denied.*publickey": {
        "category": "ssh_key_denied",
        "suggestion": "SSH public key authentication failed.",
        "steps": [
            "Verify SSH key is added to authorized_keys on target",
            "Check SSH key permissions: 'chmod 600 ~/.ssh/id_rsa'",
            "Verify correct user is specified in inventory",
            "Test SSH manually: 'ssh -v user@host'",
        ],
        "severity": "error",
    },
    r"Permission denied.*password": {
        "category": "ssh_password_denied",
        "suggestion": "SSH password authentication failed.",
        "steps": [
            "Verify password in vault.yml is correct",
            "Check if password authentication is enabled on target",
            "Verify correct username is specified",
            "Consider using SSH key authentication instead",
        ],
        "severity": "error",
    },
    r"Host key verification failed": {
        "category": "host_key_failed",
        "suggestion": "SSH host key does not match known_hosts entry.",
        "steps": [
            "If host was reinstalled, remove old key: 'ssh-keygen -R <host>'",
            "Set host_key_checking=False in ansible.cfg for initial setup",
            "Add host key manually: 'ssh-keyscan <host> >> ~/.ssh/known_hosts'",
            "Verify you're connecting to the correct host (not man-in-the-middle)",
        ],
        "severity": "warning",
    },
    r"UNREACHABLE": {
        "category": "host_unreachable",
        "suggestion": "Cannot establish SSH connection to host.",
        "steps": [
            "Check if host is online: 'ping <host>'",
            "Verify SSH service is running: 'systemctl status sshd'",
            "Check firewall allows SSH (port 22)",
            "Verify ansible_host and ansible_user in inventory",
            "Test SSH connection manually: 'ssh user@host'",
        ],
        "severity": "error",
    },
    r"Authentication failed": {
        "category": "auth_failed",
        "suggestion": "Authentication credentials are invalid.",
        "steps": [
            "Verify credentials in vault.yml are correct",
            "Check SSH key configuration",
            "Verify correct user is specified",
            "Check if account is locked or expired",
        ],
        "severity": "error",
    },
    r"Failed to connect to the host via ssh": {
        "category": "ssh_connection_failed",
        "suggestion": "SSH connection could not be established.",
        "steps": [
            "Check SSH daemon is running on target",
            "Verify network connectivity",
            "Check SSH port is not blocked by firewall",
            "Review SSH logs: 'journalctl -u ssh'",
        ],
        "severity": "error",
    },

    # ==========================================================================
    # FILE SYSTEM ERRORS
    # ==========================================================================
    r"No such file or directory": {
        "category": "file_not_found",
        "suggestion": "Required file or directory does not exist.",
        "steps": [
            "Verify previous tasks completed successfully",
            "Check path spelling and case sensitivity",
            "Ensure parent directories exist",
            "Check if path is on correct host (local vs remote)",
        ],
        "severity": "error",
    },
    r"Permission denied": {
        "category": "permission_denied",
        "suggestion": "Insufficient permissions for the operation.",
        "steps": [
            "Add 'become: yes' to task for sudo privileges",
            "Check file/directory ownership: 'ls -la'",
            "Verify sudo/become password is correct",
            "Check if SELinux/AppArmor is blocking access",
        ],
        "severity": "error",
    },
    r"Read-only file system": {
        "category": "readonly_fs",
        "suggestion": "File system is mounted as read-only.",
        "steps": [
            "Check mount options: 'mount | grep <path>'",
            "Remount as read-write: 'mount -o remount,rw <mount>'",
            "Check for disk errors that triggered read-only mode",
            "Verify container/pod has writable volume",
        ],
        "severity": "error",
    },
    r"No space left on device": {
        "category": "disk_full",
        "suggestion": "Disk space exhausted on target system.",
        "steps": [
            "Check disk usage: 'df -h'",
            "Find large files: 'du -sh /* | sort -h'",
            "Clean package cache: 'apt clean'",
            "Remove old log files or journal entries",
            "Extend partition or add storage",
        ],
        "severity": "error",
    },
    r"Directory not empty": {
        "category": "directory_not_empty",
        "suggestion": "Cannot remove directory because it contains files.",
        "steps": [
            "Use 'state: absent' with 'force: yes' to remove recursively",
            "Check for hidden files: 'ls -la'",
            "Verify no processes are using files in directory",
        ],
        "severity": "warning",
    },
    r"File exists": {
        "category": "file_exists",
        "suggestion": "Cannot create file because it already exists.",
        "steps": [
            "Use 'force: yes' to overwrite",
            "Remove existing file first",
            "Use 'state: link' to update symlinks",
        ],
        "severity": "warning",
    },

    # ==========================================================================
    # KUBERNETES ERRORS
    # ==========================================================================
    r"kubectl.*not found|command not found.*kubectl": {
        "category": "kubectl_missing",
        "suggestion": "kubectl command-line tool is not installed.",
        "steps": [
            "Install kubectl from kubernetes.io",
            "Add kubectl to PATH",
            "Verify KUBECONFIG environment variable is set",
            "Check kubectl is available: 'which kubectl'",
        ],
        "severity": "error",
    },
    r"kubectl.*connection refused": {
        "category": "k8s_api_unreachable",
        "suggestion": "Cannot connect to Kubernetes API server.",
        "steps": [
            "Check if Kubernetes cluster is running",
            "Verify KUBECONFIG points to correct config",
            "Check API server logs: 'journalctl -u kube-apiserver'",
            "Verify network connectivity to control plane",
        ],
        "severity": "error",
    },
    r"helm.*release.*not found": {
        "category": "helm_release_missing",
        "suggestion": "Helm release does not exist in the cluster.",
        "steps": [
            "List releases: 'helm list -A'",
            "Check correct namespace: 'helm list -n <namespace>'",
            "Verify release name spelling",
            "Install release first if it doesn't exist",
        ],
        "severity": "error",
    },
    r"helm.*chart.*not found": {
        "category": "helm_chart_missing",
        "suggestion": "Helm chart could not be found.",
        "steps": [
            "Update helm repos: 'helm repo update'",
            "Check chart name and version",
            "Verify repository is added: 'helm repo list'",
            "Check local chart path exists",
        ],
        "severity": "error",
    },
    r"ImagePullBackOff|ErrImagePull": {
        "category": "image_pull_failed",
        "suggestion": "Cannot pull container image from registry.",
        "steps": [
            "Verify image name and tag are correct",
            "Check registry credentials (imagePullSecrets)",
            "Verify network access to container registry",
            "Check if image exists: 'docker pull <image>'",
        ],
        "severity": "error",
    },
    r"CrashLoopBackOff": {
        "category": "container_crash_loop",
        "suggestion": "Container keeps crashing and restarting.",
        "steps": [
            "Check container logs: 'kubectl logs <pod>'",
            "Check previous logs: 'kubectl logs <pod> --previous'",
            "Verify environment variables and secrets",
            "Check resource limits (OOMKilled)",
            "Verify health check configuration",
        ],
        "severity": "error",
    },
    r"pod.*Pending|PodScheduled.*False": {
        "category": "pod_pending",
        "suggestion": "Pod cannot be scheduled to a node.",
        "steps": [
            "Check node resources: 'kubectl describe nodes'",
            "Verify node selectors and taints",
            "Check PVC binding status",
            "Review pod events: 'kubectl describe pod <pod>'",
        ],
        "severity": "warning",
    },
    r"OOMKilled": {
        "category": "oom_killed",
        "suggestion": "Container was killed due to memory limit.",
        "steps": [
            "Increase memory limit in deployment",
            "Check for memory leaks in application",
            "Review memory usage patterns",
            "Consider horizontal scaling",
        ],
        "severity": "error",
    },
    r"PersistentVolumeClaim.*Pending": {
        "category": "pvc_pending",
        "suggestion": "PVC cannot be bound to a PersistentVolume.",
        "steps": [
            "Check available PVs: 'kubectl get pv'",
            "Verify StorageClass exists and is configured",
            "Check storage provisioner is running",
            "Review PVC events: 'kubectl describe pvc <pvc>'",
        ],
        "severity": "error",
    },

    # ==========================================================================
    # DOCKER ERRORS
    # ==========================================================================
    r"docker.*daemon.*not running|Cannot connect to the Docker daemon": {
        "category": "docker_daemon_not_running",
        "suggestion": "Docker daemon is not running.",
        "steps": [
            "Start Docker: 'systemctl start docker'",
            "Enable Docker: 'systemctl enable docker'",
            "Check Docker logs: 'journalctl -u docker'",
            "Verify Docker socket exists: 'ls -la /var/run/docker.sock'",
        ],
        "severity": "error",
    },
    r"docker.*permission denied.*sock": {
        "category": "docker_permission",
        "suggestion": "User does not have permission to access Docker.",
        "steps": [
            "Add user to docker group: 'usermod -aG docker $USER'",
            "Log out and log back in for group changes",
            "Or use sudo for Docker commands",
            "Check socket permissions: 'ls -la /var/run/docker.sock'",
        ],
        "severity": "error",
    },
    r"docker.*conflict|container.*already in use": {
        "category": "docker_name_conflict",
        "suggestion": "Container name is already in use.",
        "steps": [
            "Remove existing container: 'docker rm <container>'",
            "Use a different container name",
            "Force remove: 'docker rm -f <container>'",
            "List containers: 'docker ps -a'",
        ],
        "severity": "warning",
    },
    r"docker.*network.*not found": {
        "category": "docker_network_missing",
        "suggestion": "Docker network does not exist.",
        "steps": [
            "Create network: 'docker network create <name>'",
            "List networks: 'docker network ls'",
            "Check network name spelling",
        ],
        "severity": "error",
    },

    # ==========================================================================
    # SYSTEMD AND SERVICE ERRORS
    # ==========================================================================
    r"Failed to start|Unit .* failed": {
        "category": "service_start_failed",
        "suggestion": "Service failed to start.",
        "steps": [
            "Check service logs: 'journalctl -u <service>'",
            "Verify configuration files are correct",
            "Check dependencies are running",
            "Run 'systemctl status <service>' for details",
        ],
        "severity": "error",
    },
    r"Unit .* not found|service.*could not be found": {
        "category": "service_not_found",
        "suggestion": "Service unit file does not exist.",
        "steps": [
            "Install the required package",
            "Create unit file in /etc/systemd/system/",
            "Run 'systemctl daemon-reload' after adding unit file",
            "Check service name spelling",
        ],
        "severity": "error",
    },
    r"Job .* timed out": {
        "category": "service_timeout",
        "suggestion": "Service took too long to start.",
        "steps": [
            "Increase TimeoutStartSec in unit file",
            "Check service startup process for issues",
            "Verify all dependencies are ready",
            "Check system resources (CPU, memory, disk I/O)",
        ],
        "severity": "error",
    },
    r"systemctl.*access denied|Failed to.*: Access denied": {
        "category": "systemd_access_denied",
        "suggestion": "Insufficient privileges for systemd operation.",
        "steps": [
            "Use 'become: yes' for sudo privileges",
            "Check polkit policies",
            "Verify user has required permissions",
        ],
        "severity": "error",
    },

    # ==========================================================================
    # ANSIBLE SPECIFIC ERRORS
    # ==========================================================================
    r"Undefined variable|AnsibleUndefinedVariable": {
        "category": "undefined_variable",
        "suggestion": "Variable is not defined.",
        "steps": [
            "Check variable spelling in task",
            "Verify variable is defined in group_vars/host_vars/defaults",
            "Check variable precedence order",
            "Use 'default' filter: '{{ var | default(\"value\") }}'",
        ],
        "severity": "error",
    },
    r"template error|TemplateSyntaxError": {
        "category": "template_error",
        "suggestion": "Jinja2 template has syntax errors.",
        "steps": [
            "Check template file for typos",
            "Verify Jinja2 syntax ({{ }}, {% %})",
            "Check for unbalanced braces",
            "Validate template locally: 'ansible all -m debug -a \"msg={{ lookup(\"template\", \"file.j2\") }}\"'",
        ],
        "severity": "error",
    },
    r"Module failure|MODULE FAILURE": {
        "category": "module_failure",
        "suggestion": "Ansible module execution failed.",
        "steps": [
            "Check module arguments and syntax",
            "Verify required dependencies are installed",
            "Review module documentation",
            "Check for Python import errors on target",
        ],
        "severity": "error",
    },
    r"Vault password.*failed|Decryption failed": {
        "category": "vault_decrypt_failed",
        "suggestion": "Cannot decrypt Ansible Vault encrypted content.",
        "steps": [
            "Verify vault password is correct",
            "Check vault password file path",
            "Ensure file was encrypted with current password",
            "Try: 'ansible-vault view <file>'",
        ],
        "severity": "error",
    },

    # ==========================================================================
    # HASHICORP VAULT ERRORS
    # ==========================================================================
    r"vault.*sealed": {
        "category": "vault_sealed",
        "suggestion": "HashiCorp Vault is sealed.",
        "steps": [
            "Unseal Vault: 'vault operator unseal <key>'",
            "Check Vault status: 'vault status'",
            "Verify auto-unseal configuration if used",
            "Review Vault logs for seal reason",
        ],
        "severity": "error",
    },
    r"vault.*permission denied|permission denied.*vault": {
        "category": "vault_permission_denied",
        "suggestion": "Vault policy does not allow this operation.",
        "steps": [
            "Check current token permissions: 'vault token lookup'",
            "Review required policy for this operation",
            "Use a token with appropriate permissions",
            "Update policy in Vault if needed",
        ],
        "severity": "error",
    },
    r"secret.*not found|path.*not found.*vault": {
        "category": "vault_secret_not_found",
        "suggestion": "Secret path does not exist in Vault.",
        "steps": [
            "Verify secret path spelling",
            "List secrets at path: 'vault kv list <path>'",
            "Check secret engine is enabled",
            "Create secret if it doesn't exist",
        ],
        "severity": "error",
    },
    r"vault.*token.*expired": {
        "category": "vault_token_expired",
        "suggestion": "Vault authentication token has expired.",
        "steps": [
            "Re-authenticate to Vault",
            "Check token TTL configuration",
            "Use a renewable token",
            "Configure token auto-renewal",
        ],
        "severity": "error",
    },

    # ==========================================================================
    # DATABASE ERRORS
    # ==========================================================================
    r"psql.*connection refused|postgresql.*connection refused": {
        "category": "postgres_connection_refused",
        "suggestion": "Cannot connect to PostgreSQL server.",
        "steps": [
            "Check PostgreSQL is running: 'systemctl status postgresql'",
            "Verify connection string (host, port, database)",
            "Check pg_hba.conf allows connections",
            "Verify firewall allows PostgreSQL port (5432)",
        ],
        "severity": "error",
    },
    r"FATAL:.*authentication failed.*postgres": {
        "category": "postgres_auth_failed",
        "suggestion": "PostgreSQL authentication failed.",
        "steps": [
            "Verify username and password",
            "Check pg_hba.conf authentication method",
            "Verify user exists: 'psql -c \"\\du\"'",
            "Check password encoding",
        ],
        "severity": "error",
    },
    r"redis.*connection refused|valkey.*connection refused": {
        "category": "redis_connection_refused",
        "suggestion": "Cannot connect to Redis/Valkey server.",
        "steps": [
            "Check Redis is running",
            "Verify connection host and port",
            "Check bind address in redis.conf",
            "Verify firewall allows Redis port (6379)",
        ],
        "severity": "error",
    },
    r"mongodb.*connection refused": {
        "category": "mongodb_connection_refused",
        "suggestion": "Cannot connect to MongoDB server.",
        "steps": [
            "Check MongoDB is running",
            "Verify connection string",
            "Check bindIp in mongod.conf",
            "Verify firewall allows MongoDB port (27017)",
        ],
        "severity": "error",
    },

    # ==========================================================================
    # CERTIFICATE AND TLS ERRORS
    # ==========================================================================
    r"certificate.*expired|SSL.*expired": {
        "category": "cert_expired",
        "suggestion": "SSL/TLS certificate has expired.",
        "steps": [
            "Check certificate expiry: 'openssl x509 -enddate -noout -in <cert>'",
            "Renew certificate with cert-manager",
            "Update certificate files",
            "Restart services using the certificate",
        ],
        "severity": "error",
    },
    r"certificate.*verify failed|SSL.*verify": {
        "category": "cert_verify_failed",
        "suggestion": "SSL/TLS certificate verification failed.",
        "steps": [
            "Check certificate chain is complete",
            "Verify CA certificate is trusted",
            "Check certificate hostname matches",
            "Update CA certificates: 'update-ca-certificates'",
        ],
        "severity": "error",
    },
    r"SSL.*handshake.*failed": {
        "category": "ssl_handshake_failed",
        "suggestion": "SSL/TLS handshake failed.",
        "steps": [
            "Check TLS version compatibility",
            "Verify cipher suite support",
            "Check certificate and key match",
            "Review SSL configuration",
        ],
        "severity": "error",
    },

    # ==========================================================================
    # GENERAL TIMEOUT ERRORS
    # ==========================================================================
    r"timeout|timed out|Timeout waiting": {
        "category": "timeout",
        "suggestion": "Operation timed out.",
        "steps": [
            "Increase timeout value in task",
            "Check network connectivity",
            "Verify target service is responsive",
            "Check for resource constraints",
        ],
        "severity": "error",
    },

    # ==========================================================================
    # GIT ERRORS
    # ==========================================================================
    r"git.*permission denied|Permission denied.*git": {
        "category": "git_permission_denied",
        "suggestion": "Git repository access denied.",
        "steps": [
            "Check SSH key is configured for Git",
            "Verify repository URL is correct",
            "Check access permissions on repository",
            "For HTTPS, check credentials",
        ],
        "severity": "error",
    },
    r"git.*not a git repository": {
        "category": "git_not_repo",
        "suggestion": "Directory is not a Git repository.",
        "steps": [
            "Clone repository first: 'git clone <url>'",
            "Check you're in the correct directory",
            "Initialize repo: 'git init'",
        ],
        "severity": "error",
    },
}


def get_suggestion(error_message: str, error_type: str = "unknown") -> SuggestionResult:
    """
    Match error message to suggestion.

    Args:
        error_message: The error message text to analyze
        error_type: The type of error (task_failed, host_unreachable, etc.)

    Returns:
        SuggestionResult with category, suggestion text, and recommended steps
    """
    if not error_message:
        return _get_default_suggestion(error_type)

    # Normalize error message for matching
    normalized = error_message.strip()

    # Check against known error patterns
    for pattern, suggestion_data in SUGGESTIONS.items():
        if re.search(pattern, normalized, re.IGNORECASE | re.MULTILINE):
            return SuggestionResult(
                category=suggestion_data["category"],
                suggestion=suggestion_data["suggestion"],
                steps=suggestion_data.get("steps", []),
                severity=suggestion_data.get("severity", "error"),
                documentation_url=suggestion_data.get("documentation_url"),
            )

    # Return default suggestion based on error type
    return _get_default_suggestion(error_type)


def _get_default_suggestion(error_type: str) -> SuggestionResult:
    """Return default suggestion when no pattern matches."""
    if error_type == "host_unreachable":
        return SuggestionResult(
            category="host_unreachable",
            suggestion="Cannot establish connection to the target host.",
            steps=[
                "Verify host is online: 'ping <host>'",
                "Check SSH service is running on target",
                "Verify firewall allows SSH (port 22)",
                "Check inventory configuration (ansible_host, ansible_user)",
                "Test SSH manually: 'ssh user@host'",
            ],
            severity="error",
        )

    return SuggestionResult(
        category="unknown",
        suggestion="An error occurred. Review the error details and trace file.",
        steps=[
            "Review the full error output in trace file",
            "Check task prerequisites completed successfully",
            "Verify configuration values",
            "Consult Ansible documentation for the failing module",
        ],
        severity="error",
    )


def get_all_categories() -> list[str]:
    """Return list of all error categories."""
    categories = set()
    for suggestion_data in SUGGESTIONS.values():
        categories.add(suggestion_data["category"])
    return sorted(categories)


def get_suggestions_by_category(category: str) -> list[dict]:
    """Return all suggestions for a given category."""
    results = []
    for pattern, suggestion_data in SUGGESTIONS.items():
        if suggestion_data["category"] == category:
            results.append({
                "pattern": pattern,
                **suggestion_data,
            })
    return results
