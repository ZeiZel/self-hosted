package cluster

import "fmt"

// Severity of an alert.
type Severity string

const (
	SevInfo     Severity = "info"
	SevWarning  Severity = "warning"
	SevCritical Severity = "critical"
)

// Alert is a generated alert from node/service state.
type Alert struct {
	ID       string   `json:"id"`
	Severity Severity `json:"severity"`
	Title    string   `json:"title"`
	Message  string   `json:"message"`
	Source   string   `json:"source"`
}

// GenerateAlerts derives alerts from node + service metrics against thresholds.
// Ported from the alerts logic in cli/src/modules/monitor.
func GenerateAlerts(nodes []NodeMetrics, svcs []ServiceMetrics, t AlertThresholds) []Alert {
	if t == (AlertThresholds{}) {
		t = DefaultThresholds
	}
	var alerts []Alert
	for _, n := range nodes {
		switch {
		case float64(n.CPU.Percent) >= t.CPUCritical:
			alerts = append(alerts, Alert{n.Name + "-cpu", SevCritical, "Node CPU critical",
				fmt.Sprintf("%s CPU at %d%%", n.Name, n.CPU.Percent), n.Name})
		case float64(n.CPU.Percent) >= t.CPUWarning:
			alerts = append(alerts, Alert{n.Name + "-cpu", SevWarning, "Node CPU high",
				fmt.Sprintf("%s CPU at %d%%", n.Name, n.CPU.Percent), n.Name})
		}
		switch {
		case float64(n.Memory.Percent) >= t.MemCritical:
			alerts = append(alerts, Alert{n.Name + "-mem", SevCritical, "Node memory critical",
				fmt.Sprintf("%s memory at %d%%", n.Name, n.Memory.Percent), n.Name})
		case float64(n.Memory.Percent) >= t.MemWarning:
			alerts = append(alerts, Alert{n.Name + "-mem", SevWarning, "Node memory high",
				fmt.Sprintf("%s memory at %d%%", n.Name, n.Memory.Percent), n.Name})
		}
	}
	for _, s := range svcs {
		switch s.Status {
		case PodCrashLoop, PodImagePull, PodError, PodFailed:
			alerts = append(alerts, Alert{s.Namespace + "/" + s.Name + "-status", SevCritical,
				"Pod " + string(s.Status), fmt.Sprintf("%s/%s is %s", s.Namespace, s.Name, s.Status), s.Name})
		case PodPending:
			alerts = append(alerts, Alert{s.Namespace + "/" + s.Name + "-pending", SevWarning,
				"Pod pending", fmt.Sprintf("%s/%s pending", s.Namespace, s.Name), s.Name})
		}
		if s.Restarts >= t.RestartCritical {
			alerts = append(alerts, Alert{s.Namespace + "/" + s.Name + "-restarts", SevCritical,
				"High restart count", fmt.Sprintf("%s restarted %d times", s.Name, s.Restarts), s.Name})
		} else if s.Restarts >= t.RestartWarn {
			alerts = append(alerts, Alert{s.Namespace + "/" + s.Name + "-restarts", SevWarning,
				"Elevated restarts", fmt.Sprintf("%s restarted %d times", s.Name, s.Restarts), s.Name})
		}
	}
	return alerts
}
