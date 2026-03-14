import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Alert, AlertSeverity } from '../../../../interfaces/monitor.interface';
import { Panel } from './Panel';
import { calculateVisibleItems, calculateScrollOffset } from '../hooks/useTerminalSize';
import { truncate } from '../utils/text-truncate';

interface AlertsPanelProps {
  alerts: Alert[];
  focused: boolean;
  expanded: boolean;
  maxHeight?: number;
}

export const AlertsPanel: React.FC<AlertsPanelProps> = ({
  alerts,
  focused,
  expanded,
  maxHeight,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Calculate visible items (expanded view takes 3 lines per alert, compact takes 1)
  const itemHeight = expanded ? 3 : 1;
  const visibleCount = useMemo(() => {
    if (!maxHeight) return expanded ? 20 : 4;
    return calculateVisibleItems(maxHeight, itemHeight, 2); // 2 lines for summary
  }, [maxHeight, itemHeight, expanded]);

  useInput((input, key) => {
    if (!focused) return;

    if (key.downArrow || input === 'j') {
      const newIndex = Math.min(selectedIndex + 1, alerts.length - 1);
      setSelectedIndex(newIndex);
      setScrollOffset(calculateScrollOffset(newIndex, visibleCount, alerts.length, scrollOffset));
    }
    if (key.upArrow || input === 'k') {
      const newIndex = Math.max(selectedIndex - 1, 0);
      setSelectedIndex(newIndex);
      setScrollOffset(calculateScrollOffset(newIndex, visibleCount, alerts.length, scrollOffset));
    }
    if (input === 'g') {
      setSelectedIndex(0);
      setScrollOffset(0);
    }
    if (input === 'G') {
      const newIndex = alerts.length - 1;
      setSelectedIndex(newIndex);
      setScrollOffset(calculateScrollOffset(newIndex, visibleCount, alerts.length, scrollOffset));
    }
  });

  const getSeverityStyle = (severity: AlertSeverity): { icon: string; color: string } => {
    switch (severity) {
      case 'critical': return { icon: '◉', color: 'red' };
      case 'warning': return { icon: '◉', color: 'yellow' };
      case 'info': return { icon: '◉', color: 'blue' };
      default: return { icon: '○', color: 'gray' };
    }
  };

  // Count by severity
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  const infoCount = alerts.filter(a => a.severity === 'info').length;

  const summaryParts: React.ReactNode[] = [];
  if (criticalCount > 0) summaryParts.push(<Text key="c" color="red">{criticalCount} critical</Text>);
  if (warningCount > 0) summaryParts.push(<Text key="w" color="yellow">{warningCount} warning</Text>);
  if (infoCount > 0) summaryParts.push(<Text key="i" color="blue">{infoCount} info</Text>);

  // Calculate scroll indicators
  const hasScrollUp = scrollOffset > 0;
  const hasScrollDown = scrollOffset + visibleCount < alerts.length;
  const scrollIndicator = alerts.length > visibleCount
    ? ` ${scrollOffset + 1}-${Math.min(scrollOffset + visibleCount, alerts.length)}/${alerts.length}`
    : '';

  // Get visible alerts based on scroll offset
  const visibleAlerts = alerts.slice(scrollOffset, scrollOffset + visibleCount);

  return (
    <Panel title={`ALERTS [4]${scrollIndicator}`} focused={focused}>
      <Box flexDirection="column">
        {/* Summary line */}
        <Box>
          {summaryParts.length > 0 ? (
            <>
              {summaryParts.map((part, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <Text> | </Text>}
                  {part}
                </React.Fragment>
              ))}
            </>
          ) : (
            <Text color="green">No alerts</Text>
          )}
        </Box>

        {hasScrollUp && <Text color="gray">  ↑ more</Text>}

        {alerts.length === 0 ? (
          <Text color="gray">System healthy</Text>
        ) : (
          visibleAlerts.map((alert, idx) => {
            const actualIndex = scrollOffset + idx;
            const isSelected = actualIndex === selectedIndex;
            const { icon, color } = getSeverityStyle(alert.severity);

            if (expanded) {
              return (
                <Box key={alert.id} flexDirection="column" marginBottom={1}>
                  <Box>
                    <Text color={isSelected ? 'cyan' : undefined}>
                      {isSelected ? '▶' : ' '}
                    </Text>
                    <Text color={color}>{icon} </Text>
                    <Text bold>{truncate(alert.title, 50)}</Text>
                    {alert.acknowledged && <Text color="gray"> [ACK]</Text>}
                  </Box>
                  <Box marginLeft={4}>
                    <Text color="gray">{truncate(alert.message, 60)}</Text>
                  </Box>
                  <Box marginLeft={4}>
                    <Text color="gray">
                      {truncate(alert.source, 20)} | {new Date(alert.timestamp).toLocaleTimeString()}
                    </Text>
                  </Box>
                </Box>
              );
            }

            return (
              <Box key={alert.id}>
                <Text color={isSelected ? 'cyan' : undefined}>
                  {isSelected ? '▶' : ' '}
                </Text>
                <Text color={color}>{icon} </Text>
                <Text>{truncate(alert.title, 40)}</Text>
                {alert.acknowledged && <Text color="gray"> ✓</Text>}
              </Box>
            );
          })
        )}

        {hasScrollDown && <Text color="gray">  ↓ more</Text>}
      </Box>
    </Panel>
  );
};
