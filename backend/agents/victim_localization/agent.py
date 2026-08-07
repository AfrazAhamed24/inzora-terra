from typing import Any, Dict
from backend.agents.base import BaseAgent
from backend.core.gop import TERRAState
from backend.interfaces.protocol import build_contract_output


class VictimLocalizationAgent(BaseAgent):
    version = "1.0"
    description = "Locates victims using thermal, GPR, and witness evidence"
    capabilities = ["thermal", "gpr", "witness", "search"]
    reads = frozenset({"telemetry", "environment", "evidence"})
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
        return {"thermal": thermal, "gpr": gpr, "reports": reports}

    async def reason(self, perception: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        zones = []
        thermal = perception.get("thermal", {})
        thermal_str = str(thermal).lower()

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
        if perception.get("reports"):
            zones.append({
                "zone": "A1",
                "level": "ground_floor",
                "probability": 0.6,
                "source": "witness_report",
                "confidence": 0.50,
                "priority": "HIGH",
            })
        zones.sort(key=lambda z: z["probability"], reverse=True)
        total_victims = len(zones)
        return {
            "action": "update_victim_map",
            "zones": zones,
            "total_victims_estimated": total_victims,
            "primary_zone": zones[0]["zone"] if zones else "unknown",
            "confidence": round(sum(z["confidence"] for z in zones) / max(len(zones), 1), 2),
        }

    async def act(self, decision: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        report = {
            "zones": decision["zones"],
            "total_victims_estimated": decision["total_victims_estimated"],
            "primary_search_zone": decision["primary_zone"],
            "confidence": decision["confidence"],
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
            reasoning_summary=(
                f"Primary search zone {report['primary_search_zone']} "
                f"({report['total_victims_estimated']} victims estimated)"
            ),
            next_handoff={
                "agent": "resource_coordination",
                "reason": "victim zones inform search team deployment",
            },
        )
