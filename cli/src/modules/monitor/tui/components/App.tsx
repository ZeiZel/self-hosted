import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp, useFocus, useFocusManager } from 'ink';
import type { ClusterState, NodeMetrics, ServiceMetrics, Alert } from '../../../../interfaces/monitor.interface';
import { NodesPanel } from './NodesPanel';
import { ServicesPanel } from './ServicesPanel';
import { SummaryPanel } from './SummaryPanel';
import { AlertsPanel } from './AlertsPanel';
import { PodDetailPanel } from './PodDetailPanel';
import { HelpOverlay } from './HelpOverlay';
import { StatusBar } from './StatusBar';
import type { MetricsHistoryService } from '../data/metrics-history.service';
import { useTerminalSize } from '../hooks/useTerminalSize';

export interface AppProps {
  clusterState: ClusterState | null;
  metricsHistory: MetricsHistoryService;
  onRefresh: () => void;
  onMigrate?: (service: string, namespace: string, targetNode: string) => Promise<void>;
  onGetPodDetails?: (namespace: string, podName: string) => Promise<{ events: any[]; logs: string[] } | null>;
}

type PanelId = 'nodes' | 'services' | 'summary' | 'alerts';

export const App: React.FC<AppProps> = ({
  clusterState,
  metricsHistory,
  onRefresh,
  onMigrate,
  onGetPodDetails,
}) => {
  const { exit } = useApp();
  const { focusNext, focusPrevious } = useFocusManager();
  const { height, width, layout } = useTerminalSize();
  const [activePanel, setActivePanel] = useState<PanelId>('nodes');
  const [expandedPanel, setExpandedPanel] = useState<PanelId | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [selectedServiceIndex, setSelectedServiceIndex] = useState(0);
  const [detailService, setDetailService] = useState<ServiceMetrics | null>(null);
  const [detailData, setDetailData] = useState<{ events: any[]; logs: string[] } | null>(null);

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

    // Show pod details with 'd' key
    if (input === 'd' && activePanel === 'services' && clusterState?.services.length) {
      const service = clusterState.services[selectedServiceIndex];
      if (service) {
        setDetailService(service);
        // Fetch additional details if callback provided
        if (onGetPodDetails) {
          onGetPodDetails(service.namespace, service.name).then(data => {
            setDetailData(data);
          });
        }
      }
      return;
    }
  });

  // Handle service selection changes from ServicesPanel
  const handleServiceSelect = useCallback((index: number) => {
    setSelectedServiceIndex(index);
  }, []);

  // Close pod detail view
  const handleCloseDetail = useCallback(() => {
    setDetailService(null);
    setDetailData(null);
  }, []);

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

  // Pod detail view
  if (detailService) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <StatusBar
          lastUpdate={clusterState.timestamp}
          activePanel="services"
          expanded={true}
        />
        <PodDetailPanel
          service={detailService}
          onClose={handleCloseDetail}
          events={detailData?.events || []}
          logs={detailData?.logs || []}
        />
      </Box>
    );
  }

  // Expanded panel view - takes full terminal height
  const expandedContentHeight = height - layout.statusBarHeight;
  if (expandedPanel) {
    return (
      <Box flexDirection="column" width={width} height={height}>
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
            maxHeight={expandedContentHeight}
          />
        )}
        {expandedPanel === 'services' && (
          <ServicesPanel
            services={clusterState.services}
            focused={true}
            expanded={true}
            searchQuery={searchQuery}
            searchActive={searchActive}
            maxHeight={expandedContentHeight}
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
            maxHeight={expandedContentHeight}
          />
        )}
      </Box>
    );
  }

  // Normal grid layout - uses dynamic heights from useTerminalSize
  return (
    <Box flexDirection="column" width={width} height={height}>
      <StatusBar
        lastUpdate={clusterState.timestamp}
        activePanel={activePanel}
        expanded={false}
      />

      {/* Top row: Nodes + Summary */}
      <Box flexDirection="row" height={layout.topRowHeight}>
        <Box width={layout.leftColumnWidth}>
          <NodesPanel
            nodes={clusterState.nodes}
            metricsHistory={metricsHistory}
            focused={activePanel === 'nodes'}
            expanded={false}
            maxHeight={layout.topRowHeight}
          />
        </Box>
        <Box width={layout.rightColumnWidth}>
          <SummaryPanel
            summary={clusterState.summary}
            metricsHistory={metricsHistory}
            focused={activePanel === 'summary'}
            expanded={false}
          />
        </Box>
      </Box>

      {/* Middle: Services */}
      <Box height={layout.middleRowHeight}>
        <ServicesPanel
          services={clusterState.services}
          focused={activePanel === 'services'}
          expanded={false}
          searchQuery={searchQuery}
          searchActive={searchActive}
          maxHeight={layout.middleRowHeight}
        />
      </Box>

      {/* Bottom: Alerts */}
      <Box height={layout.bottomRowHeight}>
        <AlertsPanel
          alerts={clusterState.alerts}
          focused={activePanel === 'alerts'}
          expanded={false}
          maxHeight={layout.bottomRowHeight}
        />
      </Box>
    </Box>
  );
};
