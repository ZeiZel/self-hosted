package db

import (
	"testing"
	"time"
)

func TestInsertAndRecentMetrics(t *testing.T) {
	d := openTest(t)
	if err := d.InsertMetric("cpu", "worker-01", "node", 42.5, "%", ""); err != nil {
		t.Fatal(err)
	}
	if err := d.InsertMetrics([]Metric{
		{Type: "memory", TargetID: "worker-01", TargetType: "node", Value: 71, Unit: "%"},
		{Type: "cpu", TargetID: "cluster", TargetType: "cluster", Value: 60, Unit: "%", Metadata: `{"src":"test"}`},
	}); err != nil {
		t.Fatal(err)
	}
	all, err := d.RecentMetrics(10, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 3 {
		t.Fatalf("expected 3 metrics, got %d", len(all))
	}
	cpu, err := d.RecentMetrics(10, "cpu")
	if err != nil {
		t.Fatal(err)
	}
	if len(cpu) != 2 {
		t.Fatalf("expected 2 cpu metrics, got %d", len(cpu))
	}
}

func TestPurgeOldMetrics(t *testing.T) {
	d := openTest(t)
	old := time.Now().UTC().AddDate(0, 0, -10).Format(time.RFC3339)
	if err := d.InsertMetrics([]Metric{
		{Type: "cpu", TargetID: "n", TargetType: "node", Value: 1, Unit: "%", Timestamp: old},
		{Type: "cpu", TargetID: "n", TargetType: "node", Value: 2, Unit: "%"}, // now
	}); err != nil {
		t.Fatal(err)
	}
	removed, err := d.PurgeOldMetrics(7)
	if err != nil {
		t.Fatal(err)
	}
	if removed != 1 {
		t.Fatalf("expected 1 purged, got %d", removed)
	}
	left, _ := d.RecentMetrics(10, "")
	if len(left) != 1 {
		t.Fatalf("expected 1 metric left, got %d", len(left))
	}
}
