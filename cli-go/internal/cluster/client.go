package cluster

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// Client runs kubectl against the cluster.
//
// Unlike the Node implementation (which silently returned mock data whenever
// kubectl failed), this client only serves mock data when Mock is explicitly
// enabled; otherwise failures surface as errors.
type Client struct {
	Kubeconfig string
	Mock       bool
	Thresholds AlertThresholds
}

// New returns a client with default thresholds.
func New() *Client { return &Client{Thresholds: DefaultThresholds} }

// kubectl runs a kubectl command and returns trimmed stdout.
func (c *Client) kubectl(args ...string) (string, error) {
	full := args
	if c.Kubeconfig != "" {
		full = append([]string{"--kubeconfig", c.Kubeconfig}, args...)
	}
	cmd := exec.Command("kubectl", full...)
	// Disable proxies for internal cluster IPs (parity with the Node client).
	cmd.Env = append(envWithout("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"),
		"NO_PROXY=*", "no_proxy=*")
	out, err := cmd.Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			return "", fmt.Errorf("kubectl %s: %s", strings.Join(args, " "), strings.TrimSpace(string(ee.Stderr)))
		}
		return "", fmt.Errorf("kubectl %s: %w", strings.Join(args, " "), err)
	}
	return strings.TrimSpace(string(out)), nil
}

// CheckConnection verifies the cluster is reachable.
func (c *Client) CheckConnection() error {
	if c.Mock {
		return nil
	}
	_, err := c.kubectl("cluster-info")
	return err
}

// NodeMetricsList returns per-node metrics.
func (c *Client) NodeMetricsList() ([]NodeMetrics, error) {
	if c.Mock {
		return mockNodes(), nil
	}
	raw, err := c.kubectl("get", "nodes", "-o", "json")
	if err != nil {
		return nil, err
	}
	var nodesData struct {
		Items []struct {
			Metadata struct {
				Name   string            `json:"name"`
				Labels map[string]string `json:"labels"`
			} `json:"metadata"`
			Status struct {
				Capacity   map[string]string                `json:"capacity"`
				Addresses  []struct{ Type, Address string } `json:"addresses"`
				Conditions []struct {
					Type, Status, Reason, Message string
				} `json:"conditions"`
			} `json:"status"`
		} `json:"items"`
	}
	if err := json.Unmarshal([]byte(raw), &nodesData); err != nil {
		return nil, err
	}

	// Best-effort usage via `kubectl top nodes`.
	usage := map[string]struct{ cpu, mem float64 }{}
	if top, err := c.kubectl("top", "nodes", "--no-headers"); err == nil {
		for _, line := range strings.Split(top, "\n") {
			parts := strings.Fields(line)
			if len(parts) >= 5 {
				usage[parts[0]] = struct{ cpu, mem float64 }{parseCPU(parts[1]), parseMemory(parts[3])}
			}
		}
	}

	now := time.Now().UTC().Format(time.RFC3339)
	var nodes []NodeMetrics
	for _, n := range nodesData.Items {
		totalCPU := parseCPU(orDefault(n.Status.Capacity["cpu"], "4"))
		totalMem := parseMemory(orDefault(n.Status.Capacity["memory"], "8Gi"))
		u := usage[n.Metadata.Name]
		var ip string
		for _, a := range n.Status.Addresses {
			if a.Type == "InternalIP" {
				ip = a.Address
			}
		}
		var conds []NodeCondition
		for _, cd := range n.Status.Conditions {
			conds = append(conds, NodeCondition{cd.Type, cd.Status, cd.Reason, cd.Message})
		}
		roles := []string{}
		l := n.Metadata.Labels
		if _, ok := l["node-role.kubernetes.io/master"]; ok {
			roles = append(roles, "master")
		} else if _, ok := l["node-role.kubernetes.io/control-plane"]; ok {
			roles = append(roles, "master")
		}
		if _, ok := l["node-role.kubernetes.io/worker"]; ok || len(roles) == 0 {
			roles = append(roles, "worker")
		}
		cpuPct, memPct := pct(u.cpu, totalCPU), pct(u.mem, totalMem)
		nodes = append(nodes, NodeMetrics{
			Name:        n.Metadata.Name,
			IP:          ip,
			Roles:       roles,
			Health:      CalculateHealth(float64(cpuPct), float64(memPct), c.thresholds()),
			CPU:         Resource{Total: totalCPU, Used: u.cpu, Percent: cpuPct},
			Memory:      Resource{Total: totalMem, Used: u.mem, Percent: memPct},
			Conditions:  conds,
			LastUpdated: now,
		})
	}
	c.enrichPodCounts(nodes)
	return nodes, nil
}

func (c *Client) enrichPodCounts(nodes []NodeMetrics) {
	out, err := c.kubectl("get", "pods", "-A", "-o",
		`jsonpath={range .items[*]}{.spec.nodeName}{" "}{.status.phase}{"\n"}{end}`)
	if err != nil {
		return
	}
	type counts struct{ running, pending, failed int }
	byNode := map[string]*counts{}
	for _, line := range strings.Split(out, "\n") {
		f := strings.Fields(line)
		if len(f) < 2 {
			continue
		}
		c := byNode[f[0]]
		if c == nil {
			c = &counts{}
			byNode[f[0]] = c
		}
		switch f[1] {
		case "Running":
			c.running++
		case "Pending":
			c.pending++
		case "Failed":
			c.failed++
		}
	}
	for i := range nodes {
		if c := byNode[nodes[i].Name]; c != nil {
			nodes[i].Pods = PodCounts{c.running + c.pending + c.failed, c.running, c.pending, c.failed}
		}
	}
}

// ServiceMetricsList returns per-workload metrics, optionally namespace-scoped.
func (c *Client) ServiceMetricsList(namespace string) ([]ServiceMetrics, error) {
	if c.Mock {
		return mockServices(), nil
	}
	var args []string
	if namespace != "" {
		args = []string{"get", "pods", "-n", namespace, "-o", "json"}
	} else {
		args = []string{"get", "pods", "-A", "-o", "json"}
	}
	raw, err := c.kubectl(args...)
	if err != nil {
		return nil, err
	}
	var pods struct {
		Items []podItem `json:"items"`
	}
	if err := json.Unmarshal([]byte(raw), &pods); err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	var out []ServiceMetrics
	seen := map[string]bool{}
	for _, p := range pods.Items {
		name := firstNonEmpty(
			p.Metadata.Labels["app.kubernetes.io/name"],
			p.Metadata.Labels["app"],
			p.Metadata.Name, "unknown")
		key := name + "/" + p.Metadata.Namespace
		if seen[key] {
			continue
		}
		seen[key] = true
		status := mapPodStatus(p.Status.Phase, p.Status.ContainerStatuses)
		ready := 0
		for _, cs := range p.Status.ContainerStatuses {
			if cs.Ready {
				ready++
			}
		}
		avail := 0
		if status == PodRunning {
			avail = 1
		}
		var req, lim, memReq, memLim string
		if len(p.Spec.Containers) > 0 {
			req = p.Spec.Containers[0].Resources.Requests["cpu"]
			lim = p.Spec.Containers[0].Resources.Limits["cpu"]
			memReq = p.Spec.Containers[0].Resources.Requests["memory"]
			memLim = p.Spec.Containers[0].Resources.Limits["memory"]
		}
		restarts := 0
		if len(p.Status.ContainerStatuses) > 0 {
			restarts = p.Status.ContainerStatuses[0].RestartCount
		}
		out = append(out, ServiceMetrics{
			Name:        name,
			Namespace:   orDefault(p.Metadata.Namespace, "default"),
			Node:        orDefault(p.Spec.NodeName, "unknown"),
			Status:      status,
			Health:      mapStatusToHealth(status),
			Replicas:    Replicas{Desired: 1, Ready: ready, Available: avail},
			CPU:         ResourceRL{Requested: parseCPU(orDefault(req, "100m")), Limit: parseCPU(orDefault(lim, "1000m"))},
			Memory:      ResourceRL{Requested: parseMemory(orDefault(memReq, "128Mi")), Limit: parseMemory(orDefault(memLim, "512Mi"))},
			Restarts:    restarts,
			Age:         calcAge(p.Metadata.CreationTimestamp),
			LastUpdated: now,
		})
	}
	return out, nil
}

// Summary aggregates cluster-wide metrics.
func (c *Client) Summary() (ClusterSummary, error) {
	nodes, err := c.NodeMetricsList()
	if err != nil {
		return ClusterSummary{}, err
	}
	svcs, err := c.ServiceMetricsList("")
	if err != nil {
		return ClusterSummary{}, err
	}
	nsCount := 11
	if !c.Mock {
		if raw, err := c.kubectl("get", "namespaces", "-o", "json"); err == nil {
			var ns struct {
				Items []json.RawMessage `json:"items"`
			}
			if json.Unmarshal([]byte(raw), &ns) == nil && len(ns.Items) > 0 {
				nsCount = len(ns.Items)
			}
		}
	}
	var s ClusterSummary
	for _, n := range nodes {
		s.CPU.Total += n.CPU.Total
		s.CPU.Used += n.CPU.Used
		s.Memory.Total += n.Memory.Total
		s.Memory.Used += n.Memory.Used
		switch n.Health {
		case HealthHealthy:
			s.Nodes.Healthy++
		case HealthWarning:
			s.Nodes.Warning++
		case HealthCritical:
			s.Nodes.Critical++
		}
	}
	s.Nodes.Total = len(nodes)
	s.CPU.Percent = pct(s.CPU.Used, s.CPU.Total)
	s.Memory.Percent = pct(s.Memory.Used, s.Memory.Total)
	s.Pods.Total = len(svcs)
	for _, sv := range svcs {
		switch sv.Status {
		case PodRunning:
			s.Pods.Running++
		case PodPending:
			s.Pods.Pending++
		case PodFailed, PodCrashLoop, PodError:
			s.Pods.Failed++
		}
	}
	s.Namespaces = nsCount
	s.LastUpdated = time.Now().UTC().Format(time.RFC3339)
	return s, nil
}

func (c *Client) thresholds() AlertThresholds {
	if c.Thresholds == (AlertThresholds{}) {
		return DefaultThresholds
	}
	return c.Thresholds
}

// ---- kubectl JSON shapes ----

type podItem struct {
	Metadata struct {
		Name              string            `json:"name"`
		Namespace         string            `json:"namespace"`
		Labels            map[string]string `json:"labels"`
		CreationTimestamp string            `json:"creationTimestamp"`
	} `json:"metadata"`
	Spec struct {
		NodeName   string `json:"nodeName"`
		Containers []struct {
			Resources struct {
				Requests map[string]string `json:"requests"`
				Limits   map[string]string `json:"limits"`
			} `json:"resources"`
		} `json:"containers"`
	} `json:"spec"`
	Status struct {
		Phase             string `json:"phase"`
		ContainerStatuses []struct {
			Ready        bool `json:"ready"`
			RestartCount int  `json:"restartCount"`
			State        struct {
				Waiting    *struct{ Reason string } `json:"waiting"`
				Terminated *struct{ Reason string } `json:"terminated"`
			} `json:"state"`
		} `json:"containerStatuses"`
	} `json:"status"`
}

type containerStatus = struct {
	Ready        bool `json:"ready"`
	RestartCount int  `json:"restartCount"`
	State        struct {
		Waiting    *struct{ Reason string } `json:"waiting"`
		Terminated *struct{ Reason string } `json:"terminated"`
	} `json:"state"`
}

func mapPodStatus(phase string, cs []containerStatus) PodStatus {
	for _, c := range cs {
		if c.State.Waiting != nil {
			switch c.State.Waiting.Reason {
			case "CrashLoopBackOff":
				return PodCrashLoop
			case "ImagePullBackOff":
				return PodImagePull
			}
		}
		if c.State.Terminated != nil && c.State.Terminated.Reason == "Error" {
			return PodError
		}
	}
	switch phase {
	case "Running":
		return PodRunning
	case "Pending":
		return PodPending
	case "Succeeded":
		return PodSucceeded
	case "Failed":
		return PodFailed
	case "Terminating":
		return PodTerminating
	default:
		return PodUnknown
	}
}

func mapStatusToHealth(s PodStatus) NodeHealth {
	switch s {
	case PodRunning, PodSucceeded:
		return HealthHealthy
	case PodPending:
		return HealthWarning
	case PodFailed, PodCrashLoop, PodImagePull, PodError:
		return HealthCritical
	default:
		return HealthUnknown
	}
}

// ---- parsing helpers ----

func parseCPU(s string) float64 {
	if s == "" {
		return 0
	}
	if strings.HasSuffix(s, "m") {
		v, _ := strconv.Atoi(strings.TrimSuffix(s, "m"))
		return float64(v)
	}
	v, _ := strconv.ParseFloat(s, 64)
	return v * 1000
}

func parseMemory(s string) float64 {
	if s == "" {
		return 0
	}
	units := []struct {
		suffix string
		mult   float64
	}{
		{"Ki", 1024}, {"Mi", 1 << 20}, {"Gi", 1 << 30}, {"Ti", 1 << 40},
		{"K", 1000}, {"M", 1e6}, {"G", 1e9},
	}
	for _, u := range units {
		if strings.HasSuffix(s, u.suffix) {
			v, _ := strconv.ParseFloat(strings.TrimSuffix(s, u.suffix), 64)
			return v * u.mult
		}
	}
	v, _ := strconv.ParseFloat(s, 64)
	return v
}

func calcAge(ts string) string {
	if ts == "" {
		return "unknown"
	}
	t, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		return "unknown"
	}
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%ds", int(d.Seconds()))
	case d < time.Hour:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd", int(d.Hours()/24))
	}
}

func pct(used, total float64) int {
	if total <= 0 {
		return 0
	}
	return int(used/total*100 + 0.5)
}

func orDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
