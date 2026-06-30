// Package ui holds shared lipgloss styles and small rendering helpers used by
// the non-TUI commands (the rich dashboard lives in internal/tui). Replaces
// chalk + cli-table3 + ora from the Node CLI.
package ui

import (
	"fmt"
	"os"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/lipgloss/table"
)

// Palette.
var (
	ColorPrimary = lipgloss.Color("63")  // indigo
	ColorSuccess = lipgloss.Color("42")  // green
	ColorWarning = lipgloss.Color("214") // orange
	ColorError   = lipgloss.Color("196") // red
	ColorMuted   = lipgloss.Color("245") // gray
	ColorAccent  = lipgloss.Color("213") // pink
)

// Styles.
var (
	Title   = lipgloss.NewStyle().Bold(true).Foreground(ColorPrimary)
	Heading = lipgloss.NewStyle().Bold(true).Foreground(ColorAccent)
	Success = lipgloss.NewStyle().Foreground(ColorSuccess)
	Warning = lipgloss.NewStyle().Foreground(ColorWarning)
	Error   = lipgloss.NewStyle().Foreground(ColorError)
	Muted   = lipgloss.NewStyle().Foreground(ColorMuted)
	Bold    = lipgloss.NewStyle().Bold(true)
)

// NoColor disables ANSI styling (honours --no-color / SELFHOST_NO_COLOR).
func NoColor() {
	lipgloss.SetColorProfile(0) // Ascii
}

// Println-style helpers with status glyphs.
func OK(format string, a ...any)   { fmt.Println(Success.Render("✓ ") + fmt.Sprintf(format, a...)) }
func Warn(format string, a ...any) { fmt.Println(Warning.Render("⚠ ") + fmt.Sprintf(format, a...)) }
func Fail(format string, a ...any) {
	fmt.Fprintln(os.Stderr, Error.Render("✗ ")+fmt.Sprintf(format, a...))
}
func Info(format string, a ...any) { fmt.Println(Muted.Render("• ") + fmt.Sprintf(format, a...)) }

// Header prints a styled section header.
func Header(text string) {
	fmt.Println()
	fmt.Println(Title.Render(text))
	fmt.Println(Muted.Render(strings.Repeat("─", lipgloss.Width(text))))
}

// Table renders a bordered table with the given headers and rows.
func Table(headers []string, rows [][]string) string {
	t := table.New().
		Border(lipgloss.RoundedBorder()).
		BorderStyle(lipgloss.NewStyle().Foreground(ColorMuted)).
		Headers(headers...).
		Rows(rows...).
		StyleFunc(func(row, col int) lipgloss.Style {
			if row == table.HeaderRow {
				return lipgloss.NewStyle().Bold(true).Foreground(ColorPrimary).Padding(0, 1)
			}
			return lipgloss.NewStyle().Padding(0, 1)
		})
	return t.Render()
}

// HealthGlyph returns a colored dot for a health string.
func HealthGlyph(health string) string {
	switch health {
	case "healthy":
		return Success.Render("●")
	case "warning":
		return Warning.Render("●")
	case "critical":
		return Error.Render("●")
	default:
		return Muted.Render("●")
	}
}
