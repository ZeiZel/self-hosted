package commands

import (
	"encoding/json"
	"fmt"

	"github.com/ZeiZel/self-hosted/cli-go/internal/config"
	"github.com/ZeiZel/self-hosted/cli-go/internal/core"
	"github.com/ZeiZel/self-hosted/cli-go/internal/db"
)

// loadConfig loads the CLI config (honouring --config if set).
func (g *Global) loadConfig() (*config.AppConfig, error) {
	return config.Load()
}

// openDB opens the shared SQLite database.
func openDB() (*db.DB, error) {
	return db.Open(core.DatabasePath())
}

// repoRoot resolves the repository root or returns a friendly error.
func repoRoot() (core.RepoPaths, error) {
	root := core.FindRepoRoot()
	if root == "" {
		return core.RepoPaths{}, fmt.Errorf("could not find repository root — run inside the self-hosted directory")
	}
	return core.GetRepoPaths(root), nil
}

// printJSON marshals v as indented JSON to stdout.
func printJSON(v any) error {
	out, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(out))
	return nil
}
