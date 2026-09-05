"""API request schemas (API_SPEC.md §3).

Request models are deliberately thin: fields map 1:1 onto the Mission Engine's own inputs
(incident text, environment/scenario, mission name) so the API layer never invents its own
semantics. ``extra="forbid"`` keeps the contract strict.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MissionCreateRequest(_StrictModel):
    """Body for ``POST /missions``."""

    incident_text: str = Field(..., min_length=1, description="Free-text incident description")
    mission_name: Optional[str] = Field(
        default=None, description="Optional human-readable mission name"
    )
    environment_id: Optional[str] = Field(
        default=None, description="Simulation scenario to run (see SIMULATION_SPEC)"
    )


class MissionStartRequest(_StrictModel):
    """Body for ``POST /missions/{id}/start`` (may be empty today; kept for future knobs)."""

    pass  # noqa: PIE790 - intentional empty placeholder


class AssistantQueryRequest(_StrictModel):
    """Body for the Mission Assistant placeholder (Phase 2C)."""

    query: str = Field(..., min_length=1)


class DecisionResolveRequest(_StrictModel):
    """Body for ``POST /missions/{id}/decisions/{decision_id}/resolve``."""

    action: str = Field(..., pattern="^(approve|override)$")
    notes: Optional[str] = Field(default=None, description="Optional supervisor note (audit trail)")