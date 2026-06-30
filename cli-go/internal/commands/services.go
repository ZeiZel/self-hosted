package commands

import (
	"fmt"
	"os"
	"sort"

	"github.com/ZeiZel/self-hosted/cli-go/internal/ui"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

// appEntry mirrors an entry in kubernetes/apps/_others.yaml.
type appEntry struct {
	Repo      string   `yaml:"repo"`
	Chart     string   `yaml:"chart"`
	Namespace string   `yaml:"namespace"`
	Version   string   `yaml:"version"`
	Installed *bool    `yaml:"installed"`
	Needs     []string `yaml:"needs"`
}

func loadAppRegistry() (map[string]appEntry, error) {
	paths, err := repoRoot()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(paths.AppsRegistry)
	if err != nil {
		return nil, fmt.Errorf("read app registry: %w", err)
	}
	// _others.yaml wraps the registry in a top-level `apps:` key.
	var wrapper struct {
		Apps map[string]appEntry `yaml:"apps"`
	}
	if err := yaml.Unmarshal(data, &wrapper); err != nil {
		return nil, err
	}
	if wrapper.Apps != nil {
		return wrapper.Apps, nil
	}
	// Fallback: flat map (older format).
	reg := map[string]appEntry{}
	if err := yaml.Unmarshal(data, &reg); err != nil {
		return nil, err
	}
	return reg, nil
}

func sortedKeys(m map[string]appEntry) []string {
	ks := make([]string, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	sort.Strings(ks)
	return ks
}

func newServicesCmd(g *Global) *cobra.Command {
	cmd := &cobra.Command{Use: "services", Aliases: []string{"svc"}, Short: "Manage service selection"}

	var asJSON bool
	list := &cobra.Command{
		Use: "list", Aliases: []string{"ls"}, Short: "List available services",
		RunE: func(c *cobra.Command, _ []string) error {
			reg, err := loadAppRegistry()
			if err != nil {
				return err
			}
			if asJSON {
				return printJSON(reg)
			}
			rows := [][]string{}
			for _, name := range sortedKeys(reg) {
				e := reg[name]
				installed := "yes"
				if e.Installed != nil && !*e.Installed {
					installed = "no"
				}
				rows = append(rows, []string{name, e.Namespace, e.Chart, e.Version, installed})
			}
			ui.Header(fmt.Sprintf("Services (%d)", len(reg)))
			fmt.Println(ui.Table([]string{"Name", "Namespace", "Chart", "Version", "Installed"}, rows))
			return nil
		},
	}
	list.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")

	toggle := func(use, short, status string, enabled int) *cobra.Command {
		return &cobra.Command{
			Use: use + " <name>", Short: short, Args: cobra.ExactArgs(1),
			RunE: func(c *cobra.Command, args []string) error {
				reg, err := loadAppRegistry()
				if err != nil {
					return err
				}
				e, ok := reg[args[0]]
				if !ok {
					return fmt.Errorf("unknown service %q", args[0])
				}
				d, err := openDB()
				if err != nil {
					return err
				}
				defer d.Close()
				if err := d.SetServiceEnabled(args[0], e.Namespace, enabled == 1); err != nil {
					return err
				}
				ui.OK("%s %s", status, args[0])
				return nil
			},
		}
	}

	summary := &cobra.Command{
		Use: "summary", Short: "Summarise enabled/disabled services",
		RunE: func(c *cobra.Command, _ []string) error {
			reg, err := loadAppRegistry()
			if err != nil {
				return err
			}
			enabled, disabled := 0, 0
			for _, e := range reg {
				if e.Installed != nil && !*e.Installed {
					disabled++
				} else {
					enabled++
				}
			}
			ui.Header("Services Summary")
			ui.Info("total: %d   enabled: %d   disabled: %d", len(reg), enabled, disabled)
			return nil
		},
	}

	cmd.AddCommand(
		list,
		toggle("enable", "Enable a service", "enabled", 1),
		toggle("disable", "Disable a service", "disabled", 0),
		summary,
	)
	return cmd
}
