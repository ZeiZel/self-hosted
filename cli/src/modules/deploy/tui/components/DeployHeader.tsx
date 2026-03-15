/**
 * Deploy header component for deployment TUI
 *
 * Displays the progress bar, current phase, and ETA information
 * at the top of the deployment dashboard.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { DeploymentProgress, getPhaseName } from '../interfaces';
import { ProgressBar } from './ProgressBar';

export interface DeployHeaderProps {
  /** Deployment progress information */
  progress: DeploymentProgress;
  /** Whether deployment is paused */
  paused?: boolean;
  /** Current error message if any */
  error?: string | null;
}

/**
 * Format seconds to human readable duration
 */
function formatDuration(seconds: number): string {
  if (seconds <= 0) return '--:--';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs.toString().padStart(2, '0')}s`;
  }
  return `${secs}s`;
}

/**
 * Get status indicator for deployment
 */
function getStatusIndicator(status: string, paused: boolean): { text: string; color: string } {
  if (paused) {
    return { text: 'PAUSED', color: 'yellow' };
  }

  switch (status) {
    case 'running':
      return { text: 'RUNNING', color: 'green' };
    case 'completed':
      return { text: 'COMPLETED', color: 'green' };
    case 'failed':
      return { text: 'FAILED', color: 'red' };
    case 'cancelled':
      return { text: 'CANCELLED', color: 'red' };
    case 'pending':
      return { text: 'PENDING', color: 'gray' };
    default:
      return { text: status.toUpperCase(), color: 'white' };
  }
}

export const DeployHeader: React.FC<DeployHeaderProps> = ({
  progress,
  paused = false,
  error,
}) => {
  const statusInfo = getStatusIndicator(progress.status, paused);
  const phaseName = getPhaseName(progress.currentPhase);
  const eta = formatDuration(progress.estimatedRemainingSeconds);
  const elapsed = formatDuration(Math.floor(progress.elapsedMs / 1000));

  // Determine progress bar color based on status
  let barColor = 'green';
  if (progress.status === 'failed' || progress.failedTasks > 0) {
    barColor = 'red';
  } else if (paused) {
    barColor = 'yellow';
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={paused ? 'yellow' : error ? 'red' : 'cyan'}
      paddingX={1}
    >
      {/* Main progress line */}
      <Box justifyContent="space-between">
        <Box>
          <ProgressBar
            percent={progress.progressPercent}
            width={25}
            showPercent={true}
            filledColor={barColor}
          />
          <Text> </Text>
          <Text color={statusInfo.color} bold>
            [{statusInfo.text}]
          </Text>
        </Box>
        <Box>
          <Text dimColor>Elapsed: </Text>
          <Text>{elapsed}</Text>
          {progress.status === 'running' && !paused && (
            <>
              <Text dimColor> | ETA: </Text>
              <Text>{eta}</Text>
            </>
          )}
        </Box>
      </Box>

      {/* Phase and task info line */}
      <Box justifyContent="space-between">
        <Box>
          <Text dimColor>Phase {progress.currentPhase}: </Text>
          <Text bold>{phaseName}</Text>
        </Box>
        <Box>
          <Text color="green">{progress.completedTasks}</Text>
          <Text dimColor>/</Text>
          <Text>{progress.totalTasks}</Text>
          <Text dimColor> tasks</Text>
          {progress.runningTasks > 0 && (
            <Text color="yellow"> ({progress.runningTasks} running)</Text>
          )}
          {progress.failedTasks > 0 && (
            <Text color="red"> ({progress.failedTasks} failed)</Text>
          )}
        </Box>
      </Box>

      {/* Error message if present */}
      {error && (
        <Box>
          <Text color="red" bold>Error: </Text>
          <Text color="red">{error}</Text>
        </Box>
      )}
    </Box>
  );
};
