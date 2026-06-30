package commands

import (
	"fmt"

	"github.com/ZeiZel/self-hosted/cli-go/internal/cluster"
	"github.com/ZeiZel/self-hosted/cli-go/internal/tui"
	"github.com/ZeiZel/self-hosted/cli-go/internal/ui"
	"github.com/spf13/cobra"
)

func newMonitorCmd(g *Global) *cobra.Command {
	var (
		refresh                            int
		headless, mock                     bool
		namespace, node                    string
		noAlerts                           bool
		cpuWarn, cpuCrit, memWarn, memCrit float64
	)
	mkThresholds := func() cluster.AlertThresholds {
		th := cluster.DefaultThresholds
		th.CPUWarning, th.CPUCritical, th.MemWarning, th.MemCritical = cpuWarn, cpuCrit, memWarn, memCrit
		return th
	}
	cmd := &cobra.Command{
		Use:   "monitor",
		Short: "Live cluster dashboard (TUI)",
		RunE: func(c *cobra.Command, _ []string) error {
			cl := cluster.New()
			cl.Mock = mock
			cl.Thresholds = mkThresholds()
			opts := tui.Options{
				RefreshInterval: refresh,
				Namespace:       namespace,
				Node:            node,
				ShowAlerts:      !noAlerts,
				Thresholds:      mkThresholds(),
			}
			if headless {
				return tui.Headless(cl, opts)
			}
			return tui.Run(cl, opts)
		},
	}
	cmd.Flags().IntVarP(&refresh, "refresh", "r", 5, "Refresh interval (seconds)")
	cmd.Flags().BoolVar(&headless, "headless", false, "Print a JSON snapshot instead of the TUI")
	cmd.Flags().BoolVar(&mock, "mock", false, "Use mock cluster data (offline demo)")
	cmd.Flags().StringVarP(&namespace, "namespace", "n", "", "Filter by namespace")
	cmd.Flags().StringVar(&node, "node", "", "Filter by node")
	cmd.Flags().BoolVar(&noAlerts, "no-alerts", false, "Disable alerts panel")
	cmd.Flags().Float64Var(&cpuWarn, "cpu-warn", 75, "CPU warning threshold %")
	cmd.Flags().Float64Var(&cpuCrit, "cpu-crit", 90, "CPU critical threshold %")
	cmd.Flags().Float64Var(&memWarn, "mem-warn", 80, "Memory warning threshold %")
	cmd.Flags().Float64Var(&memCrit, "mem-crit", 95, "Memory critical threshold %")

	// Non-TUI sub-views.
	cmd.AddCommand(
		monitorSub("status", "Cluster summary", func(cl *cluster.Client) error {
			s, err := cl.Summary()
			if err != nil {
				return err
			}
			return printJSON(s)
		}),
		monitorSub("nodes", "Node metrics", func(cl *cluster.Client) error {
			n, err := cl.NodeMetricsList()
			if err != nil {
				return err
			}
			return printJSON(n)
		}),
		monitorSub("pods", "Pod/service metrics", func(cl *cluster.Client) error {
			s, err := cl.ServiceMetricsList("")
			if err != nil {
				return err
			}
			return printJSON(s)
		}),
		monitorSub("alerts", "Active alerts", func(cl *cluster.Client) error {
			nodes, err := cl.NodeMetricsList()
			if err != nil {
				return err
			}
			svcs, _ := cl.ServiceMetricsList("")
			return printJSON(cluster.GenerateAlerts(nodes, svcs, cl.Thresholds))
		}),
	)
	return cmd
}

func monitorSub(use, short string, fn func(*cluster.Client) error) *cobra.Command {
	var mock bool
	c := &cobra.Command{
		Use: use, Short: short,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cl := cluster.New()
			cl.Mock = mock
			if err := cl.CheckConnection(); err != nil {
				ui.Warn("cluster unreachable: %v (try --mock)", err)
				return fmt.Errorf("not connected")
			}
			return fn(cl)
		},
	}
	c.Flags().BoolVar(&mock, "mock", false, "Use mock cluster data")
	return c
}
