// Package commands wires the cobra command tree. Mirrors cli/src/cli.ts.
package commands

import (
	"fmt"

	"github.com/ZeiZel/self-hosted/cli/internal/core"
	"github.com/ZeiZel/self-hosted/cli/internal/ui"
	"github.com/spf13/cobra"
)

// Global flags shared by all commands.
type Global struct {
	NoColor bool
	Verbose bool
	Config  string
}

// NewRoot builds the root command and registers every subcommand.
func NewRoot() *cobra.Command {
	g := &Global{}

	root := &cobra.Command{
		Use:           core.CLIName,
		Short:         core.CLIDescription,
		Version:       core.Version,
		SilenceUsage:  true,
		SilenceErrors: true, // fang renders errors
		PersistentPreRun: func(cmd *cobra.Command, args []string) {
			if g.NoColor {
				ui.NoColor()
			}
		},
	}

	root.PersistentFlags().BoolVar(&g.NoColor, "no-color", false, "Disable colored output")
	root.PersistentFlags().BoolVarP(&g.Verbose, "verbose", "v", false, "Enable verbose output")
	root.PersistentFlags().StringVar(&g.Config, "config", "", "Path to config file")

	// Styled banner on top of cobra's default help (replaces fang's styling).
	defaultHelp := root.HelpFunc()
	root.SetHelpFunc(func(cmd *cobra.Command, args []string) {
		if cmd == root && !g.NoColor {
			fmt.Println(ui.Title.Render("  ⎈ selfhost") + ui.Muted.Render("  v"+core.Version+" — self-hosted infrastructure CLI"))
		}
		defaultHelp(cmd, args)
	})

	root.AddCommand(
		newInitCmd(g),
		newInventoryCmd(g),
		newServicesCmd(g),
		newPlanCmd(g),
		newDeployCmd(g),
		newStatusCmd(g),
		newValidateCmd(g),
		newConfigCmd(g),
		newBalanceCmd(g),
		newMonitorCmd(g),
		newDaemonCmd(g),
		newTestCmd(g),
		newBotCmd(g),
		newVPNCmd(g),
		newCertsCmd(g),
		newGatewayCmd(g),
		newUpdateCmd(g),
	)
	return root
}
