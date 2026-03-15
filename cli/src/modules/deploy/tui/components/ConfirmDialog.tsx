/**
 * Confirm dialog component for deployment TUI
 *
 * Displays a modal confirmation dialog with customizable
 * title, message, and button options.
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { TUIDialog } from '../interfaces';

export interface ConfirmDialogProps {
  /** Dialog configuration */
  dialog: TUIDialog;
  /** Callback when dialog is confirmed */
  onConfirm: (value?: string) => void;
  /** Callback when dialog is cancelled */
  onCancel: () => void;
}

/**
 * Get type-specific styling
 */
function getDialogStyle(type: TUIDialog['type']): {
  borderColor: string;
  titleColor: string;
  icon: string;
} {
  switch (type) {
    case 'confirm':
      return { borderColor: 'yellow', titleColor: 'yellow', icon: '?' };
    case 'alert':
      return { borderColor: 'red', titleColor: 'red', icon: '!' };
    case 'prompt':
      return { borderColor: 'cyan', titleColor: 'cyan', icon: '\u270E' };
    default:
      return { borderColor: 'white', titleColor: 'white', icon: '*' };
  }
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  dialog,
  onConfirm,
  onCancel,
}) => {
  const style = getDialogStyle(dialog.type);
  const [inputValue, setInputValue] = React.useState(dialog.inputValue || '');
  const [focusedButton, setFocusedButton] = React.useState<'confirm' | 'cancel'>(
    dialog.focusedButton || 'confirm'
  );

  // Handle keyboard input
  useInput((input, key) => {
    // Close on escape
    if (key.escape) {
      onCancel();
      return;
    }

    // For prompt dialogs, handle text input
    if (dialog.type === 'prompt') {
      if (key.backspace || key.delete) {
        setInputValue((v) => v.slice(0, -1));
        return;
      }

      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setInputValue((v) => v + input);
        return;
      }
    }

    // Tab to switch focus between buttons
    if (key.tab) {
      setFocusedButton((f) => (f === 'confirm' ? 'cancel' : 'confirm'));
      return;
    }

    // Arrow keys for button focus
    if (key.leftArrow || key.rightArrow) {
      setFocusedButton((f) => (f === 'confirm' ? 'cancel' : 'confirm'));
      return;
    }

    // Enter to confirm
    if (key.return) {
      if (focusedButton === 'confirm') {
        onConfirm(dialog.type === 'prompt' ? inputValue : undefined);
      } else {
        onCancel();
      }
      return;
    }

    // Shortcuts: y for yes/confirm, n for no/cancel
    if (input === 'y' || input === 'Y') {
      onConfirm(dialog.type === 'prompt' ? inputValue : undefined);
      return;
    }
    if (input === 'n' || input === 'N') {
      onCancel();
      return;
    }
  });

  const confirmText = dialog.confirmText || (dialog.type === 'alert' ? 'OK' : 'Confirm');
  const cancelText = dialog.cancelText || 'Cancel';

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={style.borderColor}
      padding={1}
      width={50}
    >
      {/* Title */}
      <Box justifyContent="center" marginBottom={1}>
        <Text color={style.titleColor} bold>
          {style.icon} {dialog.title}
        </Text>
      </Box>

      {/* Message */}
      <Box justifyContent="center" marginBottom={1}>
        <Text wrap="wrap">{dialog.message}</Text>
      </Box>

      {/* Input field for prompt dialogs */}
      {dialog.type === 'prompt' && (
        <Box
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          marginBottom={1}
        >
          <Text>
            {inputValue}
            <Text color="cyan">|</Text>
          </Text>
        </Box>
      )}

      {/* Buttons */}
      <Box justifyContent="center">
        {/* For alert dialogs, only show OK button */}
        {dialog.type === 'alert' ? (
          <Box
            borderStyle="single"
            borderColor={focusedButton === 'confirm' ? 'green' : 'gray'}
            paddingX={2}
          >
            <Text
              color={focusedButton === 'confirm' ? 'green' : undefined}
              bold={focusedButton === 'confirm'}
            >
              {confirmText}
            </Text>
          </Box>
        ) : (
          <>
            {/* Cancel button */}
            <Box
              borderStyle="single"
              borderColor={focusedButton === 'cancel' ? 'red' : 'gray'}
              paddingX={2}
              marginRight={2}
            >
              <Text
                color={focusedButton === 'cancel' ? 'red' : undefined}
                bold={focusedButton === 'cancel'}
              >
                {cancelText}
              </Text>
            </Box>

            {/* Confirm button */}
            <Box
              borderStyle="single"
              borderColor={focusedButton === 'confirm' ? 'green' : 'gray'}
              paddingX={2}
            >
              <Text
                color={focusedButton === 'confirm' ? 'green' : undefined}
                bold={focusedButton === 'confirm'}
              >
                {confirmText}
              </Text>
            </Box>
          </>
        )}
      </Box>

      {/* Keyboard hints */}
      <Box justifyContent="center" marginTop={1}>
        <Text dimColor>
          {dialog.type === 'alert'
            ? '[Enter] OK  [Esc] Close'
            : '[Tab] Switch  [Enter] Select  [Esc] Cancel'}
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Centered dialog overlay wrapper
 */
export interface DialogOverlayProps {
  children: React.ReactNode;
  width?: number;
  height?: number;
}

export const DialogOverlay: React.FC<DialogOverlayProps> = ({
  children,
  width = 80,
  height = 24,
}) => {
  return (
    <Box
      width={width}
      height={height}
      justifyContent="center"
      alignItems="center"
    >
      {children}
    </Box>
  );
};
