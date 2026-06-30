package cluster

import "testing"

func node(name string, cpu, mem int) NodeMetrics {
	return NodeMetrics{
		Name:   name,
		CPU:    Resource{Percent: cpu},
		Memory: Resource{Percent: mem},
		Health: CalculateHealth(float64(cpu), float64(mem), DefaultThresholds),
	}
}

func svc(name string, status PodStatus, restarts int) ServiceMetrics {
	return ServiceMetrics{Name: name, Namespace: "db", Status: status, Restarts: restarts}
}

func countSeverity(alerts []Alert, sev Severity) int {
	n := 0
	for _, a := range alerts {
		if a.Severity == sev {
			n++
		}
	}
	return n
}

func TestGenerateAlertsHealthy(t *testing.T) {
	nodes := []NodeMetrics{node("master-01", 30, 50)}
	svcs := []ServiceMetrics{svc("postgresql", PodRunning, 0)}
	if alerts := GenerateAlerts(nodes, svcs, AlertThresholds{}); len(alerts) != 0 {
		t.Errorf("healthy input produced %d alerts, want 0: %+v", len(alerts), alerts)
	}
}

func TestGenerateAlertsNodeThresholds(t *testing.T) {
	// CPU 92 ≥ 90 critical; Memory 50 fine → one critical alert.
	nodes := []NodeMetrics{node("n-crit", 92, 50)}
	alerts := GenerateAlerts(nodes, nil, AlertThresholds{})
	if countSeverity(alerts, SevCritical) != 1 || len(alerts) != 1 {
		t.Errorf("cpu-critical: got %+v", alerts)
	}

	// CPU 78 ≥ 75 warning; Memory 85 ≥ 80 warning → two warnings.
	nodes = []NodeMetrics{node("n-warn", 78, 85)}
	alerts = GenerateAlerts(nodes, nil, AlertThresholds{})
	if countSeverity(alerts, SevWarning) != 2 || len(alerts) != 2 {
		t.Errorf("cpu+mem warning: got %+v", alerts)
	}

	// Memory 96 ≥ 95 critical.
	nodes = []NodeMetrics{node("n-mem", 30, 96)}
	alerts = GenerateAlerts(nodes, nil, AlertThresholds{})
	if countSeverity(alerts, SevCritical) != 1 || len(alerts) != 1 {
		t.Errorf("mem-critical: got %+v", alerts)
	}
}

func TestGenerateAlertsPodStatus(t *testing.T) {
	svcs := []ServiceMetrics{
		svc("crash", PodCrashLoop, 0),
		svc("imgpull", PodImagePull, 0),
		svc("pending", PodPending, 0),
	}
	alerts := GenerateAlerts(nil, svcs, AlertThresholds{})
	if countSeverity(alerts, SevCritical) != 2 {
		t.Errorf("expected 2 critical pod-status alerts, got %+v", alerts)
	}
	if countSeverity(alerts, SevWarning) != 1 {
		t.Errorf("expected 1 warning (pending), got %+v", alerts)
	}
}

func TestGenerateAlertsRestarts(t *testing.T) {
	// Restarts 12 ≥ 10 → critical; running so no status alert.
	alerts := GenerateAlerts(nil, []ServiceMetrics{svc("a", PodRunning, 12)}, AlertThresholds{})
	if countSeverity(alerts, SevCritical) != 1 || len(alerts) != 1 {
		t.Errorf("high restarts: got %+v", alerts)
	}
	// Restarts 5 (3..10) → warning.
	alerts = GenerateAlerts(nil, []ServiceMetrics{svc("b", PodRunning, 5)}, AlertThresholds{})
	if countSeverity(alerts, SevWarning) != 1 || len(alerts) != 1 {
		t.Errorf("elevated restarts: got %+v", alerts)
	}
}

func TestMapStatusToHealth(t *testing.T) {
	cases := map[PodStatus]NodeHealth{
		PodRunning:   HealthHealthy,
		PodSucceeded: HealthHealthy,
		PodPending:   HealthWarning,
		PodFailed:    HealthCritical,
		PodCrashLoop: HealthCritical,
		PodImagePull: HealthCritical,
		PodError:     HealthCritical,
		PodUnknown:   HealthUnknown,
	}
	for status, want := range cases {
		if got := mapStatusToHealth(status); got != want {
			t.Errorf("mapStatusToHealth(%s) = %s, want %s", status, got, want)
		}
	}
}

func TestSummaryMock(t *testing.T) {
	c := New()
	c.Mock = true

	nodes, err := c.NodeMetricsList()
	if err != nil || len(nodes) != 2 {
		t.Fatalf("NodeMetricsList mock: %d nodes, err=%v", len(nodes), err)
	}
	svcs, err := c.ServiceMetricsList("")
	if err != nil || len(svcs) != 3 {
		t.Fatalf("ServiceMetricsList mock: %d svcs, err=%v", len(svcs), err)
	}

	s, err := c.Summary()
	if err != nil {
		t.Fatalf("Summary: %v", err)
	}
	if s.Nodes.Total != 2 || s.Nodes.Healthy != 1 || s.Nodes.Warning != 1 || s.Nodes.Critical != 0 {
		t.Errorf("node counts: %+v", s.Nodes)
	}
	if s.Pods.Total != 3 || s.Pods.Running != 3 {
		t.Errorf("pod counts: %+v", s.Pods)
	}
	if s.Namespaces != 11 {
		t.Errorf("namespaces = %d, want 11 (mock default)", s.Namespaces)
	}
	if s.CPU.Percent <= 0 || s.Memory.Percent <= 0 {
		t.Errorf("aggregate percentages not computed: cpu=%d mem=%d", s.CPU.Percent, s.Memory.Percent)
	}
}
