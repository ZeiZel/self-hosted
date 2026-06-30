package daemon

import (
	"math"
	"testing"
	"time"
)

// buildSeries injects a controlled, evenly-spaced timeseries into the predictor
// (one sample per minute) so forecasts are deterministic (record() uses
// time.Now(), which we cannot control from a test).
func buildSeries(p *predictor, key string, vals ...float64) {
	base := time.Now().Add(-time.Duration(len(vals)) * time.Minute)
	s := make([]sample, len(vals))
	for i, v := range vals {
		s[i] = sample{t: base.Add(time.Duration(i) * time.Minute), v: v}
	}
	p.mu.Lock()
	p.series[key] = s
	p.mu.Unlock()
}

func TestNewPredictorAndRecord(t *testing.T) {
	p := newPredictor()
	if p.series == nil {
		t.Fatal("series map nil")
	}
	if p.max != 120 {
		t.Errorf("max = %d, want 120", p.max)
	}
	for i := 0; i < 130; i++ {
		p.record("node_cpu:n1", float64(i))
	}
	p.mu.Lock()
	n := len(p.series["node_cpu:n1"])
	last := p.series["node_cpu:n1"][n-1].v
	p.mu.Unlock()
	if n != 120 {
		t.Errorf("series length = %d, want capped at 120", n)
	}
	if last != 129 {
		t.Errorf("last value = %v, want 129 (newest retained)", last)
	}
}

func TestForecastRisingBreaches(t *testing.T) {
	p := newPredictor()
	// Steadily rising, currently below the warning threshold (72%).
	buildSeries(p, "node_cpu:worker-01", 40, 48, 56, 64, 72)

	alerts := p.forecast(60 * time.Minute)
	if len(alerts) != 1 {
		t.Fatalf("forecast returned %d alerts, want 1", len(alerts))
	}
	a := alerts[0]
	if a.MetricType != "node_cpu" || a.TargetID != "worker-01" {
		t.Errorf("bad split: metric=%q target=%q", a.MetricType, a.TargetID)
	}
	if a.Severity != "critical" {
		t.Errorf("severity = %q, want critical (steep rise)", a.Severity)
	}
	if a.Confidence < 0.99 {
		t.Errorf("confidence = %v, want ~1 for a clean line", a.Confidence)
	}
	if a.PredictedValue <= a.CurrentValue {
		t.Errorf("predicted %v should exceed current %v", a.PredictedValue, a.CurrentValue)
	}
	if a.PredictedValue > 100 {
		t.Errorf("predicted %v should be capped at 100", a.PredictedValue)
	}
	if a.EstimatedBreachTime == "" {
		t.Errorf("expected an estimated breach time for a rising series")
	}
}

func TestForecastFlatNoAlert(t *testing.T) {
	p := newPredictor()
	buildSeries(p, "node_cpu:worker-01", 20, 20, 20, 20, 20)
	if alerts := p.forecast(60 * time.Minute); len(alerts) != 0 {
		t.Errorf("flat low series produced %d alerts, want 0", len(alerts))
	}
}

func TestForecastTooFewSamples(t *testing.T) {
	p := newPredictor()
	buildSeries(p, "node_cpu:worker-01", 40, 60, 80) // < 5 samples
	if alerts := p.forecast(60 * time.Minute); len(alerts) != 0 {
		t.Errorf("series with <5 samples produced %d alerts, want 0", len(alerts))
	}
}

func TestForecastAllLabelsHorizons(t *testing.T) {
	p := newPredictor()
	buildSeries(p, "node_cpu:worker-01", 40, 48, 56, 64, 72)
	alerts := p.forecastAll()
	if len(alerts) != 3 {
		t.Fatalf("forecastAll returned %d alerts, want 3 (one per horizon)", len(alerts))
	}
	want := map[string]bool{"5m": false, "30m": false, "60m": false}
	for _, a := range alerts {
		if _, ok := want[a.Horizon]; !ok {
			t.Errorf("unexpected horizon label %q", a.Horizon)
		}
		want[a.Horizon] = true
	}
	for h, seen := range want {
		if !seen {
			t.Errorf("missing horizon %q in forecastAll output", h)
		}
	}
}

func TestLinreg(t *testing.T) {
	base := time.Now()
	// y = 2x + 5, x in seconds.
	s := []sample{
		{base.Add(0 * time.Second), 5},
		{base.Add(1 * time.Second), 7},
		{base.Add(2 * time.Second), 9},
		{base.Add(3 * time.Second), 11},
	}
	slope, intercept, r2 := linreg(s)
	if math.Abs(slope-2) > 1e-9 {
		t.Errorf("slope = %v, want 2", slope)
	}
	if math.Abs(intercept-5) > 1e-9 {
		t.Errorf("intercept = %v, want 5", intercept)
	}
	if math.Abs(r2-1) > 1e-9 {
		t.Errorf("r2 = %v, want 1", r2)
	}
}

func TestLinregDegenerate(t *testing.T) {
	base := time.Now()
	// All samples at the same instant → denom 0 → slope 0, intercept = mean.
	s := []sample{
		{base, 10},
		{base, 20},
		{base, 30},
	}
	slope, intercept, r2 := linreg(s)
	if slope != 0 {
		t.Errorf("slope = %v, want 0 for zero-variance x", slope)
	}
	if math.Abs(intercept-20) > 1e-9 {
		t.Errorf("intercept = %v, want 20 (mean)", intercept)
	}
	if r2 != 0 {
		t.Errorf("r2 = %v, want 0", r2)
	}
}

func TestSplitKey(t *testing.T) {
	mt, target := splitKey("node_cpu:worker-01")
	if mt != "node_cpu" || target != "worker-01" {
		t.Errorf("splitKey = %q/%q", mt, target)
	}
	mt, target = splitKey("nocolon")
	if mt != "nocolon" || target != "" {
		t.Errorf("splitKey(no colon) = %q/%q", mt, target)
	}
}

func TestEnvInt(t *testing.T) {
	if got := envInt("SELFHOST_TEST_INT_MISSING", 7); got != 7 {
		t.Errorf("envInt missing = %d, want 7", got)
	}
	t.Setenv("SELFHOST_TEST_INT", "42")
	if got := envInt("SELFHOST_TEST_INT", 7); got != 42 {
		t.Errorf("envInt set = %d, want 42", got)
	}
	t.Setenv("SELFHOST_TEST_INT", "notanumber")
	if got := envInt("SELFHOST_TEST_INT", 7); got != 7 {
		t.Errorf("envInt invalid = %d, want fallback 7", got)
	}
}

func TestEnvStr(t *testing.T) {
	if got := envStr("SELFHOST_TEST_STR_MISSING", "def"); got != "def" {
		t.Errorf("envStr missing = %q, want def", got)
	}
	t.Setenv("SELFHOST_TEST_STR", "value")
	if got := envStr("SELFHOST_TEST_STR", "def"); got != "value" {
		t.Errorf("envStr set = %q, want value", got)
	}
}
