import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { NodeMetrics, NodeHealth } from '../../../../interfaces/monitor.interface';
import type { MetricsHistoryService } from '../data/metrics-history.service';
import { Sparkline } from './Sparkline';
import { ProgressBar } from './ProgressBar';
import { Panel } from './Panel';

interface NodesPanelProps {
  nodes: NodeMetrics[];
  metricsHistory: MetricsHistoryService;
  focused: boolean;
  expanded: boolean;
}

export const NodesPanel: React.FC<NodesPanelProps> = ({
  nodes,
  metricsHistory,
  focused,
  expanded,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (!focused) return;

    if (key.downArrow || input === 'j') {
      setSelectedIndex(i => Math.min(i + 1, nodes.length - 1));
    }
    if (key.upArrow || input === 'k') {
      setSelectedIndex(i => Math.max(i - 1, 0));
    }
    if (input === 'g') {
      setSelectedIndex(0);
    }
    if (input === 'G') {
      setSelectedIndex(nodes.length - 1);
    }
  });

  const getHealthColor = (health: NodeHealth): string => {
    switch (health) {
      case 'healthy': return 'green';
      case 'warning': return 'yellow';
      case 'critical': return 'red';
      default: return 'gray';
    }
  };

  const getHealthIcon = (health: NodeHealth): string => {
    switch (health) {
      case 'healthy': return '●';
      case 'warning': return '●';
      case 'critical': return '●';
      default: return '○';
    }
  };

  if (nodes.length === 0) {
    return (
      <Panel title="NODES [1]" focused={focused}>
        <Text color="gray">No nodes found</Text>
      </Panel>
    );
  }

  return (
    <Panel title="NODES [1]" focused={focused}>
      {nodes.map((node, idx) => {
        const isSelected = idx === selectedIndex;
        const cpuHistory = metricsHistory.getNodeCpuValues(node.name);
        const memHistory = metricsHistory.getNodeMemoryValues(node.name);

        if (expanded) {
          // Expanded view with full charts
          return (
            <Box key={node.name} flexDirection="column" marginBottom={1}>
              <Box>
                <Text color={isSelected ? 'cyan' : undefined}>
                  {isSelected ? '▶ ' : '  '}
                </Text>
                <Text color={getHealthColor(node.health)}>
                  {getHealthIcon(node.health)}{' '}
                </Text>
                <Text bold>{node.name}</Text>
                <Text color="gray"> ({node.ip})</Text>
              </Box>

              <Box marginLeft={4} flexDirection="column">
                <Box>
                  <Text>CPU </Text>
                  <ProgressBar value={node.cpu.percent} width={20} />
                  <Text> {node.cpu.percent.toFixed(0)}%</Text>
                </Box>
                <Sparkline data={cpuHistory} width={30} height={2} />

                <Box marginTop={1}>
                  <Text>MEM </Text>
                  <ProgressBar value={node.memory.percent} width={20} />
                  <Text> {node.memory.percent.toFixed(0)}%</Text>
                </Box>
                <Sparkline data={memHistory} width={30} height={2} />

                <Text color="gray">
                  Pods: {node.pods.running}/{node.pods.total}
                  {node.pods.failed > 0 && <Text color="red"> ({node.pods.failed} failed)</Text>}
                </Text>
              </Box>
            </Box>
          );
        }

        // Compact view
        return (
          <Box key={node.name} flexDirection="column" marginBottom={0}>
            <Box>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? '▶' : ' '}
              </Text>
              <Text color={getHealthColor(node.health)}>
                {getHealthIcon(node.health)}
              </Text>
              <Text bold={isSelected}> {node.name.slice(0, 12).padEnd(12)}</Text>
              <ProgressBar value={node.cpu.percent} width={8} label="C" />
              <ProgressBar value={node.memory.percent} width={8} label="M" />
              <Sparkline data={cpuHistory} width={10} height={1} inline />
            </Box>
          </Box>
        );
      })}
    </Panel>
  );
};
