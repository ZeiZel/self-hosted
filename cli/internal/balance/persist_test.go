package balance

import (
	"testing"
)

func TestPresetRoundTrip(t *testing.T) {
	t.Setenv("SELFHOST_CONFIG_DIR", t.TempDir())

	// Empty list before anything is saved.
	if names, err := ListPresets(); err != nil || len(names) != 0 {
		t.Fatalf("ListPresets empty = %v, err=%v", names, err)
	}

	p := Preset{
		Name:        "prod",
		Description: "production layout",
		Strategy:    BinPacking,
		Placements: []PresetPin{
			{Service: "vault", Node: "master-01"},
			{Service: "postgresql", Node: "worker-01"},
		},
	}
	if err := SavePreset(p); err != nil {
		t.Fatalf("SavePreset: %v", err)
	}

	got, err := LoadPreset("prod")
	if err != nil {
		t.Fatalf("LoadPreset: %v", err)
	}
	if got.Name != "prod" || got.Description != "production layout" {
		t.Errorf("loaded = %+v", got)
	}
	if got.CreatedAt == "" {
		t.Errorf("CreatedAt should be auto-stamped on save")
	}
	if len(got.Placements) != 2 || got.Placements[0].Service != "vault" {
		t.Errorf("placements lost: %+v", got.Placements)
	}

	names, err := ListPresets()
	if err != nil || len(names) != 1 || names[0] != "prod" {
		t.Fatalf("ListPresets = %v, err=%v", names, err)
	}

	if err := DeletePreset("prod"); err != nil {
		t.Fatalf("DeletePreset: %v", err)
	}
	names, _ = ListPresets()
	if len(names) != 0 {
		t.Errorf("after delete, names = %v", names)
	}
	if _, err := LoadPreset("prod"); err == nil {
		t.Errorf("LoadPreset after delete should error")
	}
}

func TestPresetFromPlan(t *testing.T) {
	plan := Plan{
		Strategy: BinPacking,
		Placements: []PlacementDecision{
			{Service: "vault", TargetNode: "master-01"},
			{Service: "minio", TargetNode: "worker-01"},
		},
	}
	preset := PresetFromPlan("derived", "desc", plan)
	if preset.Name != "derived" || preset.Strategy != BinPacking {
		t.Errorf("preset header wrong: %+v", preset)
	}
	if len(preset.Placements) != 2 {
		t.Fatalf("pins = %d, want 2", len(preset.Placements))
	}
	if preset.Placements[0].Service != "vault" || preset.Placements[0].Node != "master-01" {
		t.Errorf("pin[0] = %+v", preset.Placements[0])
	}
}

func TestCreateMigrations(t *testing.T) {
	placements := []PlacementDecision{
		{Service: "vault", Namespace: "service", TargetNode: "master-01"},  // moved
		{Service: "minio", Namespace: "db", TargetNode: "worker-01"},       // unchanged
		{Service: "newsvc", Namespace: "service", TargetNode: "worker-01"}, // not in current → skip
	}
	current := map[string]string{
		"vault": "worker-01", // differs from target → migration
		"minio": "worker-01", // matches target → no migration
	}
	ms := CreateMigrations(placements, current)
	if len(ms) != 1 {
		t.Fatalf("migrations = %d, want 1: %+v", len(ms), ms)
	}
	m := ms[0]
	if m.Service != "vault" || m.SourceNode != "worker-01" || m.TargetNode != "master-01" {
		t.Errorf("migration = %+v", m)
	}
	if m.Status != "pending" || m.ID == "" {
		t.Errorf("migration metadata = %+v", m)
	}
}

func TestExecuteMigrationsDryRun(t *testing.T) {
	ms := []Migration{
		{ID: "1", Service: "vault", Namespace: "service", SourceNode: "worker-01", TargetNode: "master-01", Status: "pending"},
		{ID: "2", Service: "minio", Namespace: "db", SourceNode: "master-01", TargetNode: "worker-01", Status: "pending"},
	}
	out := ExecuteMigrations(ms, true) // dry-run: no kubectl invoked
	if len(out) != 2 {
		t.Fatalf("out = %d, want 2", len(out))
	}
	for _, m := range out {
		if m.Status != "completed" {
			t.Errorf("dry-run status for %s = %q, want completed", m.Service, m.Status)
		}
		if m.Error != "" {
			t.Errorf("dry-run error for %s = %q, want none", m.Service, m.Error)
		}
		if m.StartedAt == "" || m.CompletedAt == "" {
			t.Errorf("dry-run timing missing for %s: %+v", m.Service, m)
		}
	}
}

func TestPatchPayload(t *testing.T) {
	got := patchPayload("worker-01")
	want := `{"spec":{"template":{"spec":{"nodeSelector":{"kubernetes.io/hostname":"worker-01"}}}}}`
	if got != want {
		t.Errorf("patchPayload = %s", got)
	}
}

func TestMigrationHistoryRoundTrip(t *testing.T) {
	t.Setenv("SELFHOST_CONFIG_DIR", t.TempDir())

	if hist, err := LoadMigrationHistory(); err != nil || hist != nil {
		t.Fatalf("empty history = %v, err=%v", hist, err)
	}
	ms := []Migration{{ID: "1", Service: "vault", Status: "completed"}}
	if err := SaveMigrationHistory(ms); err != nil {
		t.Fatalf("SaveMigrationHistory: %v", err)
	}
	// Appends, not overwrites.
	if err := SaveMigrationHistory([]Migration{{ID: "2", Service: "minio", Status: "failed"}}); err != nil {
		t.Fatalf("SaveMigrationHistory append: %v", err)
	}
	hist, err := LoadMigrationHistory()
	if err != nil {
		t.Fatalf("LoadMigrationHistory: %v", err)
	}
	if len(hist) != 2 || hist[0].ID != "1" || hist[1].ID != "2" {
		t.Errorf("history = %+v", hist)
	}
}

func TestSaveLoadPlan(t *testing.T) {
	t.Setenv("SELFHOST_CONFIG_DIR", t.TempDir())
	p := Plan{ID: "abc123def", Strategy: BinPacking, Score: 88}
	if err := SavePlan(p); err != nil {
		t.Fatalf("SavePlan: %v", err)
	}
	// Exact id.
	got, err := LoadPlan("abc123def")
	if err != nil || got.Score != 88 {
		t.Fatalf("LoadPlan exact = %+v, err=%v", got, err)
	}
	// Prefix match.
	got, err = LoadPlan("abc123")
	if err != nil || got.ID != "abc123def" {
		t.Fatalf("LoadPlan prefix = %+v, err=%v", got, err)
	}
}
