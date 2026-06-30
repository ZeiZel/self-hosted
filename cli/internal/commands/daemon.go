package commands

import (
	"github.com/ZeiZel/self-hosted/cli/internal/daemon"
	"github.com/ZeiZel/self-hosted/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newDaemonCmd(g *Global) *cobra.Command {
	cmd := &cobra.Command{Use: "daemon", Short: "Manage the background monitoring daemon"}

	var interval int
	var force bool
	initc := &cobra.Command{Use: "init", Short: "Install the daemon service (launchd/systemd)",
		RunE: func(c *cobra.Command, _ []string) error { return daemon.Init(interval, force) }}
	initc.Flags().IntVarP(&interval, "interval", "i", 60, "Health-check interval (seconds)")
	initc.Flags().BoolVar(&force, "force", false, "Overwrite existing service unit")

	start := &cobra.Command{Use: "start", Short: "Start the daemon",
		RunE: func(c *cobra.Command, _ []string) error { return daemon.Start() }}
	stop := &cobra.Command{Use: "stop", Short: "Stop the daemon",
		RunE: func(c *cobra.Command, _ []string) error { return daemon.Stop() }}
	restart := &cobra.Command{Use: "restart", Short: "Restart the daemon",
		RunE: func(c *cobra.Command, _ []string) error { return daemon.Restart() }}
	remove := &cobra.Command{Use: "remove", Short: "Remove the daemon service",
		RunE: func(c *cobra.Command, _ []string) error { return daemon.Remove() }}

	var asJSON bool
	status := &cobra.Command{Use: "status", Short: "Show daemon status",
		RunE: func(c *cobra.Command, _ []string) error {
			st, err := daemon.Status()
			if err != nil {
				return err
			}
			if asJSON {
				return printJSON(st)
			}
			ui.Header("Daemon Status")
			if st.Running {
				ui.OK("running (last check: %s)", st.LastCheck)
			} else {
				ui.Warn("not running")
			}
			return nil
		}}
	status.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")

	var tail int
	var statusFilter, container string
	var follow, logsJSON bool
	logs := &cobra.Command{Use: "logs", Short: "Show recent health-check logs",
		RunE: func(c *cobra.Command, _ []string) error {
			return daemon.Logs(daemon.LogOptions{Tail: tail, Status: statusFilter, JSON: logsJSON, Follow: follow})
		}}
	logs.Flags().IntVar(&tail, "tail", 50, "Number of log entries")
	logs.Flags().StringVar(&statusFilter, "status", "", "Filter by status (degraded/critical/...)")
	logs.Flags().BoolVarP(&follow, "follow", "f", false, "Stream new log entries")
	logs.Flags().StringVar(&container, "container", "", "Container filter (accepted for parity; native daemon has none)")
	logs.Flags().BoolVar(&logsJSON, "json", false, "Output as JSON")

	// Hidden foreground entrypoint invoked by the service unit.
	run := &cobra.Command{Use: "run", Hidden: true, Short: "Run the daemon in the foreground",
		RunE: func(c *cobra.Command, _ []string) error { return daemon.RunForeground() }}

	cmd.AddCommand(initc, start, stop, restart, remove, status, logs, run)
	return cmd
}
