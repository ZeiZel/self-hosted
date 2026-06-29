// Package tui implements the live cluster dashboard with bubbletea + lipgloss +
// bubbles, and ntcharts sparklines for CPU/memory trends. Ports the React/Ink
// monitor TUI (cli/src/modules/monitor/tui/*).
package tui

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/NimbleMarkets/ntcharts/sparkline"
	"github.com/ZeiZel/self-hosted/cli-go/internal/cluster"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// Options configure the dashboard.
type Options struct {
	RefreshInterval int
	Namespace       string
	Node            string
	ShowAlerts      bool
}

// Headless prints a one-shot JSON snapshot (parity with --headless).
func Headless(cl *cluster.Client, opts Options) error {
	sum, err := cl.Summary()
	if err != nil {
		return err
	}
	nodes, _ := cl.NodeMetricsList()
	svcs, _ := cl.ServiceMetricsList(opts.Namespace)
	out, _ := json.MarshalIndent(map[string]any{
		"summary": sum, "nodes": nodes, "services": svcs, "timestamp": time.Now().UTC(),
	}, "", "  ")
	fmt.Println(string(out))
	return nil
}

// Run launches the interactive dashboard.
func Run(cl *cluster.Client, opts Options) error {
	if opts.RefreshInterval <= 0 {
		opts.RefreshInterval = 5
	}
	m := newModel(cl, opts)
	p := tea.NewProgram(m, tea.WithAltScreen())
	_, err := p.Run()
	return err
}

// ---- styles ----

var (
	border   = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("63")).Padding(0, 1)
	titleSty = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("213"))
	dimSty   = lipgloss.NewStyle().Foreground(lipgloss.Color("245"))
	okSty    = lipgloss.NewStyle().Foreground(lipgloss.Color("42"))
	warnSty  = lipgloss.NewStyle().Foreground(lipgloss.Color("214"))
	critSty  = lipgloss.NewStyle().Foreground(lipgloss.Color("196"))
)

func healthStyle(h cluster.NodeHealth) lipgloss.Style {
	switch h {
	case cluster.HealthHealthy:
		return okSty
	case cluster.HealthWarning:
		return warnSty
	case cluster.HealthCritical:
		return critSty
	default:
		return dimSty
	}
}

// ---- model ----

type tickMsg time.Time
type dataMsg struct {
	summary cluster.ClusterSummary
	nodes   []cluster.NodeMetrics
	svcs    []cluster.ServiceMetrics
	err     error
}

type model struct {
	cl   *cluster.Client
	opts Options

	width, height int
	summary       cluster.ClusterSummary
	nodes         []cluster.NodeMetrics
	svcs          []cluster.ServiceMetrics
	err           error
	lastUpdate    time.Time
	panel         int // 0 nodes, 1 services
	cpuSpark      sparkline.Model
	memSpark      sparkline.Model
}

func newModel(cl *cluster.Client, opts Options) *model {
	return &model{
		cl: cl, opts: opts,
		cpuSpark: sparkline.New(30, 4),
		memSpark: sparkline.New(30, 4),
	}
}

func (m *model) Init() tea.Cmd {
	return tea.Batch(m.fetch(), m.tick())
}

func (m *model) tick() tea.Cmd {
	return tea.Tick(time.Duration(m.opts.RefreshInterval)*time.Second, func(t time.Time) tea.Msg {
		return tickMsg(t)
	})
}

func (m *model) fetch() tea.Cmd {
	return func() tea.Msg {
		sum, err := m.cl.Summary()
		nodes, _ := m.cl.NodeMetricsList()
		svcs, _ := m.cl.ServiceMetricsList(m.opts.Namespace)
		return dataMsg{summary: sum, nodes: nodes, svcs: svcs, err: err}
	}
}

func (m *model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			return m, tea.Quit
		case "r":
			return m, m.fetch()
		case "tab":
			m.panel = (m.panel + 1) % 2
		}
	case tickMsg:
		return m, tea.Batch(m.fetch(), m.tick())
	case dataMsg:
		m.err = msg.err
		if msg.err == nil {
			m.summary, m.nodes, m.svcs = msg.summary, msg.nodes, msg.svcs
			m.lastUpdate = time.Now()
			m.cpuSpark.Push(float64(m.summary.CPU.Percent))
			m.memSpark.Push(float64(m.summary.Memory.Percent))
			m.cpuSpark.Draw()
			m.memSpark.Draw()
		}
	}
	return m, nil
}

func (m *model) View() string {
	header := titleSty.Render("⎈ selfhost monitor") + dimSty.Render(
		fmt.Sprintf("   updated %s   [tab] panel  [r] refresh  [q] quit", m.lastUpdate.Format("15:04:05")))

	if m.err != nil {
		return header + "\n\n" + critSty.Render("cluster unreachable: "+m.err.Error()) +
			dimSty.Render("\n\nrun 'selfhost monitor --mock' for a demo.")
	}

	summary := m.summaryPanel()
	var body string
	if m.panel == 0 {
		body = m.nodesPanel()
	} else {
		body = m.servicesPanel()
	}
	return header + "\n\n" + summary + "\n" + body
}

func (m *model) summaryPanel() string {
	s := m.summary
	left := fmt.Sprintf(
		"%s\nNodes:  %d (%s/%s/%s)\nPods:   %d running, %d pending, %d failed\nCPU:    %s / %s (%d%%)\nMemory: %s / %s (%d%%)\nNamespaces: %d",
		titleSty.Render("Cluster"),
		s.Nodes.Total, okSty.Render(fmt.Sprint(s.Nodes.Healthy)), warnSty.Render(fmt.Sprint(s.Nodes.Warning)), critSty.Render(fmt.Sprint(s.Nodes.Critical)),
		s.Pods.Running, s.Pods.Pending, s.Pods.Failed,
		cluster.FormatCPU(s.CPU.Used), cluster.FormatCPU(s.CPU.Total), s.CPU.Percent,
		cluster.FormatBytes(s.Memory.Used), cluster.FormatBytes(s.Memory.Total), s.Memory.Percent,
		s.Namespaces,
	)
	right := fmt.Sprintf("%s\nCPU %%\n%s\n%s\nMEM %%\n%s",
		titleSty.Render("Trend"), m.cpuSpark.View(), dimSty.Render(""), m.memSpark.View())
	return lipgloss.JoinHorizontal(lipgloss.Top, border.Render(left), border.Render(right))
}

func (m *model) nodesPanel() string {
	var b strings.Builder
	b.WriteString(titleSty.Render("Nodes") + dimSty.Render("  (tab → services)") + "\n")
	fmt.Fprintf(&b, "%-16s %-15s %-8s %-6s %-6s %s\n", "NAME", "IP", "ROLE", "CPU%", "MEM%", "HEALTH")
	for _, n := range m.nodes {
		role := strings.Join(n.Roles, ",")
		fmt.Fprintf(&b, "%-16s %-15s %-8s %-6d %-6d %s\n",
			trunc(n.Name, 16), trunc(n.IP, 15), trunc(role, 8), n.CPU.Percent, n.Memory.Percent,
			healthStyle(n.Health).Render(string(n.Health)))
	}
	return border.Render(b.String())
}

func (m *model) servicesPanel() string {
	var b strings.Builder
	b.WriteString(titleSty.Render("Services") + dimSty.Render("  (tab → nodes)") + "\n")
	fmt.Fprintf(&b, "%-22s %-14s %-12s %-8s %s\n", "NAME", "NAMESPACE", "NODE", "RESTART", "STATUS")
	shown := 0
	for _, s := range m.svcs {
		if m.opts.Node != "" && s.Node != m.opts.Node {
			continue
		}
		fmt.Fprintf(&b, "%-22s %-14s %-12s %-8d %s\n",
			trunc(s.Name, 22), trunc(s.Namespace, 14), trunc(s.Node, 12), s.Restarts,
			healthStyle(s.Health).Render(string(s.Status)))
		shown++
		if shown >= 20 {
			b.WriteString(dimSty.Render(fmt.Sprintf("… %d more", len(m.svcs)-shown)) + "\n")
			break
		}
	}
	return border.Render(b.String())
}

func trunc(s string, n int) string {
	if len(s) <= n {
		return s
	}
	if n <= 1 {
		return s[:n]
	}
	return s[:n-1] + "…"
}

var _ = os.Stdout
