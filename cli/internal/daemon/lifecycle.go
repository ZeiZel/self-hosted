// Package daemon implements the native (non-Docker) monitoring daemon: a health
// check runloop, metrics collection, an HTTP long-poll API, Telegram alerting,
// and OS service lifecycle (launchd on macOS, systemd on Linux). Replaces the
// Bun-in-Docker daemon (docker/selfhost-daemon) of the Node CLI.
package daemon

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"text/template"
	"time"

	"github.com/ZeiZel/self-hosted/cli/internal/core"
	"github.com/ZeiZel/self-hosted/cli/internal/db"
	"github.com/ZeiZel/self-hosted/cli/internal/ui"
)

func jsonEncode(v any) error {
	out, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(out))
	return nil
}

const launchdLabel = "com.selfhost.daemon"

// State reports daemon status from the shared DB.
type State struct {
	Running   bool   `json:"running"`
	StartedAt string `json:"startedAt"`
	LastCheck string `json:"lastCheck"`
	LastError string `json:"lastError"`
	Interval  int    `json:"interval"`
}

func selfExe() (string, error) { return os.Executable() }

func launchdPlistPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "LaunchAgents", launchdLabel+".plist")
}

func systemdUnitPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "systemd", "user", "selfhost-daemon.service")
}

// Init installs the OS service unit pointing at `selfhost daemon run`.
func Init(interval int, force bool) error {
	if err := core.EnsureDirs(); err != nil {
		return err
	}
	if err := os.MkdirAll(core.DaemonPath(), 0o755); err != nil {
		return err
	}
	exe, err := selfExe()
	if err != nil {
		return err
	}
	// Persist interval for the runloop.
	d, err := db.Open(core.DatabasePath())
	if err != nil {
		return err
	}
	defer d.Close()
	if err := d.SetState("check_interval", strconv.Itoa(interval)); err != nil {
		return err
	}

	switch runtime.GOOS {
	case "darwin":
		return initLaunchd(exe, interval, force)
	case "linux":
		return initSystemd(exe, interval, force)
	default:
		return fmt.Errorf("unsupported OS %q for daemon service install", runtime.GOOS)
	}
}

var launchdTmpl = template.Must(template.New("plist").Parse(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>{{.Label}}</string>
  <key>ProgramArguments</key>
  <array>
    <string>{{.Exe}}</string>
    <string>daemon</string>
    <string>run</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CHECK_INTERVAL</key><string>{{.Interval}}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>{{.LogDir}}/daemon.out.log</string>
  <key>StandardErrorPath</key><string>{{.LogDir}}/daemon.err.log</string>
</dict>
</plist>
`))

func initLaunchd(exe string, interval int, force bool) error {
	path := launchdPlistPath()
	if _, err := os.Stat(path); err == nil && !force {
		return fmt.Errorf("%s already exists (use --force)", path)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := launchdTmpl.Execute(f, map[string]any{
		"Label": launchdLabel, "Exe": exe, "Interval": interval, "LogDir": core.DaemonPath(),
	}); err != nil {
		return err
	}
	ui.OK("installed launchd unit: %s", path)
	ui.Info("start with: selfhost daemon start")
	return nil
}

var systemdTmpl = template.Must(template.New("unit").Parse(`[Unit]
Description=selfhost monitoring daemon
After=network.target

[Service]
ExecStart={{.Exe}} daemon run
Environment=CHECK_INTERVAL={{.Interval}}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`))

func initSystemd(exe string, interval int, force bool) error {
	path := systemdUnitPath()
	if _, err := os.Stat(path); err == nil && !force {
		return fmt.Errorf("%s already exists (use --force)", path)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := systemdTmpl.Execute(f, map[string]any{"Exe": exe, "Interval": interval}); err != nil {
		return err
	}
	_ = exec.Command("systemctl", "--user", "daemon-reload").Run()
	ui.OK("installed systemd unit: %s", path)
	ui.Info("start with: selfhost daemon start")
	return nil
}

// Start loads/starts the service.
func Start() error {
	switch runtime.GOOS {
	case "darwin":
		if err := run("launchctl", "load", "-w", launchdPlistPath()); err != nil {
			return err
		}
	case "linux":
		if err := run("systemctl", "--user", "enable", "--now", "selfhost-daemon.service"); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unsupported OS %q", runtime.GOOS)
	}
	ui.OK("daemon started")
	return nil
}

// Stop unloads/stops the service.
func Stop() error {
	switch runtime.GOOS {
	case "darwin":
		_ = run("launchctl", "unload", "-w", launchdPlistPath())
	case "linux":
		_ = run("systemctl", "--user", "disable", "--now", "selfhost-daemon.service")
	}
	ui.OK("daemon stopped")
	return nil
}

// Restart stops then starts the service.
func Restart() error {
	_ = Stop()
	return Start()
}

// Remove stops the service and deletes its unit + daemon dir.
func Remove() error {
	_ = Stop()
	switch runtime.GOOS {
	case "darwin":
		_ = os.Remove(launchdPlistPath())
	case "linux":
		_ = os.Remove(systemdUnitPath())
		_ = exec.Command("systemctl", "--user", "daemon-reload").Run()
	}
	_ = os.RemoveAll(core.DaemonPath())
	ui.OK("daemon removed")
	return nil
}

// Status reads daemon state from the DB.
func Status() (State, error) {
	d, err := db.Open(core.DatabasePath())
	if err != nil {
		return State{}, err
	}
	defer d.Close()
	st := State{}
	if v, ok, _ := d.GetState("running"); ok {
		st.Running = v == "true"
	}
	if v, ok, _ := d.GetState("started_at"); ok {
		st.StartedAt = v
	}
	if v, ok, _ := d.GetState("last_check"); ok {
		st.LastCheck = v
	}
	if v, ok, _ := d.GetState("last_error"); ok {
		st.LastError = v
	}
	if v, ok, _ := d.GetState("check_interval"); ok {
		st.Interval, _ = strconv.Atoi(v)
	}
	return st, nil
}

// LogOptions configure the logs command.
type LogOptions struct {
	Tail   int
	Status string
	JSON   bool
	Follow bool
}

// Logs prints recent health-check logs, optionally as JSON or following.
func Logs(opts LogOptions) error {
	d, err := db.Open(core.DatabasePath())
	if err != nil {
		return err
	}
	defer d.Close()

	print := func(logs []db.HealthLog) {
		if opts.JSON {
			_ = jsonEncode(logs)
			return
		}
		rows := make([][]string, 0, len(logs))
		for _, l := range logs {
			rows = append(rows, []string{l.Timestamp, l.CheckType, l.Target, l.Status, l.Message})
		}
		fmt.Println(ui.Table([]string{"Time", "Type", "Target", "Status", "Message"}, rows))
	}

	logs, err := d.RecentHealthLogs(opts.Tail, opts.Status)
	if err != nil {
		return err
	}
	if !opts.Follow {
		if len(logs) == 0 {
			ui.Info("no health logs yet")
			return nil
		}
		print(logs)
		return nil
	}
	// Follow mode: poll for new rows by max id.
	print(logs)
	var lastID int64
	for _, l := range logs {
		if l.ID > lastID {
			lastID = l.ID
		}
	}
	for {
		time.Sleep(2 * time.Second)
		recent, err := d.RecentHealthLogs(opts.Tail, opts.Status)
		if err != nil {
			return err
		}
		var fresh []db.HealthLog
		for _, l := range recent {
			if l.ID > lastID {
				fresh = append(fresh, l)
				lastID = l.ID
			}
		}
		if len(fresh) > 0 {
			print(fresh)
		}
	}
}

func run(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	return cmd.Run()
}
