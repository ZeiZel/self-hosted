package daemon

import (
	"fmt"
	"math"
	"sync"
	"time"
)

// Ported from cli/src/daemon/services/prediction.service.ts: keeps a rolling
// timeseries per metric and uses linear regression to forecast breaches.

const (
	predWarning  = 75.0
	predCritical = 90.0
)

type sample struct {
	t time.Time
	v float64
}

// predictor holds rolling samples per metric target and forecasts breaches.
type predictor struct {
	mu     sync.Mutex
	series map[string][]sample // key e.g. "node_cpu:worker-01"
	max    int
}

func newPredictor() *predictor {
	return &predictor{series: map[string][]sample{}, max: 120}
}

func (p *predictor) record(key string, v float64) {
	p.mu.Lock()
	defer p.mu.Unlock()
	s := append(p.series[key], sample{time.Now(), v})
	if len(s) > p.max {
		s = s[len(s)-p.max:]
	}
	p.series[key] = s
}

// PredictionAlert mirrors the Node PredictionAlert shape.
type PredictionAlert struct {
	Severity            string  `json:"severity"`
	MetricType          string  `json:"metricType"`
	TargetID            string  `json:"targetId"`
	Message             string  `json:"message"`
	CurrentValue        float64 `json:"currentValue"`
	PredictedValue      float64 `json:"predictedValue"`
	EstimatedBreachTime string  `json:"estimatedBreachTime,omitempty"`
	Confidence          float64 `json:"confidence"`
}

// forecast runs linear regression over each series and emits alerts for series
// trending toward the warning/critical thresholds within the horizon.
func (p *predictor) forecast(horizon time.Duration) []PredictionAlert {
	p.mu.Lock()
	defer p.mu.Unlock()
	var out []PredictionAlert
	for key, s := range p.series {
		if len(s) < 5 {
			continue
		}
		slope, intercept, r2 := linreg(s)
		t0 := s[0].t
		future := s[len(s)-1].t.Add(horizon).Sub(t0).Seconds()
		predicted := slope*future + intercept
		current := s[len(s)-1].v
		if predicted <= current || predicted < predWarning {
			continue
		}
		sev := "warning"
		thr := predWarning
		if predicted >= predCritical {
			sev, thr = "critical", predCritical
		}
		mt, target := splitKey(key)
		alert := PredictionAlert{
			Severity: sev, MetricType: mt, TargetID: target,
			Message:      fmt.Sprintf("%s on %s trending to %.0f%% (now %.0f%%)", mt, target, predicted, current),
			CurrentValue: current, PredictedValue: math.Min(predicted, 100), Confidence: r2,
		}
		if slope > 0 {
			secsToBreach := (thr - intercept) / slope
			breach := t0.Add(time.Duration(secsToBreach) * time.Second)
			if breach.After(time.Now()) {
				alert.EstimatedBreachTime = breach.UTC().Format(time.RFC3339)
			}
		}
		out = append(out, alert)
	}
	return out
}

// linreg returns slope, intercept and r² for samples (x = seconds since first).
func linreg(s []sample) (slope, intercept, r2 float64) {
	n := float64(len(s))
	t0 := s[0].t
	var sx, sy, sxy, sxx, syy float64
	for _, p := range s {
		x := p.t.Sub(t0).Seconds()
		y := p.v
		sx += x
		sy += y
		sxy += x * y
		sxx += x * x
		syy += y * y
	}
	denom := n*sxx - sx*sx
	if denom == 0 {
		return 0, sy / n, 0
	}
	slope = (n*sxy - sx*sy) / denom
	intercept = (sy - slope*sx) / n
	// r²
	rNum := n*sxy - sx*sy
	rDen := math.Sqrt((n*sxx - sx*sx) * (n*syy - sy*sy))
	if rDen != 0 {
		r := rNum / rDen
		r2 = r * r
	}
	return slope, intercept, r2
}

func splitKey(key string) (metricType, target string) {
	for i := 0; i < len(key); i++ {
		if key[i] == ':' {
			return key[:i], key[i+1:]
		}
	}
	return key, ""
}
