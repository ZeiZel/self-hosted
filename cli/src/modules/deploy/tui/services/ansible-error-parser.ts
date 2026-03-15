/**
 * Ansible Error Parser Service
 *
 * Parses structured error output from Ansible playbooks.
 * Ansible outputs errors in JSON format with the prefix:
 * ANSIBLE_ERROR_JSON:{...}
 *
 * This parser extracts the JSON and converts it to a typed AnsibleError object.
 */

import {
  AnsibleError,
  AnsibleErrorType,
  AnsibleErrorContext,
  StructuredError,
  ansibleErrorToStructured,
} from '../interfaces/error.interface';

/**
 * Prefix used by Ansible callback plugin to output structured errors
 */
const ANSIBLE_ERROR_PREFIX = 'ANSIBLE_ERROR_JSON:';

/**
 * Raw error data structure from Ansible JSON output
 */
interface RawAnsibleErrorData {
  error?: {
    type?: string;
    task_name?: string;
    host?: string;
    play?: string;
    role?: string;
    action?: string;
    status?: string;
    message?: string;
    suggestion?: string;
    stderr?: string;
    stdout?: string;
    rc?: number;
    timestamp?: string;
    trace_path?: string;
    context?: {
      previous_task?: string;
      previous_task_status?: string;
      playbook?: string;
      tags?: string[];
    };
  };
}

/**
 * Parse an Ansible error type string to enum
 */
function parseErrorType(type: string | undefined): AnsibleErrorType {
  switch (type) {
    case 'task_failed':
      return 'task_failed';
    case 'host_unreachable':
      return 'host_unreachable';
    case 'syntax_error':
      return 'syntax_error';
    default:
      return 'unknown';
  }
}

/**
 * Parse a line of output to extract an Ansible error if present
 *
 * @param line - Output line to parse
 * @returns Parsed AnsibleError or null if not an error line
 *
 * @example
 * ```typescript
 * const line = 'ANSIBLE_ERROR_JSON:{"error":{"type":"task_failed","message":"Failed"}}';
 * const error = parseAnsibleError(line);
 * if (error) {
 *   console.log(error.message); // "Failed"
 * }
 * ```
 */
export function parseAnsibleError(line: string): AnsibleError | null {
  // Check for error prefix
  const prefixIndex = line.indexOf(ANSIBLE_ERROR_PREFIX);
  if (prefixIndex === -1) {
    return null;
  }

  // Extract JSON portion
  const jsonStart = prefixIndex + ANSIBLE_ERROR_PREFIX.length;
  const jsonStr = line.slice(jsonStart).trim();

  // Try to parse JSON
  try {
    const data: RawAnsibleErrorData = JSON.parse(jsonStr);

    // Validate that we have error data
    if (!data.error) {
      return null;
    }

    const errorData = data.error;

    // Build context object
    const context: AnsibleErrorContext = {
      previousTask: errorData.context?.previous_task,
      previousTaskStatus: errorData.context?.previous_task_status,
      playbook: errorData.context?.playbook ?? 'unknown',
      tags: errorData.context?.tags ?? [],
    };

    // Build and return AnsibleError
    const ansibleError: AnsibleError = {
      type: parseErrorType(errorData.type),
      taskName: errorData.task_name ?? 'Unknown Task',
      host: errorData.host ?? 'Unknown Host',
      play: errorData.play ?? 'Unknown Play',
      role: errorData.role,
      action: errorData.action ?? 'unknown',
      status: errorData.status ?? 'failed',
      message: errorData.message ?? 'Task failed without error message',
      suggestion: errorData.suggestion ?? 'Check the task configuration and host connectivity.',
      stderr: errorData.stderr ?? '',
      stdout: errorData.stdout ?? '',
      rc: errorData.rc ?? 1,
      timestamp: errorData.timestamp ?? new Date().toISOString(),
      tracePath: errorData.trace_path ?? '',
      context,
    };

    return ansibleError;
  } catch {
    // JSON parsing failed - not a valid structured error
    return null;
  }
}

/**
 * Parse a line and convert directly to StructuredError if present
 *
 * @param line - Output line to parse
 * @returns StructuredError or null if not an error line
 */
export function parseAnsibleErrorToStructured(line: string): StructuredError | null {
  const ansibleError = parseAnsibleError(line);
  if (!ansibleError) {
    return null;
  }
  return ansibleErrorToStructured(ansibleError);
}

/**
 * Check if a line contains an Ansible structured error
 *
 * @param line - Output line to check
 * @returns true if line contains ANSIBLE_ERROR_JSON prefix
 */
export function isAnsibleErrorLine(line: string): boolean {
  return line.includes(ANSIBLE_ERROR_PREFIX);
}

/**
 * Extract multiple errors from a multi-line output
 *
 * @param output - Multi-line output string
 * @returns Array of parsed AnsibleError objects
 */
export function parseAnsibleErrors(output: string): AnsibleError[] {
  const lines = output.split('\n');
  const errors: AnsibleError[] = [];

  for (const line of lines) {
    const error = parseAnsibleError(line);
    if (error) {
      errors.push(error);
    }
  }

  return errors;
}

/**
 * Generate a human-readable error summary
 *
 * @param error - AnsibleError to summarize
 * @returns Formatted error summary string
 */
export function formatAnsibleErrorSummary(error: AnsibleError): string {
  const lines: string[] = [];

  lines.push(`[${error.type.toUpperCase()}] ${error.message}`);

  if (error.host && error.host !== 'Unknown Host') {
    lines.push(`Host: ${error.host}`);
  }

  if (error.taskName && error.taskName !== 'Unknown Task') {
    lines.push(`Task: ${error.taskName}`);
  }

  if (error.role) {
    lines.push(`Role: ${error.role}`);
  }

  if (error.suggestion) {
    lines.push(`Suggestion: ${error.suggestion}`);
  }

  if (error.tracePath) {
    lines.push(`Trace: ${error.tracePath}`);
  }

  return lines.join('\n');
}

/**
 * Determine error severity based on error type
 *
 * @param error - AnsibleError to evaluate
 * @returns Severity level ('critical' | 'high' | 'medium' | 'low')
 */
export function getErrorSeverity(error: AnsibleError): 'critical' | 'high' | 'medium' | 'low' {
  switch (error.type) {
    case 'syntax_error':
      return 'critical'; // Syntax errors prevent any execution
    case 'host_unreachable':
      return 'high'; // Host issues block deployment
    case 'task_failed':
      return 'medium'; // Individual task failures may be recoverable
    default:
      return 'low';
  }
}
