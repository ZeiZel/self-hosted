import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ServiceMetrics } from '../../../../interfaces/monitor.interface';
import { Panel } from './Panel';
import { ProgressBar } from './ProgressBar';
import { Sparkline } from './Sparkline';
import { truncate } from '../utils/text-truncate';

interface PodDetailPanelProps {
  service: ServiceMetrics;
  onClose: () => void;
  cpuHistory?: number[];
  memoryHistory?: number[];
  events?: PodEvent[];
  logs?: string[];
}

interface PodEvent {
  type: 'Normal' | 'Warning';
  reason: string;
  message: string;
  count: number;
  lastSeen: string;
}

type Tab = 'overview' | 'events' | 'logs';

export const PodDetailPanel: React.FC<PodDetailPanelProps> = ({
  service,
  onClose,
  cpuHistory = [],
  memoryHistory = [],
  events = [],
  logs = [],
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [logScrollOffset, setLogScrollOffset] = useState(0);
  const [eventScrollOffset, setEventScrollOffset] = useState(0);

  useInput((input, key) => {
    // Close on Escape or q
    if (key.escape || input === 'q') {
      onClose();
      return;
    }

    // Tab switching with numbers
    if (input === '1') setActiveTab('overview');
    if (input === '2') setActiveTab('events');
    if (input === '3') setActiveTab('logs');

    // Tab cycling with Tab key
    if (key.tab) {
      const tabs: Tab[] = ['overview', 'events', 'logs'];
      const idx = tabs.indexOf(activeTab);
      setActiveTab(tabs[(idx + 1) % tabs.length]);
      return;
    }

    // Scrolling in logs/events
    if (activeTab === 'logs') {
      if (key.downArrow || input === 'j') {
        setLogScrollOffset(o => Math.min(o + 1, Math.max(0, logs.length - 10)));
      }
      if (key.upArrow || input === 'k') {
        setLogScrollOffset(o => Math.max(o - 1, 0));
      }
      if (input === 'g') setLogScrollOffset(0);
      if (input === 'G') setLogScrollOffset(Math.max(0, logs.length - 10));
    }

    if (activeTab === 'events') {
      if (key.downArrow || input === 'j') {
        setEventScrollOffset(o => Math.min(o + 1, Math.max(0, events.length - 5)));
      }
      if (key.upArrow || input === 'k') {
        setEventScrollOffset(o => Math.max(o - 1, 0));
      }
    }
  });

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'Ki', 'Mi', 'Gi'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatCpu = (millicores: number): string => {
    if (millicores >= 1000) {
      return `${(millicores / 1000).toFixed(2)} cores`;
    }
    return `${millicores}m`;
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'Running': return 'green';
      case 'Pending': return 'yellow';
      case 'Failed':
      case 'CrashLoopBackOff':
      case 'Error':
        return 'red';
      default: return 'gray';
    }
  };

  return (
    <Panel title={`POD: ${service.namespace}/${service.name}`} focused={true}>
      <Box flexDirection="column">
        {/* Tab bar */}
        <Box marginBottom={1}>
          <Text
            color={activeTab === 'overview' ? 'cyan' : 'gray'}
            bold={activeTab === 'overview'}
          >
            [1] Overview
          </Text>
          <Text> | </Text>
          <Text
            color={activeTab === 'events' ? 'cyan' : 'gray'}
            bold={activeTab === 'events'}
          >
            [2] Events ({events.length})
          </Text>
          <Text> | </Text>
          <Text
            color={activeTab === 'logs' ? 'cyan' : 'gray'}
            bold={activeTab === 'logs'}
          >
            [3] Logs
          </Text>
          <Text color="gray">  (Tab: cycle, Esc: close)</Text>
        </Box>

        {/* Overview tab */}
        {activeTab === 'overview' && (
          <Box flexDirection="column">
            {/* Status row */}
            <Box marginBottom={1}>
              <Text bold>Status: </Text>
              <Text color={getStatusColor(service.status)}>{service.status}</Text>
              <Text>  </Text>
              <Text bold>Node: </Text>
              <Text>{service.node}</Text>
              <Text>  </Text>
              <Text bold>Age: </Text>
              <Text>{service.age}</Text>
              <Text>  </Text>
              <Text bold>Restarts: </Text>
              <Text color={service.restarts > 2 ? 'red' : service.restarts > 0 ? 'yellow' : 'green'}>
                {service.restarts}
              </Text>
            </Box>

            {/* CPU section */}
            <Box flexDirection="column" marginBottom={1}>
              <Text bold>CPU Usage</Text>
              <Box>
                <Text>Used: {formatCpu(service.cpu.used)}</Text>
                <Text>  </Text>
                <Text color="gray">Requested: {formatCpu(service.cpu.requested)}</Text>
                <Text>  </Text>
                <Text color="gray">Limit: {formatCpu(service.cpu.limit)}</Text>
              </Box>
              <Box>
                <ProgressBar
                  value={service.cpu.limit > 0 ? (service.cpu.used / service.cpu.limit) * 100 : 0}
                  width={40}
                />
                <Text> {service.cpu.limit > 0 ? Math.round((service.cpu.used / service.cpu.limit) * 100) : 0}%</Text>
              </Box>
              {cpuHistory.length > 0 && (
                <Box marginTop={1}>
                  <Text color="gray">History: </Text>
                  <Sparkline data={cpuHistory} width={40} height={2} />
                </Box>
              )}
            </Box>

            {/* Memory section */}
            <Box flexDirection="column" marginBottom={1}>
              <Text bold>Memory Usage</Text>
              <Box>
                <Text>Used: {formatBytes(service.memory.used)}</Text>
                <Text>  </Text>
                <Text color="gray">Requested: {formatBytes(service.memory.requested)}</Text>
                <Text>  </Text>
                <Text color="gray">Limit: {formatBytes(service.memory.limit)}</Text>
              </Box>
              <Box>
                <ProgressBar
                  value={service.memory.limit > 0 ? (service.memory.used / service.memory.limit) * 100 : 0}
                  width={40}
                />
                <Text> {service.memory.limit > 0 ? Math.round((service.memory.used / service.memory.limit) * 100) : 0}%</Text>
              </Box>
              {memoryHistory.length > 0 && (
                <Box marginTop={1}>
                  <Text color="gray">History: </Text>
                  <Sparkline data={memoryHistory} width={40} height={2} />
                </Box>
              )}
            </Box>

            {/* Replicas */}
            <Box>
              <Text bold>Replicas: </Text>
              <Text color={service.replicas.ready === service.replicas.desired ? 'green' : 'yellow'}>
                {service.replicas.ready}/{service.replicas.desired}
              </Text>
              <Text color="gray"> available: {service.replicas.available}</Text>
            </Box>
          </Box>
        )}

        {/* Events tab */}
        {activeTab === 'events' && (
          <Box flexDirection="column">
            {events.length === 0 ? (
              <Text color="gray">No events</Text>
            ) : (
              events.slice(eventScrollOffset, eventScrollOffset + 8).map((event, idx) => (
                <Box key={idx} flexDirection="column" marginBottom={1}>
                  <Box>
                    <Text color={event.type === 'Warning' ? 'yellow' : 'green'}>
                      [{event.type}]
                    </Text>
                    <Text bold> {event.reason}</Text>
                    {event.count > 1 && <Text color="gray"> (x{event.count})</Text>}
                  </Box>
                  <Text color="gray" wrap="truncate">
                    {truncate(event.message, 70)}
                  </Text>
                  <Text color="gray" dimColor>
                    Last seen: {event.lastSeen}
                  </Text>
                </Box>
              ))
            )}
            {events.length > 8 && (
              <Text color="gray">
                Showing {eventScrollOffset + 1}-{Math.min(eventScrollOffset + 8, events.length)} of {events.length}
                (j/k to scroll)
              </Text>
            )}
          </Box>
        )}

        {/* Logs tab */}
        {activeTab === 'logs' && (
          <Box flexDirection="column">
            {logs.length === 0 ? (
              <Text color="gray">No logs available</Text>
            ) : (
              <>
                {logs.slice(logScrollOffset, logScrollOffset + 15).map((line, idx) => (
                  <Text key={idx} wrap="truncate">
                    {truncate(line, 80)}
                  </Text>
                ))}
                {logs.length > 15 && (
                  <Text color="gray">
                    Lines {logScrollOffset + 1}-{Math.min(logScrollOffset + 15, logs.length)} of {logs.length}
                    (j/k to scroll, g/G for top/bottom)
                  </Text>
                )}
              </>
            )}
          </Box>
        )}
      </Box>
    </Panel>
  );
};
