"""MissionStreamService: tail the live mission state and emit typed SSE events.

The MissionLoop is the single writer (through ``MissionStateManager``); this service *observes*
the append-only histories (telemetry, timeline, agent_outputs, human_decisions) plus the mutable
status/summary and re-frames every change as an event. It contains **zero orchestration logic** —
it only diffs what the loop already wrote, so it cannot desynchronize from the engine.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, AsyncIterator, Dict

from backend.api.services.mission_service import MissionService
from backend.core.lifecycle import is_terminal

_POLL_INTERVAL = 0.1


def _agent_report_full(agent_name: str, output: Dict[str, Any]) -> Dict[str, Any]:
    """The agent's complete report as structured data, sent to the UI verbatim.

    The frontend renders the full report one agent at a time (not a summary). For contract
    envelopes this is the agent's owned artifact (``produced_artifacts``) plus its
    ``reasoning_summary``; for flat fallback reports it is the output itself.
    """
    artifacts = (output or {}).get("produced_artifacts") or {}
    if agent_name == "briefing_generator":
        return {
            "mission_briefing": (output or {}).get("mission_briefing") or {},
            "reasoning_summary": (output or {}).get("reasoning_summary", ""),
        }
    field = {
        "risk_assessment": "risk_report",
        "victim_localization": "victim_map",
        "resource_coordination": "resource_allocation",
        "knowledge_retrieval": "knowledge_results",
        "rescue_coordination": "rescue_guidance",
    }.get(agent_name)
    report = artifacts.get(field) if field else None
    if not isinstance(report, dict):
        report = output or {}
    result = dict(report)
    if isinstance(output, dict) and output.get("reasoning_summary"):
        result.setdefault("reasoning_summary", output["reasoning_summary"])
    return result


def _agent_report(agent_name: str, output: Dict[str, Any]) -> str:
    """Condense an agent's output envelope into one spoken summary line.

    D.E.X.T.E.R narrates each agent's completion from this text (real data, never fabricated).
    The output is either the universal-contract envelope (``produced_artifacts``) or a flat
    fallback report (``source: fallback``). Unknown shapes degrade to an empty string and the
    frontend falls back to a generic completion line.
    """
    artifacts = (output or {}).get("produced_artifacts") or {}

    if agent_name == "risk_assessment":
        report = artifacts.get("risk_report") or (output or {})
        likelihood = report.get("likelihood")
        score = report.get("risk_score")
        rec = report.get("recommendation")
        parts = []
        if likelihood:
            parts.append(f"Structural risk {str(likelihood).upper()}")
        if isinstance(score, (int, float)):
            parts.append(f"score {score:.2f}")
        if rec:
            parts.append(str(rec))
        return ". ".join(parts)

    if agent_name == "victim_localization":
        report = artifacts.get("victim_map") or (output or {})
        zones = report.get("zones") or []
        primary = report.get("primary_search_zone")
        total = report.get("total_victims_estimated")
        parts = []
        if zones:
            parts.append(f"{len(zones)} zones identified")
        if primary:
            prob = next(
                (z.get("probability") for z in zones if z.get("zone") == primary), None
            )
            if isinstance(prob, (int, float)):
                parts.append(f"primary zone {primary} at {prob:.0%}")
            else:
                parts.append(f"primary zone {primary}")
        if isinstance(total, (int, float)):
            parts.append(f"{int(total)} victims estimated")
        return ". ".join(parts)

    if agent_name == "resource_coordination":
        report = artifacts.get("resource_allocation") or (output or {})
        assignments = report.get("assignments") or []
        util = report.get("utilization")
        zones = sorted({a.get("zone") for a in assignments if a.get("zone")})
        parts = []
        if assignments:
            parts.append(f"{len(assignments)} assignments deployed")
        if zones:
            parts.append(f"zones {', '.join(zones)}")
        if isinstance(util, (int, float)):
            parts.append(f"team utilization {util:.0%}")
        return ". ".join(parts)

    if agent_name == "knowledge_retrieval":
        report = artifacts.get("knowledge_results") or (output or {})
        sops = report.get("sops") or []
        codes = report.get("building_codes") or []
        parts = []
        if sops:
            parts.append(f"matched {len(sops)} SOPs")
        if codes:
            parts.append(f"{len(codes)} building codes")
        if parts:
            return ". ".join(parts)
        recs = report.get("recommendations") or []
        return f"{len(recs)} recommendations" if recs else ""

    if agent_name == "rescue_coordination":
        report = artifacts.get("rescue_guidance") or (output or {})
        summary = report.get("summary")
        clearance = report.get("entry_clearance")
        sequence = report.get("priority_sequence") or []
        parts = []
        if summary:
            parts.append(str(summary))
        if clearance:
            parts.append(f"entry {str(clearance).lower()}")
        if sequence:
            parts.append(f"priority sequence {', '.join(sequence)}")
        return ". ".join(parts)

    if agent_name == "briefing_generator":
        briefing = (output or {}).get("mission_briefing") or {}
        risk = briefing.get("overall_risk")
        zones = briefing.get("priority_zones") or []
        victims = briefing.get("total_victims_estimated")
        parts = []
        if risk:
            parts.append(f"overall risk {str(risk).upper()}")
        if zones:
            parts.append(f"priority zones {', '.join(zones)}")
        if isinstance(victims, (int, float)):
            parts.append(f"{int(victims)} victims estimated")
        return ". ".join(parts) if parts else ""

    return ""


@dataclass
class _Cursors:
    """Monotonic observation cursors per append-only collection."""

    telemetry: int = 0
    timeline: int = 0
    agent_outputs: int = 0
    decisions: int = 0
    summary_ts: str = ""
    stage: str = ""


class MissionStreamService:
    """Diff-based tail over a single mission's live state."""

    def __init__(self, missions: MissionService, *, poll_interval: float = _POLL_INTERVAL):
        self._missions = missions
        self._interval = poll_interval

    async def events(self, mission_id: str) -> AsyncIterator[Dict[str, Any]]:
        """Yield one dict per new state change (typed for SSE consumers).

        Terminates once the mission reaches a terminal stage and its loop has stopped, so a
        completed mission closes the stream cleanly instead of polling forever.
        """
        session = self._missions.get(mission_id)
        cursors = _Cursors()

        # Initial status snapshot on connect.
        state = session.manager.state
        cursors.stage = state.status.stage
        yield {"type": "status", "mission_id": mission_id,
               "stage": state.status.stage, "phase": state.status.phase,
               "is_running": session.is_running}

        while True:
            state = session.manager.state

            # Telemetry packets (append-only).
            telemetry = state.telemetry
            if len(telemetry) > cursors.telemetry:
                for packet in telemetry[cursors.telemetry:]:
                    yield {"type": "telemetry", "mission_id": mission_id,
                           "packet": packet.model_dump()}
                cursors.telemetry = len(telemetry)

            # Timeline events.
            timeline = state.timeline
            if len(timeline) > cursors.timeline:
                for event in timeline[cursors.timeline:]:
                    yield {"type": "timeline", "mission_id": mission_id,
                           "event": event.model_dump()}
                cursors.timeline = len(timeline)

            # Agent execution results.
            outputs = state.agent_outputs
            if len(outputs) > cursors.agent_outputs:
                for out in outputs[cursors.agent_outputs:]:
                    # Extract reasoning from the output envelope for the frontend.
                    reasoning = (out.output or {}).get("reasoning", "") or (out.output or {}).get("reasoning_summary", "")
                    yield {"type": "agent", "mission_id": mission_id,
                           "agent": out.agent_name, "status": out.status,
                           "confidence": out.confidence, "cycle_id": out.cycle_id,
                           "timestamp": out.timestamp,
                           "report": _agent_report(out.agent_name, out.output),
                           "report_full": _agent_report_full(out.agent_name, out.output),
                           "reasoning": reasoning}
                cursors.agent_outputs = len(outputs)

            # HITL decisions (append-only).
            decisions = state.human_decisions
            if len(decisions) > cursors.decisions:
                for dec in decisions[cursors.decisions:]:
                    yield {"type": "decision", "mission_id": mission_id,
                           "decision": dec.model_dump()}
                cursors.decisions = len(decisions)

            # Stage transitions.
            if state.status.stage != cursors.stage:
                cursors.stage = state.status.stage
                yield {"type": "status", "mission_id": mission_id,
                       "stage": state.status.stage, "phase": state.status.phase,
                       "is_running": session.is_running}

            # Summary refreshes.
            if state.summary is not None and state.summary.generated_at != cursors.summary_ts:
                cursors.summary_ts = state.summary.generated_at
                yield {"type": "summary", "mission_id": mission_id,
                       "summary": state.summary.model_dump()}

            # Terminate when the mission has reached a terminal stage and the loop stopped.
            if is_terminal(state.status.stage) and not session.is_running:
                yield {"type": "status", "mission_id": mission_id,
                       "stage": state.status.stage, "phase": state.status.phase,
                       "is_running": False, "terminal": True}
                return

            await asyncio.sleep(self._interval)