package config

import (
	"testing"
)

func TestConfigRoundTrip(t *testing.T) {
	t.Setenv("SELFHOST_CONFIG_DIR", t.TempDir())

	cfg, err := Load() // creates defaults
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Cluster.Name != "selfhost" {
		t.Fatalf("default name=%q", cfg.Cluster.Name)
	}
	cfg.Cluster.Domain = "example.org"
	cfg.Initialized = true
	if err := Save(cfg); err != nil {
		t.Fatal(err)
	}
	got, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if got.Cluster.Domain != "example.org" || !got.Initialized {
		t.Fatalf("roundtrip lost data: %+v", got)
	}
}

func TestDeploymentsRoundTrip(t *testing.T) {
	t.Setenv("SELFHOST_CONFIG_DIR", t.TempDir())
	ds := []DeploymentState{{ID: "d1", Status: "running", CurrentPhase: 3}}
	if err := SaveDeployments(ds); err != nil {
		t.Fatal(err)
	}
	active, err := ActiveDeployment()
	if err != nil {
		t.Fatal(err)
	}
	if active == nil || active.ID != "d1" {
		t.Fatalf("active=%+v", active)
	}
}
