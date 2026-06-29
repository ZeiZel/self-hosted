package commands

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/ZeiZel/self-hosted/cli-go/internal/ui"
	"github.com/spf13/cobra"
)

// runPlaybook runs a specific ansible playbook under repo/ansible, streaming output.
func runPlaybook(playbook string, extraArgs ...string) error {
	paths, err := repoRoot()
	if err != nil {
		return err
	}
	args := append([]string{playbook}, extraArgs...)
	cmd := exec.Command("ansible-playbook", args...)
	cmd.Dir = paths.Ansible
	cmd.Env = append(os.Environ(), "ANSIBLE_FORCE_COLOR=true")
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	ui.Info("ansible-playbook %s (cwd=%s)", playbook, paths.Ansible)
	return cmd.Run()
}

func newVPNCmd(g *Global) *cobra.Command {
	cmd := &cobra.Command{Use: "vpn", Short: "Manage the WireGuard VPN client"}
	var gateway, clientIP string
	setup := &cobra.Command{
		Use: "setup", Short: "Configure the WireGuard client (runs vpn-client.yml)",
		RunE: func(c *cobra.Command, _ []string) error {
			extra := []string{"-i", "localhost,", "--connection=local"}
			if gateway != "" {
				extra = append(extra, "-e", "gateway="+gateway)
			}
			if clientIP != "" {
				extra = append(extra, "-e", "client_ip="+clientIP)
			}
			return runPlaybook("vpn-client.yml", extra...)
		},
	}
	setup.Flags().StringVar(&gateway, "gateway", "", "Gateway endpoint")
	setup.Flags().StringVar(&clientIP, "client-ip", "", "Client tunnel IP")

	wgScript := func(name string) *cobra.Command {
		return &cobra.Command{Use: name, Short: "Bring the VPN " + name,
			RunE: func(c *cobra.Command, _ []string) error {
				home, _ := os.UserHomeDir()
				script := filepath.Join(home, ".selfhosted", "wireguard", "wg-"+name+".sh")
				if _, err := os.Stat(script); err != nil {
					return fmt.Errorf("%s not found — run 'selfhost vpn setup' first", script)
				}
				cmd := exec.Command("bash", script)
				cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
				return cmd.Run()
			}}
	}
	status := &cobra.Command{Use: "status", Short: "Show VPN status",
		RunE: func(c *cobra.Command, _ []string) error {
			cmd := exec.Command("wg", "show")
			cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
			return cmd.Run()
		}}
	cmd.AddCommand(setup, wgScript("up"), wgScript("down"), status)
	return cmd
}

func newCertsCmd(g *Global) *cobra.Command {
	cmd := &cobra.Command{Use: "certs", Short: "Manage cert-manager"}
	var email string
	var staging bool
	setup := &cobra.Command{
		Use: "setup", Short: "Install cert-manager (runs cert-manager.yml)",
		RunE: func(c *cobra.Command, _ []string) error {
			extra := []string{"-i", "localhost,", "--connection=local"}
			if email != "" {
				extra = append(extra, "-e", "acme_email="+email)
			}
			if staging {
				extra = append(extra, "-e", "acme_staging=true")
			}
			return runPlaybook("cert-manager.yml", extra...)
		},
	}
	setup.Flags().StringVar(&email, "email", "", "ACME contact email")
	setup.Flags().BoolVar(&staging, "staging", false, "Use Let's Encrypt staging")

	list := &cobra.Command{Use: "list", Short: "List certificates",
		RunE: func(c *cobra.Command, _ []string) error {
			return kubectlPassthrough("get", "certificates", "-A")
		}}
	status := &cobra.Command{Use: "status [name]", Short: "Show certificate status", Args: cobra.MaximumNArgs(1),
		RunE: func(c *cobra.Command, args []string) error {
			a := []string{"describe", "certificate", "-A"}
			if len(args) == 1 {
				a = []string{"describe", "certificate", args[0], "-A"}
			}
			return kubectlPassthrough(a...)
		}}
	cmd.AddCommand(setup, list, status)
	return cmd
}

func newGatewayCmd(g *Global) *cobra.Command {
	cmd := &cobra.Command{Use: "gateway", Short: "Manage the Pangolin gateway"}
	var inventory string
	setup := &cobra.Command{
		Use: "setup", Short: "Set up the Pangolin gateway (runs pangolin-gateway.yml)",
		RunE: func(c *cobra.Command, _ []string) error {
			extra := []string{}
			if inventory != "" {
				extra = append(extra, "-i", filepath.Join("inventory", inventory))
			}
			return runPlaybook("pangolin-gateway.yml", extra...)
		},
	}
	setup.Flags().StringVar(&inventory, "inventory", "", "Inventory file under inventory/")
	status := &cobra.Command{Use: "status", Short: "Show gateway status",
		RunE: func(c *cobra.Command, _ []string) error {
			return kubectlPassthrough("get", "pods", "-n", "infrastructure", "-l", "app.kubernetes.io/name=pangolin")
		}}
	cmd.AddCommand(setup, status)
	return cmd
}

func kubectlPassthrough(args ...string) error {
	cmd := exec.Command("kubectl", args...)
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	return cmd.Run()
}
