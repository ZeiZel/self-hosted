package db

import "testing"

func openTest(t *testing.T) *DB {
	t.Helper()
	d, err := Open(":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { d.Close() })
	return d
}

func TestMachineRoundTrip(t *testing.T) {
	d := openTest(t)
	m := &Machine{Label: "n1", IP: "10.0.0.1", Roles: []string{"master", "worker"}}
	if err := d.UpsertMachine(m); err != nil {
		t.Fatal(err)
	}
	got, err := d.ListMachines()
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Label != "n1" || len(got[0].Roles) != 2 {
		t.Fatalf("unexpected machines: %+v", got)
	}
	// Upsert by label updates, not duplicates.
	m2 := &Machine{Label: "n1", IP: "10.0.0.2", Roles: []string{"worker"}}
	if err := d.UpsertMachine(m2); err != nil {
		t.Fatal(err)
	}
	got, _ = d.ListMachines()
	if len(got) != 1 || got[0].IP != "10.0.0.2" {
		t.Fatalf("upsert did not update: %+v", got)
	}
	n, _ := d.DeleteMachine("n1")
	if n != 1 {
		t.Fatalf("delete returned %d", n)
	}
}

func TestDaemonState(t *testing.T) {
	d := openTest(t)
	if err := d.SetState("running", "true"); err != nil {
		t.Fatal(err)
	}
	if err := d.SetState("running", "false"); err != nil { // upsert
		t.Fatal(err)
	}
	v, ok, err := d.GetState("running")
	if err != nil || !ok || v != "false" {
		t.Fatalf("GetState=%q ok=%v err=%v", v, ok, err)
	}
	if _, ok, _ := d.GetState("missing"); ok {
		t.Fatal("missing key should not be ok")
	}
}

func TestHealthLogs(t *testing.T) {
	d := openTest(t)
	for i := 0; i < 3; i++ {
		if err := d.InsertHealthLog(HealthLog{CheckType: "node", Target: "n1", Status: "critical", Message: "hot"}); err != nil {
			t.Fatal(err)
		}
	}
	logs, err := d.RecentHealthLogs(10, "critical")
	if err != nil || len(logs) != 3 {
		t.Fatalf("logs=%d err=%v", len(logs), err)
	}
	if logs, _ := d.RecentHealthLogs(10, "healthy"); len(logs) != 0 {
		t.Fatalf("expected 0 healthy logs, got %d", len(logs))
	}
}

func TestServiceToggle(t *testing.T) {
	d := openTest(t)
	if err := d.SetServiceEnabled("gitlab", "code", true); err != nil {
		t.Fatal(err)
	}
	if err := d.SetServiceEnabled("gitlab", "code", true); err != nil { // upsert by name
		t.Fatal(err)
	}
	en, err := d.EnabledServices()
	if err != nil || len(en) != 1 || en[0] != "gitlab" {
		t.Fatalf("enabled=%v err=%v", en, err)
	}
}
