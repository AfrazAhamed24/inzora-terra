"""Human-in-the-Loop gate (MISSION_LIFECYCLE.md §6, AGENTS.md §HITL).

``HitlGate`` owns the pause/resume contract for a live mission. When any agent (or the
orchestrator) needs a human decision it:

* raises a pending ``HumanDecision`` on the mission state (``request_type`` in
  ``confirm`` | ``verify`` | ``approve``, MISSION_STATE §4.10),
* moves the mission to ``awaiting_confirmation``,
* records the decision through the ``EventSink`` (``decision`` events).

The mission loop pauses on ``awaiting_confirmation``. A supervisor then resolves the decision
through :meth:`resolve` (approve / override / reject-timeout); the gate clears the pause and lets
the loop advance. The timeout path (``hitl.timeout``) fires automatically when a resolution isn't
provided in time.

Trigger rules from AGENTS.md §HITL are evaluated by the agents themselves; the gate only enforces
the state-machine side: exactly one active pause, and no resolution of an already-resolved
decision.
"""

from __future__ import annotations

import asyncio
import threading
from typing import Any, Dict, List, Optional

from backend.core.permissions import ORCHESTRATOR
from backend.core.state_manager import MissionStateManager
from backend.orchestration.events import EventSink

__all__ = [
    "HitlError",
    "HitlGate",
    "INTERRUPTED",
    "timeout_status_for",
]

_STATUS_ACTION = {"escalate": "overridden", "reject": "timeout"}

# Sentinel returned by :meth:`HitlGate.wait_for_resolution` when :meth:`HitlGate.interrupt`
# fires (loop stop / cycle-cap), distinguishing "interrupted" from "resolved".
INTERRUPTED = "__interrupted__"


class HitlError(RuntimeError):
    """Raised on illegal HITL gate operations (no pause, double resolve, ...)."""


def timeout_status_for(action: str) -> str:
    """The decision status applied when a decision times out (CONFIGURATION_SPEC §3.5).

    ``escalate`` resolves as ``overridden`` (mission proceeds on best-available data);
    ``reject`` resolves as ``timeout`` (mission blocks until a human resolves it).
    """
    return _STATUS_ACTION.get(action, "timeout")


class HitlGate:
    """Pauses and resumes a mission around pending human decisions."""

    def __init__(
        self,
        manager: MissionStateManager,
        *,
        event_sink: Optional[EventSink] = None,
        timeout: float = 120.0,
        timeout_action: str = "escalate",
    ):
        self._manager = manager
        self._sink = event_sink or EventSink(manager)
        self._timeout = timeout
        self._timeout_action = timeout_action
        self._waiters: List[asyncio.Future] = []
        self._lock = threading.RLock()

    # ------------------------------------------------------------------
    # Pause / resume
    # ------------------------------------------------------------------

    def pause(self, reason: str = "") -> None:
        """Block the mission at ``awaiting_confirmation`` (no-op if already there)."""
        with self._lock:
            if self._manager.state.status.stage != "awaiting_confirmation":
                self._manager.advance(ORCHESTRATOR, "awaiting_confirmation")
            if reason:
                self._sink.log(
                    "INFO",
                    f"HITL pause: {reason}",
                    source="hitl",
                    context={"stage": "awaiting_confirmation"},
                )

    def resume(
        self,
        resolved_by: str = "supervisor",
        notes: Optional[str] = None,
        *,
        decision_id: Optional[str] = None,
    ) -> None:
        """Clear the pause (all decisions resolved) and unblock waiters.

        Uses the lifecycle ``awaiting_confirmation -> completed`` transition so a fully reviewed
        mission can finish; missions that need re-work call :meth:`override` instead.
        """
        with self._lock:
            pending = self.pending()
            if pending:
                raise HitlError(
                    f"cannot resume: {len(pending)} decision(s) still pending"
                )
            self._manager.advance(ORCHESTRATOR, "completed")
            self._sink.log(
                "INFO",
                "HITL resume",
                source="hitl",
                context={"resolved_by": resolved_by, "notes": notes},
            )
            self._wake(decision_id)

    # ------------------------------------------------------------------
    # Decision resolution
    # ------------------------------------------------------------------

    def raise_decision(
        self,
        *,
        request_type: str,
        summary: str,
        related_agent: Optional[str] = None,
        related_task_id: Optional[str] = None,
        decision_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Raise a pending decision and move the mission into the review phase.

        Returns the persisted ``HumanDecision`` as a dict (with its id, for later resolution).
        """
        record = self._manager.raise_hitl_atomic(
            ORCHESTRATOR,
            {
                "id": decision_id or self._next_decision_id(),
                "request_type": request_type,
                "summary": summary,
                "related_agent": related_agent,
                "related_task_id": related_task_id,
            },
            review_needed=True,
        )
        self._sink.emit_decision(
            record.id,
            request_type,
            f"HITL request {record.id}: {summary}",
            data={"related_agent": related_agent, "related_task_id": related_task_id},
        )
        self.pause(summary)
        return record.model_dump()

    def resolve(
        self,
        decision_id: str,
        status: str,
        *,
        resolved_by: str = "supervisor",
        notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Resolve a pending decision (``confirmed`` | ``overridden`` | ``timeout``).

        After the final pending decision resolves, the mission advances back toward completion.
        """
        with self._lock:
            was_last = len(self.pending()) == 1
            record = self._manager.resolve_hitl_atomic(
                ORCHESTRATOR,
                decision_id,
                status,
                resolved_by=resolved_by,
                notes=notes,
                review_needed=not was_last,
            )
            self._sink.emit_decision(
                decision_id,
                record.request_type,
                f"HITL decision {decision_id} {status}",
                level="INFO",
                data={"status": status, "resolved_by": resolved_by, "notes": notes},
            )
            if not self.pending():
                self.resume(resolved_by=resolved_by, notes=notes, decision_id=decision_id)
            return record.model_dump()

    def approve(self, decision_id: str, *, resolved_by: str = "supervisor",
                notes: Optional[str] = None) -> Dict[str, Any]:
        return self.resolve(decision_id, "confirmed", resolved_by=resolved_by, notes=notes)

    def override(self, decision_id: str, *, resolved_by: str = "supervisor",
                 notes: Optional[str] = None) -> Dict[str, Any]:
        return self.resolve(decision_id, "overridden", resolved_by=resolved_by, notes=notes)

    # ------------------------------------------------------------------
    # Timeout
    # ------------------------------------------------------------------

    async def wait_for_resolution(self) -> Optional[str]:
        """Await the next resolution (or timeout). Returns the decision id when resolved.

        This is the loop-side blocking call: the mission loop invokes it while paused.
        """
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        with self._lock:
            if not self.pending():
                return None
            self._waiters.append(future)
        try:
            return await asyncio.wait_for(future, timeout=self._timeout)
        except asyncio.TimeoutError:
            return self._on_timeout()
        finally:
            with self._lock:
                if future in self._waiters:
                    self._waiters.remove(future)

    def interrupt(self) -> None:
        """Wake all waiters immediately without resolving decisions.

        Used by the mission loop to break out of a pause on stop / cycle-cap.
        """
        for future in list(self._waiters):
            if not future.done():
                future.set_result(INTERRUPTED)

    def timeout_now(self) -> Optional[str]:
        """Resolve all pending decisions by timeout (used by the loop timeout handler)."""
        return self._on_timeout()

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------

    def pending(self) -> List[Dict[str, Any]]:
        """The currently pending decisions (JSON-ready)."""
        return self._manager.state.pending_confirmations

    def is_paused(self) -> bool:
        return self._manager.state.status.stage == "awaiting_confirmation"

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _next_decision_id(self) -> str:
        seq = len(self._manager.state.human_decisions) + 1
        return f"DEC-{seq}"

    def _on_timeout(self) -> Optional[str]:
        with self._lock:
            pending = self.pending()
            if not pending:
                return None
            status = timeout_status_for(self._timeout_action)
            first = pending[0]["id"]
            for i, record in enumerate(pending):
                last = i == len(pending) - 1
                self._manager.resolve_hitl_atomic(
                    ORCHESTRATOR, record["id"], status,
                    resolved_by="system", notes=f"timeout after {self._timeout}s",
                    review_needed=False if last else None,
                )
            self._sink.emit_decision(
                first,
                "confirm",
                f"HITL decision(s) timed out after {self._timeout}s",
                level="WARNING",
                data={"status": status, "timeout_action": self._timeout_action},
            )
            if self._timeout_action == "escalate":
                self.resume(resolved_by="system", notes="timeout escalate")
            return first

    def _wake(self, decision_id: Optional[str] = None) -> None:
        for future in list(self._waiters):
            if not future.done():
                future.set_result(decision_id)
