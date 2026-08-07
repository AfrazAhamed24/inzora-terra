from typing import Any, Dict
from backend.agents.base import BaseAgent
from backend.core.gop import TERRAState
from backend.interfaces.protocol import build_contract_output


class RiskAssessmentAgent(BaseAgent):
    version = "1.0"
    description = "Evaluates structural risk from sensor, weather, and building evidence"
    capabilities = ["structural", "sensor", "environment"]
    reads = frozenset({"telemetry", "environment", "evidence"})
    writes = frozenset({"risk_report", "tasks"})

    def __init__(self):
        super().__init__(name="risk_assessment")

    async def perceive(self, gop: TERRAState) -> Dict[str, Any]:
        worst_tilt = None
        max_angle = 0
        weather = None
        building = None
        for e in gop.evidence:
            if e.source.startswith("sensor"):
                angle = e.data.get("tilt_deg", 0) if isinstance(e.data, dict) else 0
                if angle > max_angle:
                    max_angle = angle
                    worst_tilt = e.data
            elif e.source.startswith("weather"):
                weather = e.data
            elif e.source.startswith("building"):
                building = e.data
        return {"tilt": worst_tilt, "weather": weather, "building": building}

    async def reason(self, perception: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        tilt = perception.get("tilt")
        weather = perception.get("weather")
        risk_score = 0.0
        hazards = []
        if tilt:
            angle = tilt.get("tilt_deg", 0)
            trend = tilt.get("trend", "stable")
            if angle > 3:
                risk_score += 0.4
                hazards.append(f"Tilt angle {angle} degrees exceeds stability threshold")
            if trend == "increasing":
                risk_score += 0.3
                hazards.append("Trend is increasing - conditions worsening")
        if weather and "rain" in str(weather).lower():
            risk_score += 0.2
            hazards.append("Heavy rain worsens soil instability")
        risk_score = min(risk_score, 1.0)
        if risk_score > 0.5:
            likelihood = "HIGH"
            recommendation = "Evacuate immediately. Do not enter structure."
        elif risk_score > 0.2:
            likelihood = "MEDIUM"
            recommendation = "Proceed with caution. Monitor structure."
        else:
            likelihood = "LOW"
            recommendation = "Structure appears stable. Continue monitoring."
        confidence = min(0.5 + risk_score * 0.3, 0.95)
        return {
            "action": "generate_report",
            "risk_score": risk_score,
            "likelihood": likelihood,
            "hazards": hazards,
            "recommendation": recommendation,
            "confidence": round(confidence, 2),
        }

    async def act(self, decision: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        report = {
            "likelihood": decision["likelihood"],
            "risk_score": decision["risk_score"],
            "hazards": decision["hazards"],
            "recommendation": decision["recommendation"],
            "confidence": decision["confidence"],
            "trend": "increasing" if decision["risk_score"] > 0.5 else "stable",
        }
        tasks = []
        if decision["likelihood"] == "HIGH":
            tasks.append({
                "description": "Evacuate structure",
                "priority": "HIGH",
                "requires_confirmation": True,
            })
            tasks.append({
                "description": "Deploy monitoring teams",
                "priority": "HIGH",
                "requires_confirmation": False,
            })
        return build_contract_output(
            confidence=decision["confidence"],
            produced_artifacts={"risk_report": report},
            tasks=tasks,
            reasoning_summary=(
                f"Structural risk evaluated at {decision['risk_score']:.2f} "
                f"-> {decision['likelihood']}"
            ),
            next_handoff={
                "agent": "resource_coordination",
                "reason": "risk level drives resource allocation",
            },
        )
