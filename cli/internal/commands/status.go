package commands

import (
	"fmt"

	"github.com/ZeiZel/self-hosted/cli/internal/cluster"
	"github.com/ZeiZel/self-hosted/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newStatusCmd(g *Global) *cobra.Command {
	var asJSON, mock bool
	cmd := &cobra.Command{
		Use:   "status",
		Short: "Show cluster and deployment status",
		RunE: func(c *cobra.Command, _ []string) error {
			cl := cluster.New()
			cl.Mock = mock

			cfg, _ := g.loadConfig()
			summary, err := cl.Summary()
			connected := err == nil

			if asJSON {
				return printJSON(map[string]any{
					"connected": connected,
					"cluster":   cfg.Cluster,
					"summary":   summary,
					"error":     errString(err),
				})
			}

			ui.Header("Cluster Status")
			if cfg != nil {
				ui.Info("cluster: %s (%s)", cfg.Cluster.Name, cfg.Cluster.Domain)
			}
			if !connected {
				ui.Warn("cluster unreachable: %v", err)
				ui.Info("re-run with --mock for a demo dataset")
				return nil
			}
			ui.OK("cluster reachable")
			fmt.Println(ui.Table(
				[]string{"Resource", "Total", "Used", "%"},
				[][]string{
					{"Nodes", fmt.Sprintf("%d", summary.Nodes.Total),
						fmt.Sprintf("%d healthy", summary.Nodes.Healthy), ""},
					{"Pods", fmt.Sprintf("%d", summary.Pods.Total),
						fmt.Sprintf("%d running", summary.Pods.Running), ""},
					{"CPU", cluster.FormatCPU(summary.CPU.Total), cluster.FormatCPU(summary.CPU.Used),
						fmt.Sprintf("%d%%", summary.CPU.Percent)},
					{"Memory", cluster.FormatBytes(summary.Memory.Total), cluster.FormatBytes(summary.Memory.Used),
						fmt.Sprintf("%d%%", summary.Memory.Percent)},
					{"Namespaces", fmt.Sprintf("%d", summary.Namespaces), "", ""},
				}))
			return nil
		},
	}
	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	cmd.Flags().BoolVar(&mock, "mock", false, "Use mock cluster data (offline demo)")
	return cmd
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
