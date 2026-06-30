package db

import (
	"time"

	"github.com/google/uuid"
)

// SetServiceEnabled upserts a service_configs row toggling enabled state.
func (d *DB) SetServiceEnabled(name, namespace string, enabled bool) error {
	now := time.Now().UTC().Format(time.RFC3339)
	en := 0
	if enabled {
		en = 1
	}
	_, err := d.conn.Exec(
		`INSERT INTO service_configs (id,name,enabled,tier,namespace,created_at,updated_at)
		 VALUES (?,?,?,?,?,?,?)
		 ON CONFLICT(name) DO UPDATE SET enabled=excluded.enabled, namespace=excluded.namespace, updated_at=excluded.updated_at`,
		uuid.NewString(), name, en, "standard", namespace, now, now,
	)
	return err
}

// EnabledServices returns the names of enabled services.
func (d *DB) EnabledServices() ([]string, error) {
	rows, err := d.conn.Query(`SELECT name FROM service_configs WHERE enabled = 1 ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}
