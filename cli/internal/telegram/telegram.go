// Package telegram implements the Telegram Bot API client and alerting used by
// the daemon, ported from cli/src/telegram/*. It uses only net/http (no SDK).
package telegram

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/ZeiZel/self-hosted/cli/internal/db"
)

const apiBase = "https://api.telegram.org/bot"

// Client is a minimal Telegram Bot API client.
type Client struct {
	token string
	http  *http.Client
}

// NewClient returns a client for the given bot token.
func NewClient(token string) *Client {
	return &Client{token: token, http: &http.Client{Timeout: 15 * time.Second}}
}

var tokenRe = regexp.MustCompile(`^\d{6,}:[A-Za-z0-9_-]{30,}$`)

// ValidToken reports whether s looks like a Telegram bot token.
func ValidToken(s string) bool { return tokenRe.MatchString(strings.TrimSpace(s)) }

func (c *Client) call(method string, payload any, out any) error {
	var body []byte
	if payload != nil {
		body, _ = json.Marshal(payload)
	}
	req, err := http.NewRequest(http.MethodPost, apiBase+c.token+"/"+method, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	var env struct {
		OK          bool            `json:"ok"`
		Description string          `json:"description"`
		Result      json.RawMessage `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return err
	}
	if !env.OK {
		return fmt.Errorf("telegram %s: %s", method, env.Description)
	}
	if out != nil && len(env.Result) > 0 {
		return json.Unmarshal(env.Result, out)
	}
	return nil
}

// TestConnection calls getMe to validate the token.
func (c *Client) TestConnection() error {
	var me struct {
		Username string `json:"username"`
	}
	return c.call("getMe", nil, &me)
}

// SendText sends a plain message to a chat.
func (c *Client) SendText(chatID, text string) error {
	return c.call("sendMessage", map[string]any{
		"chat_id": chatID, "text": text, "parse_mode": "HTML",
	}, nil)
}

// SendAlert formats and sends an alert message (HTML).
func (c *Client) SendAlert(chatID, title, body, severity string) error {
	icon := map[string]string{"critical": "🔴", "warning": "🟡", "info": "🔵"}[severity]
	if icon == "" {
		icon = "ℹ️"
	}
	msg := fmt.Sprintf("%s <b>%s</b>\n%s", icon, EscapeHTML(title), EscapeHTML(body))
	return c.SendText(chatID, msg)
}

// EscapeHTML escapes the characters Telegram's HTML parse mode requires.
func EscapeHTML(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;")
	return r.Replace(s)
}

// ---- config persistence (telegram_config table) ----

// Config holds the persisted bot configuration.
type Config struct {
	Token           string
	ChatID          string
	Enabled         bool
	RateLimitSecs   int
	AlertOnCritical bool
	AlertOnDegraded bool
}

// SaveConfig upserts the bot configuration (single row).
func SaveConfig(d *db.DB, token, chatID string, overwrite bool) error {
	now := time.Now().UTC().Format(time.RFC3339)
	conn := d.Conn()
	var count int
	_ = conn.QueryRow(`SELECT COUNT(*) FROM telegram_config`).Scan(&count)
	if count > 0 && !overwrite {
		_, err := conn.Exec(`UPDATE telegram_config SET token=?, chat_id=?, updated_at=?`, token, chatID, now)
		return err
	}
	if count > 0 {
		if _, err := conn.Exec(`DELETE FROM telegram_config`); err != nil {
			return err
		}
	}
	_, err := conn.Exec(
		`INSERT INTO telegram_config (token, chat_id, enabled, rate_limit_seconds, alert_on_critical, alert_on_degraded, created_at, updated_at)
		 VALUES (?, ?, 1, 60, 1, 0, ?, ?)`, token, chatID, now, now)
	return err
}

// LoadConfig returns the persisted bot configuration.
func LoadConfig(d *db.DB) (*Config, error) {
	row := d.Conn().QueryRow(
		`SELECT token, chat_id, enabled, rate_limit_seconds, alert_on_critical, alert_on_degraded
		 FROM telegram_config ORDER BY id DESC LIMIT 1`)
	var c Config
	var enabled, crit, degr int
	if err := row.Scan(&c.Token, &c.ChatID, &enabled, &c.RateLimitSecs, &crit, &degr); err != nil {
		return nil, err
	}
	c.Enabled, c.AlertOnCritical, c.AlertOnDegraded = enabled == 1, crit == 1, degr == 1
	return &c, nil
}

// SetEnabled toggles alerting.
func SetEnabled(d *db.DB, enabled bool) error {
	en := 0
	if enabled {
		en = 1
	}
	_, err := d.Conn().Exec(`UPDATE telegram_config SET enabled=?, updated_at=?`,
		en, time.Now().UTC().Format(time.RFC3339))
	return err
}
