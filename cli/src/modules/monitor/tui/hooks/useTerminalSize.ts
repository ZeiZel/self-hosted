import { useState, useEffect } from 'react';
import { useStdout } from 'ink';

/**
 * Terminal size dimensions
 */
export interface TerminalSize {
  width: number;
  height: number;
  columns: number;
  rows: number;
}

/**
 * Layout configuration based on terminal size
 */
export interface LayoutConfig {
  topRowHeight: number;
  middleRowHeight: number;
  bottomRowHeight: number;
  statusBarHeight: number;
  leftColumnWidth: string;
  rightColumnWidth: string;
  isCompact: boolean;
}

/**
 * Hook for tracking terminal size and computing responsive layout
 */
export function useTerminalSize(): TerminalSize & { layout: LayoutConfig } {
  const { stdout } = useStdout();

  const getSize = (): TerminalSize => ({
    width: stdout?.columns ?? 80,
    height: stdout?.rows ?? 24,
    columns: stdout?.columns ?? 80,
    rows: stdout?.rows ?? 24,
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
  const layout = calculateLayout(size);

  return { ...size, layout };
}

/**
 * Calculate layout dimensions based on terminal size
 */
function calculateLayout(size: TerminalSize): LayoutConfig {
  const { rows, columns } = size;

  // Status bar takes 2 lines (title + border)
  const statusBarHeight = 2;
  const availableHeight = rows - statusBarHeight;

  // Compact mode for small terminals (less than 30 rows)
  const isCompact = rows < 30;

  let topRowHeight: number;
  let middleRowHeight: number;
  let bottomRowHeight: number;

  if (isCompact) {
    // Compact layout: minimize space usage
    topRowHeight = Math.max(6, Math.floor(availableHeight * 0.35));
    middleRowHeight = Math.max(4, Math.floor(availableHeight * 0.40));
    bottomRowHeight = Math.max(3, availableHeight - topRowHeight - middleRowHeight);
  } else {
    // Normal layout: proportional distribution
    // 35% top (nodes + summary), 45% middle (services), 20% bottom (alerts)
    topRowHeight = Math.max(8, Math.floor(availableHeight * 0.35));
    middleRowHeight = Math.max(6, Math.floor(availableHeight * 0.45));
    bottomRowHeight = Math.max(4, availableHeight - topRowHeight - middleRowHeight);
  }

  // Column widths based on terminal width
  const leftColumnWidth = columns >= 120 ? '60%' : '55%';
  const rightColumnWidth = columns >= 120 ? '40%' : '45%';

  return {
    topRowHeight,
    middleRowHeight,
    bottomRowHeight,
    statusBarHeight,
    leftColumnWidth,
    rightColumnWidth,
    isCompact,
  };
}

/**
 * Calculate number of visible items for a scrolling list
 */
export function calculateVisibleItems(
  containerHeight: number,
  itemHeight: number = 1,
  headerHeight: number = 1,
): number {
  // Account for borders (2 lines) and header
  const usableHeight = containerHeight - 2 - headerHeight;
  return Math.max(1, Math.floor(usableHeight / itemHeight));
}

/**
 * Calculate scroll offset for a list with a selected item
 */
export function calculateScrollOffset(
  selectedIndex: number,
  visibleItems: number,
  totalItems: number,
  currentOffset: number = 0,
): number {
  // Ensure selected item is visible
  if (selectedIndex < currentOffset) {
    // Selected above viewport, scroll up
    return selectedIndex;
  }
  if (selectedIndex >= currentOffset + visibleItems) {
    // Selected below viewport, scroll down
    return selectedIndex - visibleItems + 1;
  }
  // Selected within viewport, keep current offset
  return Math.max(0, Math.min(currentOffset, totalItems - visibleItems));
}
