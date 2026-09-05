"""Mission Assistant endpoint (Phase 2C placeholder).

Explicitly a 501 stub: the Assistant is out of Phase 2A scope. The route exists so the frontend
can discover the API shape early and gets a structured ``assistant_unavailable`` error instead of
a generic 404. Phase 2C replaces the body with the real conversation service.
"""

from __future__ import annotations

from fastapi import APIRouter

from backend.api.exceptions import AssistantUnavailableError
from backend.api.schemas.request import AssistantQueryRequest

router = APIRouter(prefix="/missions/{mission_id}/assistant", tags=["assistant"])


@router.post("/chat")
async def assistant_chat(mission_id: str, body: AssistantQueryRequest) -> None:  # noqa: ARG001
    raise AssistantUnavailableError(
        "D.E.X.T.E.R (Mission Assistant) is not available in Phase 2A (scheduled for Phase 2C)"
    )