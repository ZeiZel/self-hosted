import React from 'react';
import { Box, Text } from 'ink';

interface SparklineProps {
  data: number[];
  width: number;
  height?: number;
  inline?: boolean;
}

// Braille characters for sparkline (8 levels per character)
const BRAILLE_CHARS = [
  '⣀', '⣄', '⣆', '⣇', '⣧', '⣷', '⣿', '⡿'
];

// Simple bar characters for single-height sparklines
const BAR_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width,
  height = 1,
  inline = false,
}) => {
  if (data.length === 0) {
    return inline ? (
      <Text color="gray">{' '.repeat(width)}</Text>
    ) : (
      <Box>
        <Text color="gray">{'─'.repeat(width)}</Text>
      </Box>
    );
  }

  // Normalize data to fit width
  const samples = sampleData(data, width);

  // Find min/max for scaling
  const min = 0;
  const max = 100;
  const range = max - min || 1;

  // Generate sparkline
  const chars: string[] = [];
  const colors: string[] = [];

  for (const value of samples) {
    const normalized = Math.max(0, Math.min(1, (value - min) / range));
    const level = Math.floor(normalized * (BAR_CHARS.length - 1));
    chars.push(BAR_CHARS[level]);

    // Color based on value
    if (value >= 90) {
      colors.push('red');
    } else if (value >= 75) {
      colors.push('yellow');
    } else {
      colors.push('green');
    }
  }

  if (inline) {
    return (
      <Text>
        {' '}
        {chars.map((char, i) => (
          <Text key={i} color={colors[i]}>{char}</Text>
        ))}
      </Text>
    );
  }

  if (height === 1) {
    return (
      <Box>
        {chars.map((char, i) => (
          <Text key={i} color={colors[i]}>{char}</Text>
        ))}
      </Box>
    );
  }

  // Multi-line sparkline (simplified - just repeat for now)
  const lines: React.ReactNode[] = [];
  for (let row = 0; row < height; row++) {
    lines.push(
      <Box key={row}>
        {chars.map((char, i) => (
          <Text key={i} color={colors[i]}>{char}</Text>
        ))}
      </Box>
    );
  }

  return <Box flexDirection="column">{lines}</Box>;
};

function sampleData(data: number[], targetLength: number): number[] {
  if (data.length === 0) return [];
  if (data.length <= targetLength) {
    // Pad with first value
    const result = [...data];
    while (result.length < targetLength) {
      result.unshift(data[0]);
    }
    return result;
  }

  // Downsample
  const result: number[] = [];
  const step = data.length / targetLength;

  for (let i = 0; i < targetLength; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    let sum = 0;
    let count = 0;

    for (let j = start; j < end && j < data.length; j++) {
      sum += data[j];
      count++;
    }

    result.push(count > 0 ? sum / count : 0);
  }

  return result;
}
