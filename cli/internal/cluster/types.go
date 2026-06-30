// Package cluster talks to the Kubernetes cluster via kubectl and models its
// state. Ported from cli/src/modules/monitor/cluster-client.service.ts and
// cli/src/interfaces/monitor.interface.ts.
package cluster

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
)

// NodeHealth enumerates node/service health.
type NodeHealth string

const (
	HealthHealthy  NodeHealth = "healthy"
	HealthWarning  NodeHealth = "warning"
	HealthCritical NodeHealth = "critical"
	HealthUnknown  NodeHealth = "unknown"
)

// PodStatus enumerates pod phases/conditions.
type PodStatus string

const (
	PodRunning     PodStatus = "Running"
	PodPending     PodStatus = "Pending"
	PodSucceeded   PodStatus = "Succeeded"
	PodFailed      PodStatus = "Failed"
	PodUnknown     PodStatus = "Unknown"
	PodTerminating PodStatus = "Terminating"
	PodCrashLoop   PodStatus = "CrashLoopBackOff"
	PodImagePull   PodStatus = "ImagePullBackOff"
	PodError       PodStatus = "Error"
)

// Resource is a generic total/used triple.
type Resource struct {
	Total   float64 `json:"total"`
	Used    float64 `json:"used"`
	Percent int     `json:"percent"`
}

// PodCounts groups pod counts by phase.
type PodCounts struct {
	Total   int `json:"total"`
	Running int `json:"running"`
	Pending int `json:"pending"`
	Failed  int `json:"failed"`
}

// NodeCondition mirrors a Kubernetes node condition.
type NodeCondition struct {
	Type    string `json:"type"`
	Status  string `json:"status"`
	Reason  string `json:"reason,omitempty"`
	Message string `json:"message,omitempty"`
}

// NodeMetrics is real-time per-node metrics.
type NodeMetrics struct {
	Name        string          `json:"name"`
	IP          string          `json:"ip"`
	Roles       []string        `json:"roles"`
	Health      NodeHealth      `json:"health"`
	CPU         Resource        `json:"cpu"`
	Memory      Resource        `json:"memory"`
	Pods        PodCounts       `json:"pods"`
	Conditions  []NodeCondition `json:"conditions"`
	LastUpdated string          `json:"lastUpdated"`
}

// Replicas captures desired/ready/available counts.
type Replicas struct {
	Desired   int `json:"desired"`
	Ready     int `json:"ready"`
	Available int `json:"available"`
}

// ServiceMetrics is per-workload metrics.
type ServiceMetrics struct {
	Name        string     `json:"name"`
	Namespace   string     `json:"namespace"`
	Node        string     `json:"node"`
	Status      PodStatus  `json:"status"`
	Health      NodeHealth `json:"health"`
	Replicas    Replicas   `json:"replicas"`
	CPU         ResourceRL `json:"cpu"`
	Memory      ResourceRL `json:"memory"`
	Restarts    int        `json:"restarts"`
	Age         string     `json:"age"`
	LastUpdated string     `json:"lastUpdated"`
}

// ResourceRL is requested/limit/used for a workload.
type ResourceRL struct {
	Requested float64 `json:"requested"`
	Limit     float64 `json:"limit"`
	Used      float64 `json:"used"`
}

// ClusterSummary aggregates cluster-wide metrics.
type ClusterSummary struct {
	Nodes struct {
		Total    int `json:"total"`
		Healthy  int `json:"healthy"`
		Warning  int `json:"warning"`
		Critical int `json:"critical"`
	} `json:"nodes"`
	Pods        PodCounts `json:"pods"`
	CPU         Resource  `json:"cpu"`
	Memory      Resource  `json:"memory"`
	Namespaces  int       `json:"namespaces"`
	LastUpdated string    `json:"lastUpdated"`
}

// AlertThresholds configures health calculation.
type AlertThresholds struct {
	CPUWarning, CPUCritical      float64
	MemWarning, MemCritical      float64
	RestartWarn, RestartCritical int
	PendingWarn, PendingCritical int
}

// DefaultThresholds matches DEFAULT_ALERT_THRESHOLDS.
var DefaultThresholds = AlertThresholds{
	CPUWarning: 75, CPUCritical: 90,
	MemWarning: 80, MemCritical: 95,
	RestartWarn: 3, RestartCritical: 10,
	PendingWarn: 60, PendingCritical: 300,
}

// CalculateHealth derives health from CPU/memory percentages.
func CalculateHealth(cpuPct, memPct float64, t AlertThresholds) NodeHealth {
	if cpuPct >= t.CPUCritical || memPct >= t.MemCritical {
		return HealthCritical
	}
	if cpuPct >= t.CPUWarning || memPct >= t.MemWarning {
		return HealthWarning
	}
	return HealthHealthy
}

// FormatBytes renders bytes as B/Ki/Mi/Gi/Ti.
func FormatBytes(b float64) string {
	if b == 0 {
		return "0 B"
	}
	sizes := []string{"B", "Ki", "Mi", "Gi", "Ti"}
	i := int(math.Floor(math.Log(b) / math.Log(1024)))
	if i < 0 {
		i = 0
	}
	if i >= len(sizes) {
		i = len(sizes) - 1
	}
	return fmt.Sprintf("%g %s", round1(b/math.Pow(1024, float64(i))), sizes[i])
}

// FormatCPU renders millicores (>=1000 -> cores).
func FormatCPU(m float64) string {
	if m >= 1000 {
		return fmt.Sprintf("%.1f", m/1000)
	}
	return fmt.Sprintf("%dm", int(m))
}

func round1(f float64) float64 { return math.Round(f*10) / 10 }

var ageRe = regexp.MustCompile(`(\d+)([dhms])`)

// ParseAge converts "5d"/"2h"/"30m"/"10s" to seconds.
func ParseAge(s string) int {
	m := ageRe.FindStringSubmatch(s)
	if m == nil {
		return 0
	}
	v, _ := strconv.Atoi(m[1])
	switch m[2] {
	case "d":
		return v * 86400
	case "h":
		return v * 3600
	case "m":
		return v * 60
	case "s":
		return v
	}
	return 0
}
