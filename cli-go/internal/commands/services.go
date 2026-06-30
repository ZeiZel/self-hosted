package commands

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

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
	// The registry is split across kubernetes/apps/*.yaml, each wrapping its
	// entries in a top-level `apps:` key. Merge them all.
	dir := filepath.Dir(paths.AppsRegistry)
	files, err := filepath.Glob(filepath.Join(dir, "*.yaml"))
	if err != nil {
		return nil, err
	}
	reg := map[string]appEntry{}
	for _, f := range files {
		data, err := os.ReadFile(f)
		if err != nil {
			return nil, err
		}
		var wrapper struct {
			Apps map[string]appEntry `yaml:"apps"`
		}
		if err := yaml.Unmarshal(data, &wrapper); err != nil {
			return nil, fmt.Errorf("%s: %w", filepath.Base(f), err)
		}
		for k, v := range wrapper.Apps {
			reg[k] = v
		}
	}
	if len(reg) == 0 {
		return nil, fmt.Errorf("no apps found under %s", dir)
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

	selectCmd := &cobra.Command{
		Use: "select", Short: "Interactively choose which services to enable",
		RunE: func(c *cobra.Command, _ []string) error {
			reg, err := loadAppRegistry()
			if err != nil {
				return err
			}
			names := sortedKeys(reg)
			chosen, err := askMultiSelect("Select services to enable", names)
			if err != nil {
				return err
			}
			set := map[string]bool{}
			for _, n := range chosen {
				set[n] = true
			}
			d, err := openDB()
			if err != nil {
				return err
			}
			defer d.Close()
			for _, n := range names {
				if err := d.SetServiceEnabled(n, reg[n].Namespace, set[n]); err != nil {
					return err
				}
			}
			ui.OK("enabled %d service(s)", len(chosen))
			return nil
		},
	}

	configure := &cobra.Command{
		Use: "configure <name>", Aliases: []string{"config"}, Short: "Configure a service", Args: cobra.ExactArgs(1),
		RunE: func(c *cobra.Command, args []string) error {
			reg, err := loadAppRegistry()
			if err != nil {
				return err
			}
			e, ok := reg[args[0]]
			if !ok {
				return fmt.Errorf("unknown service %q", args[0])
			}
			enable, err := confirm(fmt.Sprintf("Enable %s?", args[0]))
			if err != nil {
				return err
			}
			ns, err := askString("Namespace", e.Namespace)
			if err != nil {
				return err
			}
			if ns == "" {
				ns = e.Namespace
			}
			d, err := openDB()
			if err != nil {
				return err
			}
			defer d.Close()
			if err := d.SetServiceEnabled(args[0], ns, enable); err != nil {
				return err
			}
			ui.OK("configured %s (namespace=%s, enabled=%t)", args[0], ns, enable)
			return nil
		},
	}

	validate := &cobra.Command{
		Use: "validate", Short: "Validate service dependencies resolve within the registry",
		RunE: func(c *cobra.Command, _ []string) error {
			reg, err := loadAppRegistry()
			if err != nil {
				return err
			}
			problems := 0
			for _, name := range sortedKeys(reg) {
				for _, need := range reg[name].Needs {
					// needs are "namespace/service"; check the service half exists
					dep := need
					if i := strings.LastIndex(need, "/"); i >= 0 {
						dep = need[i+1:]
					}
					if _, ok := reg[dep]; !ok && !knownInfraDep(dep) {
						ui.Warn("%s needs %q which is not in the registry", name, need)
						problems++
					}
				}
			}
			if problems == 0 {
				ui.OK("all service dependencies resolve (%d services)", len(reg))
				return nil
			}
			return fmt.Errorf("%d unresolved dependency reference(s)", problems)
		},
	}

	cmd.AddCommand(
		list,
		selectCmd,
		configure,
		validate,
		toggle("enable", "Enable a service", "enabled", 1),
		toggle("disable", "Disable a service", "disabled", 0),
		summary,
	)
	return cmd
}

// knownInfraDep lists dependency names that are platform components, not registry apps.
func knownInfraDep(name string) bool {
	switch name {
	case "traefik", "vault", "consul", "cert-manager", "authentik", "namespaces", "postgres", "postgresql":
		return true
	}
	return false
}
