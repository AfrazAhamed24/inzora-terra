import json
from typing import Any, Dict
from backend.agents.base import BaseAgent
from backend.core.gop import TERRAState
from backend.interfaces.protocol import build_contract_output

# Try to import LLM client — gracefully degrade to rule-based if unavailable.
try:
    from backend.core.llm_client import is_available as llm_available, generate_json
except ImportError:
    llm_available = lambda: False
    generate_json = None

_RISK_SYSTEM_PROMPT = """You are the Risk Assessment Agent for a disaster rescue orchestration system (D.E.X.T.E.R.).
Analyze the provided sensor, weather, and building evidence to assess structural risk.

You MUST return a JSON object with these exact fields:
{
  "risk_score": float (0.0 to 1.0),
  "likelihood": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "hazards": [list of specific hazard strings],
  "recommendation": string,
  "confidence": float (0.0 to 1.0),
  "reasoning": string (2-3 sentences explaining your analysis)
}

Be specific about which sensors triggered which hazards. Consider compound risks.
Risk score interpretation: <0.2 LOW, 0.2-0.5 MEDIUM, 0.5-0.8 HIGH, >0.8 CRITICAL."""


class RiskAssessmentAgent(BaseAgent):
    version = "1.0"
    description = "Evaluates structural risk from sensor, weather, and building evidence"
    capabilities = ["structural", "sensor", "environment"]
    reads = frozenset({"telemetry", "environment", "evidence"})
    writes = frozenset({"risk_report", "tasks"})

    def __init__(self):
        super().__init__(name="risk_assessment")
        self._router = None

    # -- LLM Router (crisis-bench 5-tier failover) --------------------------

    def _router_enabled(self) -> bool:
        import os

        return os.getenv("TERRA_LLM_ROUTER", "0") in ("1", "true", "yes")

    def _get_router(self):
        if self._router is None:
            from backend.llm.router import get_router

            self._router = get_router()
        return self._router

    def _call_router(self, tilt, weather, building, perception, risk_score, hazards):
        """Call the LLM router (critical tier) and return parsed JSON or None."""
        router = self._get_router()
        llm_input = json.dumps({
            "tilt_data": tilt,
            "weather_data": weather,
            "building_data": building,
            "sensor_count": len(perception.get("all_sensors", [])),
            "rule_based_score": risk_score,
            "rule_based_hazards": hazards,
        }, default=str)

        messages = [
            {"role": "system", "content": _RISK_SYSTEM_PROMPT},
            {"role": "user", "content": f"Disaster scene evidence:\n{llm_input}"},
        ]
        result = router.call("critical", messages, max_tokens=1200, temperature=0.2)
        text = result.content.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines)
        parsed = json.loads(text)
        # Attach provenance so the briefing can show the provider used.
        parsed["_provider"] = result.provider
        parsed["_cost_usd"] = round(result.cost_usd, 6)
        parsed["_latency_s"] = round(result.latency_s, 3)
        return parsed

    async def perceive(self, gop: TERRAState) -> Dict[str, Any]:
        worst_tilt = None
        max_angle = 0
        weather = None
        building = None
        all_sensors = []
        for e in gop.evidence:
            if e.source.startswith("sensor"):
                angle = e.data.get("tilt_deg", 0) if isinstance(e.data, dict) else 0
                if angle > max_angle:
                    max_angle = angle
                    worst_tilt = e.data
                all_sensors.append(e.data)
            elif e.source.startswith("weather"):
                weather = e.data
            elif e.source.startswith("building"):
                building = e.data
        return {
            "tilt": worst_tilt,
            "weather": weather,
            "building": building,
            "all_sensors": all_sensors,
        }

    async def reason(self, perception: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        # --- Enhanced rule-based reasoning (always runs) ---
        tilt = perception.get("tilt")
        weather = perception.get("weather")
        building = perception.get("building")
        risk_score = 0.0
        hazards = []

        if tilt:
            angle = tilt.get("tilt_deg", 0)
            trend = tilt.get("trend", "stable")
            if angle > 3:
                risk_score += 0.4
                hazards.append(f"Tilt angle {angle}° exceeds stability threshold (3°)")
            elif angle > 1.5:
                risk_score += 0.15
                hazards.append(f"Tilt angle {angle}° approaching threshold")
            if trend == "increasing":
                risk_score += 0.3
                hazards.append("Trend is increasing — conditions worsening")
            elif trend == "decreasing":
                risk_score -= 0.05
                hazards.append("Tilt trend decreasing — stabilizing")

        if weather:
            weather_str = str(weather).lower()
            if "heavy rain" in weather_str or "storm" in weather_str:
                risk_score += 0.25
                hazards.append("Heavy precipitation worsens soil instability and structural load")
            elif "rain" in weather_str:
                risk_score += 0.15
                hazards.append("Rain increases soil moisture and reduces foundation stability")

        if building:
            if isinstance(building, dict):
                age = building.get("age_years", 0)
                if age and age > 50:
                    risk_score += 0.1
                    hazards.append(f"Building age ({age} years) increases vulnerability")
                material = building.get("material", "")
                if "masonry" in str(material).lower() or "brick" in str(material).lower():
                    risk_score += 0.1
                    hazards.append("Masonry construction — higher collapse risk under lateral forces")

        # Compound risk: multiple hazards multiply danger
        if len(hazards) >= 3:
            risk_score = min(risk_score * 1.15, 1.0)

        risk_score = max(0.0, min(risk_score, 1.0))

        if risk_score > 0.7:
            likelihood = "CRITICAL"
            recommendation = "Immediate evacuation. No entry without heavy rescue equipment and structural monitoring."
        elif risk_score > 0.5:
            likelihood = "HIGH"
            recommendation = "Evacuate immediately. Do not enter structure without specialist equipment."
        elif risk_score > 0.2:
            likelihood = "MEDIUM"
            recommendation = "Proceed with caution. Deploy structural monitors and establish perimeter."
        else:
            likelihood = "LOW"
            recommendation = "Structure appears stable. Continue monitoring with regular tilt checks."

        confidence = min(0.5 + risk_score * 0.3, 0.95)

        # --- LLM-enhanced reasoning (if available) ---
        reasoning_chain = f"Risk evaluated at {risk_score:.2f} ({likelihood}) based on {len(hazards)} identified hazards."

        llm_result = None
        # Router path (crisis-bench 5-tier failover) — preferred when enabled.
        if self._router_enabled() and self._router is not None:
            try:
                llm_result = self._call_router(
                    tilt, weather, building, perception, risk_score, hazards
                )
            except Exception:
                llm_result = None  # fall through to legacy client

        # Legacy single-provider path (fallback).
        if llm_result is None and llm_available() and generate_json:
            try:
                llm_input = json.dumps({
                    "tilt_data": tilt,
                    "weather_data": weather,
                    "building_data": building,
                    "sensor_count": len(perception.get("all_sensors", [])),
                    "rule_based_score": risk_score,
                    "rule_based_hazards": hazards,
                }, default=str)

                llm_result = generate_json(
                    _RISK_SYSTEM_PROMPT,
                    f"Disaster scene evidence:\n{llm_input}",
                )
            except Exception:
                llm_result = None

        if llm_result:
            # Blend LLM and rule-based: take the more conservative risk score
            llm_score = float(llm_result.get("risk_score", risk_score))
            risk_score = max(risk_score, llm_score)

            llm_hazards = llm_result.get("hazards", [])
            for h in llm_hazards:
                if h not in hazards:
                    hazards.append(h)

            if llm_result.get("reasoning"):
                reasoning_chain = llm_result["reasoning"]

            # Update confidence: blend with LLM confidence
            llm_conf = float(llm_result.get("confidence", confidence))
            confidence = round(min((confidence + llm_conf) / 2 + 0.1, 0.95), 2)

            # Update recommendation if LLM provided a better one
            if llm_result.get("recommendation"):
                recommendation = llm_result["recommendation"]

            # Re-derive likelihood from blended score
            if risk_score > 0.7:
                likelihood = "CRITICAL"
            elif risk_score > 0.5:
                likelihood = "HIGH"
            elif risk_score > 0.2:
                likelihood = "MEDIUM"
            else:
                likelihood = "LOW"

        return {
            "action": "generate_report",
            "risk_score": round(risk_score, 3),
            "likelihood": likelihood,
            "hazards": hazards,
            "recommendation": recommendation,
            "confidence": round(confidence, 2),
            "reasoning": reasoning_chain,
        }

    async def act(self, decision: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        reasoning = decision.get("reasoning", "")
        report = {
            "likelihood": decision["likelihood"],
            "risk_score": decision["risk_score"],
            "hazards": decision["hazards"],
            "recommendation": decision["recommendation"],
            "confidence": decision["confidence"],
            "trend": "increasing" if decision["risk_score"] > 0.5 else "stable",
            "reasoning": reasoning,
        }
        tasks = []
        if decision["likelihood"] in ("HIGH", "CRITICAL"):
            tasks.append({
                "description": "Evacuate structure and deploy monitoring teams",
                "priority": "HIGH",
                "requires_confirmation": True,
            })
            tasks.append({
                "description": "Deploy structural monitors around collapse footprint",
                "priority": "HIGH",
                "requires_confirmation": False,
            })
        return build_contract_output(
            confidence=decision["confidence"],
            produced_artifacts={"risk_report": report},
            tasks=tasks,
            reasoning_summary=reasoning or (
                f"Structural risk evaluated at {decision['risk_score']:.2f} "
                f"({decision['likelihood']}) — {len(decision['hazards'])} hazards identified"
            ),
            next_handoff={
                "agent": "victim_localization",
                "reason": "risk level drives victim search prioritization",
            },
        )
