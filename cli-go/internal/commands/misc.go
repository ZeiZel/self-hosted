package commands

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/ZeiZel/self-hosted/cli-go/internal/config"
	"github.com/ZeiZel/self-hosted/cli-go/internal/core"
	"github.com/ZeiZel/self-hosted/cli-go/internal/ui"
	"github.com/spf13/cobra"
)

func newInitCmd(g *Global) *cobra.Command {
	var force, skipDeps bool
	cmd := &cobra.Command{
		Use:   "init",
		Short: "Initialise the CLI: verify dependencies and create config",
		RunE: func(c *cobra.Command, _ []string) error {
			ui.Header("Initialising selfhost")
			if err := core.EnsureDirs(); err != nil {
				return err
			}
			ui.OK("config dir ready: %s", core.BaseDir())

			if !skipDeps {
				ui.Header("Dependency check")
				for _, tool := range []string{"ansible-playbook", "kubectl", "helm", "docker"} {
					if _, err := exec.LookPath(tool); err != nil {
						ui.Fail("%s not found", tool)
					} else {
						ui.OK("%s", tool)
					}
				}
			}

			cfg, err := g.loadConfig()
			if err != nil {
				return err
			}
			if cfg.Initialized && !force {
				ui.Info("already initialised (use --force to re-run the wizard)")
				return nil
			}
			name, _ := askString("Cluster name", cfg.Cluster.Name)
			if name != "" {
				cfg.Cluster.Name = name
			}
			domain, _ := askString("Cluster domain", cfg.Cluster.Domain)
			if domain != "" {
				cfg.Cluster.Domain = domain
			}
			cfg.Initialized = true
			if err := config.Save(cfg); err != nil {
				return err
			}
			ui.OK("initialised cluster %q (%s)", cfg.Cluster.Name, cfg.Cluster.Domain)
			return nil
		},
	}
	cmd.Flags().BoolVar(&force, "force", false, "Re-run the wizard even if initialised")
	cmd.Flags().BoolVar(&skipDeps, "skip-deps", false, "Skip the dependency check")
	return cmd
}

func newValidateCmd(g *Global) *cobra.Command {
	var strict bool
	cmd := &cobra.Command{
		Use:   "validate",
		Short: "Validate repo, dependencies, inventory and services",
		RunE: func(c *cobra.Command, _ []string) error {
			problems := 0
			ui.Header("Validation")

			if _, err := repoRoot(); err != nil {
				ui.Fail("repo: %v", err)
				problems++
			} else {
				ui.OK("repository root found")
			}
			for _, tool := range []string{"ansible-playbook", "kubectl", "helm"} {
				if _, err := exec.LookPath(tool); err != nil {
					ui.Fail("missing tool: %s", tool)
					problems++
				} else {
					ui.OK("tool: %s", tool)
				}
			}
			if d, err := openDB(); err == nil {
				machines, _ := d.ListMachines()
				if len(machines) == 0 {
					ui.Warn("inventory empty")
					if strict {
						problems++
					}
				} else {
					ui.OK("inventory: %d machines", len(machines))
				}
				d.Close()
			}
			if problems > 0 {
				return fmt.Errorf("%d validation problem(s)", problems)
			}
			ui.OK("all checks passed")
			return nil
		},
	}
	cmd.Flags().BoolVar(&strict, "strict", false, "Treat warnings as errors")
	return cmd
}

func newPlanCmd(g *Global) *cobra.Command {
	var asJSON bool
	cmd := &cobra.Command{
		Use:   "plan",
		Short: "Preview service placement across nodes",
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
			enabled, _ := d.EnabledServices()
			plan := map[string]any{
				"nodes":    len(machines),
				"services": len(enabled),
				"strategy": "bin-packing",
			}
			if asJSON {
				return printJSON(plan)
			}
			ui.Header("Deployment Plan")
			ui.Info("%d nodes, %d enabled services (bin-packing placement)", len(machines), len(enabled))
			if len(machines) == 0 {
				ui.Warn("add machines with 'selfhost inventory add' to compute placement")
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}

func newTestCmd(g *Global) *cobra.Command {
	var all bool
	var service, namespace string
	var timeout int
	cmd := &cobra.Command{
		Use:   "test",
		Short: "Run Helm tests on releases",
		RunE: func(c *cobra.Command, _ []string) error {
			if !all && service == "" {
				return fmt.Errorf("specify --service <name> or --all")
			}
			run := func(rel, ns string) error {
				args := []string{"test", rel, fmt.Sprintf("--timeout=%ds", timeout)}
				if ns != "" {
					args = append(args, "-n", ns)
				}
				ui.Info("helm %s", strings.Join(args, " "))
				return kubectlHelm(args...)
			}
			if all {
				ui.Header("Helm tests (all releases)")
				out, err := exec.Command("helm", "list", "-A", "-o", "json").Output()
				if err != nil {
					return err
				}
				var rels []struct{ Name, Namespace string }
				if err := json.Unmarshal(out, &rels); err != nil {
					return err
				}
				for _, r := range rels {
					if err := run(r.Name, r.Namespace); err != nil {
						ui.Fail("%s: %v", r.Name, err)
					} else {
						ui.OK("%s", r.Name)
					}
				}
				return nil
			}
			return run(service, namespace)
		},
	}
	cmd.Flags().BoolVar(&all, "all", false, "Test all releases")
	cmd.Flags().StringVarP(&service, "service", "s", "", "Release to test")
	cmd.Flags().StringVarP(&namespace, "namespace", "n", "", "Namespace")
	cmd.Flags().IntVar(&timeout, "timeout", 300, "Timeout seconds")
	return cmd
}

func kubectlHelm(args ...string) error {
	cmd := exec.Command("helm", args...)
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	return cmd.Run()
}

func newUpdateCmd(g *Global) *cobra.Command {
	var asJSON bool
	cmd := &cobra.Command{
		Use:   "update",
		Short: "Check for a newer CLI release on GitHub",
		RunE: func(c *cobra.Command, _ []string) error {
			url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", core.GitHubOwner, core.GitHubRepo)
			client := &http.Client{Timeout: 8 * time.Second}
			resp, err := client.Get(url)
			if err != nil {
				return err
			}
			defer resp.Body.Close()
			var rel struct {
				TagName string `json:"tag_name"`
				HTMLURL string `json:"html_url"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
				return err
			}
			info := map[string]string{"current": core.Version, "latest": rel.TagName, "url": rel.HTMLURL}
			if asJSON {
				return printJSON(info)
			}
			ui.Header("Update Check")
			ui.Info("current: %s", core.Version)
			ui.Info("latest:  %s", rel.TagName)
			if rel.TagName != "" && strings.TrimPrefix(rel.TagName, "v") != strings.TrimPrefix(core.Version, "v") {
				ui.Warn("a newer version is available: %s", rel.HTMLURL)
			} else {
				ui.OK("up to date")
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")
	return cmd
}
