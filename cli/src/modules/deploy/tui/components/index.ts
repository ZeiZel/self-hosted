/**
 * Deployment TUI Components
 *
 * This module exports all React (Ink) components for the deployment TUI.
 * These components provide a rich terminal interface for monitoring
 * and controlling deployment operations.
 *
 * Main components:
 * - DeployApp: Root application component with layout management
 * - DeployHeader: Progress bar, phase indicator, ETA
 * - DeployFooter: Keyboard shortcuts, elapsed time, status
 * - LogPanel: Scrollable log viewer with filtering
 * - TaskPanel: Task list organized by phases
 * - HelpOverlay: Keyboard shortcuts help modal
 * - ConfirmDialog: Modal confirmation dialogs
 *
 * Usage:
 * ```tsx
 * import { render } from 'ink';
 * import { DeployApp } from './components';
 * import { createInitialTUIState } from '../interfaces';
 *
 * const state = createInitialTUIState();
 * render(
 *   <DeployApp
 *     initialState={state}
 *     onAbort={handleAbort}
 *     onPauseToggle={handlePause}
 *   />
 * );
 * ```
 */

// Main application component
export { DeployApp, tuiReducer } from './DeployApp';
export type { DeployAppProps } from './DeployApp';

// Header and footer components
export { DeployHeader } from './DeployHeader';
export type { DeployHeaderProps } from './DeployHeader';

export { DeployFooter } from './DeployFooter';
export type { DeployFooterProps } from './DeployFooter';

// Panel components
export { LogPanel } from './LogPanel';
export type { LogPanelProps } from './LogPanel';

export { TaskPanel } from './TaskPanel';
export type { TaskPanelProps } from './TaskPanel';

// Task display components
export { TaskItem, getStatusIcon, getStatusColor } from './TaskItem';
export type { TaskItemProps } from './TaskItem';

export { PhaseGroup } from './PhaseGroup';
export type { PhaseGroupProps } from './PhaseGroup';

// UI components
export { ProgressBar } from './ProgressBar';
export type { ProgressBarProps } from './ProgressBar';

export { HelpOverlay, HelpBar } from './HelpOverlay';
export type { HelpOverlayProps, HelpBarProps } from './HelpOverlay';

export { ConfirmDialog, DialogOverlay } from './ConfirmDialog';
export type { ConfirmDialogProps, DialogOverlayProps } from './ConfirmDialog';

// Error display components
export { ErrorDisplay, ErrorSummary, ErrorCountBadge } from './ErrorDisplay';
export type { ErrorDisplayProps, ErrorSummaryProps, ErrorCountBadgeProps } from './ErrorDisplay';
