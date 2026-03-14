import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ServiceMetrics, PodStatus } from '../../../../interfaces/monitor.interface';
import { Panel } from './Panel';

interface ServicesPanelProps {
  services: ServiceMetrics[];
  focused: boolean;
  expanded: boolean;
  searchQuery: string;
  searchActive: boolean;
}

type GroupMode = 'none' | 'node' | 'namespace' | 'status';

export const ServicesPanel: React.FC<ServicesPanelProps> = ({
  services,
  focused,
  expanded,
  searchQuery,
  searchActive,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [groupMode, setGroupMode] = useState<GroupMode>('node');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Filter services by search query
  const filteredServices = useMemo(() => {
    if (!searchQuery) return services;
    const q = searchQuery.toLowerCase();
    return services.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.namespace.toLowerCase().includes(q) ||
      s.node.toLowerCase().includes(q)
    );
  }, [services, searchQuery]);

  // Group services
  const groups = useMemo(() => {
    if (groupMode === 'none') {
      return [{ key: 'all', services: filteredServices }];
    }

    const map = new Map<string, ServiceMetrics[]>();
    for (const svc of filteredServices) {
      const key = groupMode === 'node' ? svc.node
        : groupMode === 'namespace' ? svc.namespace
        : svc.status;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(svc);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, services]) => ({ key, services }));
  }, [filteredServices, groupMode]);

  useInput((input, key) => {
    if (!focused) return;

    if (key.downArrow || input === 'j') {
      setSelectedIndex(i => Math.min(i + 1, filteredServices.length - 1));
    }
    if (key.upArrow || input === 'k') {
      setSelectedIndex(i => Math.max(i - 1, 0));
    }
    if (input === 'g' && !key.shift) {
      setSelectedIndex(0);
    }
    if (input === 'G') {
      setSelectedIndex(filteredServices.length - 1);
    }
    // Cycle group mode
    if (input === 'g' && !searchActive) {
      const modes: GroupMode[] = ['none', 'node', 'namespace', 'status'];
      const idx = modes.indexOf(groupMode);
      setGroupMode(modes[(idx + 1) % modes.length]);
    }
    // Toggle collapse
    if (input === 'c') {
      const group = getCurrentGroup();
      if (group) {
        setCollapsedGroups(prev => {
          const next = new Set(prev);
          if (next.has(group)) {
            next.delete(group);
          } else {
            next.add(group);
          }
          return next;
        });
      }
    }
  });

  const getCurrentGroup = (): string | null => {
    if (groupMode === 'none') return null;
    let count = 0;
    for (const group of groups) {
      if (selectedIndex <= count) return group.key;
      count++;
      if (!collapsedGroups.has(group.key)) {
        count += group.services.length;
      }
    }
    return null;
  };

  const getStatusIcon = (status: PodStatus): { icon: string; color: string } => {
    switch (status) {
      case 'Running': return { icon: '●', color: 'green' };
      case 'Succeeded': return { icon: '✓', color: 'green' };
      case 'Pending': return { icon: '◐', color: 'yellow' };
      case 'Failed': return { icon: '✖', color: 'red' };
      case 'CrashLoopBackOff': return { icon: '⟳', color: 'red' };
      case 'ImagePullBackOff': return { icon: '↓', color: 'yellow' };
      case 'Error': return { icon: '!', color: 'red' };
      case 'Terminating': return { icon: '◌', color: 'gray' };
      default: return { icon: '?', color: 'gray' };
    }
  };

  const formatMemory = (bytes: number): string => {
    if (bytes === 0) return '0';
    const k = 1024;
    const sizes = ['B', 'K', 'M', 'G'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.floor(bytes / Math.pow(k, i))}${sizes[i]}`;
  };

  const title = `SERVICES [3] ${searchActive ? `/ ${searchQuery}_` : `[g:${groupMode}]`}`;

  return (
    <Panel title={title} focused={focused}>
      {/* Header */}
      <Box>
        <Text color="gray">
          {'  '}NAME{' '.repeat(14)}NAMESPACE{' '.repeat(5)}NODE{' '.repeat(10)}MEM{' '.repeat(4)}ST  AGE   RST
        </Text>
      </Box>

      {groupMode === 'none' ? (
        // Flat list
        filteredServices.slice(0, expanded ? 50 : 8).map((svc, idx) => {
          const isSelected = idx === selectedIndex;
          const { icon, color } = getStatusIcon(svc.status);

          return (
            <Box key={`${svc.namespace}/${svc.name}`}>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? '▶' : ' '}
              </Text>
              <Text bold={isSelected}>
                {svc.name.slice(0, 15).padEnd(16)}
              </Text>
              <Text>{svc.namespace.slice(0, 12).padEnd(13)}</Text>
              <Text>{svc.node.slice(0, 12).padEnd(13)}</Text>
              <Text>{formatMemory(svc.memory.requested).padEnd(6)}</Text>
              <Text color={color}>{icon}</Text>
              <Text>  {svc.age.padEnd(5)}</Text>
              <Text color={svc.restarts > 2 ? 'red' : svc.restarts > 0 ? 'yellow' : 'green'}>
                {String(svc.restarts).padStart(3)}
              </Text>
            </Box>
          );
        })
      ) : (
        // Grouped list
        groups.map(group => {
          const isCollapsed = collapsedGroups.has(group.key);

          return (
            <Box key={group.key} flexDirection="column">
              <Box>
                <Text bold>
                  {isCollapsed ? '▶' : '▼'} {group.key} ({group.services.length})
                </Text>
              </Box>
              {!isCollapsed && group.services.slice(0, expanded ? 20 : 5).map((svc, idx) => {
                const { icon, color } = getStatusIcon(svc.status);

                return (
                  <Box key={`${svc.namespace}/${svc.name}`} marginLeft={2}>
                    <Text>
                      {svc.name.slice(0, 15).padEnd(16)}
                    </Text>
                    <Text>{svc.namespace.slice(0, 12).padEnd(13)}</Text>
                    <Text>{formatMemory(svc.memory.requested).padEnd(6)}</Text>
                    <Text color={color}>{icon}</Text>
                    <Text>  {svc.age.padEnd(5)}</Text>
                    <Text color={svc.restarts > 2 ? 'red' : svc.restarts > 0 ? 'yellow' : 'green'}>
                      {String(svc.restarts).padStart(3)}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          );
        })
      )}

      {filteredServices.length === 0 && (
        <Text color="gray">No services found</Text>
      )}
    </Panel>
  );
};
