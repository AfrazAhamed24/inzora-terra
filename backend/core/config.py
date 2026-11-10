import os
from enum import Enum
from typing import List, Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class LLMProvider(str, Enum):
    GEMINI = "gemini"
    GROQ = "groq"
    OPENAI = "openai"
    CLAUDE = "claude"
    LOCAL = "local"


class Settings(BaseSettings):
    # Provider selection
    LLM_PROVIDER: LLMProvider = LLMProvider.GROQ

    # Gemini
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL_NAME: str = "models/gemini-2.5-flash"

    # Groq
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL_NAME: str = "llama-3.3-70b-versatile"

    # Future providers
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    CLAUDE_API_KEY: str = os.getenv("CLAUDE_API_KEY", "")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


# ---------------------------------------------------------------------------
# Phase 1C — namespaced settings (CONFIGURATION_SPEC.md)
# ---------------------------------------------------------------------------

_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}


class SimulationSettings(BaseSettings):
    """Simulation group (SIMULATION_SPEC.md §5). Env: ``TERRA_SIMULATION_*``."""

    source: str = "simulated"
    scenario: str = "scenario_collapse_rain"
    tick_seconds: float = 1.0
    time_multiplier: float = 1.0
    ticks_per_cycle: int = 60
    seed: int = 20260815

    model_config = SettingsConfigDict(
        env_prefix="TERRA_SIMULATION_", env_file=".env", extra="ignore"
    )

    @field_validator("source")
    @classmethod
    def _source(cls, v: str) -> str:
        if v != "simulated":
            raise ValueError("simulation.source must be 'simulated' in Phase 1")
        return v

    @field_validator("tick_seconds", "time_multiplier")
    @classmethod
    def _positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("simulation timing params must be > 0")
        return v

    @field_validator("ticks_per_cycle", "seed")
    @classmethod
    def _positive_int(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("simulation integer params must be > 0")
        return v


class OrchestratorSettings(BaseSettings):
    """Orchestrator group (CONFIGURATION_SPEC §3.3). Env: ``TERRA_ORCHESTRATOR_*``."""

    agent_timeout: float = 30.0
    level_timeout: float = 70.0
    max_retries: int = 2
    retry_backoff_base: float = 1.0
    fallback_source: str = "simulated"
    llm_backed_agents: bool = False

    model_config = SettingsConfigDict(
        env_prefix="TERRA_ORCHESTRATOR_", env_file=".env", extra="ignore"
    )

    @field_validator("agent_timeout", "level_timeout", "retry_backoff_base")
    @classmethod
    def _positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("orchestrator timing params must be > 0")
        return v

    @field_validator("max_retries")
    @classmethod
    def _retries(cls, v: int) -> int:
        if v < 0:
            raise ValueError("orchestrator.max_retries must be >= 0")
        return v


class HitlSettings(BaseSettings):
    """HITL group (CONFIGURATION_SPEC §3.5). Env: ``TERRA_HITL_*``."""

    timeout: float = 120.0
    timeout_action: str = "escalate"
    risk_alert_threshold: float = 0.8
    confidence_verify_threshold: float = 0.5

    model_config = SettingsConfigDict(
        env_prefix="TERRA_HITL_", env_file=".env", extra="ignore"
    )

    @field_validator("timeout_action")
    @classmethod
    def _action(cls, v: str) -> str:
        if v not in ("escalate", "reject"):
            raise ValueError("hitl.timeout_action must be 'escalate' or 'reject'")
        return v


class LoggingSettings(BaseSettings):
    """Logging group (CONFIGURATION_SPEC §3.4, LOGGING_SPEC §6). Env: ``TERRA_LOGGING_*``."""

    level: str = "INFO"
    buffer_size: int = 1000
    jsonl_path: Optional[str] = None
    console: bool = True

    model_config = SettingsConfigDict(
        env_prefix="TERRA_LOGGING_", env_file=".env", extra="ignore"
    )

    @field_validator("level")
    @classmethod
    def _level(cls, v: str) -> str:
        if v not in _LEVELS:
            raise ValueError(f"logging.level must be one of {sorted(_LEVELS)}")
        return v

    @field_validator("buffer_size")
    @classmethod
    def _buffer(cls, v: int) -> int:
        if v < 1:
            raise ValueError("logging.buffer_size must be >= 1")
        return v


class ApiSettings(BaseSettings):
    """API group (CONFIGURATION_SPEC §3.6, API_SPEC §8). Env: ``TERRA_API_*``."""

    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: List[str] = ["http://localhost:5173"]
    operator_key: str = ""

    model_config = SettingsConfigDict(
        env_prefix="TERRA_API_", env_file=".env", extra="ignore"
    )


class AppSettings(BaseSettings):
    """Single validated settings object for the whole runtime (CONFIGURATION_SPEC §1).

    No module reads ``os.getenv`` directly; everything flows through this object. Grouped
    sub-settings read from namespaced env vars (``TERRA_SIMULATION_*``, ``TERRA_ORCHESTRATOR_*``,
    ``TERRA_HITL_*``, ``TERRA_LOGGING_*``, ``TERRA_API_*``).
    """

    simulation: SimulationSettings = SimulationSettings()
    orchestrator: OrchestratorSettings = OrchestratorSettings()
    hitl: HitlSettings = HitlSettings()
    logging: LoggingSettings = LoggingSettings()
    api: ApiSettings = ApiSettings()

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
app_settings = AppSettings()
