// Package ansible wraps ansible-playbook execution and the deployment-phase →
// Ansible-tag mapping, ported from cli/src/commands/deploy.command.ts and
// cli/src/interfaces/deployment.interface.ts.
package ansible

import (
	"io"
	"os"
	"os/exec"
	"path/filepath"
)

// Phase is a deployment phase (1..9).
type Phase int

const (
	PhaseInfrastructureSetup Phase = iota + 1
	PhaseKubernetesBootstrap
	PhaseStorageLayer
	PhaseBackupSetup
	PhaseCoreServices
	PhaseDatabases
	PhaseApplicationServices
	PhaseNetworkGateway
	PhaseVerification
)

// AllPhases lists phases in execution order.
var AllPhases = []Phase{
	PhaseInfrastructureSetup, PhaseKubernetesBootstrap, PhaseStorageLayer,
	PhaseBackupSetup, PhaseCoreServices, PhaseDatabases,
	PhaseApplicationServices, PhaseNetworkGateway, PhaseVerification,
}

// PhaseToTags maps each phase to its Ansible tags (PHASE_TO_ANSIBLE_TAGS).
var PhaseToTags = map[Phase][]string{
	PhaseInfrastructureSetup: {"server", "docker"},
	PhaseKubernetesBootstrap: {"kubespray", "kubernetes"},
	PhaseStorageLayer:        {"storage", "openebs"},
	PhaseBackupSetup:         {"backup", "backup-node", "zerobyte"},
	PhaseCoreServices:        {"infrastructure", "base"},
	PhaseDatabases:           {"infrastructure", "databases"},
	PhaseApplicationServices: {"infrastructure", "apps"},
	PhaseNetworkGateway:      {"pangolin"},
	PhaseVerification:        {"validate", "verify"},
}

var phaseNames = map[Phase]string{
	PhaseInfrastructureSetup: "Infrastructure Setup",
	PhaseKubernetesBootstrap: "Kubernetes Bootstrap",
	PhaseStorageLayer:        "Storage Layer",
	PhaseBackupSetup:         "Backup Infrastructure",
	PhaseCoreServices:        "Core Services",
	PhaseDatabases:           "Databases",
	PhaseApplicationServices: "Application Services",
	PhaseNetworkGateway:      "Network & Gateway",
	PhaseVerification:        "Verification",
}

// Name returns the human-readable phase name.
func (p Phase) Name() string { return phaseNames[p] }

// Result captures an ansible-playbook run outcome.
type Result struct {
	Success bool
	Output  string
	Error   string
}

// Options configure an ansible-playbook invocation.
type Options struct {
	AnsibleDir    string    // working directory (repo/ansible)
	InventoryFile string    // file under inventory/ (e.g. hosts.ini)
	Tags          []string  // --tags
	DryRun        bool      // --check
	Stdout        io.Writer // live stream target (defaults to os.Stdout)
	Stderr        io.Writer
}

// Run executes ansible-playbook with the given tags, streaming output live and
// also capturing it. Mirrors executeAnsible() from the Node CLI.
func Run(opts Options) Result {
	args := []string{
		"-i", filepath.Join("inventory", opts.InventoryFile),
		"all.yml",
		"--tags", join(opts.Tags),
	}
	if opts.DryRun {
		args = append(args, "--check")
	}
	vaultFile := filepath.Join(os.Getenv("HOME"), ".ansible_vault_password")
	args = append(args, "--vault-password-file", vaultFile)

	cmd := exec.Command("ansible-playbook", args...)
	cmd.Dir = opts.AnsibleDir
	cmd.Env = append(os.Environ(), "ANSIBLE_FORCE_COLOR=true", "ANSIBLE_STDOUT_CALLBACK=yaml")

	stdout := opts.Stdout
	if stdout == nil {
		stdout = os.Stdout
	}
	stderr := opts.Stderr
	if stderr == nil {
		stderr = os.Stderr
	}
	var outBuf, errBuf capture
	cmd.Stdout = io.MultiWriter(stdout, &outBuf)
	cmd.Stderr = io.MultiWriter(stderr, &errBuf)

	err := cmd.Run()
	return Result{Success: err == nil, Output: outBuf.String(), Error: errBuf.String()}
}

// CommandLine returns the human-readable command that Run would execute (for logging/dry display).
func CommandLine(opts Options) string {
	args := []string{"ansible-playbook", "-i", filepath.Join("inventory", opts.InventoryFile), "all.yml", "--tags", join(opts.Tags)}
	if opts.DryRun {
		args = append(args, "--check")
	}
	return join2(args)
}

func join(tags []string) string {
	out := ""
	for i, t := range tags {
		if i > 0 {
			out += ","
		}
		out += t
	}
	return out
}

func join2(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += " "
		}
		out += p
	}
	return out
}

type capture struct{ b []byte }

func (c *capture) Write(p []byte) (int, error) { c.b = append(c.b, p...); return len(p), nil }
func (c *capture) String() string              { return string(c.b) }
