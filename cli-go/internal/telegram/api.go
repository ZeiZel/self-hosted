package telegram

// Telegram Bot API update/message types and the extra methods used by the
// inbound command bot (ported from cli/src/telegram/telegram.service.ts and
// interfaces/telegram.interface.ts).

// Update is a single getUpdates entry.
type Update struct {
	UpdateID      int            `json:"update_id"`
	Message       *Message       `json:"message"`
	CallbackQuery *CallbackQuery `json:"callback_query"`
}

// Message is a Telegram message.
type Message struct {
	MessageID int    `json:"message_id"`
	Text      string `json:"text"`
	Chat      Chat   `json:"chat"`
	From      User   `json:"from"`
}

// Chat identifies a chat.
type Chat struct {
	ID int64 `json:"id"`
}

// User identifies a sender.
type User struct {
	ID int64 `json:"id"`
}

// CallbackQuery is an inline-keyboard button press.
type CallbackQuery struct {
	ID      string   `json:"id"`
	Data    string   `json:"data"`
	From    User     `json:"from"`
	Message *Message `json:"message"`
}

// InlineButton is one inline-keyboard button.
type InlineButton struct {
	Text         string `json:"text"`
	CallbackData string `json:"callback_data"`
}

// InlineKeyboard is a reply_markup with inline buttons.
type InlineKeyboard struct {
	InlineKeyboard [][]InlineButton `json:"inline_keyboard"`
}

// BotCommandInfo is used by setMyCommands.
type BotCommandInfo struct {
	Command     string `json:"command"`
	Description string `json:"description"`
}

// GetUpdates long-polls for updates since offset.
func (c *Client) GetUpdates(offset, timeout int) ([]Update, error) {
	payload := map[string]any{"timeout": timeout, "allowed_updates": []string{"message", "callback_query"}}
	if offset > 0 {
		payload["offset"] = offset
	}
	var updates []Update
	if err := c.call("getUpdates", payload, &updates); err != nil {
		return nil, err
	}
	return updates, nil
}

// SendMessageMarkup sends a message with an optional inline keyboard.
func (c *Client) SendMessageMarkup(chatID, text string, kb *InlineKeyboard) error {
	payload := map[string]any{"chat_id": chatID, "text": text, "parse_mode": "HTML"}
	if kb != nil {
		payload["reply_markup"] = kb
	}
	return c.call("sendMessage", payload, nil)
}

// AnswerCallbackQuery acknowledges a callback.
func (c *Client) AnswerCallbackQuery(id string) error {
	return c.call("answerCallbackQuery", map[string]any{"callback_query_id": id}, nil)
}

// EditMessageText edits a previously-sent message.
func (c *Client) EditMessageText(chatID string, messageID int, text string) error {
	return c.call("editMessageText", map[string]any{
		"chat_id": chatID, "message_id": messageID, "text": text, "parse_mode": "HTML",
	}, nil)
}

// SetMyCommands registers the bot's command list.
func (c *Client) SetMyCommands(cmds []BotCommandInfo) error {
	return c.call("setMyCommands", map[string]any{"commands": cmds}, nil)
}
