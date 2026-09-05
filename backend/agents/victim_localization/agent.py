import json
from typing import Any, Dict
from backend.agents.base import BaseAgent
from backend.core.gop import TERRAState
from backend.interfaces.protocol import build_contract_output

try:
    from backend.core.llm_client import is_available as llm_available, generate_json
except ImportError:
    llm_available = lambda: False
    generate_json = None

_VICTIM_SYSTEM_PROMPT = """You are the Victim Localization Agent for D.E.X.T.E.R.
Analyze thermal imaging, GPR, witness reports, and risk assessment data to locate probable survivors.

Return a JSON object with:
{
  "zones": [{"zone": str, "level": str, "probability": float 0-1, "source": str, "confidence": float 0-1, "priority": "HIGH"|"MEDIUM"|"LOW", "reasoning": str}],
  "total_victims_estimated": int,
  "primary_zone": str,
  "reasoning": string (2-3 sentences)
}

Consider: thermal signatures above 31°C indicate human presence, GPR voids may indicate trapped
persons, witness accounts add corroboration. HIGH priority zones are those with probability > 0.6
AND corroborating evidence from multiple sources."""


class VictimLocalizationAgent(BaseAgent):
    version = "1.0"
    description = "Locates victims using thermal, GPR, and witness evidence"
    capabilities = ["thermal", "gpr", "witness", "search"]
    reads = frozenset({"risk_report", "telemetry", "environment", "evidence"})
    writes = frozenset({"victim_map", "tasks"})

    def __init__(self):
        super().__init__(name="victim_localization")

    async def perceive(self, gop: TERRAState) -> Dict[str, Any]:
        thermal = None
        gpr = None
        reports = []
        for e in gop.evidence:
            data_str = str(e.data).lower()
            if "thermal" in data_str:
                thermal = e.data
            if e.source.startswith("sensor"):
                gpr = e.data
            if "report" in e.source or "witness" in e.source:
                reports.append(e.data)
        risk_report = gop.risk_report or {}
        return {
            "thermal": thermal,
            "gpr": gpr,
            "reports": reports,
            "risk_report": risk_report,
        }

    async def reason(self, perception: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        zones = []
        thermal = perception.get("thermal", {})
        thermal_str = str(thermal).lower()
        risk = perception.get("risk_report", {}) or {}
        risk_level = risk.get("likelihood", "UNKNOWN")

        # Enhanced thermal analysis
        if "heat signature" in thermal_str or "thermal" in thermal_str:
            zones.append({
                "zone": "B2",
                "level": "basement",
                "probability": 0.8,
                "source": "thermal_imaging",
                "confidence": 0.85,
                "priority": "HIGH",
            })
            zones.append({
                "zone": "B1",
                "level": "ground_floor",
                "probability": 0.4,
                "source": "thermal_imaging",
                "confidence": 0.70,
                "priority": "MEDIUM",
            })

        # Witness corroboration
        if perception.get("reports"):
            zones.append({
                "zone": "A1",
                "level": "ground_floor",
                "probability": 0.6,
                "source": "witness_report",
                "confidence": 0.50,
                "priority": "HIGH",
            })

        # Risk context escalation
        if risk_level in ("HIGH", "CRITICAL"):
            for z in zones:
                z["priority"] = "HIGH"
                z["probability"] = min(z["probability"] + 0.05, 0.95)

        zones.sort(key=lambda z: z["probability"], reverse=True)
        total_victims = len(zones)
        primary_zone = zones[0]["zone"] if zones else "unknown"
        confidence = round(sum(z["confidence"] for z in zones) / max(len(zones), 1), 2)

        reasoning_chain = (
            f"Primary search zone {primary_zone} with {total_victims} estimated victims "
            f"based on {risk_level} risk assessment"
        )

        # LLM-enhanced reasoning
        if llm_available() and generate_json:
            try:
                llm_input = json.dumps({
                    "thermal_data": thermal,
                    "gpr_data": perception.get("gpr"),
                    "witness_reports": len(perception.get("reports", [])),
                    "risk_level": risk_level,
                    "rule_based_zones": zones,
                }, default=str)

                llm_result = generate_json(
                    _VICTIM_SYSTEM_PROMPT,
                    f"Victim detection data:\n{llm_input}",
                )

                if llm_result and llm_result.get("zones"):
                    # Merge LLM zones with rule-based zones
                    llm_zones = llm_result["zones"]
                    existing_ids = {z["zone"] for z in zones}
                    for lz in llm_zones:
                        if lz.get("zone") not in existing_ids:
                            zones.append({
                                "zone": lz["zone"],
                                "level": lz.get("level", "unknown"),
                                "probability": float(lz.get("probability", 0.3)),
                                "source": lz.get("source", "llm_analysis"),
                                "confidence": float(lz.get("confidence", 0.6)),
                                "priority": lz.get("priority", "MEDIUM"),
                            })
                    zones.sort(key=lambda z: z["probability"], reverse=True)
                    total_victims = len(zones)
                    primary_zone = zones[0]["zone"] if zones else "unknown"

                    if llm_result.get("reasoning"):
                        reasoning_chain = llm_result["reasoning"]

                    confidence = round(min(confidence + 0.05, 0.95), 2)
            except Exception:
                pass

        return {
            "action": "update_victim_map",
            "zones": zones,
            "total_victims_estimated": total_victims,
            "primary_zone": primary_zone,
            "risk_context": risk_level,
            "confidence": confidence,
            "reasoning": reasoning_chain,
        }

    async def act(self, decision: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        reasoning = decision.get("reasoning", "")
        report = {
            "zones": decision["zones"],
            "total_victims_estimated": decision["total_victims_estimated"],
            "primary_search_zone": decision["primary_zone"],
            "risk_context": decision.get("risk_context", "UNKNOWN"),
            "confidence": decision["confidence"],
            "reasoning": reasoning,
        }
        tasks = []
        for z in decision["zones"]:
            if z["priority"] == "HIGH":
                tasks.append({
                    "description": (
                        f"Search {z['zone']} ({z['level']}) - "
                        f"probability {z['probability']:.0%}"
                    ),
                    "priority": "HIGH",
                    "requires_confirmation": True,
                })
        return build_contract_output(
            confidence=decision["confidence"],
            produced_artifacts={"victim_map": report},
            tasks=tasks,
            reasoning_summary=reasoning or (
                f"Primary search zone {report['primary_search_zone']} "
                f"({report['total_victims_estimated']} victims estimated) "
                f"after {report.get('risk_context', 'UNKNOWN')} risk assessment"
            ),
            next_handoff={
                "agent": "resource_coordination",
                "reason": "victim zones inform search team deployment",
            },
        )
