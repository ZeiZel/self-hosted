import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ServiceMetrics, PodStatus } from '../../../../interfaces/monitor.interface';
import { Panel } from './Panel';
import { calculateVisibleItems, calculateScrollOffset } from '../hooks/useTerminalSize';
import { truncate, fitWidth } from '../utils/text-truncate';

interface ServicesPanelProps {
  services: ServiceMetrics[];
  focused: boolean;
  expanded: boolean;
  searchQuery: string;
  searchActive: boolean;
  maxHeight?: number;
}

type GroupMode = 'none' | 'node' | 'namespace' | 'status' | 'helm';

export const ServicesPanel: React.FC<ServicesPanelProps> = ({
  services,
  focused,
  expanded,
  searchQuery,
  searchActive,
  maxHeight,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [groupMode, setGroupMode] = useState<GroupMode>('node');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [scrollOffset, setScrollOffset] = useState(0);

  // Calculate visible items based on height (header takes 1 line)
  const visibleCount = useMemo(() => {
    if (!maxHeight) return expanded ? 50 : 8;
    return calculateVisibleItems(maxHeight, 1, 1);
  }, [maxHeight, expanded]);

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
      let key: string;
      switch (groupMode) {
        case 'node':
          key = svc.node;
          break;
        case 'namespace':
          key = svc.namespace;
          break;
        case 'helm':
          key = svc.helmRelease || svc.helmChart || '(no helm release)';
          break;
        case 'status':
        default:
          key = svc.status;
          break;
      }
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
      const newIndex = Math.min(selectedIndex + 1, filteredServices.length - 1);
      setSelectedIndex(newIndex);
      setScrollOffset(calculateScrollOffset(newIndex, visibleCount, filteredServices.length, scrollOffset));
    }
    if (key.upArrow || input === 'k') {
      const newIndex = Math.max(selectedIndex - 1, 0);
      setSelectedIndex(newIndex);
      setScrollOffset(calculateScrollOffset(newIndex, visibleCount, filteredServices.length, scrollOffset));
    }
    if (input === 'g' && !key.shift && !searchActive) {
      // Cycle group mode when pressing 'g' alone
      const modes: GroupMode[] = ['none', 'node', 'namespace', 'status', 'helm'];
      const idx = modes.indexOf(groupMode);
      setGroupMode(modes[(idx + 1) % modes.length]);
    }
    if (input === 'G') {
      const newIndex = filteredServices.length - 1;
      setSelectedIndex(newIndex);
      setScrollOffset(calculateScrollOffset(newIndex, visibleCount, filteredServices.length, scrollOffset));
    }
    // Home key behavior for gg
    if (key.ctrl && input === 'g') {
      setSelectedIndex(0);
      setScrollOffset(0);
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

  // Calculate scroll indicators
  const hasScrollUp = scrollOffset > 0;
  const hasScrollDown = scrollOffset + visibleCount < filteredServices.length;
  const scrollIndicator = filteredServices.length > visibleCount
    ? ` ${scrollOffset + 1}-${Math.min(scrollOffset + visibleCount, filteredServices.length)}/${filteredServices.length}`
    : '';

  const title = `SERVICES [3] ${searchActive ? `/ ${searchQuery}_` : `[g:${groupMode}]`}${scrollIndicator}`;

  // Get visible services based on scroll offset
  const visibleServices = filteredServices.slice(scrollOffset, scrollOffset + visibleCount);

  return (
    <Panel title={title} focused={focused}>
      {/* Header */}
      <Box>
        <Text color="gray">
          {'  '}NAME{' '.repeat(14)}NAMESPACE{' '.repeat(5)}NODE{' '.repeat(10)}MEM{' '.repeat(4)}ST  AGE   RST
        </Text>
      </Box>

      {hasScrollUp && <Text color="gray">  ↑ more</Text>}

      {groupMode === 'none' ? (
        // Flat list with proper scrolling
        visibleServices.map((svc, idx) => {
          const actualIndex = scrollOffset + idx;
          const isSelected = actualIndex === selectedIndex;
          const { icon, color } = getStatusIcon(svc.status);

          return (
            <Box key={`${svc.namespace}/${svc.name}`}>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? '▶' : ' '}
              </Text>
              <Text bold={isSelected}>
                {fitWidth(svc.name, 15).padEnd(16)}
              </Text>
              <Text>{fitWidth(svc.namespace, 12).padEnd(13)}</Text>
              <Text>{fitWidth(svc.node, 12).padEnd(13)}</Text>
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
        // Grouped list with dynamic item count
        groups.map(group => {
          const isCollapsed = collapsedGroups.has(group.key);
          const groupItemCount = Math.max(3, Math.floor(visibleCount / groups.length));

          return (
            <Box key={group.key} flexDirection="column">
              <Box>
                <Text bold>
                  {isCollapsed ? '▶' : '▼'} {truncate(group.key, 20)} ({group.services.length})
                </Text>
              </Box>
              {!isCollapsed && group.services.slice(0, groupItemCount).map((svc, idx) => {
                const { icon, color } = getStatusIcon(svc.status);

                return (
                  <Box key={`${svc.namespace}/${svc.name}`} marginLeft={2}>
                    <Text>
                      {fitWidth(svc.name, 15).padEnd(16)}
                    </Text>
                    <Text>{fitWidth(svc.namespace, 12).padEnd(13)}</Text>
                    <Text>{formatMemory(svc.memory.requested).padEnd(6)}</Text>
                    <Text color={color}>{icon}</Text>
                    <Text>  {svc.age.padEnd(5)}</Text>
                    <Text color={svc.restarts > 2 ? 'red' : svc.restarts > 0 ? 'yellow' : 'green'}>
                      {String(svc.restarts).padStart(3)}
                    </Text>
                  </Box>
                );
              })}
              {!isCollapsed && group.services.length > groupItemCount && (
                <Box marginLeft={2}>
                  <Text color="gray">  ... {group.services.length - groupItemCount} more</Text>
                </Box>
              )}
            </Box>
          );
        })
      )}

      {hasScrollDown && <Text color="gray">  ↓ more</Text>}

      {filteredServices.length === 0 && (
        <Text color="gray">No services found</Text>
      )}
    </Panel>
  );
};
