// Package config loads and persists the CLI configuration
// ($HOME/.selfhosted/config.yaml) and deployment state
// ($HOME/.selfhosted/state/deployments.json), matching the Node CLI on-disk
// format so the Go and TypeScript binaries are interchangeable.
package config

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/ZeiZel/self-hosted/cli/internal/core"
	"gopkg.in/yaml.v3"
)

// Cluster mirrors the cluster block of config.yaml.
type Cluster struct {
	Name        string `yaml:"name"`
	Domain      string `yaml:"domain"`
	LocalDomain string `yaml:"localDomain"`
}

// AppConfig is the schema of config.yaml (appConfigSchema in the Node CLI).
type AppConfig struct {
	Version            string  `yaml:"version"`
	Cluster            Cluster `yaml:"cluster"`
	Initialized        bool    `yaml:"initialized"`
	LastDeployment     string  `yaml:"lastDeployment,omitempty"`
	ActiveDeploymentID string  `yaml:"activeDeploymentId,omitempty"`
}

// Defaults returns a config populated with the same defaults as the zod schema.
func Defaults() *AppConfig {
	return &AppConfig{
		Version: "1.0.0",
		Cluster: Cluster{
			Name:        "selfhost",
			Domain:      "example.com",
			LocalDomain: "homelab.local",
		},
		Initialized: false,
	}
}

// Load reads config.yaml, creating directories and a default file if missing.
func Load() (*AppConfig, error) {
	if err := core.EnsureDirs(); err != nil {
		return nil, err
	}
	path := core.ConfigPath()
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		cfg := Defaults()
		if err := Save(cfg); err != nil {
			return nil, err
		}
		return cfg, nil
	}
	if err != nil {
		return nil, err
	}
	cfg := Defaults()
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

// Save writes config.yaml atomically.
func Save(cfg *AppConfig) error {
	if err := core.EnsureDirs(); err != nil {
		return err
	}
	out, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	tmp := core.ConfigPath() + ".tmp"
	if err := os.WriteFile(tmp, out, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, core.ConfigPath())
}

// ---- Deployment state (state/deployments.json) ----

// LogEntry is a single deployment log line.
type LogEntry struct {
	Phase     int    `json:"phase"`
	Level     string `json:"level"`
	Message   string `json:"message"`
	Timestamp string `json:"timestamp"`
}

// MachineRef is a minimal machine reference stored in deployment state.
type MachineRef struct {
	Label string   `json:"label"`
	IP    string   `json:"ip"`
	Roles []string `json:"roles"`
}

// DeploymentState mirrors DeploymentStateData from the Node CLI.
type DeploymentState struct {
	ID              string       `json:"id"`
	Status          string       `json:"status"`
	StartedAt       string       `json:"startedAt"`
	CompletedAt     string       `json:"completedAt,omitempty"`
	CurrentPhase    int          `json:"currentPhase"`
	CompletedPhases []int        `json:"completedPhases"`
	FailedPhases    []int        `json:"failedPhases"`
	SkippedPhases   []int        `json:"skippedPhases"`
	Machines        []MachineRef `json:"machines"`
	Services        []string     `json:"services"`
	Logs            []LogEntry   `json:"logs"`
}

func deploymentsFile() string {
	return filepath.Join(core.StatePath(), "deployments.json")
}

// LoadDeployments reads all persisted deployment states.
func LoadDeployments() ([]DeploymentState, error) {
	data, err := os.ReadFile(deploymentsFile())
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []DeploymentState
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// SaveDeployments persists deployment states.
func SaveDeployments(ds []DeploymentState) error {
	if err := core.EnsureDirs(); err != nil {
		return err
	}
	out, err := json.MarshalIndent(ds, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(deploymentsFile(), out, 0o644)
}

// ActiveDeployment returns the most recent incomplete (pending/running) deployment, if any.
func ActiveDeployment() (*DeploymentState, error) {
	ds, err := LoadDeployments()
	if err != nil {
		return nil, err
	}
	for i := len(ds) - 1; i >= 0; i-- {
		if ds[i].Status == "pending" || ds[i].Status == "running" {
			return &ds[i], nil
		}
	}
	return nil, nil
}
