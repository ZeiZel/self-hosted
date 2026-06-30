package db

import (
	"database/sql"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Machine is a row of the machines table.
type Machine struct {
	ID         string
	Label      string
	IP         string
	Roles      []string
	Status     string
	SSHHost    string
	SSHPort    int
	SSHUser    string
	SSHKeyPath string
	LastSeen   string
	CreatedAt  string
	UpdatedAt  string
}

// UpsertMachine inserts or updates a machine by label.
func (d *DB) UpsertMachine(m *Machine) error {
	now := time.Now().UTC().Format(time.RFC3339)
	if m.ID == "" {
		m.ID = uuid.NewString()
	}
	if m.CreatedAt == "" {
		m.CreatedAt = now
	}
	m.UpdatedAt = now
	if m.SSHHost == "" {
		m.SSHHost = m.IP
	}
	if m.SSHPort == 0 {
		m.SSHPort = 22
	}
	if m.SSHUser == "" {
		m.SSHUser = "root"
	}
	if m.Status == "" {
		m.Status = "unknown"
	}
	_, err := d.conn.Exec(
		`INSERT INTO machines (id,label,ip,roles,status,ssh_host,ssh_port,ssh_username,ssh_private_key_path,last_seen,created_at,updated_at)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
		 ON CONFLICT(label) DO UPDATE SET
		   ip=excluded.ip, roles=excluded.roles, status=excluded.status,
		   ssh_host=excluded.ssh_host, ssh_port=excluded.ssh_port,
		   ssh_username=excluded.ssh_username, ssh_private_key_path=excluded.ssh_private_key_path,
		   last_seen=excluded.last_seen, updated_at=excluded.updated_at`,
		m.ID, m.Label, m.IP, strings.Join(m.Roles, ","), m.Status, m.SSHHost, m.SSHPort,
		m.SSHUser, nullable(m.SSHKeyPath), nullable(m.LastSeen), m.CreatedAt, m.UpdatedAt,
	)
	return err
}

// ListMachines returns all machines ordered by label.
func (d *DB) ListMachines() ([]Machine, error) {
	rows, err := d.conn.Query(
		`SELECT id,label,ip,roles,status,ssh_host,ssh_port,ssh_username,
		        COALESCE(ssh_private_key_path,''),COALESCE(last_seen,''),created_at,updated_at
		 FROM machines ORDER BY label`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Machine
	for rows.Next() {
		var m Machine
		var roles string
		if err := rows.Scan(&m.ID, &m.Label, &m.IP, &roles, &m.Status, &m.SSHHost,
			&m.SSHPort, &m.SSHUser, &m.SSHKeyPath, &m.LastSeen, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		if roles != "" {
			m.Roles = strings.Split(roles, ",")
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// DeleteMachine removes a machine by label; returns rows affected.
func (d *DB) DeleteMachine(label string) (int64, error) {
	res, err := d.conn.Exec(`DELETE FROM machines WHERE label = ?`, label)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// SetMachineStatus updates a machine's reachability status and last_seen.
func (d *DB) SetMachineStatus(label, status string) error {
	_, err := d.conn.Exec(
		`UPDATE machines SET status=?, last_seen=?, updated_at=? WHERE label=?`,
		status, time.Now().UTC().Format(time.RFC3339), time.Now().UTC().Format(time.RFC3339), label)
	return err
}

func nullable(s string) any {
	if s == "" {
		return sql.NullString{}
	}
	return s
}
