/**
 * Error Display Component for TUI
 *
 * Renders structured errors with formatted display showing:
 * - Error type and message
 * - Actionable suggestions
 * - Error details (host, task, role, action)
 * - Trace path for debugging
 *
 * Supports both compact (inline) and expanded (box) display modes.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { StructuredError, ErrorSource } from '../interfaces/error.interface';

/**
 * Props for ErrorDisplay component
 */
export interface ErrorDisplayProps {
  /** Structured error to display */
  error: StructuredError;
  /** Use compact single-line display */
  compact?: boolean;
  /** Maximum width for text wrapping */
  maxWidth?: number;
}

/**
 * Get icon for error source
 */
function getSourceIcon(source: ErrorSource): string {
  switch (source) {
    case 'ansible':
      return 'A';
    case 'helmfile':
      return 'H';
    case 'kubectl':
      return 'K';
    case 'shell':
      return 'S';
    default:
      return '?';
  }
}

/**
 * Get color for error source
 */
function getSourceColor(source: ErrorSource): string {
  switch (source) {
    case 'ansible':
      return 'magenta';
    case 'helmfile':
      return 'blue';
    case 'kubectl':
      return 'cyan';
    case 'shell':
      return 'yellow';
    default:
      return 'red';
  }
}

/**
 * Truncate string to max length with ellipsis
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Compact error display - single line with essential info
 */
const CompactErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, maxWidth = 100 }) => {
  const sourceIcon = getSourceIcon(error.source);
  const sourceColor = getSourceColor(error.source);
  const message = truncate(error.message, maxWidth - 20);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="red" bold>
          X{' '}
        </Text>
        <Text color={sourceColor} bold>
          [{sourceIcon}]
        </Text>
        <Text> </Text>
        <Text color="red">{message}</Text>
      </Box>
      {error.suggestion && (
        <Box marginLeft={2}>
          <Text dimColor>Suggestion: </Text>
          <Text color="yellow">{truncate(error.suggestion, maxWidth - 15)}</Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * Expanded error display - bordered box with full details
 */
const ExpandedErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, maxWidth = 80 }) => {
  const sourceIcon = getSourceIcon(error.source);
  const sourceColor = getSourceColor(error.source);
  const { details, context } = error;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="red"
      paddingX={1}
      paddingY={0}
    >
      {/* Header with error type */}
      <Box marginBottom={1}>
        <Text color="red" bold>
          ERROR
        </Text>
        <Text> </Text>
        <Text color={sourceColor} bold>
          [{sourceIcon}:{error.type.toUpperCase()}]
        </Text>
      </Box>

      {/* Error message */}
      <Box marginBottom={1}>
        <Text wrap="wrap">{truncate(error.message, maxWidth)}</Text>
      </Box>

      {/* Suggestion */}
      {error.suggestion && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="yellow" bold>
            Suggestion:
          </Text>
          <Box marginLeft={2}>
            <Text wrap="wrap">{truncate(error.suggestion, maxWidth - 2)}</Text>
          </Box>
        </Box>
      )}

      {/* Details section */}
      <Box flexDirection="column">
        {details.host && (
          <Box>
            <Text dimColor>Host: </Text>
            <Text>{details.host}</Text>
          </Box>
        )}
        {details.task && (
          <Box>
            <Text dimColor>Task: </Text>
            <Text>{details.task}</Text>
          </Box>
        )}
        {details.role && (
          <Box>
            <Text dimColor>Role: </Text>
            <Text>{details.role}</Text>
          </Box>
        )}
        {details.action && (
          <Box>
            <Text dimColor>Action: </Text>
            <Text>{details.action}</Text>
          </Box>
        )}
        {details.exitCode !== undefined && (
          <Box>
            <Text dimColor>Exit Code: </Text>
            <Text color={details.exitCode === 0 ? 'green' : 'red'}>
              {details.exitCode}
            </Text>
          </Box>
        )}
      </Box>

      {/* Context section if available */}
      {context && Object.keys(context).length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Context:</Text>
          {Object.entries(context).map(([key, value]) => (
            <Box key={key} marginLeft={2}>
              <Text dimColor>{key}: </Text>
              <Text>
                {typeof value === 'object'
                  ? JSON.stringify(value)
                  : String(value)}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Trace path */}
      {error.tracePath && (
        <Box marginTop={1}>
          <Text dimColor>Trace: </Text>
          <Text color="blue">{error.tracePath}</Text>
        </Box>
      )}

      {/* Stderr excerpt if available */}
      {details.stderr && details.stderr.trim() && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>stderr:</Text>
          <Box marginLeft={2}>
            <Text color="red" wrap="wrap">
              {truncate(details.stderr.trim(), maxWidth - 2)}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};

/**
 * Error Display Component
 *
 * Renders a structured error with formatting appropriate for TUI display.
 * Use compact mode for inline display within log panels, or expanded
 * mode for detailed error viewing.
 *
 * @example
 * ```tsx
 * <ErrorDisplay error={structuredError} compact />
 * ```
 *
 * @example
 * ```tsx
 * <ErrorDisplay error={structuredError} maxWidth={100} />
 * ```
 */
export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  compact = false,
  maxWidth = 80,
}) => {
  if (compact) {
    return <CompactErrorDisplay error={error} maxWidth={maxWidth} />;
  }
  return <ExpandedErrorDisplay error={error} maxWidth={maxWidth} />;
};

/**
 * Error Summary Component
 *
 * A minimal error display showing just the message and suggestion
 * on a single line. Useful for status bars and headers.
 */
export interface ErrorSummaryProps {
  /** Error message to display */
  message: string;
  /** Error source for icon */
  source?: ErrorSource;
}

export const ErrorSummary: React.FC<ErrorSummaryProps> = ({
  message,
  source = 'shell',
}) => {
  const sourceIcon = getSourceIcon(source);
  const sourceColor = getSourceColor(source);

  return (
    <Box>
      <Text color="red">X </Text>
      <Text color={sourceColor}>[{sourceIcon}]</Text>
      <Text> </Text>
      <Text color="red">{message}</Text>
    </Box>
  );
};

/**
 * Error Count Badge Component
 *
 * Displays a count of errors with colored badge.
 * Useful for headers and status indicators.
 */
export interface ErrorCountBadgeProps {
  /** Number of errors */
  count: number;
  /** Label to display */
  label?: string;
}

export const ErrorCountBadge: React.FC<ErrorCountBadgeProps> = ({
  count,
  label = 'errors',
}) => {
  if (count === 0) {
    return null;
  }

  return (
    <Box>
      <Text backgroundColor="red" color="white" bold>
        {' '}{count}{' '}
      </Text>
      <Text color="red"> {label}</Text>
    </Box>
  );
};
