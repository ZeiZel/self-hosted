package telegram

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ZeiZel/self-hosted/cli/internal/cluster"
	"github.com/ZeiZel/self-hosted/cli/internal/db"
)

// Bot is the inbound Telegram command bot (long-poll), ported from
// telegram-bot.service.ts + handlers/.
type Bot struct {
	client  *Client
	db      *db.DB
	cluster *cluster.Client

	mu      sync.Mutex
	running bool
	lastID  int
	pending map[string]pendingRestart // chatID -> pending restart confirmation
}

type pendingRestart struct {
	service string
	expires time.Time
}

// NewBot constructs a bot from persisted config.
func NewBot(d *db.DB, cl *cluster.Client) (*Bot, error) {
	cfg, err := LoadConfig(d)
	if err != nil {
		return nil, err
	}
	return &Bot{
		client:  NewClient(cfg.Token),
		db:      d,
		cluster: cl,
		pending: map[string]pendingRestart{},
	}, nil
}

// Run starts the polling loop until stop is closed.
func (b *Bot) Run(stop <-chan struct{}) {
	cfg, err := LoadConfig(b.db)
	if err != nil || !cfg.Enabled {
		return
	}
	b.running = true
	_ = b.client.SetMyCommands([]BotCommandInfo{
		{"status", "Cluster health summary"},
		{"resources", "Resource usage by node"},
		{"restart", "Restart a service"},
		{"settings", "View alert settings"},
		{"help", "Show help"},
	})
	for {
		select {
		case <-stop:
			b.running = false
			return
		default:
		}
		updates, err := b.client.GetUpdates(b.lastID+1, 30)
		if err != nil {
			time.Sleep(5 * time.Second)
			continue
		}
		for _, u := range updates {
			if u.UpdateID > b.lastID {
				b.lastID = u.UpdateID
			}
			b.handleUpdate(u)
		}
	}
}

func (b *Bot) handleUpdate(u Update) {
	cfg, err := LoadConfig(b.db)
	if err != nil {
		return
	}
	if u.CallbackQuery != nil {
		b.handleCallback(u.CallbackQuery, cfg)
		return
	}
	if u.Message == nil || !strings.HasPrefix(u.Message.Text, "/") {
		return
	}
	chatID := strconv.FormatInt(u.Message.Chat.ID, 10)
	if cfg.ChatID != "" && cfg.ChatID != chatID {
		_ = b.client.SendText(chatID, "⚠️ <b>Unauthorized</b>\n\nThis bot is configured for a different chat.")
		return
	}
	cmd, args := parseCommand(u.Message.Text)
	switch cmd {
	case "start", "help":
		_ = b.client.SendText(chatID, helpText())
	case "status":
		_ = b.client.SendText(chatID, b.statusText())
	case "resources":
		_ = b.client.SendText(chatID, b.resourcesText())
	case "restart":
		b.handleRestart(chatID, args)
	case "settings":
		_ = b.client.SendText(chatID, settingsText(cfg))
	case "set":
		_ = b.client.SendText(chatID, b.handleSet(args))
	default:
		_ = b.client.SendText(chatID, "⚠️ Unknown command: <code>/"+EscapeHTML(cmd)+"</code>\n\nUse /help.")
	}
}

func (b *Bot) handleRestart(chatID string, args []string) {
	if len(args) == 0 {
		_ = b.client.SendText(chatID, "Usage: <code>/restart &lt;service&gt;</code>")
		return
	}
	svc := args[0]
	b.mu.Lock()
	b.pending[chatID] = pendingRestart{service: svc, expires: time.Now().Add(2 * time.Minute)}
	b.mu.Unlock()
	kb := &InlineKeyboard{InlineKeyboard: [][]InlineButton{{
		{Text: "✅ Confirm", CallbackData: "confirm_restart:" + svc},
		{Text: "❌ Cancel", CallbackData: "cancel_restart"},
	}}}
	_ = b.client.SendMessageMarkup(chatID, fmt.Sprintf("⚠️ Restart <b>%s</b>?", EscapeHTML(svc)), kb)
}

func (b *Bot) handleCallback(q *CallbackQuery, cfg *Config) {
	_ = b.client.AnswerCallbackQuery(q.ID)
	chatID := strconv.FormatInt(q.From.ID, 10)
	if q.Message != nil {
		chatID = strconv.FormatInt(q.Message.Chat.ID, 10)
	}
	var text string
	switch {
	case strings.HasPrefix(q.Data, "confirm_restart:"):
		svc := strings.TrimPrefix(q.Data, "confirm_restart:")
		if err := b.executeRestart(svc); err != nil {
			text = fmt.Sprintf("❌ Restart of <b>%s</b> failed: %s", EscapeHTML(svc), EscapeHTML(err.Error()))
		} else {
			text = fmt.Sprintf("✅ Restarted <b>%s</b>", EscapeHTML(svc))
		}
	case q.Data == "cancel_restart":
		text = "Cancelled."
	default:
		text = "⚠️ Unknown action"
	}
	b.mu.Lock()
	delete(b.pending, chatID)
	b.mu.Unlock()
	if q.Message != nil {
		if err := b.client.EditMessageText(chatID, q.Message.MessageID, text); err != nil {
			_ = b.client.SendText(chatID, text)
		}
	} else {
		_ = b.client.SendText(chatID, text)
	}
}

func (b *Bot) executeRestart(service string) error {
	out, err := exec.Command("kubectl", "rollout", "restart", "deployment", service, "-A").CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (b *Bot) statusText() string {
	sum, err := b.cluster.Summary()
	if err != nil {
		return "❌ Cluster unreachable: " + EscapeHTML(err.Error())
	}
	logs, _ := b.db.RecentHealthLogs(5, "")
	var sb strings.Builder
	fmt.Fprintf(&sb, "🩺 <b>Cluster status</b>\n\nNodes: %d (%d healthy, %d warn, %d crit)\nPods: %d running, %d pending, %d failed\nCPU: %d%%   Memory: %d%%\n",
		sum.Nodes.Total, sum.Nodes.Healthy, sum.Nodes.Warning, sum.Nodes.Critical,
		sum.Pods.Running, sum.Pods.Pending, sum.Pods.Failed, sum.CPU.Percent, sum.Memory.Percent)
	if len(logs) > 0 {
		sb.WriteString("\n<b>Recent alerts:</b>\n")
		for _, l := range logs {
			fmt.Fprintf(&sb, "• %s %s — %s\n", l.Status, EscapeHTML(l.Target), EscapeHTML(l.Message))
		}
	}
	return sb.String()
}

func (b *Bot) resourcesText() string {
	nodes, err := b.cluster.NodeMetricsList()
	if err != nil {
		return "❌ Cluster unreachable: " + EscapeHTML(err.Error())
	}
	var sb strings.Builder
	sb.WriteString("📊 <b>Resource usage</b>\n\n")
	for _, n := range nodes {
		fmt.Fprintf(&sb, "<b>%s</b>: CPU %d%%, Mem %d%% (%d pods)\n",
			EscapeHTML(n.Name), n.CPU.Percent, n.Memory.Percent, n.Pods.Total)
	}
	return sb.String()
}

func (b *Bot) handleSet(args []string) string {
	if len(args) < 2 {
		return "Usage: <code>/set critical|degraded on|off</code> or <code>/set ratelimit &lt;seconds&gt;</code>"
	}
	conn := b.db.Conn()
	now := time.Now().UTC().Format(time.RFC3339)
	switch args[0] {
	case "critical":
		_, _ = conn.Exec(`UPDATE telegram_config SET alert_on_critical=?, updated_at=?`, boolToInt(args[1] == "on"), now)
		return "✅ critical alerts " + args[1]
	case "degraded":
		_, _ = conn.Exec(`UPDATE telegram_config SET alert_on_degraded=?, updated_at=?`, boolToInt(args[1] == "on"), now)
		return "✅ degraded alerts " + args[1]
	case "ratelimit":
		secs, _ := strconv.Atoi(args[1])
		_, _ = conn.Exec(`UPDATE telegram_config SET rate_limit_seconds=?, updated_at=?`, secs, now)
		return fmt.Sprintf("✅ rate limit set to %ds", secs)
	default:
		return "Unknown setting: " + EscapeHTML(args[0])
	}
}

func settingsText(c *Config) string {
	return fmt.Sprintf("⚙️ <b>Alert settings</b>\n\nchat: <code>%s</code>\nenabled: %t\ncritical: %t\ndegraded: %t\nrate limit: %ds",
		EscapeHTML(c.ChatID), c.Enabled, c.AlertOnCritical, c.AlertOnDegraded, c.RateLimitSecs)
}

func helpText() string {
	return "🤖 <b>Selfhost Bot</b>\n\n<b>Commands:</b>\n" +
		"/status - Cluster health summary\n" +
		"/resources - Resource usage by node\n" +
		"/restart &lt;service&gt; - Restart a service\n" +
		"/settings - View alert settings\n" +
		"/set &lt;option&gt; &lt;value&gt; - Change settings\n" +
		"/help - Show this help"
}

func parseCommand(text string) (string, []string) {
	fields := strings.Fields(text)
	if len(fields) == 0 {
		return "", nil
	}
	cmd := strings.TrimPrefix(fields[0], "/")
	if i := strings.Index(cmd, "@"); i >= 0 { // strip @botname
		cmd = cmd[:i]
	}
	return cmd, fields[1:]
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// DiscoverChatID polls once for updates and returns the first chat id seen
// (used by `bot init` chat-id auto-discovery).
func (c *Client) DiscoverChatID() (string, error) {
	updates, err := c.GetUpdates(0, 0)
	if err != nil {
		return "", err
	}
	for _, u := range updates {
		if u.Message != nil {
			return strconv.FormatInt(u.Message.Chat.ID, 10), nil
		}
	}
	return "", fmt.Errorf("no messages found — send a message to the bot first")
}
