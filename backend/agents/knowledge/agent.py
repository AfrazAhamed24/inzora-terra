from typing import Any, Dict
from backend.agents.base import BaseAgent
from backend.core.gop import TERRAState
from backend.interfaces.protocol import build_contract_output


class KnowledgeRetrievalAgent(BaseAgent):
    version = "1.0"
    description = "Queries SOPs and building codes relevant to the incident (prototype, not RAG)"
    capabilities = ["knowledge", "sop", "building_code"]
    reads = frozenset({"risk_report", "victim_map", "environment"})
    writes = frozenset({"knowledge_results"})

    def __init__(self):
        super().__init__(name="knowledge_retrieval")
        self.sop_database = [
            {
                "id": "SOP-001",
                "title": "Earthquake Response Protocol",
                "content": "Immediate evacuation for HIGH risk. Search and rescue in priority zones.",
                "tags": ["earthquake", "evacuation", "rescue"],
                "relevance_keywords": ["collapse", "tilt", "structural"],
            },
            {
                "id": "SOP-002",
                "title": "Building Collapse Assessment",
                "content": "Assess structural integrity before entry. Monitor for secondary collapse.",
                "tags": ["collapse", "assessment", "safety"],
                "relevance_keywords": ["collapse", "risk", "hazard"],
            },
            {
                "id": "SOP-003",
                "title": "Victim Search Procedures",
                "content": "Use thermal imaging and GPR for victim detection. Prioritize high-probability zones.",
                "tags": ["search", "victim", "thermal", "gpr"],
                "relevance_keywords": ["victim", "search", "thermal"],
            },
        ]
        self.building_codes = [
            {
                "code": "IBC-2021-1604",
                "title": "Structural Integrity Requirements",
                "content": "Buildings must withstand design loads. Tilt > 2 degrees requires assessment.",
                "applicable_to": ["concrete_frame", "residential"],
            },
            {
                "code": "IBC-2021-1605",
                "title": "Post-Disaster Assessment",
                "content": "Mandatory inspection after seismic event before re-occupancy.",
                "applicable_to": ["all"],
            },
        ]

    async def perceive(self, gop: TERRAState) -> Dict[str, Any]:
        risk_report = gop.risk_report
        victim_map = gop.victim_map
        building_info = None
        for e in gop.evidence:
            if e.source.startswith("building"):
                building_info = e.data
                break
        return {
            "risk_report": risk_report,
            "victim_map": victim_map,
            "building_info": building_info,
        }

    async def reason(self, perception: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        risk = perception.get("risk_report") or {}
        victims = perception.get("victim_map") or {}
        building = perception.get("building_info") or {}

        risk_level = risk.get("likelihood", "LOW")
        hazards = risk.get("hazards", [])
        building_type = building.get("material", "unknown")

        relevant_sops = []
        for sop in self.sop_database:
            relevance = 0.0
            for keyword in sop["relevance_keywords"]:
                if keyword in str(risk).lower() or keyword in str(hazards).lower():
                    relevance += 0.3
            if relevance > 0:
                relevant_sops.append({
                    "id": sop["id"],
                    "title": sop["title"],
                    "relevance": round(min(relevance, 1.0), 2),
                })
        relevant_sops.sort(key=lambda x: x["relevance"], reverse=True)

        relevant_codes = []
        for code in self.building_codes:
            if building_type in code["applicable_to"] or "all" in code["applicable_to"]:
                relevance = 0.8 if risk_level in ["HIGH", "CRITICAL"] else 0.5
                relevant_codes.append({
                    "code": code["code"],
                    "title": code["title"],
                    "relevance": relevance,
                })

        recommendations = []
        if risk_level == "HIGH":
            recommendations.append("Evacuate all non-essential personnel immediately")
            recommendations.append("Deploy structural monitors to track tilt progression")
        if risk_level == "CRITICAL":
            recommendations.append("Do NOT enter structure without heavy rescue equipment")
            recommendations.append("Establish 100m perimeter")
        zones = victims.get("zones", [])
        high_prob_zones = [z for z in zones if z.get("probability", 0) > 0.6]
        if high_prob_zones:
            zone_names = [z["zone"] for z in high_prob_zones]
            recommendations.append(f"Prioritize search in zones: {', '.join(zone_names)}")

        return {
            "action": "query_knowledge",
            "relevant_sops": relevant_sops[:3],
            "relevant_codes": relevant_codes[:2],
            "recommendations": recommendations,
            "confidence": round(min(0.6 + len(relevant_sops) * 0.1, 0.9), 2),
        }

    async def act(self, decision: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        report = {
            "sops": decision["relevant_sops"],
            "building_codes": decision["relevant_codes"],
            "recommendations": decision["recommendations"],
        }
        return build_contract_output(
            confidence=decision["confidence"],
            produced_artifacts={"knowledge_results": report},
            reasoning_summary=(
                f"Matched {len(report['sops'])} SOPs and {len(report['building_codes'])} "
                f"building codes"
            ),
            next_handoff={
                "agent": "briefing_generator",
                "reason": "knowledge recommendations ready for the mission briefing",
            },
        )
