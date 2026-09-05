from typing import Any, Dict
from backend.agents.base import BaseAgent
from backend.core.gop import TERRAState
from backend.interfaces.protocol import build_contract_output


class ResourceCoordinationAgent(BaseAgent):
    version = "1.0"
    description = "Allocates teams and equipment based on risk and victim data"
    capabilities = ["resource", "allocation", "logistics"]
    reads = frozenset({"risk_report", "victim_map", "tasks"})
    writes = frozenset({"resource_allocation", "tasks"})

    def __init__(self):
        super().__init__(name="resource_coordination")

    async def perceive(self, gop: TERRAState) -> Dict[str, Any]:
        risk_report = gop.risk_report
        victim_map = gop.victim_map
        tasks = gop.tasks
        return {
            "risk_report": risk_report,
            "victim_map": victim_map,
            "tasks": tasks,
        }

    async def reason(self, perception: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        risk = perception.get("risk_report", {})
        victims = perception.get("victim_map", {})
        tasks = perception.get("tasks", [])

        risk_level = risk.get("likelihood", "LOW")
        zones = victims.get("zones", [])

        assignments = []
        teams_available = ["Alpha", "Bravo", "Charlie"]
        equipment = {
            "rescue": ["hydraulic_jacks", "cutting_tools", "thermal_suits"],
            "medical": ["first_aid_kits", "stretchers", "defibrillators"],
            "evacuate": ["breathing_apparatus", "communication_radios"],
            "secure": ["barrier_tape", "structural_monitors"],
        }

        team_idx = 0
        for zone in zones:
            if zone.get("priority") == "HIGH":
                team = teams_available[team_idx % len(teams_available)]
                task_type = "rescue" if zone.get("probability", 0) > 0.6 else "search"
                assignments.append({
                    "id": f"T{len(tasks) + len(assignments) + 1:03d}",
                    "type": task_type,
                    "zone": zone["zone"],
                    "priority": "HIGH",
                    "assigned_to": f"Team {team}",
                    "equipment": equipment.get(task_type, [])[:2],
                    "eta_minutes": 10 + team_idx * 5,
                })
                team_idx += 1

        if risk_level in ["HIGH", "CRITICAL"]:
            assignments.append({
                "id": f"T{len(tasks) + len(assignments) + 1:03d}",
                "type": "secure",
                "zone": "perimeter",
                "priority": "HIGH",
                "assigned_to": f"Team {teams_available[team_idx % len(teams_available)]}",
                "equipment": equipment["secure"],
                "eta_minutes": 5,
            })

        utilization = min(len(assignments) / max(len(teams_available), 1), 1.0)
        bottlenecks = []
        if len(zones) > len(teams_available):
            bottlenecks.append("More zones than available teams")
        if risk_level == "CRITICAL":
            bottlenecks.append("CRITICAL risk - additional resources needed")

        team_names = [a['assigned_to'] for a in assignments]
        reasoning = (
            f"Allocated {len(assignments)} teams ({', '.join(team_names)}) across "
            f"{len(zones)} HIGH-priority zones. Utilization at {utilization:.0%}."
        )
        if bottlenecks:
            reasoning += f" Bottlenecks identified: {'; '.join(bottlenecks)}."

        return {
            "action": "allocate_resources",
            "assignments": assignments,
            "resource_utilization": round(utilization, 2),
            "bottlenecks": bottlenecks,
            "confidence": round(min(0.7 + utilization * 0.2, 0.95), 2),
            "reasoning": reasoning,
        }

    async def act(self, decision: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        tasks = [
            {
                "description": f"{a['type'].upper()}: Zone {a['zone']} ({a['assigned_to']})",
                "priority": a["priority"],
                "requires_confirmation": a["priority"] == "HIGH",
            }
            for a in decision["assignments"]
        ]
        report = {
            "assignments": decision["assignments"],
            "utilization": decision["resource_utilization"],
            "bottlenecks": decision["bottlenecks"],
        }
        reasoning = decision.get("reasoning", "")
        return build_contract_output(
            confidence=decision["confidence"],
            produced_artifacts={"resource_allocation": report},
            tasks=tasks,
            reasoning_summary=reasoning or (
                f"Allocated {len(report['assignments'])} assignments across victim zones "
                f"(utilization {report['utilization']:.0%})"
            ),
            next_handoff={
                "agent": "knowledge_retrieval",
                "reason": "resource plan scopes the knowledge query",
            },
        )
