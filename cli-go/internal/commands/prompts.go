package commands

import "github.com/charmbracelet/huh"

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
