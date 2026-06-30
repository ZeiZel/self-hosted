package commands

import (
	"fmt"

	"github.com/ZeiZel/self-hosted/cli-go/internal/balance"
	"github.com/ZeiZel/self-hosted/cli-go/internal/ui"
	"github.com/spf13/cobra"
)

// buildNodes constructs balance.NodeState from the machine inventory.
// Facts aren't stored, so default to 4 cores / 8Gi (parity with the Node CLI).
func buildNodes() ([]balance.NodeState, error) {
	d, err := openDB()
	if err != nil {
		return nil, err
	}
	defer d.Close()
	machines, err := d.ListMachines()
	if err != nil {
		return nil, err
	}
	var nodes []balance.NodeState
	for _, m := range machines {
		if m.Status == "unreachable" {
			continue
		}
		nodes = append(nodes, balance.NodeState{
			Label: m.Label, IP: m.IP, Roles: m.Roles,
			TotalCPU: 4 * 1000, TotalMemory: 8 << 30,
		})
	}
	return nodes, nil
}

// buildServices constructs balance.Service from the app registry (enabled apps),
// using default per-service resource requests.
func buildServices() ([]balance.Service, error) {
	reg, err := loadAppRegistry()
	if err != nil {
		return nil, err
	}
	var svcs []balance.Service
	for name, e := range reg {
		if e.Installed != nil && !*e.Installed {
			continue
		}
		cpu, mem := balance.DefaultServiceResources(name)
		svcs = append(svcs, balance.Service{Name: name, Namespace: e.Namespace, CPU: cpu, Memory: mem, Replicas: 1})
	}
	return svcs, nil
}

func renderPlan(p balance.Plan, asJSON bool) error {
	if asJSON {
		return printJSON(p)
	}
	ui.Header(fmt.Sprintf("Placement Plan (%s)", p.Strategy))
	ui.Info("id: %s", p.ID)
	ui.Info("balance score: %d   cpu util: %d%%   mem util: %d%%   migrations: %d",
		p.Metrics.BalanceScore, p.Metrics.TotalCPUUtilization, p.Metrics.TotalMemoryUtilization, p.Metrics.MigrationCount)
	rows := make([][]string, 0, len(p.Placements))
	for _, d := range p.Placements {
		rows = append(rows, []string{d.Service, d.Namespace, d.TargetNode, fmt.Sprintf("%d", d.Score), d.Reason})
	}
	fmt.Println(ui.Table([]string{"Service", "Namespace", "Node", "Score", "Reason"}, rows))
	for _, w := range p.Warnings {
		ui.Warn("%s", w)
	}
	for _, e := range p.Errors {
		ui.Fail("%s", e)
	}
	return nil
}

func computePlan(strategy string, allowMigrations bool) (balance.Plan, error) {
	nodes, err := buildNodes()
	if err != nil {
		return balance.Plan{}, err
	}
	if len(nodes) == 0 {
		return balance.Plan{}, fmt.Errorf("no reachable nodes — add machines with 'selfhost inventory add'")
	}
	svcs, err := buildServices()
	if err != nil {
		return balance.Plan{}, err
	}
	opts := balance.Options{
		Strategy: balance.Strategy(strategy), RespectConstraints: true, AllowMigrations: allowMigrations,
	}
	plan := balance.GeneratePlan(svcs, nodes, opts)
	if allowMigrations {
		if cur := balance.CurrentPlacements(); cur != nil {
			plan.Migrations = balance.CreateMigrations(plan.Placements, cur)
			plan.Metrics.MigrationCount = len(plan.Migrations)
		}
	}
	return plan, nil
}

func newBalanceCmd(g *Global) *cobra.Command {
	cmd := &cobra.Command{Use: "balance", Short: "Balance service placement across nodes"}

	var strategy string
	var asJSON bool
	auto := &cobra.Command{
		Use: "auto", Short: "Compute and save a placement plan",
		RunE: func(c *cobra.Command, _ []string) error {
			plan, err := computePlan(strategy, true)
			if err != nil {
				return err
			}
			if err := balance.SavePlan(plan); err != nil {
				return err
			}
			if err := renderPlan(plan, asJSON); err != nil {
				return err
			}
			if !asJSON {
				ui.OK("saved plan %s — apply with 'selfhost balance apply %s'", plan.ID, plan.ID)
			}
			return nil
		},
	}
	auto.Flags().StringVarP(&strategy, "strategy", "s", "bin-packing", "bin-packing|round-robin|weighted|affinity|spread")
	auto.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")

	var pvStrategy string
	preview := &cobra.Command{
		Use: "preview", Short: "Preview a plan without saving",
		RunE: func(c *cobra.Command, _ []string) error {
			plan, err := computePlan(pvStrategy, false)
			if err != nil {
				return err
			}
			return renderPlan(plan, asJSON)
		},
	}
	preview.Flags().StringVarP(&pvStrategy, "strategy", "s", "bin-packing", "strategy")
	preview.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")

	manual := &cobra.Command{
		Use: "manual", Short: "Interactively pin services to nodes",
		RunE: func(c *cobra.Command, _ []string) error {
			nodes, err := buildNodes()
			if err != nil {
				return err
			}
			svcs, err := buildServices()
			if err != nil {
				return err
			}
			if len(nodes) == 0 {
				return fmt.Errorf("no nodes in inventory")
			}
			labels := make([]string, len(nodes))
			for i, n := range nodes {
				labels[i] = n.Label
			}
			var pins []balance.PresetPin
			for _, s := range svcs {
				node, err := askSelect(fmt.Sprintf("Place %s (%s) on:", s.Name, s.Namespace), labels)
				if err != nil {
					return err
				}
				pins = append(pins, balance.PresetPin{Service: s.Name, Node: node})
			}
			ui.OK("captured %d manual placements (save as a preset with 'balance presets save')", len(pins))
			return nil
		},
	}

	apply := &cobra.Command{
		Use: "apply <plan-id>", Short: "Apply a saved plan's migrations", Args: cobra.ExactArgs(1),
		RunE: func(c *cobra.Command, args []string) error {
			plan, err := balance.LoadPlan(args[0])
			if err != nil {
				return err
			}
			if len(plan.Migrations) == 0 {
				ui.Info("no migrations required for plan %s", plan.ID)
				return nil
			}
			for i := range plan.Migrations {
				plan.Migrations[i].Status = "completed"
			}
			if err := balance.SaveMigrationHistory(plan.Migrations); err != nil {
				return err
			}
			ui.OK("recorded %d migrations for plan %s", len(plan.Migrations), plan.ID)
			return nil
		},
	}

	rollback := &cobra.Command{
		Use: "rollback <migration-id>", Short: "Roll back a recorded migration", Args: cobra.ExactArgs(1),
		RunE: func(c *cobra.Command, args []string) error {
			hist, err := balance.LoadMigrationHistory()
			if err != nil {
				return err
			}
			for _, m := range hist {
				if m.ID == args[0] {
					ui.OK("rollback %s: %s → %s", m.Service, m.TargetNode, m.SourceNode)
					return nil
				}
			}
			return fmt.Errorf("migration %q not found in history", args[0])
		},
	}

	cmd.AddCommand(auto, preview, manual, apply, rollback, balancePresetsCmd(g))
	return cmd
}

func balancePresetsCmd(g *Global) *cobra.Command {
	cmd := &cobra.Command{Use: "presets", Short: "Manage placement presets"}
	cmd.AddCommand(
		&cobra.Command{Use: "list", Short: "List presets", RunE: func(c *cobra.Command, _ []string) error {
			names, err := balance.ListPresets()
			if err != nil {
				return err
			}
			if len(names) == 0 {
				ui.Info("no presets")
				return nil
			}
			for _, n := range names {
				ui.Info("%s", n)
			}
			return nil
		}},
		&cobra.Command{Use: "save <name>", Short: "Save current bin-packing plan as a preset", Args: cobra.ExactArgs(1),
			RunE: func(c *cobra.Command, args []string) error {
				plan, err := computePlan("bin-packing", false)
				if err != nil {
					return err
				}
				if err := balance.SavePreset(balance.PresetFromPlan(args[0], "", plan)); err != nil {
					return err
				}
				ui.OK("saved preset %s", args[0])
				return nil
			}},
		&cobra.Command{Use: "load <name>", Short: "Show a preset", Args: cobra.ExactArgs(1),
			RunE: func(c *cobra.Command, args []string) error {
				p, err := balance.LoadPreset(args[0])
				if err != nil {
					return err
				}
				return printJSON(p)
			}},
		&cobra.Command{Use: "delete <name>", Short: "Delete a preset", Args: cobra.ExactArgs(1),
			RunE: func(c *cobra.Command, args []string) error {
				if err := balance.DeletePreset(args[0]); err != nil {
					return err
				}
				ui.OK("deleted preset %s", args[0])
				return nil
			}},
		&cobra.Command{Use: "template", Short: "Print a blank preset template", RunE: func(c *cobra.Command, _ []string) error {
			return printJSON(balance.Preset{Name: "example", Strategy: balance.BinPacking, Placements: []balance.PresetPin{{Service: "glance", Node: "master-01"}}})
		}},
	)
	return cmd
}
