"""LLM Client — wraps Groq (or any OpenAI-compatible API) for agent reasoning.

Falls back gracefully when no API key is configured: agents continue using
their enhanced rule-based reasoning. When a key is available, the client
provides real LLM-powered analysis that produces natural language reasoning
and novel hypotheses beyond hardcoded thresholds.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

_log = logging.getLogger(__name__)

# Lazy singleton so the module is importable even without the SDK.
_client: Optional[Any] = None
_model: Optional[str] = None
_available: Optional[bool] = None


def _resolve_config() -> tuple[Optional[str], Optional[str]]:
    """Return (api_key, model_name) from env or the Settings object."""
    try:
        from backend.core.config import settings
        provider = settings.LLM_PROVIDER.value if hasattr(settings.LLM_PROVIDER, 'value') else settings.LLM_PROVIDER
        if provider == "groq":
            key = settings.GROQ_API_KEY
            model = settings.GROQ_MODEL_NAME
        elif provider == "openai":
            key = settings.OPENAI_API_KEY
            model = "gpt-4o-mini"
        else:
            key = ""
            model = ""
        return (key or None, model or None)
    except Exception:
        return (os.getenv("GROQ_API_KEY"), os.getenv("GROQ_MODEL_NAME", "llama-3.3-70b-versatile"))


def is_available() -> bool:
    """True if an LLM API key is configured and the SDK is installed."""
    global _available
    if _available is not None:
        return _available

    key, _ = _resolve_config()
    if not key or key.startswith("your_"):
        _available = False
        return False

    try:
        import groq  # noqa: F401
        _available = True
    except ImportError:
        try:
            import openai  # noqa: F401
            _available = True
        except ImportError:
            _available = False

    return _available


def _get_client():
    """Lazy-init the Groq or OpenAI client."""
    global _client, _model
    if _client is not None:
        return _client

    key, model = _resolve_config()
    if not key:
        return None

    try:
        from groq import Groq
        _client = Groq(api_key=key)
        _model = model or "llama-3.3-70b-versatile"
        _log.info("LLM client initialized (Groq, model=%s)", _model)
    except ImportError:
        try:
            from openai import OpenAI
            _client = OpenAI(api_key=key, base_url="https://api.groq.com/openai/v1")
            _model = model or "llama-3.3-70b-versatile"
            _log.info("LLM client initialized (OpenAI-compat, model=%s)", _model)
        except ImportError:
            _log.warning("No LLM SDK available — agents use rule-based reasoning")
            return None

    return _client


def generate(
    system_prompt: str,
    user_prompt: str,
    *,
    max_tokens: int = 800,
    temperature: float = 0.3,
) -> Optional[str]:
    """Generate a response from the LLM. Returns None on failure (caller falls back)."""
    client = _get_client()
    if client is None:
        return None

    try:
        response = client.chat.completions.create(
            model=_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return response.choices[0].message.content.strip()
    except Exception as exc:
        _log.warning("LLM generation failed: %s", exc)
        return None


def generate_json(
    system_prompt: str,
    user_prompt: str,
    *,
    max_tokens: int = 1200,
    temperature: float = 0.2,
) -> Optional[Dict[str, Any]]:
    """Generate a JSON response from the LLM. Returns parsed dict or None."""
    text = generate(
        system_prompt,
        user_prompt + "\n\nRespond ONLY with valid JSON. No markdown, no explanation.",
        max_tokens=max_tokens,
        temperature=temperature,
    )
    if not text:
        return None

    # Strip markdown code fences if present
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        _log.warning("LLM returned non-JSON: %s", text[:200])
        return None
