package balance

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/ZeiZel/self-hosted/cli/internal/core"
	"github.com/google/uuid"
)

func baseDir() string     { return filepath.Join(core.BaseDir(), "balance") }
func plansDir() string    { return filepath.Join(baseDir(), "plans") }
func presetsDir() string  { return filepath.Join(baseDir(), "presets") }
func historyFile() string { return filepath.Join(baseDir(), "migrations.json") }

func ensure(dir string) error { return os.MkdirAll(dir, 0o755) }

// SavePlan persists a plan for later `apply`.
func SavePlan(p Plan) error {
	if err := ensure(plansDir()); err != nil {
		return err
	}
	data, _ := json.MarshalIndent(p, "", "  ")
	return os.WriteFile(filepath.Join(plansDir(), p.ID+".json"), data, 0o644)
}

// LoadPlan loads a saved plan by id (accepts a unique prefix).
func LoadPlan(id string) (*Plan, error) {
	path := filepath.Join(plansDir(), id+".json")
	if _, err := os.Stat(path); err != nil {
		// try prefix match
		entries, _ := os.ReadDir(plansDir())
		for _, e := range entries {
			if strings.HasPrefix(e.Name(), id) {
				path = filepath.Join(plansDir(), e.Name())
				break
			}
		}
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("plan %q not found", id)
	}
	var p Plan
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// ---- presets ----

// SavePreset writes a preset.
func SavePreset(p Preset) error {
	if err := ensure(presetsDir()); err != nil {
		return err
	}
	if p.CreatedAt == "" {
		p.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	data, _ := json.MarshalIndent(p, "", "  ")
	return os.WriteFile(filepath.Join(presetsDir(), p.Name+".json"), data, 0o644)
}

// LoadPreset reads a preset by name.
func LoadPreset(name string) (*Preset, error) {
	data, err := os.ReadFile(filepath.Join(presetsDir(), name+".json"))
	if err != nil {
		return nil, fmt.Errorf("preset %q not found", name)
	}
	var p Preset
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// ListPresets returns preset names.
func ListPresets() ([]string, error) {
	entries, err := os.ReadDir(presetsDir())
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".json") {
			out = append(out, strings.TrimSuffix(e.Name(), ".json"))
		}
	}
	return out, nil
}

// DeletePreset removes a preset.
func DeletePreset(name string) error {
	return os.Remove(filepath.Join(presetsDir(), name+".json"))
}

// PresetFromPlan derives a preset (pinning each service to its target node).
func PresetFromPlan(name, desc string, p Plan) Preset {
	pins := make([]PresetPin, 0, len(p.Placements))
	for _, d := range p.Placements {
		pins = append(pins, PresetPin{Service: d.Service, Node: d.TargetNode})
	}
	return Preset{Name: name, Description: desc, CreatedAt: time.Now().UTC().Format(time.RFC3339), Strategy: p.Strategy, Placements: pins}
}

// ---- migrator ----

// CurrentPlacements returns service→node from the live cluster (best-effort).
// Returns nil if kubectl is unavailable.
func CurrentPlacements() map[string]string {
	out, err := exec.Command("kubectl", "get", "pods", "-A", "-o",
		`jsonpath={range .items[*]}{.metadata.labels.app\.kubernetes\.io/name}{" "}{.spec.nodeName}{"\n"}{end}`).Output()
	if err != nil {
		return nil
	}
	res := map[string]string{}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		f := strings.Fields(line)
		if len(f) == 2 {
			res[f[0]] = f[1]
		}
	}
	return res
}

// CreateMigrations diffs target placements against current node assignments.
func CreateMigrations(placements []PlacementDecision, current map[string]string) []Migration {
	var ms []Migration
	for _, p := range placements {
		cur := current[p.Service]
		if cur != "" && cur != p.TargetNode {
			ms = append(ms, Migration{
				ID: uuid.NewString(), Service: p.Service, Namespace: p.Namespace,
				SourceNode: cur, TargetNode: p.TargetNode, Status: "pending",
			})
		}
	}
	return ms
}

// SaveMigrationHistory appends migrations to the history file.
func SaveMigrationHistory(ms []Migration) error {
	if err := ensure(baseDir()); err != nil {
		return err
	}
	hist, _ := LoadMigrationHistory()
	hist = append(hist, ms...)
	data, _ := json.MarshalIndent(hist, "", "  ")
	return os.WriteFile(historyFile(), data, 0o644)
}

// LoadMigrationHistory returns recorded migrations.
func LoadMigrationHistory() ([]Migration, error) {
	data, err := os.ReadFile(historyFile())
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var ms []Migration
	if err := json.Unmarshal(data, &ms); err != nil {
		return nil, err
	}
	return ms, nil
}
