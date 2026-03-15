# -*- coding: utf-8 -*-
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
"""
Error report generator for Ansible.

Generates detailed, human-readable error trace files for debugging Ansible
playbook failures. Integrates with the error_reporter callback plugin.

Features:
- Structured error reports with clear sections
- Full error context including previous task info
- Intelligent suggestions from error_suggestions module
- JSON dump for programmatic parsing
- Automatic cleanup of old reports

Usage:
    from ansible.module_utils.error_report import ErrorReportGenerator

    generator = ErrorReportGenerator(error_dir='/tmp/ansible-errors')
    trace_path = generator.generate_report(error_data)
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Import suggestion system - handle both direct import and Ansible module context
try:
    from ansible.module_utils.error_suggestions import get_suggestion, SuggestionResult
except ImportError:
    # Fallback for direct execution or testing
    try:
        from error_suggestions import get_suggestion, SuggestionResult
    except ImportError:
        # Minimal fallback if suggestions module not available
        class SuggestionResult:
            def __init__(self, category="unknown", suggestion="", steps=None, severity="error"):
                self.category = category
                self.suggestion = suggestion
                self.steps = steps or []
                self.severity = severity

            def format(self):
                return self.suggestion

        def get_suggestion(error_message, error_type="unknown"):
            return SuggestionResult(
                suggestion="Review the error message and trace file for details."
            )


class ErrorReportGenerator:
    """
    Generates detailed error trace files for Ansible failures.

    Creates human-readable reports with error context, suggestions,
    and JSON dumps for programmatic parsing.
    """

    # Report template sections
    SEPARATOR_DOUBLE = "=" * 80
    SEPARATOR_SINGLE = "-" * 40

    def __init__(
        self,
        error_dir: str | Path = "/tmp/ansible-errors",
        keep_count: int = 50,
    ):
        """
        Initialize the error report generator.

        Args:
            error_dir: Directory to store error trace files
            keep_count: Maximum number of error files to keep
        """
        self.error_dir = Path(error_dir)
        self.keep_count = keep_count
        self._ensure_directory()

    def _ensure_directory(self) -> None:
        """Create error directory if it doesn't exist."""
        try:
            self.error_dir.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            # Log but don't fail - we'll handle file write errors later
            print(f"Warning: Cannot create error directory {self.error_dir}: {e}")

    def generate_report(self, error_data: dict[str, Any]) -> str:
        """
        Generate error report file and return the path.

        Args:
            error_data: Dictionary containing error information
                Expected structure:
                {
                    "error": {
                        "type": str,
                        "task_name": str,
                        "host": str,
                        "play": str,
                        "role": str,
                        "action": str,
                        "message": str,
                        "stderr": str,
                        "stdout": str,
                        "rc": int,
                        "timestamp": str,
                        "module_args": dict,
                        "context": {
                            "playbook": str,
                            "previous_task": str,
                            "previous_task_status": str,
                            "tags": list,
                            "become": bool,
                            "variables": dict,
                        },
                        "full_result": dict,
                    }
                }

        Returns:
            Path to the generated trace file
        """
        error = error_data.get("error", {})
        host = error.get("host", "unknown")
        timestamp = datetime.now(timezone.utc)
        timestamp_str = timestamp.strftime("%Y%m%d-%H%M%S")

        # Generate filename
        filename = f"error-{timestamp_str}-{self._sanitize_filename(host)}.log"
        filepath = self.error_dir / filename

        # Get suggestion for this error
        error_message = self._build_error_text(error)
        error_type = error.get("type", "unknown")
        suggestion = get_suggestion(error_message, error_type)

        # Format the report
        report_content = self._format_report(error_data, suggestion, timestamp)

        # Write the report
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(report_content)
        except OSError as e:
            # Return a fallback path or empty string on failure
            print(f"Warning: Cannot write error trace to {filepath}: {e}")
            return ""

        # Cleanup old reports
        self.cleanup_old_reports()

        return str(filepath)

    def _sanitize_filename(self, name: str) -> str:
        """Sanitize string for use in filename."""
        # Replace problematic characters
        sanitized = name.replace("/", "_").replace("\\", "_")
        sanitized = sanitized.replace(":", "_").replace(" ", "_")
        # Remove any remaining non-alphanumeric except underscore, hyphen, dot
        sanitized = "".join(
            c if c.isalnum() or c in "_-." else "_" for c in sanitized
        )
        # Limit length
        return sanitized[:50]

    def _build_error_text(self, error: dict[str, Any]) -> str:
        """Build combined error text for suggestion matching."""
        parts = []
        if error.get("message"):
            parts.append(str(error["message"]))
        if error.get("stderr"):
            parts.append(str(error["stderr"]))
        if error.get("stdout"):
            parts.append(str(error["stdout"]))
        return " ".join(parts)

    def _format_report(
        self,
        error_data: dict[str, Any],
        suggestion: SuggestionResult,
        timestamp: datetime,
    ) -> str:
        """
        Format the complete error report.

        Args:
            error_data: The error data dictionary
            suggestion: Matched suggestion result
            timestamp: Report generation timestamp

        Returns:
            Formatted report as string
        """
        error = error_data.get("error", {})
        context = error.get("context", {})

        sections = []

        # Header
        sections.append(self._format_header(timestamp, context))

        # Failed Task section
        sections.append(self._format_failed_task(error))

        # Error Details section
        sections.append(self._format_error_details(error))

        # Context section
        sections.append(self._format_context(context, error))

        # Suggestion section
        sections.append(self._format_suggestion(suggestion))

        # Module Arguments (if available)
        if error.get("module_args"):
            sections.append(self._format_module_args(error["module_args"]))

        # Variables (if available)
        if context.get("variables"):
            sections.append(self._format_variables(context["variables"]))

        # Full JSON Result
        sections.append(self._format_json_result(error_data))

        # Footer
        sections.append(self.SEPARATOR_DOUBLE)

        return "\n".join(sections)

    def _format_header(self, timestamp: datetime, context: dict) -> str:
        """Format report header section."""
        lines = [
            self.SEPARATOR_DOUBLE,
            "ANSIBLE ERROR REPORT",
            self.SEPARATOR_DOUBLE,
            f"Timestamp: {timestamp.strftime('%Y-%m-%d %H:%M:%S')} UTC",
            f"Playbook: {context.get('playbook', 'unknown')}",
        ]

        tags = context.get("tags", [])
        if tags:
            lines.append(f"Tags: {', '.join(tags)}")
        else:
            lines.append("Tags: (none)")

        lines.append("")
        return "\n".join(lines)

    def _format_failed_task(self, error: dict) -> str:
        """Format failed task section."""
        lines = [
            self.SEPARATOR_DOUBLE,
            "FAILED TASK",
            self.SEPARATOR_DOUBLE,
            f"Task: {error.get('task_name', 'unknown')}",
            f"Role: {error.get('role', 'unknown')}",
            f"Play: {error.get('play', 'unknown')}",
            f"Host: {error.get('host', 'unknown')}",
            "",
            f"Action: {error.get('action', 'unknown')}",
        ]

        # Add module arguments if present
        if error.get("module_args"):
            lines.append("Module Args:")
            for key, value in error["module_args"].items():
                # Redact sensitive values
                if any(
                    s in key.lower()
                    for s in ["password", "secret", "token", "key", "credential"]
                ):
                    value = "***REDACTED***"
                lines.append(f"  {key}: {value}")

        lines.append("")
        return "\n".join(lines)

    def _format_error_details(self, error: dict) -> str:
        """Format error details section."""
        lines = [
            self.SEPARATOR_DOUBLE,
            "ERROR DETAILS",
            self.SEPARATOR_DOUBLE,
            f"Type: {error.get('type', 'unknown')}",
            f"Status: {error.get('status', 'FAILED')}",
            "",
            "Message:",
            self.SEPARATOR_SINGLE,
            error.get("message", "(no message)"),
            "",
        ]

        # Return code
        rc = error.get("rc")
        if rc is not None:
            lines.extend([
                f"Return Code: {rc}",
                "",
            ])

        # STDOUT
        stdout = error.get("stdout", "")
        lines.extend([
            "STDOUT:",
            self.SEPARATOR_SINGLE,
        ])
        if stdout and stdout.strip():
            lines.append(stdout.strip())
        else:
            lines.append("(empty)")
        lines.append("")

        # STDERR
        stderr = error.get("stderr", "")
        lines.extend([
            "STDERR:",
            self.SEPARATOR_SINGLE,
        ])
        if stderr and stderr.strip():
            lines.append(stderr.strip())
        else:
            lines.append("(empty)")
        lines.append("")

        return "\n".join(lines)

    def _format_context(self, context: dict, error: dict) -> str:
        """Format context section."""
        lines = [
            self.SEPARATOR_DOUBLE,
            "CONTEXT",
            self.SEPARATOR_DOUBLE,
            f"Previous Task: {context.get('previous_task', 'none')}",
            f"Previous Task Status: {context.get('previous_task_status', 'unknown')}",
            "",
            f"Become (sudo): {context.get('become', False)}",
        ]

        # Add any extra context fields
        for key in ["become_user", "become_method", "check_mode", "diff_mode"]:
            if key in context:
                lines.append(f"{key.replace('_', ' ').title()}: {context[key]}")

        lines.append("")
        return "\n".join(lines)

    def _format_suggestion(self, suggestion: SuggestionResult) -> str:
        """Format suggestion section."""
        lines = [
            self.SEPARATOR_DOUBLE,
            "SUGGESTION",
            self.SEPARATOR_DOUBLE,
            f"Category: {suggestion.category}",
            f"Severity: {suggestion.severity}",
            "",
            suggestion.suggestion,
            "",
        ]

        if suggestion.steps:
            lines.append("Recommended Steps:")
            lines.append(self.SEPARATOR_SINGLE)
            for i, step in enumerate(suggestion.steps, 1):
                lines.append(f"  {i}. {step}")
            lines.append("")

        if hasattr(suggestion, "documentation_url") and suggestion.documentation_url:
            lines.append(f"Documentation: {suggestion.documentation_url}")
            lines.append("")

        return "\n".join(lines)

    def _format_module_args(self, module_args: dict) -> str:
        """Format module arguments section."""
        lines = [
            self.SEPARATOR_DOUBLE,
            "MODULE ARGUMENTS",
            self.SEPARATOR_DOUBLE,
        ]

        for key, value in module_args.items():
            # Redact sensitive values
            if any(
                s in key.lower()
                for s in ["password", "secret", "token", "key", "credential"]
            ):
                value = "***REDACTED***"
            lines.append(f"  {key}: {value}")

        lines.append("")
        return "\n".join(lines)

    def _format_variables(self, variables: dict) -> str:
        """Format relevant variables section."""
        lines = [
            self.SEPARATOR_DOUBLE,
            "RELEVANT VARIABLES",
            self.SEPARATOR_DOUBLE,
        ]

        for key, value in variables.items():
            # Redact sensitive values
            if any(
                s in key.lower()
                for s in ["password", "secret", "token", "key", "credential", "vault"]
            ):
                value = "***REDACTED***"
            # Truncate long values
            value_str = str(value)
            if len(value_str) > 200:
                value_str = value_str[:200] + "..."
            lines.append(f"  {key}: {value_str}")

        lines.append("")
        return "\n".join(lines)

    def _format_json_result(self, error_data: dict) -> str:
        """Format full JSON result section."""
        lines = [
            self.SEPARATOR_DOUBLE,
            "FULL TASK RESULT (JSON)",
            self.SEPARATOR_DOUBLE,
        ]

        # Redact sensitive information in JSON output
        redacted_data = self._redact_sensitive(error_data)

        try:
            json_str = json.dumps(redacted_data, indent=2, default=str, ensure_ascii=False)
            lines.append(json_str)
        except (TypeError, ValueError) as e:
            lines.append(f"(Error serializing JSON: {e})")

        lines.append("")
        return "\n".join(lines)

    def _redact_sensitive(self, data: Any, parent_key: str = "") -> Any:
        """
        Recursively redact sensitive values in data structure.

        Args:
            data: Data to redact (dict, list, or scalar)
            parent_key: Key name from parent level for context

        Returns:
            Data with sensitive values redacted
        """
        sensitive_patterns = [
            "password", "secret", "token", "key", "credential",
            "private", "auth", "api_key", "apikey",
        ]

        if isinstance(data, dict):
            return {
                k: self._redact_sensitive(v, k)
                for k, v in data.items()
            }
        elif isinstance(data, list):
            return [self._redact_sensitive(item, parent_key) for item in data]
        elif isinstance(data, str):
            # Check if parent key suggests this is sensitive
            if any(p in parent_key.lower() for p in sensitive_patterns):
                return "***REDACTED***"
            return data
        else:
            return data

    def cleanup_old_reports(self, keep_count: Optional[int] = None) -> int:
        """
        Remove old error reports, keeping only the most recent N files.

        Args:
            keep_count: Number of files to keep (defaults to self.keep_count)

        Returns:
            Number of files removed
        """
        if keep_count is None:
            keep_count = self.keep_count

        removed_count = 0

        try:
            # Get all error files sorted by modification time (newest first)
            error_files = sorted(
                self.error_dir.glob("error-*.log"),
                key=lambda f: f.stat().st_mtime,
                reverse=True,
            )

            # Remove files beyond keep_count
            for old_file in error_files[keep_count:]:
                try:
                    old_file.unlink()
                    removed_count += 1
                except OSError:
                    pass  # Ignore individual file deletion errors

        except OSError:
            pass  # Ignore cleanup errors

        return removed_count

    def get_recent_reports(self, count: int = 10) -> list[Path]:
        """
        Get the most recent error reports.

        Args:
            count: Number of reports to return

        Returns:
            List of paths to recent error reports
        """
        try:
            error_files = sorted(
                self.error_dir.glob("error-*.log"),
                key=lambda f: f.stat().st_mtime,
                reverse=True,
            )
            return error_files[:count]
        except OSError:
            return []

    def clear_all_reports(self) -> int:
        """
        Remove all error reports.

        Returns:
            Number of files removed
        """
        removed_count = 0
        try:
            for error_file in self.error_dir.glob("error-*.log"):
                try:
                    error_file.unlink()
                    removed_count += 1
                except OSError:
                    pass
        except OSError:
            pass
        return removed_count


# Convenience function for direct use
def create_error_report(
    error_data: dict[str, Any],
    error_dir: str = "/tmp/ansible-errors",
) -> str:
    """
    Create an error report file.

    Convenience function for one-off report generation.

    Args:
        error_data: Error data dictionary
        error_dir: Directory for error files

    Returns:
        Path to the generated report
    """
    generator = ErrorReportGenerator(error_dir=error_dir)
    return generator.generate_report(error_data)
