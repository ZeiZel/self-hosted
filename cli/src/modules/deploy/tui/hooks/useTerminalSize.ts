/**
 * Terminal size hook for deployment TUI
 *
 * Provides reactive terminal dimensions and layout calculations
 * specific to the deployment dashboard layout.
 */

import { useState, useEffect } from 'react';
import { useStdout } from 'ink';

/**
 * Terminal size dimensions
 */
export interface TerminalSize {
  width: number;
  height: number;
}

/**
 * Layout configuration for deployment TUI
 */
export interface DeployLayoutConfig {
  /** Height of header section (progress bar, phase info) */
  headerHeight: number;
  /** Height of footer section (shortcuts, status) */
  footerHeight: number;
  /** Height of main content area */
  contentHeight: number;
  /** Width of log panel (left side) */
  logPanelWidth: number;
  /** Width of task panel (right side) */
  taskPanelWidth: number;
  /** Whether terminal is in compact mode */
  isCompact: boolean;
  /** Split ratio (0-1, log panel width ratio) */
  splitRatio: number;
}

/**
 * Hook result type
 */
export interface UseTerminalSizeResult extends TerminalSize {
  layout: DeployLayoutConfig;
}

/**
 * Default split ratio (60% logs, 40% tasks)
 */
const DEFAULT_SPLIT_RATIO = 0.6;

/**
 * Hook for tracking terminal size and computing responsive layout
 * for the deployment TUI.
 */
export function useTerminalSize(splitRatio: number = DEFAULT_SPLIT_RATIO): UseTerminalSizeResult {
  const { stdout } = useStdout();

  const getSize = (): TerminalSize => ({
    width: stdout?.columns ?? 120,
    height: stdout?.rows ?? 40,
  });

  const [size, setSize] = useState<TerminalSize>(getSize());

  useEffect(() => {
    const handleResize = () => {
      setSize(getSize());
    };

    stdout?.on('resize', handleResize);

    return () => {
      stdout?.off('resize', handleResize);
    };
  }, [stdout]);

  // Calculate responsive layout
  const layout = calculateLayout(size, splitRatio);

  return { ...size, layout };
}

/**
 * Calculate layout dimensions based on terminal size
 */
function calculateLayout(size: TerminalSize, splitRatio: number): DeployLayoutConfig {
  const { width, height } = size;

  // Fixed heights for header and footer
  const headerHeight = 4; // Progress bar + phase info + borders
  const footerHeight = 3; // Shortcuts + status + borders

  // Available height for content
  const contentHeight = Math.max(10, height - headerHeight - footerHeight);

  // Compact mode for small terminals (less than 30 rows or 100 columns)
  const isCompact = height < 30 || width < 100;

  // In compact mode, use more space for logs
  const effectiveSplitRatio = isCompact ? 0.55 : splitRatio;

  // Calculate panel widths
  const logPanelWidth = Math.floor(width * effectiveSplitRatio);
  const taskPanelWidth = width - logPanelWidth;

  return {
    headerHeight,
    footerHeight,
    contentHeight,
    logPanelWidth,
    taskPanelWidth,
    isCompact,
    splitRatio: effectiveSplitRatio,
  };
}

/**
 * Calculate number of visible lines for a scrolling panel
 *
 * @param containerHeight - Total height of the container
 * @param borderLines - Lines used by borders (default: 2 for top/bottom)
 * @param headerLines - Lines used by panel header (default: 1)
 * @param footerLines - Lines used by panel footer (default: 0)
 */
export function calculateVisibleLines(
  containerHeight: number,
  borderLines: number = 2,
  headerLines: number = 1,
  footerLines: number = 0
): number {
  const usableHeight = containerHeight - borderLines - headerLines - footerLines;
  return Math.max(1, usableHeight);
}

/**
 * Calculate scroll offset to keep a selected item in view
 *
 * @param selectedIndex - Index of the currently selected item
 * @param visibleItems - Number of items visible in the viewport
 * @param totalItems - Total number of items in the list
 * @param currentOffset - Current scroll offset
 * @param padding - Number of items to keep visible above/below selection
 */
export function calculateScrollOffset(
  selectedIndex: number,
  visibleItems: number,
  totalItems: number,
  currentOffset: number = 0,
  padding: number = 2
): number {
  // Clamp selected index to valid range
  const clampedIndex = Math.max(0, Math.min(selectedIndex, totalItems - 1));

  // Calculate the visible range with padding
  const minVisibleIndex = currentOffset + padding;
  const maxVisibleIndex = currentOffset + visibleItems - padding - 1;

  // Adjust offset if selected item is outside the visible range
  if (clampedIndex < minVisibleIndex) {
    return Math.max(0, clampedIndex - padding);
  }
  if (clampedIndex > maxVisibleIndex) {
    return Math.min(
      totalItems - visibleItems,
      clampedIndex - visibleItems + padding + 1
    );
  }

  // Keep current offset if selection is visible
  return Math.max(0, Math.min(currentOffset, totalItems - visibleItems));
}

/**
 * Format terminal size for display
 */
export function formatTerminalSize(size: TerminalSize): string {
  return `${size.width}x${size.height}`;
}
