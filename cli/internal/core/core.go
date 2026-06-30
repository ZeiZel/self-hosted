// Package core holds CLI-wide constants and filesystem path helpers,
// ported from cli/src/core/constants.ts and cli/src/utils/paths.ts.
package core

import (
	"os"
	"path/filepath"
)

// CLI metadata.
const (
	CLIName        = "selfhost"
	CLIDescription = "CLI tool for automated self-hosted infrastructure deployment"
	Version        = "2.0.0" // Go rewrite
)

// GitHub repository info for update checking.
const (
	GitHubOwner = "ZeiZel"
	GitHubRepo  = "self-hosted"
)

// On-disk layout under $HOME/.selfhosted (kept identical to the Node CLI so
// both binaries share state).
const (
	BaseDirName  = ".selfhosted"
	ConfigFile   = "config.yaml"
	DatabaseFile = "selfhosted.db"
	CacheDir     = "cache"
	StateDir     = "state"
	ProjectsDir  = "projects"
	DaemonDir    = "daemon"
)

// BaseDir returns $HOME/.selfhosted, honouring SELFHOST_CONFIG_DIR and DATA_DIR
// overrides (the latter is used by the daemon).
func BaseDir() string {
	if v := os.Getenv("SELFHOST_CONFIG_DIR"); v != "" {
		return v
	}
	if v := os.Getenv("DATA_DIR"); v != "" {
		return v
	}
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	return filepath.Join(home, BaseDirName)
}

// ConfigPath is $HOME/.selfhosted/config.yaml.
func ConfigPath() string { return filepath.Join(BaseDir(), ConfigFile) }

// DatabasePath is $HOME/.selfhosted/selfhosted.db.
func DatabasePath() string { return filepath.Join(BaseDir(), DatabaseFile) }

// StatePath is $HOME/.selfhosted/state.
func StatePath() string { return filepath.Join(BaseDir(), StateDir) }

// DaemonPath is $HOME/.selfhosted/daemon.
func DaemonPath() string { return filepath.Join(BaseDir(), DaemonDir) }

// EnsureDirs creates the base directory tree if missing.
func EnsureDirs() error {
	for _, d := range []string{
		BaseDir(),
		filepath.Join(BaseDir(), CacheDir),
		filepath.Join(BaseDir(), StateDir),
		filepath.Join(BaseDir(), ProjectsDir),
	} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return err
		}
	}
	return nil
}

// RepoPaths mirrors getRepoPaths() from the Node CLI.
type RepoPaths struct {
	Root         string
	CLI          string
	Kubernetes   string
	Ansible      string
	Charts       string
	Releases     string
	AppsRegistry string
	Helmfile     string
	Inventory    string
	GroupVars    string
	Docs         string
}

// FindRepoRoot walks up from cwd looking for the repo markers
// (kubernetes/ + ansible/ + CLAUDE.md, or cli/ + kubernetes/).
// Returns "" if not found.
func FindRepoRoot() string {
	dir, err := os.Getwd()
	if err != nil {
		return ""
	}
	for {
		if exists(filepath.Join(dir, "kubernetes")) &&
			exists(filepath.Join(dir, "ansible")) &&
			exists(filepath.Join(dir, "CLAUDE.md")) {
			return dir
		}
		if exists(filepath.Join(dir, "cli")) && exists(filepath.Join(dir, "kubernetes")) {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir { // reached filesystem root
			return ""
		}
		dir = parent
	}
}

// GetRepoPaths computes repo-relative paths from a root.
func GetRepoPaths(root string) RepoPaths {
	return RepoPaths{
		Root:         root,
		CLI:          filepath.Join(root, "cli"),
		Kubernetes:   filepath.Join(root, "kubernetes"),
		Ansible:      filepath.Join(root, "ansible"),
		Charts:       filepath.Join(root, "kubernetes", "charts"),
		Releases:     filepath.Join(root, "kubernetes", "releases"),
		AppsRegistry: filepath.Join(root, "kubernetes", "apps", "_others.yaml"),
		Helmfile:     filepath.Join(root, "kubernetes", ".helmfile"),
		Inventory:    filepath.Join(root, "ansible", "inventory"),
		GroupVars:    filepath.Join(root, "ansible", "group_vars"),
		Docs:         filepath.Join(root, ".docs"),
	}
}

func exists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}
