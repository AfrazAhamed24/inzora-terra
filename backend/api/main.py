"""Launch entry for the Inzora Mission API (Phase 2A).

Run from the repo root:

    python -m backend.api.main

Host/port/workers come from ``app_settings.api`` (TERRA_API_HOST / TERRA_API_PORT) so there is
no hardcoded API configuration. This file is intentionally separate from ``app.py`` (the importable
ASGI app) so tests can import the app without starting a server.
"""

from __future__ import annotations

import logging
import os

import uvicorn

from backend.api.app import app  # noqa: F401  (re-export for `--app-dir` / `-app` uses)
from backend.core.config import app_settings

_log = logging.getLogger("inzora.api")


def main() -> None:
    host = app_settings.api.host
    port = app_settings.api.port
    _log.info("Inzora Terra OS API listening on http://%s:%d", host, port)
    uvicorn.run(
        "backend.api.app:app",
        host=host,
        port=port,
        reload=os.getenv("TERRA_API_RELOAD", "").lower() in ("1", "true", "yes"),
    )


if __name__ == "__main__":
    main()