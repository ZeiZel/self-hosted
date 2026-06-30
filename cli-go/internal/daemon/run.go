package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"sync"
	"syscall"
	"time"

	"github.com/ZeiZel/self-hosted/cli-go/internal/cluster"
	"github.com/ZeiZel/self-hosted/cli-go/internal/core"
	"github.com/ZeiZel/self-hosted/cli-go/internal/db"
	"github.com/ZeiZel/self-hosted/cli-go/internal/telegram"
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

	// HTTP long-poll API (parity with daemon-server.ts).
	srv := startHTTP(httpHost, httpPort, snap)
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
	c := telegram.NewClient(cfg.Token)
	_ = c.SendAlert(cfg.ChatID, fmt.Sprintf("Node %s %s", target, health), msg, sev)
	_, _ = d.Conn().Exec(
		`INSERT INTO telegram_alert_log (check_type, target, status, sent_at) VALUES (?,?,?,?)`,
		"node", target, string(health), time.Now().UTC().Format(time.RFC3339))
}

func startHTTP(host string, port int, snap *snapshot) *http.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"status": "ok", "time": time.Now().UTC()})
	})
	mux.HandleFunc("/api/v1/metrics/current", func(w http.ResponseWriter, r *http.Request) {
		sum, nodes, svcs := snap.read()
		writeJSON(w, map[string]any{"summary": sum, "nodes": nodes, "services": svcs})
	})
	mux.HandleFunc("/api/v1/metrics/poll", func(w http.ResponseWriter, r *http.Request) {
		sum, nodes, svcs := snap.read()
		writeJSON(w, map[string]any{"summary": sum, "nodes": nodes, "services": svcs})
	})
	srv := &http.Server{Addr: fmt.Sprintf("%s:%d", host, port), Handler: mux}
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Printf("http server: %v\n", err)
		}
	}()
	return srv
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
