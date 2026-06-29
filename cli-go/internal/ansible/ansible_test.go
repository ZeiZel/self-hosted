package ansible

import "testing"

func TestPhaseToTagsComplete(t *testing.T) {
	for _, p := range AllPhases {
		tags, ok := PhaseToTags[p]
		if !ok || len(tags) == 0 {
			t.Errorf("phase %d (%s) has no tags", int(p), p.Name())
		}
		if p.Name() == "" {
			t.Errorf("phase %d has no name", int(p))
		}
	}
	if len(AllPhases) != 9 {
		t.Errorf("expected 9 phases, got %d", len(AllPhases))
	}
}

func TestCommandLine(t *testing.T) {
	got := CommandLine(Options{InventoryFile: "hosts.ini", Tags: []string{"server", "docker"}})
	want := "ansible-playbook -i inventory/hosts.ini all.yml --tags server,docker"
	if got != want {
		t.Errorf("CommandLine=%q want %q", got, want)
	}
}

func TestPhaseTagMapping(t *testing.T) {
	if PhaseToTags[PhaseNetworkGateway][0] != "pangolin" {
		t.Errorf("network gateway should map to pangolin")
	}
}
