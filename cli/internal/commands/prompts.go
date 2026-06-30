package commands

import (
	"strconv"
	"strings"

	"github.com/ZeiZel/self-hosted/cli/internal/config"
	"github.com/charmbracelet/huh"
)

// confirm shows a yes/no prompt (huh). Replaces inquirer confirm.
func confirm(title string) (bool, error) {
	var ok bool
	err := huh.NewConfirm().Title(title).Affirmative("Yes").Negative("No").Value(&ok).Run()
	return ok, err
}

// askString prompts for a line of input.
func askString(title, placeholder string) (string, error) {
	var v string
	err := huh.NewInput().Title(title).Placeholder(placeholder).Value(&v).Run()
	return v, err
}

// askPassword prompts for a hidden line of input (replaces the raw-stdin reader).
func askPassword(title string) (string, error) {
	var v string
	err := huh.NewInput().Title(title).EchoMode(huh.EchoModePassword).Value(&v).Run()
	return v, err
}

// askSelect presents a single-choice menu.
func askSelect(title string, options []string) (string, error) {
	var v string
	opts := make([]huh.Option[string], len(options))
	for i, o := range options {
		opts[i] = huh.NewOption(o, o)
	}
	err := huh.NewSelect[string]().Title(title).Options(opts...).Value(&v).Run()
	return v, err
}

// askMultiSelect presents a multi-choice menu.
func askMultiSelect(title string, options []string) ([]string, error) {
	var v []string
	opts := make([]huh.Option[string], len(options))
	for i, o := range options {
		opts[i] = huh.NewOption(o, o)
	}
	err := huh.NewMultiSelect[string]().Title(title).Options(opts...).Value(&v).Run()
	return v, err
}

// machineWizard runs a multi-step form collecting everything needed to register
// a machine in the inventory. Roles are returned as a comma-separated string so
// callers can feed them straight into splitCSV. Replaces the old TS machineWizard.
func machineWizard() (label, ip, roles, sshUser string, sshPort int, err error) {
	sshUser = "root"
	portStr := "22"
	var roleSel []string
	form := huh.NewForm(
		huh.NewGroup(
			huh.NewInput().Title("Machine label").Placeholder("node-1").Value(&label),
			huh.NewInput().Title("Machine IP").Placeholder("192.168.1.10").Value(&ip),
			huh.NewMultiSelect[string]().
				Title("Roles").
				Options(
					huh.NewOption("master", "master"),
					huh.NewOption("worker", "worker"),
					huh.NewOption("storage", "storage"),
					huh.NewOption("gateway", "gateway"),
				).
				Value(&roleSel),
			huh.NewInput().Title("SSH user").Value(&sshUser),
			huh.NewInput().Title("SSH port").Value(&portStr),
		),
	)
	if err = form.Run(); err != nil {
		return
	}
	roles = strings.Join(roleSel, ",")
	sshPort, _ = strconv.Atoi(strings.TrimSpace(portStr))
	if sshPort == 0 {
		sshPort = 22
	}
	return
}

// clusterWizard runs a form for the core cluster settings, prefilled with the
// current configuration. Replaces the old TS clusterWizard.
func clusterWizard(cur config.Cluster) (name, domain, localDomain string, err error) {
	name = cur.Name
	domain = cur.Domain
	localDomain = cur.LocalDomain
	form := huh.NewForm(
		huh.NewGroup(
			huh.NewInput().Title("Cluster name").Value(&name),
			huh.NewInput().Title("Cluster domain").Placeholder("example.com").Value(&domain),
			huh.NewInput().Title("Cluster local domain").Placeholder("homelab.local").Value(&localDomain),
		),
	)
	err = form.Run()
	return
}
