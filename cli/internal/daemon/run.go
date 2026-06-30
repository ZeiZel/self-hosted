package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/ZeiZel/self-hosted/cli/internal/cluster"
	"github.com/ZeiZel/self-hosted/cli/internal/core"
	"github.com/ZeiZel/self-hosted/cli/internal/db"
	"github.com/ZeiZel/self-hosted/cli/internal/telegram"
)

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func envStr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// snapshot holds the latest cluster state served by the HTTP API.
type snapshot struct {
	mu      sync.RWMutex
	summary cluster.ClusterSummary
	nodes   []cluster.NodeMetrics
	svcs    []cluster.ServiceMetrics
	updated time.Time
}

func (s *snapshot) set(sum cluster.ClusterSummary, n []cluster.NodeMetrics, sv []cluster.ServiceMetrics) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.summary, s.nodes, s.svcs, s.updated = sum, n, sv, time.Now()
}

func (s *snapshot) read() (cluster.ClusterSummary, []cluster.NodeMetrics, []cluster.ServiceMetrics) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.summary, s.nodes, s.svcs
}

// RunForeground runs the daemon loop until SIGINT/SIGTERM.
func RunForeground() error {
	interval := envInt("CHECK_INTERVAL", 60)
	metricsInterval := envInt("METRICS_INTERVAL", 5)
	retentionDays := envInt("RETENTION_DAYS", 7)
	httpHost := envStr("HTTP_HOST", "127.0.0.1")
	httpPort := envInt("HTTP_PORT", 8765)

	d, err := db.Open(core.DatabasePath())
	if err != nil {
		return err
	}
	defer d.Close()

	cl := cluster.New()
	if kc := os.Getenv("KUBECONFIG"); kc != "" {
		cl.Kubeconfig = kc
	}

	_ = d.SetState("running", "true")
	_ = d.SetState("started_at", time.Now().UTC().Format(time.RFC3339))
	defer d.SetState("running", "false")

	// Inbound Telegram command bot (if configured + enabled).
	botStop := make(chan struct{})
	defer close(botStop)
	if bot, err := telegram.NewBot(d, cl); err == nil {
		go bot.Run(botStop)
		fmt.Println("telegram command bot started")
	}

	snap := &snapshot{}
	pred := newPredictor()

	// HTTP long-poll API (parity with daemon-server.ts).
	srv := startHTTP(httpHost, httpPort, snap, pred)
	defer srv.Close()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Metrics collector ticker.
	metricsTick := time.NewTicker(time.Duration(metricsInterval) * time.Second)
	defer metricsTick.Stop()
	// Health-check ticker.
	healthTick := time.NewTicker(time.Duration(interval) * time.Second)
	defer healthTick.Stop()

	fmt.Printf("selfhost daemon: check=%ds metrics=%ds http=%s:%d\n", interval, metricsInterval, httpHost, httpPort)

	collect := func() {
		sum, errS := cl.Summary()
		nodes, _ := cl.NodeMetricsList()
		svcs, _ := cl.ServiceMetricsList("")
		if errS == nil {
			snap.set(sum, nodes, svcs)
			ms := make([]db.Metric, 0, len(nodes)*2+2)
			for _, n := range nodes {
				pred.record("node_cpu:"+n.Name, float64(n.CPU.Percent))
				pred.record("node_memory:"+n.Name, float64(n.Memory.Percent))
				ms = append(ms,
					db.Metric{Type: "cpu", TargetID: n.Name, TargetType: "node", Value: float64(n.CPU.Percent), Unit: "%"},
					db.Metric{Type: "memory", TargetID: n.Name, TargetType: "node", Value: float64(n.Memory.Percent), Unit: "%"},
				)
			}
			pred.record("cluster_cpu:cluster", float64(sum.CPU.Percent))
			pred.record("cluster_memory:cluster", float64(sum.Memory.Percent))
			ms = append(ms,
				db.Metric{Type: "cpu", TargetID: "cluster", TargetType: "cluster", Value: float64(sum.CPU.Percent), Unit: "%"},
				db.Metric{Type: "memory", TargetID: "cluster", TargetType: "cluster", Value: float64(sum.Memory.Percent), Unit: "%"},
			)
			if err := d.InsertMetrics(ms); err != nil {
				_ = d.SetState("last_error", err.Error())
			}
		}
	}
	collect()

	healthCheck := func() {
		nodes, err := cl.NodeMetricsList()
		now := time.Now().UTC().Format(time.RFC3339)
		if err != nil {
			_ = d.SetState("last_error", err.Error())
			_ = d.InsertHealthLog(db.HealthLog{CheckType: "cluster", Target: "kubectl", Status: "unknown", Message: err.Error()})
			return
		}
		_ = d.SetState("last_check", now)
		_ = d.SetState("last_error", "")
		for _, n := range nodes {
			if n.Health == cluster.HealthHealthy {
				continue // only persist non-healthy entries (parity)
			}
			meta, _ := json.Marshal(map[string]any{"cpu": n.CPU.Percent, "memory": n.Memory.Percent})
			log := db.HealthLog{
				CheckType: "node", Target: n.Name, Status: string(n.Health),
				Message:  fmt.Sprintf("cpu %d%% mem %d%%", n.CPU.Percent, n.Memory.Percent),
				Metadata: string(meta), Timestamp: now,
			}
			_ = d.InsertHealthLog(log)
			maybeAlert(d, n.Name, n.Health, log.Message)
		}
		if removed, _ := d.PurgeOldHealthLogs(retentionDays); removed > 0 {
			fmt.Printf("purged %d old health logs\n", removed)
		}
		if removed, _ := d.PurgeOldMetrics(retentionDays); removed > 0 {
			fmt.Printf("purged %d old metrics\n", removed)
		}
	}
	healthCheck()

	for {
		select {
		case <-ctx.Done():
			fmt.Println("daemon: shutting down")
			return nil
		case <-metricsTick.C:
			collect()
		case <-healthTick.C:
			healthCheck()
		}
	}
}

// maybeAlert sends a Telegram alert when enabled and the severity matches.
func maybeAlert(d *db.DB, target string, health cluster.NodeHealth, msg string) {
	cfg, err := telegram.LoadConfig(d)
	if err != nil || !cfg.Enabled {
		return
	}
	if health == cluster.HealthCritical && !cfg.AlertOnCritical {
		return
	}
	if health == cluster.HealthWarning && !cfg.AlertOnDegraded {
		return
	}
	sev := "warning"
	if health == cluster.HealthCritical {
		sev = "critical"
	}
	title := fmt.Sprintf("Node %s %s", target, health)
	// ThrottledAlert applies dedup (same target+status within 5m) and the
	// configured rate limit, and records the alert in telegram_alert_log.
	if _, err := telegram.ThrottledAlert(d, target, string(health), title, msg, sev); err != nil {
		_ = d.SetState("last_error", err.Error())
	}
}

func startHTTP(host string, port int, snap *snapshot, pred *predictor) *http.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"status": "ok", "time": time.Now().UTC()})
	})
	current := func(w http.ResponseWriter, r *http.Request) {
		sum, nodes, svcs := snap.read()
		writeJSON(w, map[string]any{"summary": sum, "nodes": nodes, "services": svcs})
	}
	mux.HandleFunc("/api/v1/metrics/current", current)
	mux.HandleFunc("/api/v1/metrics/poll", current)
	mux.HandleFunc("/api/v1/metrics/history", func(w http.ResponseWriter, r *http.Request) {
		pred.mu.Lock()
		out := map[string][]map[string]any{}
		for k, s := range pred.series {
			pts := make([]map[string]any, len(s))
			for i, p := range s {
				pts[i] = map[string]any{"t": p.t.UTC().Format(time.RFC3339), "v": p.v}
			}
			out[k] = pts
		}
		pred.mu.Unlock()
		writeJSON(w, out)
	})
	mux.HandleFunc("/api/v1/predictions", func(w http.ResponseWriter, r *http.Request) {
		// All horizons (5m/30m/60m), each alert labelled with its horizon.
		writeJSON(w, pred.forecastAll())
	})
	mux.HandleFunc("/api/v1/pods/", podDetailsHandler)
	srv := &http.Server{Addr: fmt.Sprintf("%s:%d", host, port), Handler: mux}
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Printf("http server: %v\n", err)
		}
	}()
	return srv
}

// podDetailsHandler serves /api/v1/pods/{ns}/{name}/details by shelling out to
// kubectl (honouring KUBECONFIG, as the rest of the daemon does). It returns the
// pod spec/status, recent events for the object and the last 100 log lines.
func podDetailsHandler(w http.ResponseWriter, r *http.Request) {
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/pods/"), "/")
	parts := strings.Split(rest, "/")
	if len(parts) < 2 || parts[0] == "" || parts[1] == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]any{"error": "expected /api/v1/pods/{ns}/{name}/details"})
		return
	}
	ns, name := parts[0], parts[1]

	podRaw, podErr := kubectlOutput("get", "pod", "-n", ns, name, "-o", "json")
	evRaw, _ := kubectlOutput("get", "events", "-n", ns,
		"--field-selector", "involvedObject.name="+name, "-o", "json")
	logsRaw, _ := kubectlOutput("logs", "-n", ns, name, "--tail=100")

	resp := map[string]any{
		"pod":    rawJSON(podRaw),
		"events": rawJSON(evRaw),
		"logs":   string(logsRaw),
	}
	if podErr != nil {
		resp["error"] = podErr.Error()
	}
	writeJSON(w, resp)
}

// kubectlOutput runs kubectl with the given args, prepending --kubeconfig when
// KUBECONFIG is set so it matches the cluster client's behaviour.
func kubectlOutput(args ...string) ([]byte, error) {
	if kc := os.Getenv("KUBECONFIG"); kc != "" {
		args = append([]string{"--kubeconfig", kc}, args...)
	}
	return exec.Command("kubectl", args...).Output()
}

// rawJSON returns b as embeddable JSON when it parses, otherwise nil.
func rawJSON(b []byte) json.RawMessage {
	if len(b) == 0 || !json.Valid(b) {
		return nil
	}
	return json.RawMessage(b)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
