/**
 * TUI Services Module
 *
 * This module exports all services used by the deployment TUI,
 * including DAG management, task execution, and state handling.
 */

// ============================================================================
// Service Classes (runtime values)
// ============================================================================

// DAG Manager - Core orchestration service
export { DAGManagerService } from './dag-manager.service';

// Task Executor - Parallel task execution service
export { TaskExecutorService } from './task-executor.service';

// Task Builder - Builds DAG from enabled services
export { TaskBuilderService } from './task-builder.service';

// Deploy TUI Service - Main orchestration service
export { DeployTuiService } from './deploy-tui.service';

// ============================================================================
// Type-only exports
// ============================================================================

// Deploy TUI types
export type { TUIDeployOptions, DeployTuiEvent } from './deploy-tui.service';

// ============================================================================
// Utility Functions (runtime values)
// ============================================================================

// Ansible Error Parser - Structured error parsing from Ansible output
export {
  parseAnsibleError,
  parseAnsibleErrorToStructured,
  parseAnsibleErrors,
  isAnsibleErrorLine,
  formatAnsibleErrorSummary,
  getErrorSeverity,
} from './ansible-error-parser';
