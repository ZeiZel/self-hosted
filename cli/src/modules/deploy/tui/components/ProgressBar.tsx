/**
 * ASCII progress bar component for deployment TUI
 *
 * Displays a visual progress indicator with percentage,
 * using filled and empty blocks for the progress bar.
 */

import React from 'react';
import { Text } from 'ink';

export interface ProgressBarProps {
  /** Progress percentage (0-100) */
  percent: number;
  /** Width of the progress bar in characters */
  width?: number;
  /** Show percentage text after the bar */
  showPercent?: boolean;
  /** Color for the filled portion */
  filledColor?: string;
  /** Color for the empty portion */
  emptyColor?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  percent,
  width = 20,
  showPercent = true,
  filledColor = 'green',
  emptyColor,
}) => {
  // Clamp percent to 0-100
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clampedPercent / 100) * width);
  const empty = width - filled;

  // Determine color based on progress or status
  const getColor = (): string => {
    if (filledColor !== 'green') return filledColor;
    if (clampedPercent >= 100) return 'green';
    if (clampedPercent >= 50) return 'yellow';
    return 'cyan';
  };

  return (
    <Text>
      <Text>[</Text>
      <Text color={getColor()}>{'█'.repeat(filled)}</Text>
      <Text dimColor={!emptyColor} color={emptyColor}>
        {'░'.repeat(empty)}
      </Text>
      <Text>]</Text>
      {showPercent && <Text> {Math.round(clampedPercent)}%</Text>}
    </Text>
  );
};
