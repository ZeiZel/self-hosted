import React from 'react';
import { Box, Text } from 'ink';
import type { ClusterSummary } from '../../../../interfaces/monitor.interface';
import type { MetricsHistoryService } from '../data/metrics-history.service';
import { Panel } from './Panel';
import { ProgressBar } from './ProgressBar';
import { Sparkline } from './Sparkline';

interface SummaryPanelProps {
  summary: ClusterSummary;
  metricsHistory: MetricsHistoryService;
  focused: boolean;
  expanded: boolean;
}

export const SummaryPanel: React.FC<SummaryPanelProps> = ({
  summary,
  metricsHistory,
  focused,
  expanded,
}) => {
  const cpuHistory = metricsHistory.getClusterCpuValues();
  const memHistory = metricsHistory.getClusterMemoryValues();

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'Ki', 'Mi', 'Gi', 'Ti'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatCpu = (millicores: number): string => {
    if (millicores >= 1000) {
      return `${(millicores / 1000).toFixed(1)} cores`;
    }
    return `${millicores}m`;
  };

  if (expanded) {
    return (
      <Panel title="SUMMARY [2]" focused={focused}>
        <Box flexDirection="column">
          <Text bold>Cluster CPU</Text>
          <Box>
            <ProgressBar value={summary.cpu.percent} width={30} />
            <Text> {summary.cpu.percent.toFixed(1)}%</Text>
          </Box>
          <Text color="gray">
            {formatCpu(summary.cpu.used)} / {formatCpu(summary.cpu.total)}
          </Text>
          <Sparkline data={cpuHistory} width={40} height={3} />

          <Box marginTop={1} />
          <Text bold>Cluster Memory</Text>
          <Box>
            <ProgressBar value={summary.memory.percent} width={30} />
            <Text> {summary.memory.percent.toFixed(1)}%</Text>
          </Box>
          <Text color="gray">
            {formatBytes(summary.memory.used)} / {formatBytes(summary.memory.total)}
          </Text>
          <Sparkline data={memHistory} width={40} height={3} />

          <Box marginTop={1} />
          <Text bold>Nodes</Text>
          <Box>
            <Text color="green">{summary.nodes.healthy} healthy</Text>
            <Text> | </Text>
            <Text color="yellow">{summary.nodes.warning} warning</Text>
            <Text> | </Text>
            <Text color="red">{summary.nodes.critical} critical</Text>
          </Box>

          <Box marginTop={1} />
          <Text bold>Pods</Text>
          <Box>
            <Text color="green">{summary.pods.running} running</Text>
            <Text> | </Text>
            <Text color="yellow">{summary.pods.pending} pending</Text>
            <Text> | </Text>
            <Text color="red">{summary.pods.failed} failed</Text>
          </Box>
        </Box>
      </Panel>
    );
  }

  // Compact view
  return (
    <Panel title="SUMMARY [2]" focused={focused}>
      <Box flexDirection="column">
        <Box>
          <Text>CPU </Text>
          <ProgressBar value={summary.cpu.percent} width={12} />
          <Text> {summary.cpu.percent.toFixed(0)}%</Text>
          <Sparkline data={cpuHistory} width={8} height={1} inline />
        </Box>

        <Box>
          <Text>MEM </Text>
          <ProgressBar value={summary.memory.percent} width={12} />
          <Text> {summary.memory.percent.toFixed(0)}%</Text>
          <Sparkline data={memHistory} width={8} height={1} inline />
        </Box>

        <Box marginTop={1}>
          <Text>Nodes: </Text>
          <Text color="green">{summary.nodes.healthy}</Text>
          <Text>/</Text>
          <Text color="yellow">{summary.nodes.warning}</Text>
          <Text>/</Text>
          <Text color="red">{summary.nodes.critical}</Text>
        </Box>

        <Box>
          <Text>Pods: </Text>
          <Text color="green">{summary.pods.running}</Text>
          <Text color="gray">/{summary.pods.total}</Text>
          {summary.pods.failed > 0 && <Text color="red"> ({summary.pods.failed}!)</Text>}
        </Box>

        <Box>
          <Text color="gray">NS: {summary.namespaces}</Text>
        </Box>
      </Box>
    </Panel>
  );
};
