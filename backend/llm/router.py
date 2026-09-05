"""LLM Router — 5-tier multi-provider routing with automatic failover.

Adapted from crisis-bench/src/routing/llm_router.py for Inzora Terra OS
(Project Catalyst). Routes all LLM calls through a unified interface. Each
agent calls ``router.call(tier, messages)`` — the router handles provider
selection, failover, rate limiting, circuit breaking, and cost tracking.

Tier chains use whatever providers are configured in ``backend.core.config``
plus optional DeepSeek/Qwen/Kimi keys via env vars for future-proofing.

Usage:
    from backend.llm.router import LLMRouter
    from backend.llm.cost import CostTracker
    from backend.core.config import settings

    router = LLMRouter(settings, CostTracker())
    result = await router.call("critical", [{"role": "user", "content": "..."}])
    # result.content, result.provider, result.cost_usd, result.latency_s
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

from openai import AsyncOpenAI

logger = logging.getLogger("terra.llm_router")


# =============================================================================
# Errors
# =============================================================================


class AllProvidersFailedError(Exception):
    """Raised when every provider in a tier chain fails."""

    def __init__(self, message: str, *, context: dict | None = None) -> None:
        super().__init__(message)
        self.context = context or {}


# =============================================================================
# Enums & Data Models
# =============================================================================


class LLMTier(str, Enum):
    """LLM routing tier — determines provider chain."""

    CRITICAL = "critical"
    STANDARD = "standard"
    ROUTINE = "routine"
    VISION = "vision"


class CircuitState(str, Enum):
    """Circuit breaker states."""

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class LLMProvider:
    """Configuration for a single LLM provider."""

    name: str
    key: str
    client: AsyncOpenAI
    model: str
    input_cost_per_m: float
    output_cost_per_m: float
    max_rpm: int
    is_free: bool
    has_key: bool = True


@dataclass
class LLMResponse:
    """Result from an LLM call."""

    content: str
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_s: float
    tier: str


# =============================================================================
# Rate Limiter
# =============================================================================


class SlidingWindowRateLimiter:
    """Sliding-window rate limiter tracking requests per minute."""

    def __init__(self, max_rpm: int) -> None:
        self._max_rpm = max_rpm
        self._timestamps: deque[float] = deque()

    def _cleanup(self) -> None:
        now = time.monotonic()
        while self._timestamps and (now - self._timestamps[0]) > 60.0:
            self._timestamps.popleft()

    def allow(self) -> bool:
        """Return True if a request is allowed, False if rate-limited."""
        self._cleanup()
        if len(self._timestamps) >= self._max_rpm:
            return False
        self._timestamps.append(time.monotonic())
        return True

    def remaining(self) -> int:
        """Return remaining capacity in the current window."""
        self._cleanup()
        return max(0, self._max_rpm - len(self._timestamps))


# =============================================================================
# Circuit Breaker
# =============================================================================


@dataclass
class CircuitBreaker:
    """Circuit breaker to prevent cascading failures.

    After ``failure_threshold`` consecutive failures, opens the circuit for
    ``recovery_timeout`` seconds. Then allows one test request (half-open).
    """

    failure_threshold: int = 3
    recovery_timeout: float = 30.0
    state: CircuitState = field(default=CircuitState.CLOSED)
    _failure_count: int = field(default=0, repr=False)
    _last_failure_time: float = field(default=0.0, repr=False)

    def allow_request(self) -> bool:
        """Return True if a request should be attempted."""
        if self.state == CircuitState.CLOSED:
            return True
        if self.state == CircuitState.OPEN:
            if (time.monotonic() - self._last_failure_time) >= self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                return True
            return False
        # HALF_OPEN — already allowed one test request
        return False

    def record_success(self) -> None:
        """Record a successful call — reset failure count, close circuit."""
        self._failure_count = 0
        self.state = CircuitState.CLOSED

    def record_failure(self) -> None:
        """Record a failed call — may open the circuit."""
        self._failure_count += 1
        self._last_failure_time = time.monotonic()
        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.OPEN
        elif self._failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN


# =============================================================================
# LLM Router
# =============================================================================


class LLMRouter:
    """Routes LLM calls across providers based on tier with automatic failover."""

    def __init__(
        self,
        settings: Any,
        cost_tracker: Any | None = None,
    ) -> None:
        self._settings = settings
        self._cost_tracker = cost_tracker
        self._providers: dict[str, LLMProvider] = {}
        self._rate_limiters: dict[str, SlidingWindowRateLimiter] = {}
        self._circuit_breakers: dict[str, CircuitBreaker] = {}

        self._init_providers()
        self._tier_chains: dict[str, list[str]] = {
            "critical": ["groq", "gemini_free", "deepseek_chat", "ollama_local"],
            "standard": ["groq", "gemini_free", "deepseek_chat", "ollama_local"],
            "routine": ["groq", "gemini_free", "ollama_local"],
            "vision": ["gemini_free", "ollama_local"],
        }

    # -- provider setup ------------------------------------------------------

    def _env(self, name: str, default: str = "") -> str:
        import os

        return os.getenv(name, default)

    @staticmethod
    def _real_key(key: str) -> str:
        """Return the key only if it looks real; placeholder/sample keys -> empty."""
        if not key:
            return ""
        if key.startswith("your_") or key.startswith("sk-placeholder") or "example" in key:
            return ""
        return key

    def _init_providers(self) -> None:
        """Initialize all providers from settings + optional env keys."""
        s = self._settings

        # Resolve keys for the providers Catalyst already supports.
        groq_key = self._real_key(getattr(s, "GROQ_API_KEY", "") or self._env("GROQ_API_KEY", ""))
        groq_model = getattr(s, "GROQ_MODEL_NAME", "llama-3.3-70b-versatile")
        gemini_key = self._real_key(getattr(s, "GEMINI_API_KEY", "") or self._env("GEMINI_API_KEY", ""))
        gemini_model = getattr(s, "GEMINI_MODEL_NAME", "models/gemini-2.5-flash")
        openai_key = self._real_key(getattr(s, "OPENAI_API_KEY", "") or self._env("OPENAI_API_KEY", ""))

        # Optional advanced providers (crisis-bench parity, future-proofing).
        deepseek_key = self._env("DEEPSEEK_API_KEY", "")
        deepseek_base = self._env("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
        deepseek_model = self._env("DEEPSEEK_MODEL_NAME", "deepseek-chat")
        qwen_key = self._env("QWEN_API_KEY", "")
        qwen_base = self._env("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
        qwen_model = self._env("QWEN_MODEL_NAME", "qwen-max")
        ollama_host = self._env("OLLAMA_HOST", "http://localhost:11434")
        ollama_model = self._env("OLLAMA_MODEL", "qwen2.5:7b")

        provider_defs = [
            ("groq", "Groq", "https://api.groq.com/openai/v1",
             groq_key, groq_model, 0.0, 0.0, 30, True),
            ("gemini_free", "Gemini Flash (Free)", "https://generativelanguage.googleapis.com/v1beta/openai",
             gemini_key, gemini_model, 0.0, 0.0, 15, True),
            ("openai", "OpenAI", "https://api.openai.com/v1",
             openai_key, "gpt-4o-mini", 0.15, 0.60, 60, False),
            ("deepseek_chat", "DeepSeek Chat", deepseek_base,
             deepseek_key, deepseek_model, 0.28, 0.42, 60, False),
            ("qwen", "Qwen", qwen_base,
             qwen_key, qwen_model, 0.04, 0.40, 120, False),
            ("ollama_local", "Ollama Local", f"{ollama_host}/v1",
             "ollama", ollama_model, 0.0, 0.0, 999, True),
        ]

        for (key, name, base_url, api_key, model,
             in_cost, out_cost, max_rpm, is_free) in provider_defs:
            has_key = bool(api_key) or key == "ollama_local"
            if not has_key:
                # Register with has_key=False so the router skips it cleanly.
                provider = LLMProvider(
                    name=name, key=key,
                    client=AsyncOpenAI(base_url=base_url, api_key="none"),
                    model=model, input_cost_per_m=in_cost, output_cost_per_m=out_cost,
                    max_rpm=max_rpm, is_free=is_free, has_key=False,
                )
                self._providers[key] = provider
                self._rate_limiters[key] = SlidingWindowRateLimiter(max_rpm)
                self._circuit_breakers[key] = CircuitBreaker()
                continue

            client = AsyncOpenAI(base_url=base_url, api_key=api_key or "none")
            provider = LLMProvider(
                name=name, key=key, client=client, model=model,
                input_cost_per_m=in_cost, output_cost_per_m=out_cost,
                max_rpm=max_rpm, is_free=is_free, has_key=True,
            )
            self._providers[key] = provider
            self._rate_limiters[key] = SlidingWindowRateLimiter(max_rpm)
            self._circuit_breakers[key] = CircuitBreaker()

    # -- routing -------------------------------------------------------------

    async def call(
        self,
        tier: str | LLMTier,
        messages: list[dict[str, str]],
        *,
        trace_id: str = "",
        max_tokens: int | None = None,
        temperature: float | None = None,
        timeout: float = 60.0,
    ) -> LLMResponse:
        """Route an LLM call through the provider chain for the given tier.

        Tries each provider in the chain until one succeeds. Skips providers
        that are rate-limited, circuit-broken, or missing API keys.
        """
        tier_str = tier.value if isinstance(tier, LLMTier) else str(tier)
        chain = self._tier_chains.get(tier_str, self._tier_chains["standard"])
        errors: list[str] = []

        for provider_key in chain:
            provider = self._providers.get(provider_key)
            if provider is None:
                continue

            if not provider.has_key:
                errors.append(f"{provider.name}: no API key")
                continue

            if not self._rate_limiters[provider_key].allow():
                errors.append(f"{provider.name}: rate limited")
                continue

            cb = self._circuit_breakers[provider_key]
            if not cb.allow_request():
                errors.append(f"{provider.name}: circuit open")
                continue

            try:
                result = await self._call_provider(
                    provider, tier_str, messages,
                    max_tokens=max_tokens, temperature=temperature,
                    timeout=timeout, trace_id=trace_id,
                )
                cb.record_success()

                if self._cost_tracker is not None:
                    self._cost_tracker.record(result)

                logger.info(
                    "llm_call",
                    provider=provider.name, model=provider.model, tier=tier_str,
                    input_tokens=result.input_tokens, output_tokens=result.output_tokens,
                    cost_usd=round(result.cost_usd, 6), latency_s=round(result.latency_s, 3),
                    trace_id=trace_id,
                )
                return result
            except Exception as e:  # noqa: BLE001
                cb.record_failure()
                errors.append(f"{provider.name}: {e}")
                logger.warning(
                    "provider_failed", provider=provider.name, tier=tier_str,
                    error=str(e), trace_id=trace_id,
                )

        raise AllProvidersFailedError(
            f"All providers failed for tier '{tier_str}'",
            context={"tier": tier_str, "errors": errors, "trace_id": trace_id},
        )

    async def _call_provider(
        self,
        provider: LLMProvider,
        tier: str,
        messages: list[dict[str, str]],
        *,
        max_tokens: int | None,
        temperature: float | None,
        timeout: float,
        trace_id: str,
    ) -> LLMResponse:
        """Make an actual LLM call to a single provider."""
        kwargs: dict = {"model": provider.model, "messages": messages}
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens
        if temperature is not None:
            kwargs["temperature"] = temperature

        start = time.monotonic()
        response = await asyncio.wait_for(
            provider.client.chat.completions.create(**kwargs),
            timeout=timeout,
        )
        latency = time.monotonic() - start

        usage = response.usage
        input_tokens = usage.prompt_tokens if usage else 0
        output_tokens = usage.completion_tokens if usage else 0
        cost = (
            input_tokens / 1_000_000 * provider.input_cost_per_m
            + output_tokens / 1_000_000 * provider.output_cost_per_m
        )

        return LLMResponse(
            content=response.choices[0].message.content or "",
            provider=provider.name,
            model=provider.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost,
            latency_s=latency,
            tier=tier,
        )

    # -- introspection -------------------------------------------------------

    def get_cost_summary(self) -> dict:
        """Return cost summary from the tracker, or empty dict if none."""
        if self._cost_tracker is not None:
            return self._cost_tracker.get_summary()
        return {}

    def get_provider_status(self) -> dict[str, dict]:
        """Return status for all providers (circuit state, rate limit, etc.)."""
        status: dict[str, dict] = {}
        for key, provider in self._providers.items():
            cb = self._circuit_breakers[key]
            rl = self._rate_limiters[key]
            status[key] = {
                "name": provider.name,
                "model": provider.model,
                "has_key": provider.has_key,
                "is_free": provider.is_free,
                "circuit_state": cb.state.value,
                "rate_limit_remaining": rl.remaining(),
                "max_rpm": provider.max_rpm,
            }
        return status


# =============================================================================
# Singleton access
# =============================================================================

_ROUTER: Optional[LLMRouter] = None


def get_router(settings: Any = None, cost_tracker: Any = None) -> LLMRouter:
    """Lazy global router — build once, reuse across agents."""
    global _ROUTER
    if _ROUTER is not None:
        return _ROUTER
    if settings is None:
        from backend.core.config import settings as _settings
        settings = _settings
    if cost_tracker is None:
        from backend.llm.cost import CostTracker
        cost_tracker = CostTracker()
    _ROUTER = LLMRouter(settings, cost_tracker)
    return _ROUTER
