package commands

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/ZeiZel/self-hosted/cli/internal/config"
	"github.com/ZeiZel/self-hosted/cli/internal/ui"
	"github.com/spf13/cobra"
)

// validConfigKeys lists the keys accepted by `config set`, in display order.
var validConfigKeys = []string{
	"cluster.name",
	"cluster.domain",
	"cluster.localDomain",
	"version",
	"initialized",
	"activeDeploymentId",
}

func newConfigCmd(g *Global) *cobra.Command {
	cmd := &cobra.Command{Use: "config", Short: "Manage CLI configuration"}

	var asJSON bool
	show := &cobra.Command{
		Use:   "show",
		Short: "Show current configuration",
		RunE: func(c *cobra.Command, _ []string) error {
			cfg, err := g.loadConfig()
			if err != nil {
				return err
			}
			if asJSON {
				return printJSON(cfg)
			}
			ui.Header("Configuration")
			fmt.Println(ui.Table(
				[]string{"Key", "Value"},
				[][]string{
					{"version", cfg.Version},
					{"cluster.name", cfg.Cluster.Name},
					{"cluster.domain", cfg.Cluster.Domain},
					{"cluster.localDomain", cfg.Cluster.LocalDomain},
					{"initialized", fmt.Sprintf("%t", cfg.Initialized)},
					{"activeDeploymentId", cfg.ActiveDeploymentID},
				}))
			return nil
		},
	}
	show.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")

	set := &cobra.Command{
		Use:   "set <key> <value>",
		Short: "Set a configuration value (e.g. cluster.domain example.com)",
		Args:  cobra.ExactArgs(2),
		RunE: func(c *cobra.Command, args []string) error {
			cfg, err := g.loadConfig()
			if err != nil {
				return err
			}
			if err := setConfigKey(cfg, args[0], args[1]); err != nil {
				return err
			}
			if err := config.Save(cfg); err != nil {
				return err
			}
			ui.OK("set %s = %s", args[0], args[1])
			return nil
		},
	}

	gen := &cobra.Command{
		Use:   "generate",
		Short: "Generate a deployment.yaml from current config",
		RunE: func(c *cobra.Command, _ []string) error {
			return generateDeploymentYAML(g)
		},
	}
	gen.Flags().Bool("from-current", false, "Use the current cluster config")

	cmd.AddCommand(show, set, gen)
	return cmd
}

func setConfigKey(cfg *config.AppConfig, key, value string) error {
	switch strings.ToLower(key) {
	case "cluster.name":
		cfg.Cluster.Name = value
	case "cluster.domain":
		cfg.Cluster.Domain = value
	case "cluster.localdomain":
		cfg.Cluster.LocalDomain = value
	case "version":
		cfg.Version = value
	case "initialized":
		b, err := strconv.ParseBool(value)
		if err != nil {
			return fmt.Errorf("invalid boolean for %q: %q (use true/false)", key, value)
		}
		cfg.Initialized = b
	case "activedeploymentid":
		cfg.ActiveDeploymentID = value
	default:
		return fmt.Errorf("unknown config key %q (valid keys: %s)", key, strings.Join(validConfigKeys, ", "))
	}
	return nil
}
