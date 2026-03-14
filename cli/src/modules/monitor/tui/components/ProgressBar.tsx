import React from 'react';
import { Text } from 'ink';

interface ProgressBarProps {
  value: number;
  width: number;
  label?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ value, width, label }) => {
  const percent = Math.max(0, Math.min(100, value));
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  const getColor = (val: number): string => {
    if (val >= 90) return 'red';
    if (val >= 75) return 'yellow';
    return 'green';
  };

  const color = getColor(percent);
  const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, empty));

  return (
    <Text>
      {label && <Text color="gray">{label}</Text>}
      <Text color={color}>{bar}</Text>
    </Text>
  );
};
