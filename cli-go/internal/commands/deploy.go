package commands

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/ZeiZel/self-hosted/cli-go/internal/ansible"
	"github.com/ZeiZel/self-hosted/cli-go/internal/config"
	"github.com/ZeiZel/self-hosted/cli-go/internal/ui"
	"github.com/spf13/cobra"
)

func newDeployCmd(g *Global) *cobra.Command {
	var (
		bypass     bool
		dryRun     bool
		tags       string
		inventory  string
		onlyPhase  int
		skipPhases string
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

			phases := ansible.AllPhases
			if onlyPhase != 0 {
				phases = []ansible.Phase{ansible.Phase(onlyPhase)}
			}

			ui.Header("Deployment")
			for _, p := range phases {
				if skip[int(p)] {
					ui.Info("skipping phase %d — %s", int(p), p.Name())
					continue
				}
				tagList := ansible.PhaseToTags[p]
				opts := ansible.Options{
					AnsibleDir: paths.Ansible, InventoryFile: inventory,
					Tags: tagList, DryRun: dryRun,
				}
				if !bypass && !dryRun {
					ok, err := confirm(fmt.Sprintf("Run phase %d — %s  [%s]?", int(p), p.Name(), strings.Join(tagList, ",")))
					if err != nil {
						return err
					}
					if !ok {
						ui.Info("phase %d skipped by user", int(p))
						continue
					}
				}
				ui.Header(fmt.Sprintf("Phase %d — %s", int(p), p.Name()))
				ui.Info("%s", ansible.CommandLine(opts))
				res := ansible.Run(opts)
				if !res.Success {
					ui.Fail("phase %d (%s) failed", int(p), p.Name())
					return fmt.Errorf("deployment aborted at phase %d", int(p))
				}
				ui.OK("phase %d complete", int(p))
			}
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

	cmd.AddCommand(deployHistoryCmd(g))
	return cmd
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
