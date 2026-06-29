package commands

import (
	"fmt"
	"net"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/ZeiZel/self-hosted/cli-go/internal/db"
	"github.com/ZeiZel/self-hosted/cli-go/internal/ui"
	"github.com/spf13/cobra"
)

func newInventoryCmd(g *Global) *cobra.Command {
	cmd := &cobra.Command{Use: "inventory", Aliases: []string{"inv"}, Short: "Manage machine inventory"}
	cmd.AddCommand(
		invAddCmd(),
		invListCmd(),
		invRemoveCmd(),
		invValidateCmd(),
		invTestCmd(),
		invGenerateCmd(),
	)
	return cmd
}

func invAddCmd() *cobra.Command {
	var ip, label, roles, sshUser string
	var sshPort int
	var noTest bool
	cmd := &cobra.Command{
		Use:   "add",
		Short: "Add a machine to the inventory",
		RunE: func(c *cobra.Command, _ []string) error {
			if ip == "" || label == "" {
				return fmt.Errorf("--ip and --label are required")
			}
			d, err := openDB()
			if err != nil {
				return err
			}
			defer d.Close()
			m := &db.Machine{
				Label: label, IP: ip, SSHHost: ip, SSHPort: sshPort, SSHUser: sshUser,
				Roles: splitCSV(roles),
			}
			if !noTest {
				if err := tcpProbe(ip, sshPort); err == nil {
					m.Status = "reachable"
				} else {
					m.Status = "unreachable"
					ui.Warn("ssh probe failed: %v", err)
				}
			}
			if err := d.UpsertMachine(m); err != nil {
				return err
			}
			ui.OK("added %s (%s) roles=%s status=%s", label, ip, strings.Join(m.Roles, ","), m.Status)
			return nil
		},
	}
	cmd.Flags().StringVar(&ip, "ip", "", "Machine IP address")
	cmd.Flags().StringVar(&label, "label", "", "Unique machine label")
	cmd.Flags().StringVar(&roles, "roles", "worker", "Comma-separated roles (master,worker,storage,gateway)")
	cmd.Flags().StringVar(&sshUser, "ssh-user", "root", "SSH username")
	cmd.Flags().IntVar(&sshPort, "ssh-port", 22, "SSH port")
	cmd.Flags().BoolVar(&noTest, "no-test", false, "Skip SSH reachability test")
	return cmd
}

func invListCmd() *cobra.Command {
	var asJSON bool
	cmd := &cobra.Command{
		Use: "list", Aliases: []string{"ls"}, Short: "List machines",
		RunE: func(c *cobra.Command, _ []string) error {
			d, err := openDB()
			if err != nil {
				return err
			}
			defer d.Close()
			machines, err := d.ListMachines()
			if err != nil {
				return err
			}
			if asJSON {
				return printJSON(machines)
			}
			if len(machines) == 0 {
				ui.Info("no machines in inventory — add one with 'selfhost inventory add'")
				return nil
			}
			rows := make([][]string, 0, len(machines))
			for _, m := range machines {
				rows = append(rows, []string{m.Label, m.IP, strings.Join(m.Roles, ","),
					fmt.Sprintf("%s@%s:%d", m.SSHUser, m.SSHHost, m.SSHPort), m.Status})
			}
			ui.Header("Inventory")
			fmt.Println(ui.Table([]string{"Label", "IP", "Roles", "SSH", "Status"}, rows))
			return nil
		},
	}
	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

func invRemoveCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use: "remove <label>", Aliases: []string{"rm"}, Short: "Remove a machine", Args: cobra.ExactArgs(1),
		RunE: func(c *cobra.Command, args []string) error {
			d, err := openDB()
			if err != nil {
				return err
			}
			defer d.Close()
			n, err := d.DeleteMachine(args[0])
			if err != nil {
				return err
			}
			if n == 0 {
				return fmt.Errorf("no machine labelled %q", args[0])
			}
			ui.OK("removed %s", args[0])
			return nil
		},
	}
	return cmd
}

func invValidateCmd() *cobra.Command {
	return &cobra.Command{
		Use: "validate", Short: "Validate the inventory (roles, duplicate IPs, at least one master)",
		RunE: func(c *cobra.Command, _ []string) error {
			d, err := openDB()
			if err != nil {
				return err
			}
			defer d.Close()
			machines, err := d.ListMachines()
			if err != nil {
				return err
			}
			var problems []string
			ips := map[string]string{}
			masters := 0
			for _, m := range machines {
				if prev, dup := ips[m.IP]; dup {
					problems = append(problems, fmt.Sprintf("duplicate IP %s (%s and %s)", m.IP, prev, m.Label))
				}
				ips[m.IP] = m.Label
				for _, r := range m.Roles {
					if r == "master" {
						masters++
					}
				}
			}
			if len(machines) == 0 {
				problems = append(problems, "inventory is empty")
			} else if masters == 0 {
				problems = append(problems, "no machine has the 'master' role")
			}
			if len(problems) == 0 {
				ui.OK("inventory valid (%d machines, %d masters)", len(machines), masters)
				return nil
			}
			for _, p := range problems {
				ui.Fail("%s", p)
			}
			return fmt.Errorf("%d inventory problem(s)", len(problems))
		},
	}
}

func invTestCmd() *cobra.Command {
	return &cobra.Command{
		Use: "test", Short: "Test SSH reachability of all machines",
		RunE: func(c *cobra.Command, _ []string) error {
			d, err := openDB()
			if err != nil {
				return err
			}
			defer d.Close()
			machines, err := d.ListMachines()
			if err != nil {
				return err
			}
			for _, m := range machines {
				status := "reachable"
				if err := tcpProbe(m.SSHHost, m.SSHPort); err != nil {
					status = "unreachable"
					ui.Fail("%s (%s) — %v", m.Label, m.IP, err)
				} else {
					ui.OK("%s (%s)", m.Label, m.IP)
				}
				_ = d.SetMachineStatus(m.Label, status)
			}
			return nil
		},
	}
}

func invGenerateCmd() *cobra.Command {
	var out string
	cmd := &cobra.Command{
		Use: "generate", Short: "Generate an Ansible inventory (hosts.ini) from the machine DB",
		RunE: func(c *cobra.Command, _ []string) error {
			d, err := openDB()
			if err != nil {
				return err
			}
			defer d.Close()
			machines, err := d.ListMachines()
			if err != nil {
				return err
			}
			content := renderAnsibleInventory(machines)
			if out == "" {
				fmt.Print(content)
				return nil
			}
			if err := os.WriteFile(out, []byte(content), 0o644); err != nil {
				return err
			}
			ui.OK("wrote %s (%d machines)", out, len(machines))
			return nil
		},
	}
	cmd.Flags().StringVarP(&out, "output", "o", "", "Output file (default: stdout)")
	return cmd
}

// renderAnsibleInventory groups machines by role into Ansible groups.
func renderAnsibleInventory(machines []db.Machine) string {
	groups := map[string][]string{}
	for _, m := range machines {
		line := fmt.Sprintf("%s ansible_host=%s ansible_port=%d ansible_user=%s", m.Label, m.IP, m.SSHPort, m.SSHUser)
		for _, r := range m.Roles {
			groups[r] = append(groups[r], line)
		}
	}
	var b strings.Builder
	names := make([]string, 0, len(groups))
	for g := range groups {
		names = append(names, g)
	}
	sort.Strings(names)
	for _, g := range names {
		fmt.Fprintf(&b, "[%s]\n", g)
		for _, l := range groups[g] {
			b.WriteString(l + "\n")
		}
		b.WriteString("\n")
	}
	return b.String()
}

func tcpProbe(host string, port int) error {
	if port == 0 {
		port = 22
	}
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", host, port), 3*time.Second)
	if err != nil {
		return err
	}
	return conn.Close()
}

func splitCSV(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
