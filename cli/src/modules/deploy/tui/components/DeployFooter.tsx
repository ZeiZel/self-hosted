/**
 * Deploy footer component for deployment TUI
 *
 * Displays keyboard shortcuts, elapsed time, and deployment status
 * at the bottom of the deployment dashboard.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { ActivePanel } from '../interfaces';

export interface DeployFooterProps {
  /** Total elapsed time in milliseconds */
  elapsedTime: number;
  /** Deployment status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  /** Currently active panel */
  activePanel: ActivePanel;
  /** Whether deployment is paused */
  paused?: boolean;
  /** Whether help is visible */
  helpVisible?: boolean;
  /** Connection status */
  connectionStatus?: 'connected' | 'disconnected' | 'reconnecting';
}

/**
 * Format milliseconds to human readable duration
 */
function formatElapsedTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Get status display info
 */
function getStatusDisplay(
  status: string,
  paused: boolean
): { text: string; color: string } {
  if (paused) {
    return { text: 'PAUSED', color: 'yellow' };
  }

  switch (status) {
    case 'running':
      return { text: 'Deploying...', color: 'green' };
    case 'completed':
      return { text: 'Completed', color: 'green' };
    case 'failed':
      return { text: 'Failed', color: 'red' };
    case 'cancelled':
      return { text: 'Cancelled', color: 'red' };
    case 'pending':
      return { text: 'Starting...', color: 'yellow' };
    default:
      return { text: status, color: 'white' };
  }
}

export const DeployFooter: React.FC<DeployFooterProps> = ({
  elapsedTime,
  status,
  activePanel,
  paused = false,
  helpVisible = false,
  connectionStatus = 'connected',
}) => {
  const statusDisplay = getStatusDisplay(status, paused);
  const elapsed = formatElapsedTime(elapsedTime);

  // Dynamic shortcuts based on state
  const shortcuts: Array<{ key: string; label: string }> = [];

  if (helpVisible) {
    shortcuts.push({ key: 'Esc/?', label: 'Close help' });
  } else {
    shortcuts.push({ key: 'Tab', label: 'Switch panel' });
    shortcuts.push({ key: 'j/k', label: 'Scroll' });

    if (status === 'running') {
      shortcuts.push({ key: 'p', label: paused ? 'Resume' : 'Pause' });
    }

    shortcuts.push({ key: '?', label: 'Help' });
    shortcuts.push({ key: 'q', label: 'Quit' });
  }

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
    >
      {/* Shortcuts */}
      <Box>
        {shortcuts.map((shortcut, index) => (
          <React.Fragment key={shortcut.key}>
            {index > 0 && <Text dimColor> | </Text>}
            <Text color="yellow">[{shortcut.key}]</Text>
            <Text dimColor> {shortcut.label}</Text>
          </React.Fragment>
        ))}
      </Box>

      {/* Status and time */}
      <Box>
        {/* Connection status indicator */}
        {connectionStatus !== 'connected' && (
          <Text color={connectionStatus === 'reconnecting' ? 'yellow' : 'red'}>
            {connectionStatus === 'reconnecting' ? '\u21BB ' : '\u2717 '}
          </Text>
        )}

        {/* Active panel indicator */}
        <Text dimColor>
          [{activePanel}]
        </Text>
        <Text dimColor> | </Text>

        {/* Status */}
        <Text color={statusDisplay.color}>{statusDisplay.text}</Text>
        <Text dimColor> | </Text>

        {/* Elapsed time */}
        <Text dimColor>Elapsed: </Text>
        <Text>{elapsed}</Text>
      </Box>
    </Box>
  );
};
