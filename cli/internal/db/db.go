// Package db provides the SQLite layer, ported from
// cli/src/database/database.service.ts. It uses the pure-Go modernc.org/sqlite
// driver (no cgo) and always binds parameters (the Node daemon-client built SQL
// via string interpolation — fixed here).
package db

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/ZeiZel/self-hosted/cli/internal/core"
	_ "modernc.org/sqlite"
)

// DB wraps the SQLite connection.
type DB struct {
	conn *sql.DB
}

// Open opens (creating if needed) the database at $HOME/.selfhosted/selfhosted.db
// and ensures the schema exists. Pass ":memory:" for an in-memory DB (tests).
func Open(path string) (*DB, error) {
	if path == "" {
		path = core.DatabasePath()
	}
	if path != ":memory:" {
		if err := core.EnsureDirs(); err != nil {
			return nil, err
		}
	}
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	// modernc serialises writes; a single connection avoids "database is locked".
	conn.SetMaxOpenConns(1)
	if _, err := conn.Exec("PRAGMA journal_mode = WAL"); err != nil {
		return nil, err
	}
	if _, err := conn.Exec("PRAGMA foreign_keys = ON"); err != nil {
		return nil, err
	}
	d := &DB{conn: conn}
	if err := d.createSchema(); err != nil {
		return nil, err
	}
	return d, nil
}

// Conn exposes the underlying *sql.DB for repositories.
func (d *DB) Conn() *sql.DB { return d.conn }

// Close closes the connection.
func (d *DB) Close() error { return d.conn.Close() }

func (d *DB) createSchema() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS machines (
			id TEXT PRIMARY KEY, label TEXT NOT NULL UNIQUE, ip TEXT NOT NULL UNIQUE,
			roles TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unknown',
			ssh_host TEXT NOT NULL, ssh_port INTEGER NOT NULL DEFAULT 22,
			ssh_username TEXT NOT NULL DEFAULT 'root', ssh_private_key_path TEXT,
			last_seen TEXT, facts TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS deployments (
			id TEXT PRIMARY KEY, repo_path TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
			current_phase INTEGER NOT NULL DEFAULT 0, completed_phases TEXT NOT NULL DEFAULT '[]',
			failed_phases TEXT NOT NULL DEFAULT '[]', skipped_phases TEXT NOT NULL DEFAULT '[]',
			config TEXT NOT NULL DEFAULT '{}', logs TEXT NOT NULL DEFAULT '[]',
			started_at TEXT NOT NULL, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS service_configs (
			id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, enabled INTEGER NOT NULL DEFAULT 0,
			tier TEXT NOT NULL, namespace TEXT NOT NULL, resources TEXT NOT NULL DEFAULT '{}',
			placement TEXT, overrides TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS metrics (
			id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, target_id TEXT NOT NULL,
			target_type TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL, metadata TEXT,
			timestamp TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS daemon_health_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT, check_type TEXT NOT NULL, target TEXT NOT NULL,
			status TEXT NOT NULL, message TEXT, metadata TEXT, timestamp TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS daemon_state (
			key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS telegram_config (
			id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL, chat_id TEXT NOT NULL,
			enabled INTEGER NOT NULL DEFAULT 1, rate_limit_seconds INTEGER DEFAULT 60,
			alert_on_critical INTEGER DEFAULT 1, alert_on_degraded INTEGER DEFAULT 0,
			last_alert_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS telegram_alert_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT, check_type TEXT NOT NULL, target TEXT NOT NULL,
			status TEXT NOT NULL, message_id TEXT, sent_at TEXT NOT NULL, error TEXT)`,
		`CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status)`,
		`CREATE INDEX IF NOT EXISTS idx_machines_roles ON machines(roles)`,
		`CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status)`,
		`CREATE INDEX IF NOT EXISTS idx_service_configs_enabled ON service_configs(enabled)`,
		`CREATE INDEX IF NOT EXISTS idx_metrics_target ON metrics(target_id, target_type)`,
		`CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp)`,
		`CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(type)`,
		`CREATE INDEX IF NOT EXISTS idx_daemon_health_logs_status ON daemon_health_logs(status)`,
		`CREATE INDEX IF NOT EXISTS idx_daemon_health_logs_timestamp ON daemon_health_logs(timestamp)`,
		`CREATE INDEX IF NOT EXISTS idx_daemon_health_logs_target ON daemon_health_logs(target)`,
		`CREATE INDEX IF NOT EXISTS idx_telegram_alert_log_sent_at ON telegram_alert_log(sent_at)`,
	}
	for _, s := range stmts {
		if _, err := d.conn.Exec(s); err != nil {
			return fmt.Errorf("schema: %w", err)
		}
	}
	return nil
}

// ---- daemon_state key/value ----

// SetState upserts a daemon_state key (bound params; no interpolation).
func (d *DB) SetState(key, value string) error {
	_, err := d.conn.Exec(
		`INSERT INTO daemon_state (key, value, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		key, value, time.Now().UTC().Format(time.RFC3339),
	)
	return err
}

// GetState reads a daemon_state value; ok is false if absent.
func (d *DB) GetState(key string) (value string, ok bool, err error) {
	row := d.conn.QueryRow(`SELECT value FROM daemon_state WHERE key = ?`, key)
	switch err = row.Scan(&value); err {
	case nil:
		return value, true, nil
	case sql.ErrNoRows:
		return "", false, nil
	default:
		return "", false, err
	}
}

// ---- daemon_health_logs ----

// HealthLog is a row of daemon_health_logs.
type HealthLog struct {
	ID        int64
	CheckType string
	Target    string
	Status    string
	Message   string
	Metadata  string
	Timestamp string
}

// InsertHealthLog appends a health-check log row.
func (d *DB) InsertHealthLog(l HealthLog) error {
	if l.Timestamp == "" {
		l.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}
	_, err := d.conn.Exec(
		`INSERT INTO daemon_health_logs (check_type, target, status, message, metadata, timestamp)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		l.CheckType, l.Target, l.Status, l.Message, l.Metadata, l.Timestamp,
	)
	return err
}

// RecentHealthLogs returns the most recent health logs (newest first), optionally
// filtered by status.
func (d *DB) RecentHealthLogs(limit int, status string) ([]HealthLog, error) {
	q := `SELECT id, check_type, target, status, message, metadata, timestamp
	      FROM daemon_health_logs`
	args := []any{}
	if status != "" {
		q += ` WHERE status = ?`
		args = append(args, status)
	}
	q += ` ORDER BY timestamp DESC LIMIT ?`
	args = append(args, limit)
	rows, err := d.conn.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []HealthLog
	for rows.Next() {
		var l HealthLog
		var msg, meta sql.NullString
		if err := rows.Scan(&l.ID, &l.CheckType, &l.Target, &l.Status, &msg, &meta, &l.Timestamp); err != nil {
			return nil, err
		}
		l.Message, l.Metadata = msg.String, meta.String
		out = append(out, l)
	}
	return out, rows.Err()
}

// PurgeOldHealthLogs deletes health logs older than retentionDays. Returns rows removed.
func (d *DB) PurgeOldHealthLogs(retentionDays int) (int64, error) {
	cutoff := time.Now().UTC().AddDate(0, 0, -retentionDays).Format(time.RFC3339)
	res, err := d.conn.Exec(`DELETE FROM daemon_health_logs WHERE timestamp < ?`, cutoff)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
