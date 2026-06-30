// Package node wraps kubectl and ansible for Kubernetes node lifecycle
// operations: listing, cordon/uncordon, drain, and scaling the cluster
// (add/remove) via the kubespray Ansible role.
package node

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/ZeiZel/self-hosted/cli/internal/core"
)

// runKubectl executes kubectl with the given args, streaming output to the
// parent process's stdout/stderr.
func runKubectl(args ...string) error {
	cmd := exec.Command("kubectl", args...)
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	return cmd.Run()
}

// List prints all cluster nodes in wide format.
func List() error {
	return runKubectl("get", "nodes", "-o", "wide")
}

// Cordon marks a node as unschedulable.
func Cordon(name string) error {
	if name == "" {
		return fmt.Errorf("node name is required")
	}
	return runKubectl("cordon", name)
}

// Uncordon marks a node as schedulable again.
func Uncordon(name string) error {
	if name == "" {
		return fmt.Errorf("node name is required")
	}
	return runKubectl("uncordon", name)
}

// Drain safely evicts all pods from a node. DaemonSet-managed pods are ignored
// and emptyDir data is deleted. When force is true, pods not managed by a
// controller are also evicted.
func Drain(name string, force bool) error {
	if name == "" {
		return fmt.Errorf("node name is required")
	}
	args := []string{"drain", name, "--ignore-daemonsets", "--delete-emptydir-data"}
	if force {
		args = append(args, "--force")
	}
	return runKubectl(args...)
}

// runPlaybook runs an Ansible playbook under the repo's ansible directory,
// streaming output. Mirrors the pattern in internal/commands/net.go.
func runPlaybook(playbook string, extraArgs ...string) error {
	root := core.FindRepoRoot()
	if root == "" {
		return fmt.Errorf("could not find repository root — run inside the self-hosted directory")
	}
	paths := core.GetRepoPaths(root)

	args := append([]string{playbook}, extraArgs...)
	cmd := exec.Command("ansible-playbook", args...)
	cmd.Dir = paths.Ansible
	cmd.Env = append(os.Environ(), "ANSIBLE_FORCE_COLOR=true")
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	return cmd.Run()
}

// Add scales the cluster by adding a new node. The repo has no dedicated
// scale playbook, so this is best-effort: it runs the main playbook (all.yml)
// limited to the named host with the kubespray tag, passing -e node=<name>.
// The kubespray role's scale tasks (roles/kubespray/tasks/scale.yml) cover the
// underlying mechanics.
func Add(name string) error {
	if name == "" {
		return fmt.Errorf("node name is required")
	}
	return runPlaybook("all.yml",
		"--tags", "kubespray",
		"--limit", name,
		"-e", "node="+name,
	)
}

// Remove scales the cluster down by removing a node. Like Add, this is
// best-effort against the kubespray role (roles/kubespray/tasks/reset.yml):
// it drains/cordons the node first via kubectl, then runs the main playbook
// limited to the host with the kubespray tag and -e node=<name>.
func Remove(name string) error {
	if name == "" {
		return fmt.Errorf("node name is required")
	}
	// Best-effort drain before removal; ignore errors so removal proceeds.
	_ = Drain(name, true)
	return runPlaybook("all.yml",
		"--tags", "kubespray",
		"--limit", name,
		"-e", "node="+name,
		"-e", "kubespray_action=remove",
	)
}
