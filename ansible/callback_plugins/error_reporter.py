# -*- coding: utf-8 -*-
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
"""
Ansible callback plugin for structured error logging.

This plugin captures task failures and unreachable hosts, formats them as JSON,
and generates detailed trace files with intelligent suggestions.

Output format:
- JSON errors are printed to stderr with prefix ANSIBLE_ERROR_JSON:
- Full trace logs are written to configurable error directory
- Suggestions are generated based on common error patterns

Configuration (ansible.cfg):
    [defaults]
    callback_plugins = ./callback_plugins
    callbacks_enabled = error_reporter

    [error_reporter]
    error_dir = /tmp/ansible-errors
    keep_errors = 50

Environment variables:
    ANSIBLE_ERROR_DIR: Override error directory path
    ANSIBLE_ERROR_REPORTER_ENABLED: Set to 'true' to enable (default: enabled)
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from ansible.plugins.callback import CallbackBase
from ansible.executor.task_result import TaskResult

# Import the error report generator and suggestions
# Handle import for both Ansible context and direct execution
try:
    from ansible.module_utils.error_report import ErrorReportGenerator
    from ansible.module_utils.error_suggestions import get_suggestion
except ImportError:
    # Fallback for development/testing - try relative import
    import sys
    module_utils_path = str(Path(__file__).parent.parent / "module_utils")
    if module_utils_path not in sys.path:
        sys.path.insert(0, module_utils_path)
    try:
        from error_report import ErrorReportGenerator
        from error_suggestions import get_suggestion
    except ImportError:
        # Minimal fallback if modules not available
        ErrorReportGenerator = None
        get_suggestion = None


DOCUMENTATION = """
    name: error_reporter
    type: notification
    short_description: Structured JSON error reporting for CLI integration
    version_added: "1.0.0"
    description:
        - Captures task failures and unreachable hosts
        - Outputs structured JSON to stderr for CLI parsing
        - Writes detailed trace logs with intelligent suggestions
        - Provides context about previous tasks and environment
    requirements:
        - Ansible 2.14+
    options:
        error_dir:
            description: Directory to store error trace files
            default: /tmp/ansible-errors
            env:
                - name: ANSIBLE_ERROR_DIR
            ini:
                - section: error_reporter
                  key: error_dir
        keep_errors:
            description: Maximum number of error files to keep
            default: 50
            type: int
            ini:
                - section: error_reporter
                  key: keep_errors
"""


class CallbackModule(CallbackBase):
    """
    Ansible callback plugin for structured error reporting.

    Captures task failures and unreachable hosts, outputs JSON to stderr
    for CLI parsing, and writes detailed trace logs with suggestions.
    """

    CALLBACK_VERSION = 2.0
    CALLBACK_TYPE = "notification"
    CALLBACK_NAME = "error_reporter"
    CALLBACK_NEEDS_ENABLED = True

    def __init__(self, display=None):
        super().__init__(display=display)
        self.errors: list[dict[str, Any]] = []
        self.current_play: str | None = None
        self.current_play_hosts: list[str] = []
        self.current_task: Any = None
        self.current_task_name: str | None = None
        self.previous_task: Any = None
        self.previous_task_name: str | None = None
        self.previous_task_status: str = "unknown"
        self.playbook_file: str | None = None
        self.current_tags: list[str] = []
        self.task_results: dict[str, str] = {}  # host -> status
        self.task_vars: dict[str, Any] = {}  # Captured task variables

        # Configuration
        self.error_dir = Path(
            os.environ.get("ANSIBLE_ERROR_DIR", "/tmp/ansible-errors")
        )
        self.keep_errors = 50

        # Initialize report generator
        self.report_generator: Optional[ErrorReportGenerator] = None
        self._init_report_generator()

    def _init_report_generator(self) -> None:
        """Initialize the error report generator."""
        if ErrorReportGenerator is not None:
            try:
                self.report_generator = ErrorReportGenerator(
                    error_dir=str(self.error_dir),
                    keep_count=self.keep_errors,
                )
            except Exception as e:
                self._display.warning(
                    f"Cannot initialize error report generator: {e}"
                )
                self.report_generator = None
        else:
            # Fallback: ensure directory exists for manual file writing
            self._ensure_error_dir()

    def _ensure_error_dir(self) -> None:
        """Create error directory if it doesn't exist."""
        try:
            self.error_dir.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            self._display.warning(
                f"Cannot create error directory {self.error_dir}: {e}"
            )

    def set_options(self, task_keys=None, var_options=None, direct=None):
        """Load configuration options."""
        super().set_options(task_keys=task_keys, var_options=var_options, direct=direct)

        # Try to get options from configuration
        try:
            error_dir = self.get_option("error_dir")
            if error_dir:
                self.error_dir = Path(error_dir)
        except (AttributeError, KeyError):
            pass

        try:
            keep_errors = self.get_option("keep_errors")
            if keep_errors:
                self.keep_errors = int(keep_errors)
        except (AttributeError, KeyError, ValueError):
            pass

        # Reinitialize report generator with new options
        self._init_report_generator()

    def v2_playbook_on_start(self, playbook) -> None:
        """Capture playbook filename when playbook starts."""
        self.playbook_file = playbook._file_name

    def v2_playbook_on_play_start(self, play) -> None:
        """Capture play information when a new play starts."""
        self.current_play = play.get_name()
        try:
            self.current_play_hosts = play.get_variable_manager().get_inventory().get_hosts(
                play.hosts
            ) if hasattr(play, 'hosts') else []
        except Exception:
            self.current_play_hosts = []

    def v2_playbook_on_task_start(self, task, is_conditional) -> None:
        """Track task transitions for context."""
        # Save previous task info
        if self.current_task is not None:
            self.previous_task = self.current_task
            self.previous_task_name = self.current_task_name
            # Get the status of previous task (last known status)
            self.previous_task_status = "ok"  # Default assumption

        self.current_task = task
        self.current_task_name = task.get_name()
        self.current_tags = list(task.tags) if task.tags else []

    def v2_runner_on_ok(self, result: TaskResult) -> None:
        """Track successful task completion."""
        host = result._host.get_name() if result._host else "unknown"
        self.task_results[host] = "ok"
        self.previous_task_status = "ok"

    def v2_runner_on_skipped(self, result: TaskResult) -> None:
        """Track skipped tasks."""
        host = result._host.get_name() if result._host else "unknown"
        self.task_results[host] = "skipped"

    def v2_runner_on_failed(self, result: TaskResult, ignore_errors: bool = False) -> None:
        """Handle task failure and generate structured error report."""
        if ignore_errors:
            return

        error = self._build_error(result, "task_failed")
        self.errors.append(error)

        # Generate detailed trace file
        trace_path = self._write_error_trace(error)
        if trace_path:
            error["error"]["trace_path"] = trace_path

        self._print_structured_error(error)

    def v2_runner_on_unreachable(self, result: TaskResult) -> None:
        """Handle unreachable host and generate structured error report."""
        error = self._build_error(result, "host_unreachable")

        # Override suggestion for unreachable hosts
        if get_suggestion:
            suggestion = get_suggestion("", "host_unreachable")
            error["error"]["suggestion"] = suggestion.suggestion
            error["error"]["suggestion_steps"] = suggestion.steps
            error["error"]["suggestion_category"] = suggestion.category
        else:
            error["error"]["suggestion"] = (
                "Check SSH connectivity, firewall rules, and host availability. "
                "Verify the host is running and SSH service is active."
            )

        self.errors.append(error)

        # Generate detailed trace file
        trace_path = self._write_error_trace(error)
        if trace_path:
            error["error"]["trace_path"] = trace_path

        self._print_structured_error(error)

    def _build_error(self, result: TaskResult, error_type: str) -> dict[str, Any]:
        """Build structured error dictionary from task result."""
        host = result._host.get_name() if result._host else "unknown"
        task = result._task
        result_dict = result._result

        # Extract error details
        msg = result_dict.get("msg", "")
        stderr = result_dict.get("stderr", "")
        stdout = result_dict.get("stdout", "")
        rc = result_dict.get("rc")

        # Extract module arguments (safely)
        module_args = {}
        if task:
            try:
                args = task.args
                if isinstance(args, dict):
                    module_args = dict(args)
            except Exception:
                pass

        # Combine message sources for suggestion matching
        full_error_text = f"{msg} {stderr} {stdout}"

        # Generate timestamp
        timestamp = datetime.now(timezone.utc).isoformat()

        # Determine role name from task path
        role_name = self._extract_role_name(task)

        # Get suggestion
        suggestion_text = "Review the error message and check task prerequisites"
        suggestion_steps = []
        suggestion_category = "unknown"

        if get_suggestion:
            suggestion = get_suggestion(full_error_text, error_type)
            suggestion_text = suggestion.suggestion
            suggestion_steps = suggestion.steps
            suggestion_category = suggestion.category

        # Extract relevant variables
        relevant_vars = self._extract_relevant_vars(result)

        # Build the structured error
        error = {
            "error": {
                "type": error_type,
                "task_name": task.get_name() if task else "unknown",
                "host": host,
                "play": self.current_play or "unknown",
                "role": role_name,
                "action": task.action if task else "unknown",
                "status": "UNREACHABLE" if error_type == "host_unreachable" else "FAILED",
                "message": str(msg) if msg else self._extract_message(result_dict),
                "suggestion": suggestion_text,
                "suggestion_steps": suggestion_steps,
                "suggestion_category": suggestion_category,
                "stderr": str(stderr)[:2000] if stderr else "",  # Limit size
                "stdout": str(stdout)[:2000] if stdout else "",  # Limit size
                "rc": rc,
                "timestamp": timestamp,
                "trace_path": "",  # Will be filled after trace generation
                "module_args": module_args,
                "context": {
                    "previous_task": self.previous_task_name or "none",
                    "previous_task_status": self.previous_task_status,
                    "playbook": self.playbook_file or "unknown",
                    "tags": self.current_tags,
                    "become": getattr(task, "become", False) if task else False,
                    "become_user": getattr(task, "become_user", None) if task else None,
                    "check_mode": result_dict.get("_ansible_check_mode", False),
                    "diff_mode": result_dict.get("_ansible_diff", False),
                    "variables": relevant_vars,
                },
                "full_result": self._sanitize_result(result_dict),
            }
        }

        return error

    def _extract_role_name(self, task) -> str:
        """Extract role name from task metadata."""
        if task is None:
            return "unknown"

        # Try to get role name from task path
        if hasattr(task, "_role") and task._role:
            return task._role.get_name()

        # Fallback: try to extract from task path
        if hasattr(task, "_ds") and task._ds:
            task_path = task._ds.get("__ansible_file__", "")
            if "roles/" in task_path:
                parts = task_path.split("roles/")
                if len(parts) > 1:
                    role_part = parts[1].split("/")[0]
                    return role_part

        return "unknown"

    def _extract_message(self, result_dict: dict[str, Any]) -> str:
        """Extract meaningful error message from result dictionary."""
        # Try common message fields
        for key in ["msg", "message", "reason", "error"]:
            if key in result_dict and result_dict[key]:
                return str(result_dict[key])

        # Check for module-specific error fields
        if "module_stderr" in result_dict:
            return str(result_dict["module_stderr"])[:500]

        if "module_stdout" in result_dict:
            return str(result_dict["module_stdout"])[:500]

        # Last resort: stringify the result
        return "Task failed without specific error message"

    def _extract_relevant_vars(self, result: TaskResult) -> dict[str, Any]:
        """Extract relevant variables for debugging."""
        relevant_vars = {}

        # Variables that are often useful for debugging
        useful_vars = [
            "ansible_distribution",
            "ansible_distribution_version",
            "ansible_os_family",
            "ansible_architecture",
            "ansible_hostname",
            "ansible_fqdn",
            "ansible_python_version",
            "inventory_hostname",
        ]

        try:
            task_vars = result._task_fields.get("vars", {})
            if isinstance(task_vars, dict):
                for var in useful_vars:
                    if var in task_vars:
                        relevant_vars[var] = task_vars[var]
        except Exception:
            pass

        # Also try to get from result
        result_dict = result._result
        for key in ["invocation", "ansible_facts"]:
            if key in result_dict and isinstance(result_dict[key], dict):
                for var in useful_vars:
                    if var in result_dict[key] and var not in relevant_vars:
                        relevant_vars[var] = result_dict[key][var]

        return relevant_vars

    def _sanitize_result(self, result_dict: dict[str, Any]) -> dict[str, Any]:
        """
        Sanitize result dictionary for safe storage.

        Removes or truncates large fields and redacts sensitive values.
        """
        # Make a shallow copy
        sanitized = {}

        sensitive_keys = [
            "password", "secret", "token", "key", "credential",
            "private", "auth", "api_key", "apikey",
        ]

        for key, value in result_dict.items():
            # Skip internal ansible fields
            if key.startswith("_ansible"):
                continue

            # Redact sensitive values
            if any(s in key.lower() for s in sensitive_keys):
                sanitized[key] = "***REDACTED***"
                continue

            # Truncate long strings
            if isinstance(value, str) and len(value) > 1000:
                sanitized[key] = value[:1000] + "... (truncated)"
            elif isinstance(value, (dict, list)):
                # For complex types, just include them (will be handled by JSON serialization)
                sanitized[key] = value
            else:
                sanitized[key] = value

        return sanitized

    def _write_error_trace(self, error: dict[str, Any]) -> str:
        """Write detailed error trace to file using the report generator."""
        if self.report_generator:
            try:
                return self.report_generator.generate_report(error)
            except Exception as e:
                self._display.warning(f"Error generating trace file: {e}")
                # Fall through to manual file writing

        # Fallback: manual file writing if generator unavailable
        return self._write_error_trace_manual(error)

    def _write_error_trace_manual(self, error: dict[str, Any]) -> str:
        """Fallback method for writing trace files without the generator."""
        err = error["error"]
        ctx = err.get("context", {})

        timestamp_file = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        trace_filename = f"error-{timestamp_file}-{err.get('host', 'unknown')}.log"
        trace_path = str(self.error_dir / trace_filename)

        lines = [
            "=" * 80,
            f"ANSIBLE ERROR TRACE - {err['timestamp']}",
            "=" * 80,
            "",
            "SUMMARY",
            "-" * 40,
            f"Type:        {err['type']}",
            f"Status:      {err['status']}",
            f"Host:        {err['host']}",
            f"Task:        {err['task_name']}",
            f"Play:        {err['play']}",
            f"Role:        {err['role']}",
            f"Action:      {err['action']}",
            "",
            "ERROR MESSAGE",
            "-" * 40,
            err["message"],
            "",
            "SUGGESTION",
            "-" * 40,
            err["suggestion"],
            "",
        ]

        if err.get("suggestion_steps"):
            lines.append("Recommended Steps:")
            for i, step in enumerate(err["suggestion_steps"], 1):
                lines.append(f"  {i}. {step}")
            lines.append("")

        if err.get("rc") is not None:
            lines.extend([
                "RETURN CODE",
                "-" * 40,
                str(err["rc"]),
                "",
            ])

        if err.get("stderr"):
            lines.extend([
                "STDERR",
                "-" * 40,
                err["stderr"],
                "",
            ])

        if err.get("stdout"):
            lines.extend([
                "STDOUT",
                "-" * 40,
                err["stdout"],
                "",
            ])

        lines.extend([
            "CONTEXT",
            "-" * 40,
            f"Playbook:           {ctx.get('playbook', 'unknown')}",
            f"Previous Task:      {ctx.get('previous_task', 'none')}",
            f"Previous Status:    {ctx.get('previous_task_status', 'unknown')}",
            f"Tags:               {', '.join(ctx.get('tags', [])) or 'none'}",
            f"Become:             {ctx.get('become', False)}",
            "",
            "JSON ERROR STRUCTURE",
            "-" * 40,
            json.dumps(error, indent=2, default=str),
            "",
            "=" * 80,
        ])

        try:
            with open(trace_path, "w", encoding="utf-8") as f:
                f.write("\n".join(lines))
            return trace_path
        except OSError as e:
            self._display.warning(f"Cannot write error trace to {trace_path}: {e}")
            return ""

    def _print_structured_error(self, error: dict[str, Any]) -> None:
        """Print JSON error to stderr for CLI parsing."""
        try:
            json_str = json.dumps(error, default=str, ensure_ascii=False)
            print(f"ANSIBLE_ERROR_JSON:{json_str}", file=sys.stderr)
        except (TypeError, ValueError) as e:
            # Fallback: print simplified error
            simplified = {
                "error": {
                    "type": error.get("error", {}).get("type", "unknown"),
                    "task_name": error.get("error", {}).get("task_name", "unknown"),
                    "host": error.get("error", {}).get("host", "unknown"),
                    "message": str(e),
                }
            }
            print(f"ANSIBLE_ERROR_JSON:{json.dumps(simplified)}", file=sys.stderr)

    def v2_playbook_on_stats(self, stats) -> None:
        """Print summary when playbook completes."""
        if self.errors:
            summary = {
                "error_summary": {
                    "total_errors": len(self.errors),
                    "error_types": {},
                    "affected_hosts": [],
                    "trace_files": [],
                    "categories": {},
                }
            }

            hosts_set = set()
            for error in self.errors:
                err = error["error"]
                error_type = err["type"]
                summary["error_summary"]["error_types"][error_type] = (
                    summary["error_summary"]["error_types"].get(error_type, 0) + 1
                )
                hosts_set.add(err["host"])
                if err.get("trace_path"):
                    summary["error_summary"]["trace_files"].append(err["trace_path"])

                # Track suggestion categories
                category = err.get("suggestion_category", "unknown")
                summary["error_summary"]["categories"][category] = (
                    summary["error_summary"]["categories"].get(category, 0) + 1
                )

            summary["error_summary"]["affected_hosts"] = list(hosts_set)

            print(f"ANSIBLE_ERROR_SUMMARY:{json.dumps(summary)}", file=sys.stderr)
