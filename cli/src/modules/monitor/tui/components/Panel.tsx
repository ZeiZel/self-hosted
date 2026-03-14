import React from 'react';
import { Box, Text } from 'ink';

interface PanelProps {
  title: string;
  focused: boolean;
  children: React.ReactNode;
}

export const Panel: React.FC<PanelProps> = ({ title, focused, children }) => {
  const borderColor = focused ? 'cyan' : 'gray';

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      width="100%"
      height="100%"
    >
      <Box marginBottom={0}>
        <Text color={focused ? 'cyan' : 'white'} bold>
          {focused ? '◀ ' : ''}{title}{focused ? ' ▶' : ''}
        </Text>
      </Box>
      {children}
    </Box>
  );
};
