package tui

// poddetail.go implements the tabbed pod-detail overlay for the monitor TUI:
// an Overview tab (static fields), plus live Events and Logs tabs backed by
// bubbles/viewport for scrolling. Events/logs are fetched asynchronously via
// kubectl (or sample text when the client is in --mock mode).

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/ZeiZel/self-hosted/cli/internal/cluster"
	tea "github.com/charmbracelet/bubbletea"
)

// detail tabs
const (
	detTabOverview = iota
	detTabEvents
	detTabLogs
)

var detTabNames = []string{"Overview", "Events", "Logs"}

// detailDataMsg carries the async result of a kubectl events/logs fetch.
type detailDataMsg struct {
	kind    int // detTabEvents or detTabLogs
	content string
	err     error
}

// selectedService returns the service currently highlighted in the services
// panel (after filtering), if any.
func (m *model) selectedService() (cluster.ServiceMetrics, bool) {
	svcs := m.filteredServices()
	if len(svcs) == 0 {
		return cluster.ServiceMetrics{}, false
	}
	i := m.sel[panelServices]
	if i >= len(svcs) {
		i = len(svcs) - 1
	}
	if i < 0 {
		i = 0
	}
	return svcs[i], true
}

// openDetail resets the overlay state for a freshly opened pod-detail view.
func (m *model) openDetail() {
	m.showDet = true
	m.detTab = detTabOverview
	m.evLoaded, m.logLoaded = false, false
	m.evText, m.logText = "", ""
	m.evVP.SetContent("")
	m.logVP.SetContent("")
	m.evVP.GotoTop()
	m.logVP.GotoTop()
}

// detailKey handles all key input while the pod-detail overlay is open.
func (m *model) detailKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "q", "ctrl+c":
		return m, tea.Quit
	case "esc":
		m.showDet = false
		return m, nil
	case "1":
		m.detTab = detTabOverview
		return m, nil
	case "2":
		m.detTab = detTabEvents
		return m, m.ensureDetailData(detTabEvents)
	case "3":
		m.detTab = detTabLogs
		return m, m.ensureDetailData(detTabLogs)
	case "tab":
		m.detTab = (m.detTab + 1) % len(detTabNames)
		return m, m.ensureDetailData(m.detTab)
	case "r":
		switch m.detTab {
		case detTabEvents:
			m.evLoaded = false
			return m, m.ensureDetailData(detTabEvents)
		case detTabLogs:
			m.logLoaded = false
			return m, m.ensureDetailData(detTabLogs)
		}
		return m, nil
	}

	// remaining keys scroll the active content viewport (up/down/j/k/pgup/...)
	var cmd tea.Cmd
	switch m.detTab {
	case detTabEvents:
		m.evVP, cmd = m.evVP.Update(msg)
	case detTabLogs:
		m.logVP, cmd = m.logVP.Update(msg)
	}
	return m, cmd
}

// ensureDetailData lazily triggers a fetch for the given tab if not yet loaded.
func (m *model) ensureDetailData(tab int) tea.Cmd {
	s, ok := m.selectedService()
	if !ok {
		return nil
	}
	switch tab {
	case detTabEvents:
		if m.evLoaded {
			return nil
		}
		m.evLoaded = true
		m.evText = "loading events…"
		m.evVP.SetContent(m.evText)
		return m.fetchDetail(detTabEvents, s.Namespace, s.Name)
	case detTabLogs:
		if m.logLoaded {
			return nil
		}
		m.logLoaded = true
		m.logText = "loading logs…"
		m.logVP.SetContent(m.logText)
		return m.fetchDetail(detTabLogs, s.Namespace, s.Name)
	}
	return nil
}

// fetchDetail returns a tea.Cmd that fetches events/logs without blocking the UI.
func (m *model) fetchDetail(kind int, ns, name string) tea.Cmd {
	mock := m.cl.Mock
	kubeconfig := m.cl.Kubeconfig
	return func() tea.Msg {
		if mock {
			return detailDataMsg{kind: kind, content: mockDetailText(kind, ns, name)}
		}
		var args []string
		switch kind {
		case detTabEvents:
			args = []string{"get", "events", "-n", ns, "--sort-by=.lastTimestamp"}
		case detTabLogs:
			args = []string{"logs", "-n", ns, "-l", "app.kubernetes.io/name=" + name, "--tail=200"}
		}
		out, err := runKubectl(kubeconfig, args...)
		return detailDataMsg{kind: kind, content: out, err: err}
	}
}

// applyDetailData stores the result of a fetch onto the matching viewport.
func (m *model) applyDetailData(msg detailDataMsg) {
	content := msg.content
	if msg.err != nil {
		content = "error: " + msg.err.Error()
	} else if strings.TrimSpace(content) == "" {
		content = "(no data)"
	}
	switch msg.kind {
	case detTabEvents:
		m.evText = content
		m.evVP.SetContent(content)
	case detTabLogs:
		m.logText = content
		m.logVP.SetContent(content)
	}
}

// detailView renders the tabbed overlay.
func (m *model) detailView() string {
	s, ok := m.selectedService()
	if !ok {
		return "no service selected"
	}

	inner := m.w - 10
	if inner < 20 {
		inner = 20
	}
	bodyH := m.h - 12
	if bodyH < 5 {
		bodyH = 5
	}

	var body string
	switch m.detTab {
	case detTabEvents:
		m.evVP.Width, m.evVP.Height = inner, bodyH
		body = m.evVP.View()
	case detTabLogs:
		m.logVP.Width, m.logVP.Height = inner, bodyH
		body = m.logVP.View()
	default:
		body = m.detailOverview(s)
	}

	footer := dimSty.Render("[1/2/3] tabs  [tab] next  [↑↓ / j k] scroll  [r] reload  [esc] close")
	content := m.detailTabBar(s) + "\n\n" + body + "\n\n" + footer
	return focusBorder.Width(m.w - 6).Render(content)
}

// detailTabBar renders the title line plus the tab selector.
func (m *model) detailTabBar(s cluster.ServiceMetrics) string {
	title := titleSty.Render("Pod detail: "+s.Name) + dimSty.Render("  ("+s.Namespace+")")
	var parts []string
	for i, n := range detTabNames {
		label := fmt.Sprintf(" %d %s ", i+1, n)
		if i == m.detTab {
			parts = append(parts, selSty.Render(label))
		} else {
			parts = append(parts, dimSty.Render(label))
		}
	}
	return title + "\n" + strings.Join(parts, dimSty.Render("│"))
}

// detailOverview renders the static field card (the original detail content).
func (m *model) detailOverview(s cluster.ServiceMetrics) string {
	return fmt.Sprintf(
		"Namespace: %s\nNode:      %s\nStatus:    %s\nHealth:    %s\nReplicas:  %d/%d ready\nRestarts:  %d\nAge:       %s\nCPU req:   %s\nMem req:   %s",
		s.Namespace, s.Node, healthStyle(s.Health).Render(string(s.Status)), s.Health,
		s.Replicas.Ready, s.Replicas.Desired, s.Restarts, s.Age,
		cluster.FormatCPU(s.CPU.Requested), cluster.FormatBytes(s.Memory.Requested))
}

// runKubectl shells out to kubectl, mirroring cluster.Client.kubectl's proxy
// handling (we avoid editing the cluster package per the task constraints).
func runKubectl(kubeconfig string, args ...string) (string, error) {
	full := args
	if kubeconfig != "" {
		full = append([]string{"--kubeconfig", kubeconfig}, args...)
	}
	cmd := exec.Command("kubectl", full...)
	cmd.Env = append(os.Environ(), "NO_PROXY=*", "no_proxy=*")
	out, err := cmd.Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			return "", fmt.Errorf("kubectl %s: %s", strings.Join(args, " "), strings.TrimSpace(string(ee.Stderr)))
		}
		return "", fmt.Errorf("kubectl %s: %w", strings.Join(args, " "), err)
	}
	return strings.TrimSpace(string(out)), nil
}

// mockDetailText produces sample events/logs for --mock mode.
func mockDetailText(kind int, ns, name string) string {
	switch kind {
	case detTabEvents:
		return fmt.Sprintf(
			"LAST SEEN   TYPE     REASON      OBJECT             MESSAGE\n"+
				"12s         Normal   Scheduled   pod/%[1]s-abc123   Successfully assigned %[2]s/%[1]s to node-1\n"+
				"10s         Normal   Pulled      pod/%[1]s-abc123   Container image already present on machine\n"+
				"9s          Normal   Created     pod/%[1]s-abc123   Created container %[1]s\n"+
				"8s          Normal   Started     pod/%[1]s-abc123   Started container %[1]s\n"+
				"6s          Warning  Unhealthy   pod/%[1]s-abc123   Readiness probe failed: connection refused\n"+
				"3s          Normal   Started     pod/%[1]s-abc123   Container is now ready",
			name, ns)
	case detTabLogs:
		var b strings.Builder
		for i := 0; i < 30; i++ {
			b.WriteString(fmt.Sprintf("2026-06-30T12:00:%02dZ [info] %s: handled request id=%d ns=%s status=200\n",
				i%60, name, 1000+i, ns))
		}
		return strings.TrimSpace(b.String())
	}
	return ""
}
