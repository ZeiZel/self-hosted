/**
 * Structured Error Interfaces for TUI Deployment
 *
 * This module defines interfaces for structured error handling,
 * supporting multiple error sources (Ansible, Helmfile, kubectl, shell)
 * with actionable suggestions and debugging context.
 */

/**
 * Source of the structured error
 */
export type ErrorSource = 'ansible' | 'helmfile' | 'kubectl' | 'shell';

/**
 * Type of Ansible error
 */
export type AnsibleErrorType = 'task_failed' | 'host_unreachable' | 'syntax_error' | 'unknown';

/**
 * Parsed Ansible error from structured JSON output
 */
export interface AnsibleError {
  /** Type of Ansible error */
  type: AnsibleErrorType;
  /** Name of the failed task */
  taskName: string;
  /** Host where the error occurred */
  host: string;
  /** Ansible play name */
  play: string;
  /** Ansible role name if applicable */
  role?: string;
  /** Ansible module/action that failed */
  action: string;
  /** Error status (failed, unreachable, etc.) */
  status: string;
  /** Human-readable error message */
  message: string;
  /** Actionable suggestion for fixing the error */
  suggestion: string;
  /** Stderr output from the failed task */
  stderr: string;
  /** Stdout output from the failed task */
  stdout: string;
  /** Return code from the failed command */
  rc: number;
  /** ISO timestamp of when the error occurred */
  timestamp: string;
  /** Path to Ansible trace file for debugging */
  tracePath: string;
  /** Additional context about the error */
  context: AnsibleErrorContext;
}

/**
 * Context information for Ansible error
 */
export interface AnsibleErrorContext {
  /** Name of the previous task */
  previousTask?: string;
  /** Status of the previous task */
  previousTaskStatus?: string;
  /** Playbook being executed */
  playbook: string;
  /** Tags being used */
  tags: string[];
}

/**
 * Details of a structured error
 */
export interface StructuredErrorDetails {
  /** Host where the error occurred (for remote execution) */
  host?: string;
  /** Task name that failed */
  task?: string;
  /** Role that contains the failed task */
  role?: string;
  /** Action/module that failed */
  action?: string;
  /** Exit code from the command */
  exitCode: number;
  /** Stderr output */
  stderr: string;
  /** Stdout output */
  stdout: string;
}

/**
 * Generic structured error that can come from multiple sources
 */
export interface StructuredError {
  /** Source system that generated the error */
  source: ErrorSource;
  /** Type of error */
  type: string;
  /** Human-readable error message */
  message: string;
  /** Actionable suggestion for fixing the error */
  suggestion: string;
  /** Path to trace/debug file */
  tracePath?: string;
  /** Detailed error information */
  details: StructuredErrorDetails;
  /** Additional context as key-value pairs */
  context?: Record<string, unknown>;
}

/**
 * Extended LogLine interface with optional structured error
 */
export interface LogLineWithError {
  /** ISO timestamp of log entry */
  timestamp: Date;
  /** Log level/severity */
  level: 'debug' | 'info' | 'warn' | 'error';
  /** Log message content */
  message: string;
  /** Source of log (stdout, stderr, system) */
  source: 'stdout' | 'stderr' | 'system';
  /** Task ID this log belongs to */
  taskId: string;
  /** Structured error if this log represents one */
  structuredError?: StructuredError;
}

/**
 * Convert AnsibleError to generic StructuredError
 */
export function ansibleErrorToStructured(error: AnsibleError): StructuredError {
  return {
    source: 'ansible',
    type: error.type,
    message: error.message,
    suggestion: error.suggestion,
    tracePath: error.tracePath,
    details: {
      host: error.host,
      task: error.taskName,
      role: error.role,
      action: error.action,
      exitCode: error.rc,
      stderr: error.stderr,
      stdout: error.stdout,
    },
    context: {
      play: error.play,
      playbook: error.context.playbook,
      tags: error.context.tags,
      previousTask: error.context.previousTask,
      previousTaskStatus: error.context.previousTaskStatus,
    },
  };
}

/**
 * Create a generic structured error from shell command failure
 */
export function createShellError(
  message: string,
  exitCode: number,
  stderr: string,
  stdout: string,
  suggestion?: string
): StructuredError {
  return {
    source: 'shell',
    type: 'command_failed',
    message,
    suggestion: suggestion || 'Check command syntax and ensure required dependencies are installed.',
    details: {
      exitCode,
      stderr,
      stdout,
    },
  };
}

/**
 * Create a structured error from Helmfile failure
 */
export function createHelmfileError(
  message: string,
  exitCode: number,
  stderr: string,
  stdout: string,
  suggestion?: string
): StructuredError {
  return {
    source: 'helmfile',
    type: 'helmfile_failed',
    message,
    suggestion: suggestion || 'Check Helm chart configuration and Kubernetes connectivity.',
    details: {
      exitCode,
      stderr,
      stdout,
    },
  };
}

/**
 * Create a structured error from kubectl failure
 */
export function createKubectlError(
  message: string,
  exitCode: number,
  stderr: string,
  stdout: string,
  suggestion?: string
): StructuredError {
  return {
    source: 'kubectl',
    type: 'kubectl_failed',
    message,
    suggestion: suggestion || 'Check Kubernetes cluster connectivity and resource configuration.',
    details: {
      exitCode,
      stderr,
      stdout,
    },
  };
}
