package balance

import (
	"bytes"
	"fmt"
	"os/exec"
	"time"
)

// nowRFC3339 returns the current UTC time formatted for migration records.
func nowRFC3339() string { return time.Now().UTC().Format(time.RFC3339) }

// patchPayload builds the strategic merge patch that pins a workload's pod
// template to a specific node via the standard hostname label.
func patchPayload(targetNode string) string {
	return fmt.Sprintf(`{"spec":{"template":{"spec":{"nodeSelector":{"kubernetes.io/hostname":%q}}}}}`, targetNode)
}

// runKubectl executes kubectl with the given args, capturing stderr for error
// reporting. Returns combined stderr text on failure.
func runKubectl(args ...string) (string, error) {
	cmd := exec.Command("kubectl", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err != nil {
		msg := stderr.String()
		if msg == "" {
			msg = stdout.String()
		}
		return msg, fmt.Errorf("kubectl %v: %w: %s", args, err, msg)
	}
	return stdout.String(), nil
}

// workloadExists reports whether a workload of the given kind exists in the namespace.
func workloadExists(kind, ns, name string) bool {
	cmd := exec.Command("kubectl", "-n", ns, "get", kind, name, "--no-headers", "--ignore-not-found")
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return len(bytes.TrimSpace(out)) > 0
}

// resolveKind determines which workload kind (deployment or statefulset) backs
// the service, preferring deployment.
func resolveKind(ns, name string) (string, error) {
	if workloadExists("deployment", ns, name) {
		return "deployment", nil
	}
	if workloadExists("statefulset", ns, name) {
		return "statefulset", nil
	}
	return "", fmt.Errorf("no deployment or statefulset %q found in namespace %q", name, ns)
}

// ExecuteMigration performs a real kubectl-based move of a service's workload to
// its target node: it patches the pod template's nodeSelector to pin the
// workload to the target host, then waits for the rollout to complete. When
// dryRun is set the kubectl commands are printed instead of executed. The
// returned Migration carries updated Status/StartedAt/CompletedAt/Error fields.
func ExecuteMigration(m Migration, dryRun bool) error {
	patch := patchPayload(m.TargetNode)

	if dryRun {
		fmt.Printf("[dry-run] would migrate %s (%s): %s -> %s\n", m.Service, m.Namespace, m.SourceNode, m.TargetNode)
		fmt.Printf("[dry-run]   kubectl -n %s patch deployment %s --type merge -p '%s'\n", m.Namespace, m.Service, patch)
		fmt.Printf("[dry-run]   kubectl -n %s rollout status deployment/%s --timeout=120s\n", m.Namespace, m.Service)
		fmt.Printf("[dry-run]   (falls back to statefulset if no deployment exists)\n")
		return nil
	}

	kind, err := resolveKind(m.Namespace, m.Service)
	if err != nil {
		return err
	}

	if _, err := runKubectl("-n", m.Namespace, "patch", kind, m.Service, "--type", "merge", "-p", patch); err != nil {
		return err
	}

	if _, err := runKubectl("-n", m.Namespace, "rollout", "status", kind+"/"+m.Service, "--timeout=120s"); err != nil {
		return err
	}
	return nil
}

// ExecuteMigrations runs each migration in order, recording timing and status on
// a copy of the input slice, and returns the updated migrations. A failed
// migration does not abort the remaining ones.
func ExecuteMigrations(ms []Migration, dryRun bool) []Migration {
	out := make([]Migration, len(ms))
	copy(out, ms)
	for i := range out {
		out[i].StartedAt = nowRFC3339()
		out[i].Error = ""
		if err := ExecuteMigration(out[i], dryRun); err != nil {
			out[i].Status = "failed"
			out[i].Error = err.Error()
			out[i].CompletedAt = nowRFC3339()
			continue
		}
		out[i].Status = "completed"
		out[i].CompletedAt = nowRFC3339()
	}
	return out
}
