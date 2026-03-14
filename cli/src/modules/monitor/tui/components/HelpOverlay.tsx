import React from 'react';
import { Box, Text, useInput } from 'ink';

interface HelpOverlayProps {
  onClose: () => void;
}

export const HelpOverlay: React.FC<HelpOverlayProps> = ({ onClose }) => {
  useInput((input, key) => {
    if (key.escape || input === '?' || input === 'q') {
      onClose();
    }
  });

  const shortcuts = [
    { category: 'Navigation', items: [
      { key: 'Tab', desc: 'Cycle panel focus' },
      { key: '1-4', desc: 'Quick select panel' },
      { key: 'h/j/k/l', desc: 'Navigate between panels' },
      { key: '↑/↓', desc: 'Navigate within panel' },
      { key: 'gg / G', desc: 'Jump to top / bottom' },
    ]},
    { category: 'Actions', items: [
      { key: 'Enter', desc: 'Expand focused panel' },
      { key: 'Esc', desc: 'Collapse / cancel' },
      { key: '/', desc: 'Search in services' },
      { key: 'g', desc: 'Cycle group mode' },
      { key: 'c', desc: 'Toggle group collapse' },
      { key: 'r', desc: 'Refresh metrics' },
    ]},
    { category: 'General', items: [
      { key: 'q / Ctrl+C', desc: 'Quit' },
      { key: '?', desc: 'Toggle this help' },
    ]},
  ];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
      width={50}
    >
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="cyan">Keyboard Shortcuts</Text>
      </Box>

      {shortcuts.map(section => (
        <Box key={section.category} flexDirection="column" marginBottom={1}>
          <Text bold underline>{section.category}</Text>
          {section.items.map(item => (
            <Box key={item.key}>
              <Text color="yellow">{item.key.padEnd(12)}</Text>
              <Text>{item.desc}</Text>
            </Box>
          ))}
        </Box>
      ))}

      <Box justifyContent="center" marginTop={1}>
        <Text color="gray">Press ? or Esc to close</Text>
      </Box>
    </Box>
  );
};
