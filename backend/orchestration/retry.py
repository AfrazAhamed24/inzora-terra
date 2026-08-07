"""Retry policy for agent execution (ORCHESTRATOR.md §5).

Determines how many times a failed agent run is retried and how long to back off between attempts.
Defaults: linear backoff of 1s, then 2s, capped at two retries — matching the spec's
``orchestrator.max_retries = 2`` and ``orchestrator.retry_backoff_base = 1``.
"""

from __future__ import annotations

__all__ = ["RetryPolicy"]


class RetryPolicy:
    """Linear-backoff retry policy."""

    def __init__(self, max_retries: int = 2, backoff_base: float = 1.0):
        self.max_retries = max_retries
        self.backoff_base = backoff_base

    def total_attempts(self) -> int:
        """Number of attempts when retrying: initial run plus ``max_retries`` retries."""
        return self.max_retries + 1

    def should_retry(self, attempt: int) -> bool:
        """Whether attempt ``attempt`` (1-based) may be followed by another attempt."""
        return attempt < self.total_attempts()

    def backoff(self, attempt: int) -> float:
        """Linear backoff in seconds after failing ``attempt`` (1-based)."""
        return self.backoff_base * attempt
