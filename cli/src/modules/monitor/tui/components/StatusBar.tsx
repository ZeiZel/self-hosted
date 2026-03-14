import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  lastUpdate: string;
  activePanel: string;
  expanded: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  lastUpdate,
  activePanel,
  expanded,
}) => {
  const time = new Date(lastUpdate).toLocaleTimeString();

  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box>
        <Text bold color="cyan">selfhost monitor</Text>
        <Text color="gray"> │ </Text>
        <Text color="white">{activePanel}</Text>
        {expanded && <Text color="green"> [EXPANDED]</Text>}
      </Box>
      <Box>
        <Text color="gray">
          [?]help [q]quit │ Updated: {time}
        </Text>
      </Box>
    </Box>
  );
};
