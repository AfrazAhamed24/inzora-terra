"""Rescue Coordination Agent (the "rescue agent").

Synthesizes the outputs of Risk Assessment, Victim Localization, Resource Coordination, and
Knowledge Retrieval into a single field-ready rescue handoff (``rescue_guidance``). It is the
last specialist in the dependency graph — everything before it feeds this report, and the
Briefing Generator surfaces it in the final mission briefing so field teams get a proper,
grounded summary instead of raw agent data.

The guidance covers: entry clearance, prioritized rescue sequence, extraction techniques per
zone, safety constraints, triage notes, and communications. Rule-based (like the other agents);
the confidence reflects how much of the specialist picture was available.
"""

from typing import Any, Dict

from backend.agents.base import BaseAgent
from backend.core.gop import TERRAState
from backend.interfaces.protocol import build_contract_output

# Entry clearance derived from the structural risk likelihood.
_ENTRY_BY_RISK: Dict[str, str] = {
    "CRITICAL": "HOLD",
    "HIGH": "CONDITIONAL",
    "MEDIUM": "CONDITIONAL",
    "LOW": "CLEAR",
}

# Extraction technique by zone priority / probability band.
_EXTRACTION_TECHNIQUES: Dict[str, str] = {
    "high": "thermal-guided void entry — silent search, debris-void approach",
    "medium": "GPR-correlated void approach with structural shoring",
    "low": "surface recovery and witness-correlated sweep",
}

_SAFETY_GROUND = [
    "Do not enter the structure without heavy rescue equipment",
    "Deploy structural monitors and track tilt progression before entry",
    "Establish a hard perimeter around the collapse footprint",
]


class RescueCoordinationAgent(BaseAgent):
    version = "1.0"
    description = (
        "Synthesizes risk, victim, resource, and knowledge outputs into "
        "actionable rescue guidance for field teams"
    )
    capabilities = ["rescue", "guidance", "extraction", "triage", "handoff"]
    reads = frozenset({"risk_report", "victim_map", "resource_allocation", "knowledge_results"})
    writes = frozenset({"rescue_guidance", "confidence_scores", "tasks"})

    def __init__(self):
        super().__init__(name="rescue_coordination")

    async def perceive(self, gop: TERRAState) -> Dict[str, Any]:
        return {
            "risk_report": gop.risk_report,
            "victim_map": gop.victim_map,
            "resource_allocation": gop.resource_allocation,
            "knowledge_results": gop.knowledge_results,
        }

    async def reason(self, perception: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        risk = perception.get("risk_report", {})
        victims = perception.get("victim_map", {})
        resources = perception.get("resource_allocation", {})
        knowledge = perception.get("knowledge_results", {})

        likelihood = str(risk.get("likelihood", "LOW")).upper()
        risk_score = risk.get("risk_score", 0.0)
        hazards = risk.get("hazards", [])
        zones = sorted(
            victims.get("zones", []),
            # HIGH priority first, then by probability descending.
            key=lambda z: (z.get("priority") != "HIGH", -float(z.get("probability", 0))),
        )
        primary_zone = victims.get("primary_search_zone")
        total_victims = victims.get("total_victims_estimated", 0)
        assignments = resources.get("assignments", [])
        bottlenecks = resources.get("bottlenecks", [])
        recommendations = knowledge.get("recommendations", [])

        # Priority sequence: high-probability victim zones first, then primary zone, then the rest.
        priority_sequence: list = []
        for zone in zones:
            if zone.get("priority") == "HIGH":
                priority_sequence.append(zone["zone"])
        if primary_zone and primary_zone not in priority_sequence:
            priority_sequence.append(primary_zone)
        for zone in zones:
            if zone["zone"] not in priority_sequence:
                priority_sequence.append(zone["zone"])

        # Extraction guidance per prioritized zone.
        extraction_guidance = []
        for zone in zones:
            zone_id = zone["zone"]
            probability = float(zone.get("probability", 0))
            band = "high" if probability > 0.6 else "medium" if probability > 0.35 else "low"
            technique = _EXTRACTION_TECHNIQUES[band]
            notes = []
            if zone.get("priority") == "HIGH":
                notes.append("highest victim probability — first team in")
            if likelihood in ("HIGH", "CRITICAL"):
                notes.append("structural risk elevated — shoring required before entry")
            extraction_guidance.append(
                {
                    "zone": zone_id,
                    "probability": round(probability, 2),
                    "technique": technique,
                    "notes": notes,
                }
            )

        # Objectives derived from the victim map + assigned teams.
        objectives = []
        if priority_sequence:
            objectives.append(
                f"Locate and extract victims in {', '.join(priority_sequence[:3])} "
                f"(estimated {total_victims} victims)"
            )
        if assignments:
            deployed = ", ".join(sorted({a.get("assigned_to", "") for a in assignments}))
            objectives.append(f"Coordinate deployed teams ({deployed}) against the priority sequence")
        else:
            objectives.append("Request resource allocation before staging teams")

        # Safety constraints: grounded in the risk report + knowledge recommendations.
        safety_constraints = list(_SAFETY_GROUND)
        safety_constraints.extend(h for h in hazards if h not in safety_constraints)
        safety_constraints.extend(r for r in recommendations if r not in safety_constraints)
        safety_constraints.extend(f"Bottleneck: {b}" for b in bottlenecks)
        if likelihood == "CRITICAL":
            safety_constraints.append("CRITICAL risk — no entry without supervisor approval")
        safety_constraints = safety_constraints[:6]

        triage_notes = [
            f"{total_victims} victims estimated — stage triage teams at the perimeter",
        ]
        if primary_zone:
            triage_notes.append(f"First casualties expected from {primary_zone}")

        # Confidence: how much of the specialist picture was available.
        available = 0
        if risk:
            available += 1
        if victims.get("zones"):
            available += 1
        if resources.get("assignments"):
            available += 1
        if knowledge.get("recommendations"):
            available += 1
        confidence = round(min(0.55 + 0.1 * available, 0.95), 2)

        reasoning = (
            f"Synthesized {likelihood} risk ({risk_score:.2f}), {len(zones)} victim zones, "
            f"{len(assignments)} team assignments, and {len(recommendations)} safety constraints. "
            f"Entry clearance: {_ENTRY_BY_RISK.get(likelihood, 'CONDITIONAL')}. "
            f"Priority sequence: {', '.join(priority_sequence[:3])}."
        )

        return {
            "action": "compile_rescue_guidance",
            "summary": (
                f"{len(priority_sequence)} rescue zones prioritized; entry "
                f"{_ENTRY_BY_RISK.get(likelihood, 'CONDITIONAL').lower()}"
            ),
            "entry_clearance": _ENTRY_BY_RISK.get(likelihood, "CONDITIONAL"),
            "priority_sequence": priority_sequence,
            "objectives": objectives,
            "extraction_guidance": extraction_guidance,
            "safety_constraints": safety_constraints,
            "triage_notes": triage_notes,
            "comms_guidance": (
                "All teams report on a single incident channel; relay zone entry "
                "clearances and victim finds in real time"
            ),
            "confidence": confidence,
            "reasoning": reasoning,
        }

    async def act(self, decision: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        report = {
            "summary": decision["summary"],
            "entry_clearance": decision["entry_clearance"],
            "priority_sequence": decision["priority_sequence"],
            "objectives": decision["objectives"],
            "extraction_guidance": decision["extraction_guidance"],
            "safety_constraints": decision["safety_constraints"],
            "triage_notes": decision["triage_notes"],
            "comms_guidance": decision["comms_guidance"],
        }
        tasks = [
            {
                "description": f"Rescue objective: {obj}",
                "priority": "HIGH",
                "requires_confirmation": True,
            }
            for obj in decision["objectives"][:2]
        ]
        reasoning = decision.get("reasoning", "")
        return build_contract_output(
            confidence=decision["confidence"],
            produced_artifacts={"rescue_guidance": report},
            tasks=tasks,
            reasoning_summary=reasoning or (
                f"Rescue guidance compiled: {len(report['priority_sequence'])} zones, "
                f"entry {report['entry_clearance']}"
            ),
            next_handoff={
                "agent": "briefing_generator",
                "reason": "rescue guidance ready for the final mission briefing",
            },
        )
