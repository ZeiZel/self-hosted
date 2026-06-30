package telegram

import (
	"strings"
	"testing"
	"time"

	"github.com/ZeiZel/self-hosted/cli/internal/db"
)

func TestValidToken(t *testing.T) {
	valid := []string{
		"123456:" + strings.Repeat("a", 35),
		"7000000000:" + strings.Repeat("A", 30),
		"  9999999:ABCdef-_012345678901234567890123456  ", // surrounding whitespace trimmed
	}
	for _, s := range valid {
		if !ValidToken(s) {
			t.Errorf("ValidToken(%q) = false, want true", s)
		}
	}
	invalid := []string{
		"",
		"abc",
		"12345:" + strings.Repeat("a", 35), // too few digits before colon
		"123456:short",                     // secret too short
		"123456" + strings.Repeat("a", 35), // missing colon
		"123456:" + strings.Repeat("a", 35) + "!", // illegal char
	}
	for _, s := range invalid {
		if ValidToken(s) {
			t.Errorf("ValidToken(%q) = true, want false", s)
		}
	}
}

func TestEscapeHTML(t *testing.T) {
	cases := map[string]string{
		"a & b":    "a &amp; b",
		"<b>x</b>": "&lt;b&gt;x&lt;/b&gt;",
		"plain":    "plain",
		"&<>":      "&amp;&lt;&gt;",
		"a&amp;b":  "a&amp;amp;b", // & escaped first, no double-decoding
	}
	for in, want := range cases {
		if got := EscapeHTML(in); got != want {
			t.Errorf("EscapeHTML(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestParseCommand(t *testing.T) {
	cases := []struct {
		in       string
		wantCmd  string
		wantArgs []string
	}{
		{"/status", "status", []string{}},
		{"/restart gitlab", "restart", []string{"gitlab"}},
		{"/set ratelimit 30", "set", []string{"ratelimit", "30"}},
		{"/status@mybot", "status", []string{}},
		{"/restart@mybot gitlab extra", "restart", []string{"gitlab", "extra"}},
		{"", "", nil},
		{"   ", "", nil},
	}
	for _, c := range cases {
		cmd, args := parseCommand(c.in)
		if cmd != c.wantCmd {
			t.Errorf("parseCommand(%q) cmd = %q, want %q", c.in, cmd, c.wantCmd)
		}
		if len(args) != len(c.wantArgs) {
			t.Errorf("parseCommand(%q) args = %v, want %v", c.in, args, c.wantArgs)
			continue
		}
		for i := range args {
			if args[i] != c.wantArgs[i] {
				t.Errorf("parseCommand(%q) args[%d] = %q, want %q", c.in, i, args[i], c.wantArgs[i])
			}
		}
	}
}

func openMemDB(t *testing.T) *db.DB {
	t.Helper()
	d, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = d.Close() })
	return d
}

func TestConfigRoundTrip(t *testing.T) {
	d := openMemDB(t)
	token := "123456:" + strings.Repeat("a", 35)

	if err := SaveConfig(d, token, "555", false); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}
	cfg, err := LoadConfig(d)
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.Token != token || cfg.ChatID != "555" {
		t.Errorf("token/chat = %q/%q", cfg.Token, cfg.ChatID)
	}
	if !cfg.Enabled || !cfg.AlertOnCritical || cfg.AlertOnDegraded {
		t.Errorf("defaults wrong: %+v", cfg)
	}
	if cfg.RateLimitSecs != 60 {
		t.Errorf("rate limit default = %d, want 60", cfg.RateLimitSecs)
	}

	// Update (overwrite=false) should keep the single row but change token/chat.
	if err := SaveConfig(d, token, "777", false); err != nil {
		t.Fatalf("SaveConfig update: %v", err)
	}
	cfg, _ = LoadConfig(d)
	if cfg.ChatID != "777" {
		t.Errorf("after update chat = %q, want 777", cfg.ChatID)
	}

	// SetEnabled toggles the enabled flag.
	if err := SetEnabled(d, false); err != nil {
		t.Fatalf("SetEnabled: %v", err)
	}
	cfg, _ = LoadConfig(d)
	if cfg.Enabled {
		t.Errorf("expected disabled after SetEnabled(false)")
	}
	if err := SetEnabled(d, true); err != nil {
		t.Fatalf("SetEnabled: %v", err)
	}
	cfg, _ = LoadConfig(d)
	if !cfg.Enabled {
		t.Errorf("expected enabled after SetEnabled(true)")
	}
}

func TestThrottledAlertDisabled(t *testing.T) {
	d := openMemDB(t)
	if err := SaveConfig(d, "123456:"+strings.Repeat("a", 35), "555", false); err != nil {
		t.Fatal(err)
	}
	if err := SetEnabled(d, false); err != nil {
		t.Fatal(err)
	}
	// Disabled config must short-circuit before any network call.
	sent, err := ThrottledAlert(d, "node-1", "warning", "T", "B", "warning")
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if sent {
		t.Errorf("sent = true for disabled config, want false")
	}
}

func TestThrottledAlertDedup(t *testing.T) {
	d := openMemDB(t)
	if err := SaveConfig(d, "123456:"+strings.Repeat("a", 35), "555", false); err != nil {
		t.Fatal(err)
	}
	// Pre-insert a recent alert for the same target+status: dedup must skip
	// (returns before any network send).
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := d.Conn().Exec(
		`INSERT INTO telegram_alert_log (check_type, target, status, sent_at) VALUES (?,?,?,?)`,
		"node", "node-1", "warning", now); err != nil {
		t.Fatal(err)
	}
	sent, err := ThrottledAlert(d, "node-1", "warning", "T", "B", "warning")
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if sent {
		t.Errorf("sent = true despite dedup window, want false")
	}
}

func TestThrottledAlertRateLimited(t *testing.T) {
	d := openMemDB(t)
	if err := SaveConfig(d, "123456:"+strings.Repeat("a", 35), "555", false); err != nil {
		t.Fatal(err)
	}
	// last_alert_at recent + rate_limit_seconds>0 → rate-limited skip (no send).
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := d.Conn().Exec(
		`UPDATE telegram_config SET last_alert_at=?, rate_limit_seconds=600`, now); err != nil {
		t.Fatal(err)
	}
	// Use a target/status that has no dedup row so the rate-limit branch is hit.
	sent, err := ThrottledAlert(d, "node-2", "critical", "T", "B", "critical")
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if sent {
		t.Errorf("sent = true despite rate limit, want false")
	}
}
