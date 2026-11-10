import json
import os
from typing import Any, Dict

from backend.agents.base import BaseAgent
from backend.core.gop import TERRAState
from backend.interfaces.protocol import build_contract_output


class EnhancedResourceCoordinationAgent(BaseAgent):
    version = "2.0"
    description = "Allocates teams and equipment using rule-based + LLM optimization"
    capabilities = ["resource", "allocation", "logistics", "optimization"]
    reads = frozenset({"risk_report", "victim_map", "tasks"})
    writes = frozenset({"resource_allocation", "tasks"})
    
    def __init__(self):
        super().__init__(name="resource_coordination")
        self._router = None
        self._setup_team_database()
        
    def _setup_team_database(self):
        """Initialize comprehensive team/equipment database"""
        self.teams = [
            {"name": "Alpha", "specialty": "structural", "capacity": 8},
            {"name": "Bravo", "specialty": "medical", "capacity": 6},
            {"name": "Charlie", "specialty": "search", "capacity": 10},
            {"name": "Delta", "specialty": "evacuation", "capacity": 5},
            {"name": "Echo", "specialty": "communications", "capacity": 4},
        ]
        
    def _router_enabled(self) -> bool:
        return os.getenv("TERRA_LLM_ROUTER", "0") in ("1", "true", "yes")
        
    def _get_router(self):
        if self._router is None:
            from backend.llm.router import get_router
            self._router = get_router()
        return self._router

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

        decision = {
            "action": "allocate_resources",
            "assignments": assignments,
            "resource_utilization": round(utilization, 2),
            "bottlenecks": bottlenecks,
            "confidence": round(min(0.7 + utilization * 0.2, 0.95), 2),
            "reasoning": reasoning,
        }

        # LLM Enhancement
        system_prompt = self._get_resource_allocation_prompt()
        enhanced_decision = await self._enhance_with_llm(decision, gop, system_prompt)

        # Use the enhanced decision
        return {
            "action": enhanced_decision["action"],
            "assignments": enhanced_decision["assignments"],
            "resource_utilization": enhanced_decision["resource_utilization"],
            "bottlenecks": enhanced_decision["bottlenecks"],
            "confidence": enhanced_decision["confidence"],
            "reasoning": enhanced_decision["reasoning"],
            "optimization_method": enhanced_decision.get("optimization_method", "rule_based"),
            "objective_score": enhanced_decision.get("objective_score", 0.0),
            "trade_offs": enhanced_decision.get("trade_offs", []),
        }

    def _get_resource_allocation_prompt(self) -> str:
        return """You are a resource allocation optimization expert for disaster response.

Analyze the current resource allocation decisions and optimize them for maximum victim rescue probability.
Consider:
- Team specialties and capabilities
- Zone characteristics and victim priorities  
- Risk levels and safety constraints
- Equipment availability and constraints
- Operational feasibility and time constraints

You MUST return a JSON object with these exact fields:
{
  "assignments": [{"id": str, "type": "rescue|search|secure|medical|evacuate", "zone": str, "priority": "HIGH|MEDIUM|LOW", "assigned_to": str, "equipment": [str], "eta_minutes": int}],
  "objective_score": float (0.0-1.0, higher = better allocation),
  "trade_offs": [string list of compromises made],
  "confidence": float (0.0-1.0)
}

Optimization principles:
- Prioritize zones with highest victim probability and severity
- Match team specialties to zone requirements
- Balance load across teams to avoid burnout
- Consider time-critical situations and response times
- Maintain safety constraints and risk thresholds
- Use all available teams effectively

Return ONLY valid JSON.

Current context: Multi-zone disaster with teams Alpha, Bravo, Charlie. Need to allocate resources across victim zones and secure perimeter."""

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
                f"(utilization {report['utilization']:.0%}) "
                f"(method: {decision.get('optimization_method', 'rule_based')})"
            ),
            next_handoff={
                "agent": "knowledge_retrieval",
                "reason": "resource plan scopes the knowledge query",
            },
        )


# For backward compatibility, keep the original agent class name
ResourceCoordinationAgent = EnhancedResourceCoordinationAgent
