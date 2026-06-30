package commands

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ZeiZel/self-hosted/cli/internal/ansible"
	"github.com/ZeiZel/self-hosted/cli/internal/config"
	"github.com/ZeiZel/self-hosted/cli/internal/ui"
	"github.com/google/uuid"
	"github.com/spf13/cobra"
)

func newDeployCmd(g *Global) *cobra.Command {
	var (
		bypass      bool
		dryRun      bool
		tags        string
		inventory   string
		onlyPhase   int
		skipPhases  string
		resume      bool
		fresh       bool
		enableLocal bool
		localDomain string
		cfgFile     string
	)
	cmd := &cobra.Command{
		Use:   "deploy",
		Short: "Deploy infrastructure and services via Ansible",
		RunE: func(c *cobra.Command, _ []string) error {
			paths, err := repoRoot()
			if err != nil {
				return err
			}

			// Direct tag mode bypasses the phase system (parity with --tags).
			if tags != "" {
				ui.Header("Ansible (direct tags)")
				res := ansible.Run(ansible.Options{
					AnsibleDir: paths.Ansible, InventoryFile: inventory,
					Tags: splitCSV(tags), DryRun: dryRun,
				})
				if !res.Success {
					return fmt.Errorf("ansible failed")
				}
				ui.OK("done")
				return nil
			}

			skip := map[int]bool{}
			for _, s := range splitCSV(skipPhases) {
				var n int
				fmt.Sscanf(s, "%d", &n)
				skip[n] = true
			}

			// Resolve/restore deployment state.
			state, err := resolveState(g, resume, fresh)
			if err != nil {
				return err
			}
			done := map[int]bool{}
			for _, p := range state.CompletedPhases {
				done[p] = true
			}

			phases := ansible.AllPhases
			if onlyPhase != 0 {
				phases = []ansible.Phase{ansible.Phase(onlyPhase)}
			}

			ui.Header(fmt.Sprintf("Deployment %s", state.ID))
			if enableLocal {
				ui.Info("local access enabled for *.%s", localDomain)
			}
			state.Status = "running"
			_ = saveState(state)

			for _, p := range phases {
				if skip[int(p)] || done[int(p)] {
					ui.Info("skipping phase %d — %s", int(p), p.Name())
					state.SkippedPhases = appendUnique(state.SkippedPhases, int(p))
					continue
				}
				tagList := ansible.PhaseToTags[p]
				opts := ansible.Options{AnsibleDir: paths.Ansible, InventoryFile: inventory, Tags: tagList, DryRun: dryRun}
				if !bypass && !dryRun {
					ok, err := confirm(fmt.Sprintf("Run phase %d — %s  [%s]?", int(p), p.Name(), strings.Join(tagList, ",")))
					if err != nil {
						return err
					}
					if !ok {
						ui.Info("phase %d skipped by user", int(p))
						state.SkippedPhases = appendUnique(state.SkippedPhases, int(p))
						continue
					}
				}
				state.CurrentPhase = int(p)
				_ = saveState(state)

				// Run with per-phase error handling (retry/skip/abort/debug).
				if err := runPhaseWithRetry(p, opts, bypass || dryRun); err != nil {
					state.FailedPhases = appendUnique(state.FailedPhases, int(p))
					state.Status = "failed"
					_ = saveState(state)
					return err
				}
				state.CompletedPhases = appendUnique(state.CompletedPhases, int(p))
				_ = saveState(state)
				ui.OK("phase %d complete", int(p))
			}
			state.Status = "success"
			state.CompletedAt = time.Now().UTC().Format(time.RFC3339)
			_ = saveState(state)
			ui.OK("deployment finished")
			return nil
		},
	}
	cmd.Flags().BoolVar(&bypass, "bypass-permissions", false, "Skip all confirmation prompts")
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "Pass --check to Ansible (no changes)")
	cmd.Flags().StringVar(&tags, "tags", "", "Run specific Ansible tags directly (bypasses phases)")
	cmd.Flags().StringVar(&inventory, "inventory", "hosts.ini", "Inventory file under ansible/inventory/")
	cmd.Flags().IntVar(&onlyPhase, "only-phase", 0, "Run only this phase (1-9)")
	cmd.Flags().StringVar(&skipPhases, "skip-phase", "", "Comma-separated phases to skip")
	cmd.Flags().BoolVar(&resume, "resume", false, "Resume the last incomplete deployment")
	cmd.Flags().BoolVar(&fresh, "fresh", false, "Start a fresh deployment (ignore incomplete)")
	cmd.Flags().BoolVar(&enableLocal, "enable-local-access", false, "Configure local access via <app>.<domain>")
	cmd.Flags().StringVar(&localDomain, "local-domain", "zeizel.local", "Local domain suffix")
	cmd.Flags().StringVar(&cfgFile, "config", "", "Headless deployment config (deployment.yaml)")

	cmd.AddCommand(deployHistoryCmd(g), deployCleanCmd(g))
	return cmd
}

// runPhaseWithRetry runs a phase, prompting retry/skip/abort/debug on failure.
func runPhaseWithRetry(p ansible.Phase, opts ansible.Options, noPrompt bool) error {
	for {
		ui.Header(fmt.Sprintf("Phase %d — %s", int(p), p.Name()))
		ui.Info("%s", ansible.CommandLine(opts))
		res := ansible.Run(opts)
		if res.Success {
			return nil
		}
		ui.Fail("phase %d (%s) failed", int(p), p.Name())
		if noPrompt {
			return fmt.Errorf("deployment aborted at phase %d", int(p))
		}
		action, err := askSelect("Phase failed — what now?", []string{"retry", "skip", "abort", "debug"})
		if err != nil {
			return err
		}
		switch action {
		case "retry":
			continue
		case "skip":
			ui.Warn("skipping phase %d", int(p))
			return nil
		case "debug":
			if res.Error != "" {
				fmt.Println(res.Error)
			} else {
				tail := res.Output
				if len(tail) > 2000 {
					tail = tail[len(tail)-2000:]
				}
				fmt.Println(tail)
			}
			continue
		default: // abort
			return fmt.Errorf("deployment aborted at phase %d", int(p))
		}
	}
}

// resolveState returns the deployment state to use, honouring --resume/--fresh.
func resolveState(g *Global, resume, fresh bool) (*config.DeploymentState, error) {
	if resume && !fresh {
		if active, err := config.ActiveDeployment(); err == nil && active != nil {
			ui.Info("resuming deployment %s (phase %d)", active.ID, active.CurrentPhase)
			return active, nil
		}
		ui.Warn("no incomplete deployment to resume — starting fresh")
	}
	root, _ := repoRoot()
	state := &config.DeploymentState{
		ID:        uuid.NewString()[:8],
		Status:    "pending",
		StartedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if d, err := openDB(); err == nil {
		machines, _ := d.ListMachines()
		for _, m := range machines {
			state.Machines = append(state.Machines, config.MachineRef{Label: m.Label, IP: m.IP, Roles: m.Roles})
		}
		state.Services, _ = d.EnabledServices()
		d.Close()
	}
	_ = root
	return state, nil
}

// saveState upserts the deployment state into deployments.json.
func saveState(s *config.DeploymentState) error {
	all, _ := config.LoadDeployments()
	found := false
	for i := range all {
		if all[i].ID == s.ID {
			all[i] = *s
			found = true
			break
		}
	}
	if !found {
		all = append(all, *s)
	}
	return config.SaveDeployments(all)
}

func appendUnique(xs []int, v int) []int {
	for _, x := range xs {
		if x == v {
			return xs
		}
	}
	return append(xs, v)
}

func deployHistoryCmd(g *Global) *cobra.Command {
	var limit int
	var asJSON bool
	cmd := &cobra.Command{
		Use: "history", Short: "Show past deployments",
		RunE: func(c *cobra.Command, _ []string) error {
			ds, err := config.LoadDeployments()
			if err != nil {
				return err
			}
			if asJSON {
				return printJSON(ds)
			}
			if len(ds) == 0 {
				ui.Info("no deployment history")
				return nil
			}
			if limit > 0 && len(ds) > limit {
				ds = ds[len(ds)-limit:]
			}
			rows := make([][]string, 0, len(ds))
			for _, d := range ds {
				rows = append(rows, []string{d.ID, d.Status, d.StartedAt, fmt.Sprintf("phase %d", d.CurrentPhase)})
			}
			ui.Header("Deployment History")
			fmt.Println(ui.Table([]string{"ID", "Status", "Started", "Phase"}, rows))
			return nil
		},
	}
	cmd.Flags().IntVar(&limit, "limit", 0, "Max entries to show")
	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

func deployCleanCmd(g *Global) *cobra.Command {
	var keep int
	var all bool
	cmd := &cobra.Command{
		Use: "clean", Short: "Prune deployment history",
		RunE: func(c *cobra.Command, _ []string) error {
			ds, err := config.LoadDeployments()
			if err != nil {
				return err
			}
			before := len(ds)
			if all {
				ds = nil
			} else if keep > 0 && len(ds) > keep {
				ds = ds[len(ds)-keep:]
			}
			if err := config.SaveDeployments(ds); err != nil {
				return err
			}
			ui.OK("pruned %d deployment record(s)", before-len(ds))
			return nil
		},
	}
	cmd.Flags().IntVar(&keep, "keep", 10, "Number of recent deployments to keep")
	cmd.Flags().BoolVar(&all, "all", false, "Remove all deployment history")
	return cmd
}

// generateDeploymentYAML writes a starter deployment.yaml from current config + inventory.
func generateDeploymentYAML(g *Global) error {
	cfg, err := g.loadConfig()
	if err != nil {
		return err
	}
	d, err := openDB()
	if err != nil {
		return err
	}
	defer d.Close()
	machines, _ := d.ListMachines()

	var b strings.Builder
	fmt.Fprintf(&b, "cluster:\n  name: %s\n  domain: %s\n  localDomain: %s\n\nnodes:\n",
		cfg.Cluster.Name, cfg.Cluster.Domain, cfg.Cluster.LocalDomain)
	for _, m := range machines {
		fmt.Fprintf(&b, "  - ip: %s\n    label: %s\n    roles: [%s]\n    ssh_user: %s\n    ssh_port: %d\n",
			m.IP, m.Label, strings.Join(m.Roles, ", "), m.SSHUser, m.SSHPort)
	}
	b.WriteString("\nsettings:\n  bypass_permissions: false\n  parallel_deploys: 3\n")

	out := filepath.Join(".", "deployment.yaml")
	if err := os.WriteFile(out, []byte(b.String()), 0o644); err != nil {
		return err
	}
	ui.OK("wrote %s", out)
	return nil
}
