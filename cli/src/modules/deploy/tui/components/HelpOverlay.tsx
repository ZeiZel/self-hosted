/**
 * Help overlay component for deployment TUI
 *
 * Displays keyboard shortcuts and help information
 * in a modal overlay.
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { TUI_KEYBOARD_SHORTCUTS } from '../interfaces';

export interface HelpOverlayProps {
  /** Callback when help is closed */
  onClose: () => void;
}

/**
 * Keyboard shortcut category
 */
interface ShortcutCategory {
  title: string;
  shortcuts: Array<{ key: string; description: string }>;
}

/**
 * Organize shortcuts by category
 */
function getShortcutCategories(): ShortcutCategory[] {
  return [
    {
      title: 'Navigation',
      shortcuts: [
        { key: 'Tab', description: 'Switch panel' },
        { key: '1', description: 'Tasks panel' },
        { key: '2', description: 'Logs panel' },
        { key: '3', description: 'DAG panel' },
        { key: 'j/Down', description: 'Navigate down' },
        { key: 'k/Up', description: 'Navigate up' },
        { key: 'gg/Home', description: 'Jump to start' },
        { key: 'G/End', description: 'Jump to end' },
        { key: 'PgUp/PgDn', description: 'Page up/down' },
      ],
    },
    {
      title: 'Deployment',
      shortcuts: [
        { key: 'p', description: 'Pause/Resume deployment' },
        { key: 'r', description: 'Retry failed task' },
        { key: 's', description: 'Skip task' },
        { key: 'c', description: 'Cancel task' },
      ],
    },
    {
      title: 'View',
      shortcuts: [
        { key: 'Space', description: 'Toggle expand/collapse' },
        { key: 'g', description: 'Change grouping mode' },
        { key: 'v', description: 'Change view mode' },
        { key: 't', description: 'Toggle timestamps' },
        { key: 'a', description: 'Toggle auto-scroll' },
        { key: 'Enter', description: 'Expand focused panel' },
      ],
    },
    {
      title: 'Search',
      shortcuts: [
        { key: '/', description: 'Start search' },
        { key: 'Esc', description: 'Cancel search/Close overlay' },
        { key: 'Ctrl+l', description: 'Clear logs' },
      ],
    },
    {
      title: 'General',
      shortcuts: [
        { key: '?', description: 'Toggle this help' },
        { key: 'Ctrl+p', description: 'Command palette' },
        { key: 'q/Ctrl+C', description: 'Quit deployment' },
      ],
    },
  ];
}

export const HelpOverlay: React.FC<HelpOverlayProps> = ({ onClose }) => {
  // Handle keyboard input
  useInput((input, key) => {
    if (key.escape || input === '?' || input === 'q') {
      onClose();
    }
  });

  const categories = getShortcutCategories();

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      padding={1}
      width={60}
    >
      {/* Title */}
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="cyan">
          Keyboard Shortcuts
        </Text>
      </Box>

      {/* Categories */}
      <Box flexDirection="row" flexWrap="wrap">
        {categories.map((category, categoryIndex) => (
          <Box
            key={category.title}
            flexDirection="column"
            width="50%"
            marginBottom={1}
          >
            <Text bold underline color="white">
              {category.title}
            </Text>
            {category.shortcuts.map((shortcut) => (
              <Box key={shortcut.key}>
                <Text color="yellow" bold>
                  {shortcut.key.padEnd(12)}
                </Text>
                <Text>{shortcut.description}</Text>
              </Box>
            ))}
          </Box>
        ))}
      </Box>

      {/* Footer */}
      <Box justifyContent="center" marginTop={1}>
        <Text dimColor>Press ? or Esc to close</Text>
      </Box>
    </Box>
  );
};

/**
 * Compact help bar for footer
 */
export interface HelpBarProps {
  /** Shortcuts to display */
  shortcuts?: Array<{ key: string; label: string }>;
}

export const HelpBar: React.FC<HelpBarProps> = ({ shortcuts }) => {
  const defaultShortcuts = [
    { key: '?', label: 'help' },
    { key: 'p', label: 'pause' },
    { key: 'Tab', label: 'switch' },
    { key: 'q', label: 'quit' },
  ];

  const items = shortcuts || defaultShortcuts;

  return (
    <Box>
      {items.map((item, index) => (
        <React.Fragment key={item.key}>
          {index > 0 && <Text dimColor> | </Text>}
          <Text color="yellow">[{item.key}]</Text>
          <Text dimColor>{item.label}</Text>
        </React.Fragment>
      ))}
    </Box>
  );
};
