package telegram

import (
	"database/sql"
	"strconv"
	"time"

	"github.com/ZeiZel/self-hosted/cli/internal/db"
)

// dedupWindow is the minimum interval between two alerts for the *same*
// target+status pair. Ported from the TS daemon's 5-minute alert dedup.
const dedupWindow = 5 * time.Minute

// ThrottledAlert sends a Telegram alert subject to two guards, matching the
// behaviour of the original TS CLI:
//
//  1. dedup     — skip if an alert for the same target+status was sent within
//     the last dedupWindow (5 minutes), per telegram_alert_log.
//  2. rate-limit — skip if *any* alert was sent within rate_limit_seconds of
//     the configured telegram_config.last_alert_at.
//
// On a successful send it records a row in telegram_alert_log (with the returned
// message_id) and stamps telegram_config.last_alert_at. All queries bind params.
func ThrottledAlert(d *db.DB, target, status, title, body, severity string) (sent bool, err error) {
	cfg, err := LoadConfig(d)
	if err != nil {
		return false, err
	}
	if !cfg.Enabled {
		return false, nil
	}
	conn := d.Conn()
	now := time.Now().UTC()

	// (a) dedup: same target+status within the dedup window.
	dedupCutoff := now.Add(-dedupWindow).Format(time.RFC3339)
	var dupCount int
	if err := conn.QueryRow(
		`SELECT COUNT(*) FROM telegram_alert_log
		 WHERE target = ? AND status = ? AND sent_at >= ?`,
		target, status, dedupCutoff,
	).Scan(&dupCount); err != nil {
		return false, err
	}
	if dupCount > 0 {
		return false, nil
	}

	// (b) rate-limit: any alert within rate_limit_seconds of last_alert_at.
	if cfg.RateLimitSecs > 0 {
		var lastAlert sql.NullString
		if err := conn.QueryRow(
			`SELECT last_alert_at FROM telegram_config ORDER BY id DESC LIMIT 1`,
		).Scan(&lastAlert); err != nil && err != sql.ErrNoRows {
			return false, err
		}
		if lastAlert.Valid && lastAlert.String != "" {
			if t, perr := time.Parse(time.RFC3339, lastAlert.String); perr == nil {
				if now.Sub(t) < time.Duration(cfg.RateLimitSecs)*time.Second {
					return false, nil
				}
			}
		}
	}

	// (c) send + record.
	client := NewClient(cfg.Token)
	msgID, serr := client.SendAlertID(cfg.ChatID, title, body, severity)
	nowStr := now.Format(time.RFC3339)
	var msgIDStr any
	if msgID != 0 {
		msgIDStr = strconv.Itoa(msgID)
	}
	if serr != nil {
		// Log the failed attempt with the error for observability; do not
		// advance last_alert_at so the next attempt isn't rate-limited.
		_, _ = conn.Exec(
			`INSERT INTO telegram_alert_log (check_type, target, status, message_id, sent_at, error)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			"node", target, status, msgIDStr, nowStr, serr.Error())
		return false, serr
	}
	if _, err := conn.Exec(
		`INSERT INTO telegram_alert_log (check_type, target, status, message_id, sent_at)
		 VALUES (?, ?, ?, ?, ?)`,
		"node", target, status, msgIDStr, nowStr); err != nil {
		return true, err
	}
	if _, err := conn.Exec(
		`UPDATE telegram_config SET last_alert_at = ?, updated_at = ?`,
		nowStr, nowStr); err != nil {
		return true, err
	}
	return true, nil
}
