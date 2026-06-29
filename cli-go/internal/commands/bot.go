package commands

import (
	"fmt"

	"github.com/ZeiZel/self-hosted/cli-go/internal/telegram"
	"github.com/ZeiZel/self-hosted/cli-go/internal/ui"
	"github.com/spf13/cobra"
)

func newBotCmd(g *Global) *cobra.Command {
	cmd := &cobra.Command{Use: "bot", Short: "Manage the Telegram alert bot"}

	var token, chatID string
	var force bool
	initc := &cobra.Command{Use: "init", Short: "Configure the Telegram bot",
		RunE: func(c *cobra.Command, _ []string) error {
			if token == "" {
				var err error
				if token, err = askPassword("Telegram bot token"); err != nil {
					return err
				}
			}
			if chatID == "" {
				var err error
				if chatID, err = askString("Telegram chat ID", ""); err != nil {
					return err
				}
			}
			if !telegram.ValidToken(token) {
				return fmt.Errorf("token does not look like a valid bot token")
			}
			d, err := openDB()
			if err != nil {
				return err
			}
			defer d.Close()
			tc := telegram.NewClient(token)
			if err := tc.TestConnection(); err != nil {
				return fmt.Errorf("token rejected by Telegram: %w", err)
			}
			if err := telegram.SaveConfig(d, token, chatID, force); err != nil {
				return err
			}
			ui.OK("telegram bot configured")
			return nil
		}}
	initc.Flags().StringVar(&token, "token", "", "Bot token")
	initc.Flags().StringVar(&chatID, "chat-id", "", "Chat ID")
	initc.Flags().BoolVar(&force, "force", false, "Overwrite existing config")

	check := &cobra.Command{Use: "check", Short: "Verify the bot token via getMe",
		RunE: func(c *cobra.Command, _ []string) error {
			d, err := openDB()
			if err != nil {
				return err
			}
			defer d.Close()
			cfg, err := telegram.LoadConfig(d)
			if err != nil {
				return err
			}
			tc := telegram.NewClient(cfg.Token)
			if err := tc.TestConnection(); err != nil {
				return err
			}
			ui.OK("token valid")
			return nil
		}}

	enable := botToggle("enable", "Enable alerts", true)
	disable := botToggle("disable", "Disable alerts", false)

	var asJSON bool
	status := &cobra.Command{Use: "status", Short: "Show bot status",
		RunE: func(c *cobra.Command, _ []string) error {
			d, err := openDB()
			if err != nil {
				return err
			}
			defer d.Close()
			cfg, err := telegram.LoadConfig(d)
			if err != nil {
				if asJSON {
					return printJSON(map[string]any{"configured": false})
				}
				ui.Warn("bot not configured")
				return nil
			}
			if asJSON {
				return printJSON(map[string]any{"configured": true, "enabled": cfg.Enabled, "chatId": cfg.ChatID})
			}
			ui.Header("Telegram Bot")
			ui.Info("chat: %s   enabled: %t", cfg.ChatID, cfg.Enabled)
			return nil
		}}
	status.Flags().BoolVar(&asJSON, "json", false, "Output as JSON")

	cmd.AddCommand(initc, check, enable, disable, status)
	return cmd
}

func botToggle(use, short string, enabled bool) *cobra.Command {
	return &cobra.Command{Use: use, Short: short,
		RunE: func(c *cobra.Command, _ []string) error {
			d, err := openDB()
			if err != nil {
				return err
			}
			defer d.Close()
			if err := telegram.SetEnabled(d, enabled); err != nil {
				return err
			}
			ui.OK("alerts %sd", use)
			return nil
		}}
}
