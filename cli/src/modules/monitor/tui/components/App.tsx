import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp, useFocus, useFocusManager } from 'ink';
import type { ClusterState, NodeMetrics, ServiceMetrics, Alert } from '../../../../interfaces/monitor.interface';
import { NodesPanel } from './NodesPanel';
import { ServicesPanel } from './ServicesPanel';
import { SummaryPanel } from './SummaryPanel';
import { AlertsPanel } from './AlertsPanel';
import { HelpOverlay } from './HelpOverlay';
import { StatusBar } from './StatusBar';
import type { MetricsHistoryService } from '../data/metrics-history.service';

export interface AppProps {
  clusterState: ClusterState | null;
  metricsHistory: MetricsHistoryService;
  onRefresh: () => void;
  onMigrate?: (service: string, namespace: string, targetNode: string) => Promise<void>;
}

type PanelId = 'nodes' | 'services' | 'summary' | 'alerts';

export const App: React.FC<AppProps> = ({
  clusterState,
  metricsHistory,
  onRefresh,
  onMigrate,
}) => {
  const { exit } = useApp();
  const { focusNext, focusPrevious } = useFocusManager();
  const [activePanel, setActivePanel] = useState<PanelId>('nodes');
  const [expandedPanel, setExpandedPanel] = useState<PanelId | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);

  // Handle keyboard input
  useInput((input, key) => {
    // Global shortcuts
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }

    if (input === '?') {
      setShowHelp(h => !h);
      return;
    }

    if (showHelp) {
      if (key.escape) {
        setShowHelp(false);
      }
      return;
    }

    if (input === 'r') {
      onRefresh();
      return;
    }

    // Search mode
    if (searchActive) {
      if (key.escape) {
        setSearchActive(false);
        setSearchQuery('');
        return;
      }
      if (key.return) {
        setSearchActive(false);
        return;
      }
      if (key.backspace || key.delete) {
        setSearchQuery(q => q.slice(0, -1));
        return;
      }
      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setSearchQuery(q => q + input);
        return;
      }
      return;
    }

    // Expand/collapse
    if (key.return) {
      if (expandedPanel) {
        setExpandedPanel(null);
      } else {
        setExpandedPanel(activePanel);
      }
      return;
    }

    if (key.escape) {
      if (expandedPanel) {
        setExpandedPanel(null);
      }
      return;
    }

    // Panel navigation
    if (key.tab) {
      const panels: PanelId[] = ['nodes', 'summary', 'services', 'alerts'];
      const idx = panels.indexOf(activePanel);
      setActivePanel(panels[(idx + 1) % panels.length]);
      return;
    }

    // Number selection
    if (['1', '2', '3', '4'].includes(input)) {
      const panels: PanelId[] = ['nodes', 'summary', 'services', 'alerts'];
      const idx = parseInt(input, 10) - 1;
      if (idx < panels.length) {
        setActivePanel(panels[idx]);
      }
      return;
    }

    // Vim navigation
    if (input === 'h') {
      const map: Record<PanelId, PanelId> = {
        nodes: 'nodes',
        summary: 'nodes',
        services: 'services',
        alerts: 'services',
      };
      setActivePanel(map[activePanel]);
      return;
    }

    if (input === 'l') {
      const map: Record<PanelId, PanelId> = {
        nodes: 'summary',
        summary: 'summary',
        services: 'alerts',
        alerts: 'alerts',
      };
      setActivePanel(map[activePanel]);
      return;
    }

    if (input === 'k') {
      const map: Record<PanelId, PanelId> = {
        nodes: 'nodes',
        summary: 'summary',
        services: 'nodes',
        alerts: 'summary',
      };
      setActivePanel(map[activePanel]);
      return;
    }

    if (input === 'j') {
      const map: Record<PanelId, PanelId> = {
        nodes: 'services',
        summary: 'alerts',
        services: 'services',
        alerts: 'alerts',
      };
      setActivePanel(map[activePanel]);
      return;
    }

    // Search
    if (input === '/' && activePanel === 'services') {
      setSearchActive(true);
      setSearchQuery('');
      return;
    }
  });

  if (!clusterState) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>selfhost monitor</Text>
        <Text color="gray">Loading cluster data...</Text>
      </Box>
    );
  }

  // Help overlay
  if (showHelp) {
    return <HelpOverlay onClose={() => setShowHelp(false)} />;
  }

  // Expanded panel view
  if (expandedPanel) {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        <StatusBar
          lastUpdate={clusterState.timestamp}
          activePanel={expandedPanel}
          expanded={true}
        />
        {expandedPanel === 'nodes' && (
          <NodesPanel
            nodes={clusterState.nodes}
            metricsHistory={metricsHistory}
            focused={true}
            expanded={true}
          />
        )}
        {expandedPanel === 'services' && (
          <ServicesPanel
            services={clusterState.services}
            focused={true}
            expanded={true}
            searchQuery={searchQuery}
            searchActive={searchActive}
          />
        )}
        {expandedPanel === 'summary' && (
          <SummaryPanel
            summary={clusterState.summary}
            metricsHistory={metricsHistory}
            focused={true}
            expanded={true}
          />
        )}
        {expandedPanel === 'alerts' && (
          <AlertsPanel
            alerts={clusterState.alerts}
            focused={true}
            expanded={true}
          />
        )}
      </Box>
    );
  }

  // Normal grid layout
  return (
    <Box flexDirection="column" width="100%">
      <StatusBar
        lastUpdate={clusterState.timestamp}
        activePanel={activePanel}
        expanded={false}
      />

      {/* Top row: Nodes + Summary */}
      <Box flexDirection="row" height={12}>
        <Box width="60%">
          <NodesPanel
            nodes={clusterState.nodes}
            metricsHistory={metricsHistory}
            focused={activePanel === 'nodes'}
            expanded={false}
          />
        </Box>
        <Box width="40%">
          <SummaryPanel
            summary={clusterState.summary}
            metricsHistory={metricsHistory}
            focused={activePanel === 'summary'}
            expanded={false}
          />
        </Box>
      </Box>

      {/* Middle: Services */}
      <Box height={10}>
        <ServicesPanel
          services={clusterState.services}
          focused={activePanel === 'services'}
          expanded={false}
          searchQuery={searchQuery}
          searchActive={searchActive}
        />
      </Box>

      {/* Bottom: Alerts */}
      <Box height={6}>
        <AlertsPanel
          alerts={clusterState.alerts}
          focused={activePanel === 'alerts'}
          expanded={false}
        />
      </Box>
    </Box>
  );
};
