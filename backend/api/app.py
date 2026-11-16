"""FastAPI application factory (API_SPEC §1).

Builds the app, installs service instances + middleware, wires the MissionService shutdown via a
lifespan hook, and mounts routes under ``/api/v1``. All config comes from ``app_settings`` — no
hardcoded API configuration (CONFIGURATION_SPEC §1).
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional

from fastapi import FastAPI

from backend.api import __version__
from backend.api.middleware import install_middleware
from backend.api.routes import assistant, health, hitl, missions, replay, telemetry, knowledge
from backend.api.services.mission_service import MissionService
from backend.api.services.replay_service import ReplayService
from backend.api.services.stream_service import MissionStreamService
from backend.api.services.telemetry_service import TelemetryService
from backend.core.config import AppSettings, app_settings

API_PREFIX = "/api/v1"


def create_app(
    *,
    service: Optional[MissionService] = None,
    settings: Optional[AppSettings] = None,
) -> FastAPI:
    """Assemble the FastAPI application.

    ``service``/``settings`` may be injected (used by tests and embedding hosts); when omitted the
    default production wiring from ``app_settings`` is used.
    """

    resolved_settings = settings or app_settings

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Managed by app (in-memory; restart clears missions — acceptable for a foundation).
        # Reuse the injected service when present so tests with a fast HITL timeout are honored.
        if service is not None:
            svc = service
        else:
            svc = MissionService(resolved_settings)
        app.state.mission_service = svc
        app.state.telemetry_service = TelemetryService(svc)
        app.state.replay_service = ReplayService(svc)
        app.state.stream_service = MissionStreamService(svc)
        app.state.settings = resolved_settings
        yield
        # Graceful teardown: cancel any still-running loop tasks.
        await svc.shutdown()

    app = FastAPI(
        title="Inzora Terra OS — Mission API",
        version=__version__,
        description="REST + SSE surface over the Inzora Mission Engine (Phase 2A).",
        lifespan=lifespan,
    )

    install_middleware(app, cors_origins=resolved_settings.api.cors_origins)

    # Mount API surface under a versioned prefix (API_SPEC §2).
    app.include_router(health.router, prefix=API_PREFIX)
    app.include_router(missions.router, prefix=API_PREFIX)
    app.include_router(telemetry.router, prefix=API_PREFIX)
    app.include_router(replay.router, prefix=API_PREFIX)
    app.include_router(hitl.router, prefix=API_PREFIX)
    app.include_router(assistant.router, prefix=API_PREFIX)
    app.include_router(knowledge.router, prefix=API_PREFIX)

    return app


app = create_app()