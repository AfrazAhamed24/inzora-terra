"""Per-provider cost tracking for the LLM Router.

Tracks tokens, cost (USD), and latency per provider so the dashboard and
logs can show how much each mission costs. Self-contained — no external deps.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Any


@dataclass
class _ProviderTotals:
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    latency_s: float = 0.0


class CostTracker:
    """Accumulates LLM usage and cost across a session/mission."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._by_provider: dict[str, _ProviderTotals] = {}
        self._by_tier: dict[str, _ProviderTotals] = {}
        self._total = _ProviderTotals()

    def record(self, result: Any) -> None:
        """Record an LLMResponse-like object (must expose the fields)."""
        with self._lock:
            provider = getattr(result, "provider", "unknown")
            tier = getattr(result, "tier", "unknown")

            p = self._by_provider.setdefault(provider, _ProviderTotals())
            p.calls += 1
            p.input_tokens += result.input_tokens
            p.output_tokens += result.output_tokens
            p.cost_usd += result.cost_usd
            p.latency_s += result.latency_s

            t = self._by_tier.setdefault(tier, _ProviderTotals())
            t.calls += 1
            t.input_tokens += result.input_tokens
            t.output_tokens += result.output_tokens
            t.cost_usd += result.cost_usd
            t.latency_s += result.latency_s

            self._total.calls += 1
            self._total.input_tokens += result.input_tokens
            self._total.output_tokens += result.output_tokens
            self._total.cost_usd += result.cost_usd
            self._total.latency_s += result.latency_s

    def get_summary(self) -> dict:
        """Return a serializable cost summary."""
        with self._lock:
            return {
                "total": {
                    "calls": self._total.calls,
                    "input_tokens": self._total.input_tokens,
                    "output_tokens": self._total.output_tokens,
                    "cost_usd": round(self._total.cost_usd, 6),
                    "avg_latency_s": round(
                        self._total.latency_s / self._total.calls, 3
                    ) if self._total.calls else 0.0,
                },
                "by_provider": {
                    k: {
                        "calls": v.calls,
                        "input_tokens": v.input_tokens,
                        "output_tokens": v.output_tokens,
                        "cost_usd": round(v.cost_usd, 6),
                    }
                    for k, v in self._by_provider.items()
                },
                "by_tier": {
                    k: {
                        "calls": v.calls,
                        "cost_usd": round(v.cost_usd, 6),
                    }
                    for k, v in self._by_tier.items()
                },
            }

    def reset(self) -> None:
        with self._lock:
            self._by_provider.clear()
            self._by_tier.clear()
            self._total = _ProviderTotals()
