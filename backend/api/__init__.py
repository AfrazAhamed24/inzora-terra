"""Inzora Terra OS — FastAPI foundation (Phase 2A).

Exposes the stable Phase 1 Mission Engine to HTTP consumers. The API layer is *thin*: it
never re-implements orchestration, never bypasses ``MissionStateManager``, and consumes only
the existing engine (MissionService -> MissionLoop -> MissionState -> GraphExecutor). All
configuration flows through ``app_settings`` (CONFIGURATION_SPEC §1 / API_SPEC §8).
"""

__version__ = "0.1.0"