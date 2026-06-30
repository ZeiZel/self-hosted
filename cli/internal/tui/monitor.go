// Package tui implements the live cluster dashboard with bubbletea + lipgloss +
// bubbles, and ntcharts sparklines for CPU/memory trends. Ports the React/Ink
// monitor TUI (cli/src/modules/monitor/tui/components/*): a multi-panel grid
// (nodes, summary, services, alerts) with focus cycling, in-panel selection,
// btop-style expand/collapse, services search + grouping, a pod-detail overlay
// and a help overlay.
package tui

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/NimbleMarkets/ntcharts/sparkline"
	"github.com/ZeiZel/self-hosted/cli/internal/cluster"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// Options configure the dashboard.
type Options struct {
	RefreshInterval int
	Namespace       string
	Node            string
	ShowAlerts      bool
	Thresholds      cluster.AlertThresholds
}

// Headless prints a one-shot JSON snapshot (parity with --headless).
func Headless(cl *cluster.Client, opts Options) error {
	sum, err := cl.Summary()
	if err != nil {
		return err
	}
	nodes, _ := cl.NodeMetricsList()
	svcs, _ := cl.ServiceMetricsList(opts.Namespace)
	alerts := cluster.GenerateAlerts(nodes, svcs, opts.Thresholds)
	out, _ := json.MarshalIndent(map[string]any{
		"summary": sum, "nodes": nodes, "services": svcs, "alerts": alerts, "timestamp": time.Now().UTC(),
	}, "", "  ")
	fmt.Println(string(out))
	return nil
}

// Run launches the interactive dashboard.
func Run(cl *cluster.Client, opts Options) error {
	if opts.RefreshInterval <= 0 {
		opts.RefreshInterval = 5
	}
	if opts.Thresholds == (cluster.AlertThresholds{}) {
		opts.Thresholds = cluster.DefaultThresholds
	}
	_, err := tea.NewProgram(newModel(cl, opts), tea.WithAltScreen()).Run()
	return err
}

// ---- styles ----

var (
	focusBorder = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("213")).Padding(0, 1)
	dimBorder   = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("240")).Padding(0, 1)
	titleSty    = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("213"))
	dimSty      = lipgloss.NewStyle().Foreground(lipgloss.Color("245"))
	okSty       = lipgloss.NewStyle().Foreground(lipgloss.Color("42"))
	warnSty     = lipgloss.NewStyle().Foreground(lipgloss.Color("214"))
	critSty     = lipgloss.NewStyle().Foreground(lipgloss.Color("196"))
	selSty      = lipgloss.NewStyle().Foreground(lipgloss.Color("0")).Background(lipgloss.Color("213"))
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

func sevStyle(s cluster.Severity) lipgloss.Style {
	switch s {
	case cluster.SevCritical:
		return critSty
	case cluster.SevWarning:
		return warnSty
	default:
		return dimSty
	}
}

// ---- panels ----

const (
	panelNodes = iota
	panelSummary
	panelServices
	panelAlerts
	panelCount
)

var panelNames = []string{"Nodes", "Summary", "Services", "Alerts"}

// ---- messages ----

type tickMsg time.Time
type dataMsg struct {
	summary cluster.ClusterSummary
	nodes   []cluster.NodeMetrics
	svcs    []cluster.ServiceMetrics
	alerts  []cluster.Alert
	err     error
}

// ---- model ----

type model struct {
	cl   *cluster.Client
	opts Options

	w, h       int
	summary    cluster.ClusterSummary
	nodes      []cluster.NodeMetrics
	svcs       []cluster.ServiceMetrics
	alerts     []cluster.Alert
	err        error
	lastUpdate time.Time

	focus    int
	sel      [panelCount]int
	expanded bool
	showHelp bool
	showDet  bool

	// pod-detail overlay tabs (overview / events / logs)
	detTab    int
	evVP      viewport.Model
	logVP     viewport.Model
	evText    string
	logText   string
	evLoaded  bool
	logLoaded bool

	searching bool
	query     string
	grouping  int // 0 none, 1 namespace, 2 node, 3 status

	cpuSpark sparkline.Model
	memSpark sparkline.Model
	cpuHist  map[string][]float64
}

func newModel(cl *cluster.Client, opts Options) *model {
	return &model{
		cl: cl, opts: opts,
		cpuSpark: sparkline.New(28, 4),
		memSpark: sparkline.New(28, 4),
		cpuHist:  map[string][]float64{},
		evVP:     viewport.New(0, 0),
		logVP:    viewport.New(0, 0),
	}
}

func (m *model) Init() tea.Cmd { return tea.Batch(m.fetch(), m.tick()) }

func (m *model) tick() tea.Cmd {
	return tea.Tick(time.Duration(m.opts.RefreshInterval)*time.Second, func(t time.Time) tea.Msg { return tickMsg(t) })
}

func (m *model) fetch() tea.Cmd {
	return func() tea.Msg {
		sum, err := m.cl.Summary()
		nodes, _ := m.cl.NodeMetricsList()
		svcs, _ := m.cl.ServiceMetricsList(m.opts.Namespace)
		alerts := cluster.GenerateAlerts(nodes, svcs, m.opts.Thresholds)
		return dataMsg{sum, nodes, svcs, alerts, err}
	}
}

func (m *model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.w, m.h = msg.Width, msg.Height
	case tickMsg:
		return m, tea.Batch(m.fetch(), m.tick())
	case dataMsg:
		m.err = msg.err
		if msg.err == nil {
			m.summary, m.nodes, m.svcs, m.alerts = msg.summary, msg.nodes, msg.svcs, msg.alerts
			m.lastUpdate = time.Now()
			m.cpuSpark.Push(float64(m.summary.CPU.Percent))
			m.memSpark.Push(float64(m.summary.Memory.Percent))
			m.cpuSpark.Draw()
			m.memSpark.Draw()
			for _, n := range m.nodes {
				h := append(m.cpuHist[n.Name], float64(n.CPU.Percent))
				if len(h) > 60 {
					h = h[len(h)-60:]
				}
				m.cpuHist[n.Name] = h
			}
			m.clampSelections()
		}
	case detailDataMsg:
		m.applyDetailData(msg)
	case tea.KeyMsg:
		return m.handleKey(msg)
	}
	return m, nil
}

func (m *model) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	// search input mode (services panel)
	if m.searching {
		switch msg.String() {
		case "esc":
			m.searching, m.query = false, ""
		case "enter":
			m.searching = false
		case "backspace":
			if len(m.query) > 0 {
				m.query = m.query[:len(m.query)-1]
			}
		default:
			if len(msg.String()) == 1 {
				m.query += msg.String()
			}
		}
		return m, nil
	}

	// pod-detail overlay owns all key input while open (tabs + scrolling)
	if m.showDet {
		return m.detailKey(msg)
	}

	switch msg.String() {
	case "q", "ctrl+c":
		return m, tea.Quit
	case "r":
		return m, m.fetch()
	case "?":
		m.showHelp = !m.showHelp
	case "esc":
		switch {
		case m.showHelp:
			m.showHelp = false
		case m.showDet:
			m.showDet = false
		case m.expanded:
			m.expanded = false
		}
	case "tab":
		m.focus = (m.focus + 1) % panelCount
	case "1", "2", "3", "4":
		m.focus = int(msg.String()[0] - '1')
	case "up", "k":
		if m.sel[m.focus] > 0 {
			m.sel[m.focus]--
		}
	case "down", "j":
		m.sel[m.focus]++
		m.clampSelections()
	case "g":
		if m.focus == panelServices {
			m.grouping = (m.grouping + 1) % 4
		}
	case "enter":
		m.expanded = !m.expanded
	case "d":
		if m.focus == panelServices && len(m.filteredServices()) > 0 {
			m.openDetail()
		}
	case "/":
		if m.focus == panelServices {
			m.searching, m.query = true, ""
		}
	}
	return m, nil
}

func (m *model) View() string {
	if m.w == 0 {
		return "loading…"
	}
	header := titleSty.Render(" ⎈ selfhost monitor ") + dimSty.Render(
		fmt.Sprintf(" %s  [tab] focus  [enter] expand  [/] search  [g] group  [d] detail  [?] help  [q] quit",
			m.lastUpdate.Format("15:04:05")))

	if m.err != nil {
		return header + "\n\n" + critSty.Render("cluster unreachable: "+m.err.Error()) +
			dimSty.Render("\n\ntry: selfhost monitor --mock")
	}
	if m.showHelp {
		return header + "\n\n" + m.helpView()
	}
	if m.showDet {
		return header + "\n\n" + m.detailView()
	}
	if m.expanded {
		return header + "\n\n" + m.panelView(m.focus, m.w-4, m.h-6, true)
	}

	colW := m.w/2 - 2
	rowH := (m.h - 6) / 2
	top := lipgloss.JoinHorizontal(lipgloss.Top,
		m.panelView(panelNodes, colW, rowH, m.focus == panelNodes),
		m.panelView(panelSummary, colW, rowH, m.focus == panelSummary))
	bottom := lipgloss.JoinHorizontal(lipgloss.Top,
		m.panelView(panelServices, colW, rowH, m.focus == panelServices),
		m.panelView(panelAlerts, colW, rowH, m.focus == panelAlerts))
	return header + "\n" + top + "\n" + bottom + "\n" + m.statusBar()
}

func (m *model) panelView(p, w, hgt int, focused bool) string {
	var body string
	switch p {
	case panelNodes:
		body = m.nodesBody()
	case panelSummary:
		body = m.summaryBody()
	case panelServices:
		body = m.servicesBody()
	case panelAlerts:
		body = m.alertsBody()
	}
	style := dimBorder
	if focused {
		style = focusBorder
	}
	return style.Width(w).Height(hgt).Render(body)
}

func (m *model) nodesBody() string {
	var b strings.Builder
	b.WriteString(titleSty.Render("Nodes") + "\n")
	for i, n := range m.nodes {
		line := fmt.Sprintf("%s %-14s %3d%%cpu %3d%%mem %s", healthStyle(n.Health).Render("●"),
			trunc(n.Name, 14), n.CPU.Percent, n.Memory.Percent, miniSpark(m.cpuHist[n.Name]))
		if m.focus == panelNodes && i == m.sel[panelNodes] {
			line = selSty.Render("›" + line)
		} else {
			line = " " + line
		}
		b.WriteString(line + "\n")
	}
	return b.String()
}

func (m *model) summaryBody() string {
	s := m.summary
	return fmt.Sprintf("%s\nNodes:  %d  %s%d %s%d %s%d\nPods:   %d run %d pend %d fail\nCPU:    %s / %s  %d%%\n%s\nMemory: %s / %s  %d%%\n%s\nNamespaces: %d",
		titleSty.Render("Cluster Summary"),
		s.Nodes.Total, okSty.Render("✓"), s.Nodes.Healthy, warnSty.Render("!"), s.Nodes.Warning, critSty.Render("✗"), s.Nodes.Critical,
		s.Pods.Running, s.Pods.Pending, s.Pods.Failed,
		cluster.FormatCPU(s.CPU.Used), cluster.FormatCPU(s.CPU.Total), s.CPU.Percent, m.cpuSpark.View(),
		cluster.FormatBytes(s.Memory.Used), cluster.FormatBytes(s.Memory.Total), s.Memory.Percent, m.memSpark.View(),
		s.Namespaces)
}

func (m *model) servicesBody() string {
	var b strings.Builder
	title := "Services"
	if m.grouping > 0 {
		title += dimSty.Render(" by " + []string{"", "namespace", "node", "status"}[m.grouping])
	}
	b.WriteString(titleSty.Render(title))
	if m.searching {
		b.WriteString(dimSty.Render("  /" + m.query + "█"))
	} else if m.query != "" {
		b.WriteString(dimSty.Render("  /" + m.query))
	}
	b.WriteString("\n")
	svcs := m.filteredServices()
	if m.grouping == 0 {
		for i, s := range svcs {
			b.WriteString(m.svcLine(s, i == m.sel[panelServices] && m.focus == panelServices) + "\n")
		}
	} else {
		groups, order := groupServices(svcs, m.grouping)
		idx := 0
		for _, g := range order {
			b.WriteString(dimSty.Render("▼ "+g) + "\n")
			for _, s := range groups[g] {
				b.WriteString(m.svcLine(s, idx == m.sel[panelServices] && m.focus == panelServices) + "\n")
				idx++
			}
		}
	}
	return b.String()
}

func (m *model) svcLine(s cluster.ServiceMetrics, sel bool) string {
	line := fmt.Sprintf("%s %-20s %-12s r:%d", healthStyle(s.Health).Render("●"), trunc(s.Name, 20), trunc(s.Namespace, 12), s.Restarts)
	if sel {
		return selSty.Render("›" + line)
	}
	return " " + line
}

func (m *model) alertsBody() string {
	var b strings.Builder
	b.WriteString(titleSty.Render(fmt.Sprintf("Alerts (%d)", len(m.alerts))) + "\n")
	if len(m.alerts) == 0 {
		b.WriteString(okSty.Render("no active alerts"))
		return b.String()
	}
	for i, a := range m.alerts {
		line := fmt.Sprintf("%s %s — %s", sevStyle(a.Severity).Render("●"), a.Title, a.Message)
		if m.focus == panelAlerts && i == m.sel[panelAlerts] {
			line = selSty.Render("›" + trunc(line, 60))
		} else {
			line = " " + trunc(line, 60)
		}
		b.WriteString(line + "\n")
	}
	return b.String()
}

func (m *model) helpView() string {
	rows := [][2]string{
		{"q / ctrl+c", "quit"}, {"r", "refresh"}, {"?", "toggle help"},
		{"tab / 1-4", "focus panel"}, {"↑↓ / j k", "select in panel"},
		{"enter", "expand / collapse panel"}, {"esc", "collapse / close overlay"},
		{"/", "search services"}, {"g", "cycle services grouping"}, {"d", "pod detail"},
		{"1/2/3 / tab", "detail: overview / events / logs tabs"},
		{"↑↓ / j k", "detail: scroll events / logs"},
		{"r", "detail: reload events / logs"},
	}
	var b strings.Builder
	b.WriteString(titleSty.Render("Keyboard shortcuts") + "\n\n")
	for _, r := range rows {
		b.WriteString(fmt.Sprintf("  %s  %s\n", okSty.Render(fmt.Sprintf("%-12s", r[0])), r[1]))
	}
	return focusBorder.Width(m.w - 6).Render(b.String())
}

func (m *model) statusBar() string {
	return dimSty.Render(fmt.Sprintf(" focus: %s | nodes:%d pods:%d alerts:%d | refresh %ds ",
		panelNames[m.focus], len(m.nodes), len(m.svcs), len(m.alerts), m.opts.RefreshInterval))
}

// ---- helpers ----

func (m *model) filteredServices() []cluster.ServiceMetrics {
	var out []cluster.ServiceMetrics
	for _, s := range m.svcs {
		if m.opts.Node != "" && s.Node != m.opts.Node {
			continue
		}
		if m.query != "" && !strings.Contains(strings.ToLower(s.Name+s.Namespace+s.Node), strings.ToLower(m.query)) {
			continue
		}
		out = append(out, s)
	}
	return out
}

func (m *model) clampSelections() {
	counts := [panelCount]int{len(m.nodes), 0, len(m.filteredServices()), len(m.alerts)}
	for p := 0; p < panelCount; p++ {
		if m.sel[p] >= counts[p] && counts[p] > 0 {
			m.sel[p] = counts[p] - 1
		}
		if m.sel[p] < 0 {
			m.sel[p] = 0
		}
	}
}

func groupServices(svcs []cluster.ServiceMetrics, mode int) (map[string][]cluster.ServiceMetrics, []string) {
	groups := map[string][]cluster.ServiceMetrics{}
	var order []string
	key := func(s cluster.ServiceMetrics) string {
		switch mode {
		case 1:
			return s.Namespace
		case 2:
			return s.Node
		case 3:
			return string(s.Status)
		}
		return ""
	}
	for _, s := range svcs {
		k := key(s)
		if _, ok := groups[k]; !ok {
			order = append(order, k)
		}
		groups[k] = append(groups[k], s)
	}
	sort.Strings(order)
	return groups, order
}

var sparkRunes = []rune("▁▂▃▄▅▆▇█")

func miniSpark(vals []float64) string {
	if len(vals) == 0 {
		return ""
	}
	if len(vals) > 12 {
		vals = vals[len(vals)-12:]
	}
	var b strings.Builder
	for _, v := range vals {
		idx := int(v / 100 * float64(len(sparkRunes)-1))
		if idx < 0 {
			idx = 0
		}
		if idx >= len(sparkRunes) {
			idx = len(sparkRunes) - 1
		}
		b.WriteRune(sparkRunes[idx])
	}
	return dimSty.Render(b.String())
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
