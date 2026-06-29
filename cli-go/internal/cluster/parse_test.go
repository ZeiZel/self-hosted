package cluster

import "testing"

func TestParseCPU(t *testing.T) {
	cases := map[string]float64{"250m": 250, "2": 2000, "1500m": 1500, "": 0}
	for in, want := range cases {
		if got := parseCPU(in); got != want {
			t.Errorf("parseCPU(%q)=%v want %v", in, got, want)
		}
	}
}

func TestParseMemory(t *testing.T) {
	cases := map[string]float64{"128Mi": 128 << 20, "2Gi": 2 << 30, "1Ki": 1024, "1000": 1000, "": 0}
	for in, want := range cases {
		if got := parseMemory(in); got != want {
			t.Errorf("parseMemory(%q)=%v want %v", in, got, want)
		}
	}
}

func TestCalculateHealth(t *testing.T) {
	th := DefaultThresholds
	if h := CalculateHealth(95, 10, th); h != HealthCritical {
		t.Errorf("cpu 95%% should be critical, got %v", h)
	}
	if h := CalculateHealth(80, 10, th); h != HealthWarning {
		t.Errorf("cpu 80%% should be warning, got %v", h)
	}
	if h := CalculateHealth(10, 10, th); h != HealthHealthy {
		t.Errorf("low usage should be healthy, got %v", h)
	}
}

func TestMapPodStatus(t *testing.T) {
	if s := mapPodStatus("Running", nil); s != PodRunning {
		t.Errorf("want Running, got %v", s)
	}
	cs := []containerStatus{{State: struct {
		Waiting    *struct{ Reason string } `json:"waiting"`
		Terminated *struct{ Reason string } `json:"terminated"`
	}{Waiting: &struct{ Reason string }{Reason: "CrashLoopBackOff"}}}}
	if s := mapPodStatus("Running", cs); s != PodCrashLoop {
		t.Errorf("want CrashLoopBackOff, got %v", s)
	}
}

func TestFormatHelpers(t *testing.T) {
	if got := FormatCPU(1500); got != "1.5" {
		t.Errorf("FormatCPU(1500)=%q", got)
	}
	if got := FormatCPU(250); got != "250m" {
		t.Errorf("FormatCPU(250)=%q", got)
	}
	if got := ParseAge("5d"); got != 5*86400 {
		t.Errorf("ParseAge(5d)=%d", got)
	}
}
