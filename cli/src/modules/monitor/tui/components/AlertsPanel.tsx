import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Alert, AlertSeverity } from '../../../../interfaces/monitor.interface';
import { Panel } from './Panel';

interface AlertsPanelProps {
  alerts: Alert[];
  focused: boolean;
  expanded: boolean;
}

export const AlertsPanel: React.FC<AlertsPanelProps> = ({
  alerts,
  focused,
  expanded,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (!focused) return;

    if (key.downArrow || input === 'j') {
      setSelectedIndex(i => Math.min(i + 1, alerts.length - 1));
    }
    if (key.upArrow || input === 'k') {
      setSelectedIndex(i => Math.max(i - 1, 0));
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

  return (
    <Panel title="ALERTS [4]" focused={focused}>
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

        {alerts.length === 0 ? (
          <Text color="gray">System healthy</Text>
        ) : (
          alerts.slice(0, expanded ? 20 : 4).map((alert, idx) => {
            const isSelected = idx === selectedIndex;
            const { icon, color } = getSeverityStyle(alert.severity);

            if (expanded) {
              return (
                <Box key={alert.id} flexDirection="column" marginBottom={1}>
                  <Box>
                    <Text color={isSelected ? 'cyan' : undefined}>
                      {isSelected ? '▶' : ' '}
                    </Text>
                    <Text color={color}>{icon} </Text>
                    <Text bold>{alert.title}</Text>
                    {alert.acknowledged && <Text color="gray"> [ACK]</Text>}
                  </Box>
                  <Box marginLeft={4}>
                    <Text color="gray">{alert.message}</Text>
                  </Box>
                  <Box marginLeft={4}>
                    <Text color="gray">
                      {alert.source} | {new Date(alert.timestamp).toLocaleTimeString()}
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
                <Text>{alert.title.slice(0, 40)}</Text>
                {alert.acknowledged && <Text color="gray"> ✓</Text>}
              </Box>
            );
          })
        )}
      </Box>
    </Panel>
  );
};
