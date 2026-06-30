package db

import "time"

// Metric is a row of the metrics table.
type Metric struct {
	Type       string
	TargetID   string
	TargetType string
	Value      float64
	Unit       string
	Metadata   string
	Timestamp  string
}

// InsertMetric appends a single metric sample (bound params; no interpolation).
func (d *DB) InsertMetric(typ, targetID, targetType string, value float64, unit, metadata string) error {
	return d.InsertMetrics([]Metric{{
		Type: typ, TargetID: targetID, TargetType: targetType,
		Value: value, Unit: unit, Metadata: metadata,
	}})
}

// InsertMetrics appends a batch of metric samples in a single transaction.
func (d *DB) InsertMetrics(ms []Metric) error {
	if len(ms) == 0 {
		return nil
	}
	now := time.Now().UTC().Format(time.RFC3339)
	tx, err := d.conn.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare(
		`INSERT INTO metrics (type, target_id, target_type, value, unit, metadata, timestamp)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	defer stmt.Close()
	for _, m := range ms {
		ts := m.Timestamp
		if ts == "" {
			ts = now
		}
		var meta any
		if m.Metadata != "" {
			meta = m.Metadata
		}
		if _, err := stmt.Exec(m.Type, m.TargetID, m.TargetType, m.Value, m.Unit, meta, ts); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// RecentMetrics returns the most recent metric samples (newest first), optionally
// filtered by type. Used for tests and inspection.
func (d *DB) RecentMetrics(limit int, typ string) ([]Metric, error) {
	q := `SELECT type, target_id, target_type, value, unit, COALESCE(metadata, ''), timestamp FROM metrics`
	args := []any{}
	if typ != "" {
		q += ` WHERE type = ?`
		args = append(args, typ)
	}
	q += ` ORDER BY timestamp DESC, id DESC LIMIT ?`
	args = append(args, limit)
	rows, err := d.conn.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Metric
	for rows.Next() {
		var m Metric
		if err := rows.Scan(&m.Type, &m.TargetID, &m.TargetType, &m.Value, &m.Unit, &m.Metadata, &m.Timestamp); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// PurgeOldMetrics deletes metric rows older than retentionDays. Returns rows removed.
func (d *DB) PurgeOldMetrics(retentionDays int) (int64, error) {
	cutoff := time.Now().UTC().AddDate(0, 0, -retentionDays).Format(time.RFC3339)
	res, err := d.conn.Exec(`DELETE FROM metrics WHERE timestamp < ?`, cutoff)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
