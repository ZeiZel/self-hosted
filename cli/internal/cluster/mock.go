package cluster

import (
	"os"
	"strings"
	"time"
)

// envWithout returns os.Environ() with the named vars blanked (set to empty).
func envWithout(names ...string) []string {
	blank := map[string]bool{}
	for _, n := range names {
		blank[n] = true
	}
	var out []string
	for _, kv := range os.Environ() {
		k := kv
		if i := strings.IndexByte(kv, '='); i >= 0 {
			k = kv[:i]
		}
		if blank[k] {
			out = append(out, k+"=")
			continue
		}
		out = append(out, kv)
	}
	return out
}

// mockNodes mirrors getMockNodeMetrics() from the Node CLI.
func mockNodes() []NodeMetrics {
	now := time.Now().UTC().Format(time.RFC3339)
	return []NodeMetrics{
		{
			Name: "master-01", IP: "192.168.1.10", Roles: []string{"master"},
			Health:      HealthHealthy,
			CPU:         Resource{Total: 8000, Used: 2400, Percent: 30},
			Memory:      Resource{Total: 16 << 30, Used: 8 << 30, Percent: 50},
			Pods:        PodCounts{Total: 15, Running: 14, Pending: 1, Failed: 0},
			Conditions:  []NodeCondition{{Type: "Ready", Status: "True"}},
			LastUpdated: now,
		},
		{
			Name: "worker-01", IP: "192.168.1.11", Roles: []string{"worker"},
			Health:      HealthWarning,
			CPU:         Resource{Total: 16000, Used: 12000, Percent: 75},
			Memory:      Resource{Total: 32 << 30, Used: 28 << 30, Percent: 87},
			Pods:        PodCounts{Total: 25, Running: 23, Pending: 0, Failed: 2},
			Conditions:  []NodeCondition{{Type: "Ready", Status: "True"}},
			LastUpdated: now,
		},
	}
}

// mockServices mirrors getMockServiceMetrics() from the Node CLI.
func mockServices() []ServiceMetrics {
	now := time.Now().UTC().Format(time.RFC3339)
	return []ServiceMetrics{
		{
			Name: "traefik", Namespace: "ingress", Node: "master-01",
			Status: PodRunning, Health: HealthHealthy,
			Replicas: Replicas{1, 1, 1},
			CPU:      ResourceRL{Requested: 500, Limit: 1000, Used: 200},
			Memory:   ResourceRL{Requested: 128 << 20, Limit: 512 << 20, Used: 100 << 20},
			Restarts: 0, Age: "5d", LastUpdated: now,
		},
		{
			Name: "postgresql", Namespace: "db", Node: "worker-01",
			Status: PodRunning, Health: HealthHealthy,
			Replicas: Replicas{1, 1, 1},
			CPU:      ResourceRL{Requested: 2000, Limit: 4000, Used: 1500},
			Memory:   ResourceRL{Requested: 2 << 30, Limit: 4 << 30, Used: 1610612736},
			Restarts: 0, Age: "5d", LastUpdated: now,
		},
		{
			Name: "gitlab", Namespace: "code", Node: "worker-01",
			Status: PodRunning, Health: HealthHealthy,
			Replicas: Replicas{1, 1, 1},
			CPU:      ResourceRL{Requested: 4000, Limit: 8000, Used: 3000},
			Memory:   ResourceRL{Requested: 4 << 30, Limit: 8 << 30, Used: 5 << 30},
			Restarts: 2, Age: "3d", LastUpdated: now,
		},
	}
}
