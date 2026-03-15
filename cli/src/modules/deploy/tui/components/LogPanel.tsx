/**
 * Log panel component for deployment TUI
 *
 * Displays a scrollable view of deployment logs with timestamps,
 * colors, and level indicators. Supports filtering and auto-scroll.
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { LogLine, LogLevel, LogViewMode, StructuredError } from '../interfaces';
import { ErrorDisplay } from './ErrorDisplay';

/**
 * Log level colors
 */
const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'gray',
  [LogLevel.INFO]: 'white',
  [LogLevel.WARN]: 'yellow',
  [LogLevel.ERROR]: 'red',
};

/**
 * Log level prefixes
 */
const LOG_LEVEL_PREFIXES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DBG',
  [LogLevel.INFO]: 'INF',
  [LogLevel.WARN]: 'WRN',
  [LogLevel.ERROR]: 'ERR',
};

export interface LogPanelProps {
  /** Log lines to display */
  logs: LogLine[];
  /** Maximum height of the panel */
  maxHeight: number;
  /** Current scroll offset from bottom */
  scrollOffset: number;
  /** Whether panel is focused */
  focused?: boolean;
  /** Current log view mode */
  viewMode?: LogViewMode;
  /** Filter string for messages */
  filter?: string;
  /** Minimum log level to display */
  minLevel?: LogLevel;
  /** Whether to show timestamps */
  showTimestamps?: boolean;
  /** Whether auto-scroll is enabled */
  autoScroll?: boolean;
  /** Current task ID for filtering */
  currentTaskId?: string | null;
}

/**
 * Format timestamp for log display
 */
function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Get log level priority for filtering
 */
function getLogLevelPriority(level: LogLevel): number {
  const priorities: Record<LogLevel, number> = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.WARN]: 2,
    [LogLevel.ERROR]: 3,
  };
  return priorities[level] ?? 0;
}

export const LogPanel: React.FC<LogPanelProps> = ({
  logs,
  maxHeight,
  scrollOffset,
  focused = false,
  viewMode = 'all',
  filter = '',
  minLevel = LogLevel.INFO,
  showTimestamps = true,
  autoScroll = true,
  currentTaskId,
}) => {
  // Filter logs based on view mode, level, and filter string
  const filteredLogs = useMemo(() => {
    let result = logs;

    // Apply view mode filter
    if (viewMode === 'current' && currentTaskId) {
      result = result.filter((log) => log.taskId === currentTaskId);
    } else if (viewMode === 'errors') {
      result = result.filter((log) => log.level === LogLevel.ERROR || log.level === LogLevel.WARN);
    } else if (viewMode === 'filtered' && filter) {
      const lowerFilter = filter.toLowerCase();
      result = result.filter((log) =>
        log.message.toLowerCase().includes(lowerFilter) ||
        log.taskId.toLowerCase().includes(lowerFilter)
      );
    }

    // Apply minimum level filter
    const minPriority = getLogLevelPriority(minLevel);
    result = result.filter((log) => getLogLevelPriority(log.level) >= minPriority);

    return result;
  }, [logs, viewMode, currentTaskId, filter, minLevel]);

  // Calculate visible range based on scroll
  const visibleLines = maxHeight - 4; // Account for borders and title
  const totalLines = filteredLogs.length;
  const startIndex = autoScroll && scrollOffset === 0
    ? Math.max(0, totalLines - visibleLines)
    : Math.max(0, totalLines - visibleLines - scrollOffset);
  const endIndex = Math.min(totalLines, startIndex + visibleLines);
  const visibleLogs = filteredLogs.slice(startIndex, endIndex);

  // Scroll indicator
  const hasMoreAbove = startIndex > 0;
  const hasMoreBelow = endIndex < totalLines;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={focused ? 'cyan' : 'gray'}
      height={maxHeight}
      width="100%"
    >
      {/* Panel title */}
      <Box justifyContent="space-between" paddingX={1}>
        <Box>
          <Text color={focused ? 'cyan' : 'white'} bold>
            {focused ? '\u25C0 ' : ''}Logs{focused ? ' \u25B6' : ''}
          </Text>
          {viewMode !== 'all' && (
            <Text dimColor> [{viewMode}]</Text>
          )}
        </Box>
        <Box>
          <Text dimColor>
            {filteredLogs.length} lines
            {autoScroll && <Text color="green"> [auto]</Text>}
          </Text>
        </Box>
      </Box>

      {/* Scroll up indicator */}
      {hasMoreAbove && (
        <Box justifyContent="center">
          <Text dimColor>\u25B2 {startIndex} more above</Text>
        </Box>
      )}

      {/* Log content */}
      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {visibleLogs.length === 0 ? (
          <Text dimColor>No log entries{filter ? ` matching "${filter}"` : ''}</Text>
        ) : (
          visibleLogs.map((log, index) => (
            <LogLineItem
              key={`${log.timestamp.getTime()}-${index}`}
              log={log}
              showTimestamp={showTimestamps}
            />
          ))
        )}
      </Box>

      {/* Scroll down indicator */}
      {hasMoreBelow && (
        <Box justifyContent="center">
          <Text dimColor>\u25BC {totalLines - endIndex} more below</Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * Individual log line component
 */
interface LogLineItemProps {
  log: LogLine;
  showTimestamp: boolean;
}

const LogLineItem: React.FC<LogLineItemProps> = ({ log, showTimestamp }) => {
  // Check if this log has a structured error attached
  if (log.structuredError) {
    return (
      <Box flexDirection="column" marginY={0}>
        {showTimestamp && (
          <Text dimColor>[{formatTimestamp(log.timestamp)}]</Text>
        )}
        <ErrorDisplay error={log.structuredError} compact />
      </Box>
    );
  }

  const color = LOG_LEVEL_COLORS[log.level];
  const prefix = LOG_LEVEL_PREFIXES[log.level];
  const timestamp = formatTimestamp(log.timestamp);

  // Truncate long messages
  const maxMessageLength = 100;
  const message = log.message.length > maxMessageLength
    ? log.message.substring(0, maxMessageLength - 3) + '...'
    : log.message;

  return (
    <Box>
      {showTimestamp && (
        <Text dimColor>[{timestamp}] </Text>
      )}
      <Text color={color} bold>
        {prefix}
      </Text>
      <Text> </Text>
      {log.source === 'stderr' && (
        <Text color="red" dimColor>[stderr] </Text>
      )}
      <Text color={log.level === LogLevel.ERROR ? 'red' : undefined}>
        {message}
      </Text>
    </Box>
  );
};
