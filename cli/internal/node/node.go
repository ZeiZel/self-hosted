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

// Add scales the cluster up by joining a new node. It runs the dedicated
// ansible/scale.yml playbook, which prepares the node's OS (server + docker),
// regenerates the kubespray inventory and runs kubespray scale.yml. The node
// must already be present in the Ansible inventory — the CLI regenerates it from
// the machine database before calling this (see commands/node.go).
func Add(name, inventory string) error {
	if name == "" {
		return fmt.Errorf("node name is required")
	}
	if inventory == "" {
		inventory = "hosts.ini"
	}
	return runPlaybook("scale.yml",
		"-i", "inventory/"+inventory,
		"-e", "target_node="+name,
		"--limit", name+",localhost",
	)
}

// Remove scales the cluster down by gracefully removing a node. It runs the
// dedicated ansible/remove-node.yml playbook, which invokes kubespray's
// remove-node.yml (cordon + drain + reset of that node only). The node must
// still be present in the inventory when this runs.
func Remove(name, inventory string) error {
	if name == "" {
		return fmt.Errorf("node name is required")
	}
	if inventory == "" {
		inventory = "hosts.ini"
	}
	return runPlaybook("remove-node.yml",
		"-i", "inventory/"+inventory,
		"-e", "node="+name,
	)
}
