import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { NodeMetrics, NodeHealth } from '../../../../interfaces/monitor.interface';
import type { MetricsHistoryService } from '../data/metrics-history.service';
import { Sparkline } from './Sparkline';
import { ProgressBar } from './ProgressBar';
import { Panel } from './Panel';
import { calculateVisibleItems, calculateScrollOffset } from '../hooks/useTerminalSize';
import { truncate } from '../utils/text-truncate';

interface NodesPanelProps {
  nodes: NodeMetrics[];
  metricsHistory: MetricsHistoryService;
  focused: boolean;
  expanded: boolean;
  maxHeight?: number;
}

export const NodesPanel: React.FC<NodesPanelProps> = ({
  nodes,
  metricsHistory,
  focused,
  expanded,
  maxHeight,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Calculate visible items based on height
  const itemHeight = expanded ? 8 : 1; // Expanded view takes more lines per node
  const visibleCount = useMemo(() => {
    if (!maxHeight) return nodes.length;
    return calculateVisibleItems(maxHeight, itemHeight, 0);
  }, [maxHeight, itemHeight, nodes.length]);

  useInput((input, key) => {
    if (!focused) return;

    if (key.downArrow || input === 'j') {
      const newIndex = Math.min(selectedIndex + 1, nodes.length - 1);
      setSelectedIndex(newIndex);
      setScrollOffset(calculateScrollOffset(newIndex, visibleCount, nodes.length, scrollOffset));
    }
    if (key.upArrow || input === 'k') {
      const newIndex = Math.max(selectedIndex - 1, 0);
      setSelectedIndex(newIndex);
      setScrollOffset(calculateScrollOffset(newIndex, visibleCount, nodes.length, scrollOffset));
    }
    if (input === 'g') {
      setSelectedIndex(0);
      setScrollOffset(0);
    }
    if (input === 'G') {
      const newIndex = nodes.length - 1;
      setSelectedIndex(newIndex);
      setScrollOffset(calculateScrollOffset(newIndex, visibleCount, nodes.length, scrollOffset));
    }
  });

  // Get visible nodes based on scroll offset
  const visibleNodes = useMemo(() => {
    return nodes.slice(scrollOffset, scrollOffset + visibleCount);
  }, [nodes, scrollOffset, visibleCount]);

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

  // Calculate scroll indicator
  const hasScrollUp = scrollOffset > 0;
  const hasScrollDown = scrollOffset + visibleCount < nodes.length;
  const scrollIndicator = hasScrollUp || hasScrollDown
    ? ` ${scrollOffset + 1}-${Math.min(scrollOffset + visibleCount, nodes.length)}/${nodes.length}`
    : '';

  if (nodes.length === 0) {
    return (
      <Panel title="NODES [1]" focused={focused}>
        <Text color="gray">No nodes found</Text>
      </Panel>
    );
  }

  return (
    <Panel title={`NODES [1]${scrollIndicator}`} focused={focused}>
      {hasScrollUp && <Text color="gray">  ↑ more</Text>}
      {visibleNodes.map((node, idx) => {
        const actualIndex = scrollOffset + idx;
        const isSelected = actualIndex === selectedIndex;
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

        // Compact view - use truncate for node name
        return (
          <Box key={node.name} flexDirection="column" marginBottom={0}>
            <Box>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? '▶' : ' '}
              </Text>
              <Text color={getHealthColor(node.health)}>
                {getHealthIcon(node.health)}
              </Text>
              <Text bold={isSelected}> {truncate(node.name, 12).padEnd(12)}</Text>
              <ProgressBar value={node.cpu.percent} width={8} label="C" />
              <ProgressBar value={node.memory.percent} width={8} label="M" />
              <Sparkline data={cpuHistory} width={10} height={1} inline />
            </Box>
          </Box>
        );
      })}
      {hasScrollDown && <Text color="gray">  ↓ more</Text>}
    </Panel>
  );
};
