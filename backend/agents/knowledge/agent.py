from typing import Any, Dict, List
import pathlib
from backend.agents.base import BaseAgent
from backend.core.gop import TERRAState
from backend.interfaces.protocol import build_contract_output


def _load_knowledge_files() -> tuple[List[Dict], List[Dict]]:
    """Load SOP and building code data from markdown files in backend/knowledge/.
    Falls back to empty lists so the agent never fails if files are missing.
    """
    knowledge_dir = pathlib.Path(__file__).parent.parent / "knowledge"
    sops: List[Dict] = []
    codes: List[Dict] = []
    if knowledge_dir.is_dir():
        for md in sorted(knowledge_dir.glob("*.md")):
            try:
                text = md.read_text(encoding="utf-8").strip()
                # Use the first H1 as title, rest as content summary
                title_line = next((l for l in text.splitlines() if l.startswith("#")), None)
                title = title_line.lstrip("# ").strip() if title_line else md.stem
                # Use the first 200 chars as a summary for keyword matching
                summary = text[:200]
                if "earthquake" in text.lower() or "response" in text.lower():
                    sops.append(
                        {
                            "id": md.stem,
                            "title": title,
                            "content": summary,
                            "tags": md.stem.split("_"),
                            "relevance_keywords": [k.lower() for k in text.lower().split() if len(k) > 4],
                        }
                    )
                if "building" in text.lower() or "code" in text.lower():
                    codes.append(
                        {
                            "code": md.stem,
                            "title": title,
                            "content": summary,
                            "applicable_to": ["all"],
                        }
                    )
            except Exception:
                pass
    return sops, codes


class KnowledgeRetrievalAgent(BaseAgent):
    version = "1.1"
    description = "Queries SOPs and building codes with keyword retrieval from local knowledge base (offline-first, LLM-enhanced when available)"
    capabilities = ["knowledge", "sop", "building_code"]
    reads = frozenset({"resource_allocation", "risk_report", "victim_map", "environment"})
    writes = frozenset({"knowledge_results"})

    def __init__(self):
        super().__init__(name="knowledge_retrieval")
        self.sop_database, self.building_codes = _load_knowledge_files()
        # Also keep a small hardcoded fallback so the agent always has SOPs
        self.hardcoded_sops = [
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
        # Merge hardcoded as last resort so new files take precedence
        self.sop_database = self.hardcoded_sops + self.sop_database
        self.building_codes = self.hardcoded_sops[:0] + self.building_codes  # only new codes

    async def perceive(self, gop: TERRAState) -> Dict[str, Any]:
        risk_report = gop.risk_report
        victim_map = gop.victim_map
        # Consumes the Resource Coordination report handed off before this agent runs.
        resource_allocation = gop.resource_allocation or {}
        building_info = None
        for e in gop.evidence:
            if e.source.startswith("building"):
                building_info = e.data
                break
        return {
            "risk_report": risk_report,
            "victim_map": victim_map,
            "resource_allocation": resource_allocation,
            "building_info": building_info,
        }

    async def reason(self, perception: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        risk = perception.get("risk_report") or {}
        victims = perception.get("victim_map") or {}
        building = perception.get("building_info") or {}
        resource_plan = perception.get("resource_allocation") or {}

        risk_level = risk.get("likelihood", "LOW")
        hazards = risk.get("hazards", [])
        building_type = building.get("material", "unknown")

        relevant_sops = []
        # 1) Keyword match against loaded knowledge base SOPs
        for sop in self.sop_database:
            relevance = 0.0
            for kw in sop.get("relevance_keywords", []):
                # check against risk level and hazards
                if kw in risk_level.lower() or kw in [h.lower() for h in hazards]:
                    relevance += 0.3
                # also check against the sop content summary
                if kw in str(sop.get("content", "")).lower():
                    relevance += 0.2
            if relevance > 0:
                relevant_sops.append(
                    {
                        "id": sop["id"],
                        "title": sop["title"],
                        "relevance": round(min(relevance, 1.0), 2),
                    }
                )
        relevant_sops.sort(key=lambda x: x["relevance"], reverse=True)

        # 2) Keyword match against building codes
        relevant_codes = []
        for code in self.building_codes:
            relevance = 0.0
            if risk_level in ["HIGH", "CRITICAL"]:
                relevance += 0.5
            # check code content for risk-related terms
            if risk_level.lower() in str(code.get("content", "")).lower():
                relevance += 0.3
            if relevant_codes and relevant_codes[-1]["code"] == code["code"]:
                continue  # avoid duplicates
            if relevance > 0:
                relevant_codes.append(
                    {
                        "code": code["code"],
                        "title": code["title"],
                        "relevance": round(min(relevance, 1.0), 2),
                    }
                )

        # 3) LLM-enhanced retrieval (optional, token-cautious)
        # Only attempt LLM if available and we have low keyword coverage
        use_llm = False
        if (
            __import__("backend.core.llm_client", fromlist=["is_available"]).is_available()
            and risk_level in ["HIGH", "CRITICAL"]
            and len(relevant_sops) < 2
        ):
            use_llm = True

        # Build recommendations based on matched SOPs/codes
        recommendations = []
        if risk_level == "HIGH":
            recommendations.append("Evacuate all non-essential personnel immediately")
            recommendations.append("Deploy structural monitors to track tilt progression")
        if risk_level == "CRITICAL":
            recommendations.append("Do NOT enter structure without heavy rescue equipment")
            recommendations.append("Establish 100m perimeter")
        high_prob_zones = [z for z in victims.get("zones", []) if z.get("probability", 0) > 0.6]
        if high_prob_zones:
            zone_names = [z["zone"] for z in high_prob_zones]
            recommendations.append(f"Prioritize search in zones: {', '.join(zone_names)}")
        assignments = resource_plan.get("assignments", []) or []
        if assignments:
            recommendations.append(f"Align search procedures with deployed plan ({len(assignments)} assignments)")

        # 4) optional LLM enhancement (skipped when fixture disables LLM)
        if use_llm:
            try:
                from backend.core.llm_client import generate_json
                prompt = (
                    f"Given the following disaster context, provide 3 concise safety recommendations "
                    f"(each <= 20 words). Risk level: {risk_level}. Hazards: {hazards}. "
                    f"Zones of interest: {high_prob_zones}. Return ONLY a JSON array of strings."
                )
                llm_result = generate_json(prompt, "")
                if llm_result and isinstance(llm_result, list):
                    recommendations.extend(llm_result)
            except Exception:
                pass

        sop_names = [s["title"] for s in relevant_sops[:3]]
        coding_names = [c["title"] for c in relevant_codes[:2]]
        reasoning = (
            f"Matched {len(relevant_sops)} SOPs ({', '.join(sop_names)}) and "
            f"{len(relevant_codes)} building codes against the {risk_level} risk level. "
            f"Generated {len(recommendations)} safety recommendations for {len(high_prob_zones)} priority zones."
        )

        return {
            "action": "query_knowledge",
            "relevant_sops": relevant_sops[:3],
            "relevant_codes": relevant_codes[:2],
            "recommendations": recommendations,
            "resource_context": len(resource_plan.get("assignments", [])),
            "confidence": round(min(0.6 + len(relevant_sops) * 0.1, 0.9), 2),
            "reasoning": reasoning,
        }

    async def act(self, decision: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        report = {
            "sops": decision["relevant_sops"],
            "building_codes": decision["relevant_codes"],
            "recommendations": decision["recommendations"],
        }
        reasoning = decision.get("reasoning", "")
        return build_contract_output(
            confidence=decision["confidence"],
            produced_artifacts={"knowledge_results": report},
            reasoning_summary=reasoning or (
                f"Matched {len(report['sops'])} SOPs and {len(report['building_codes'])} "
                f"building codes against the {risk_level} risk level"
            ),
            next_handoff={
                "agent": "rescue_coordination",
                "reason": "knowledge base scopes the rescue handoff",
            },
        )

    async def perceive(self, gop: TERRAState) -> Dict[str, Any]:
        risk_report = gop.risk_report
        victim_map = gop.victim_map
        # Consumes the Resource Coordination report handed off before this agent runs.
        resource_allocation = gop.resource_allocation or {}
        building_info = None
        for e in gop.evidence:
            if e.source.startswith("building"):
                building_info = e.data
                break
        return {
            "risk_report": risk_report,
            "victim_map": victim_map,
            "resource_allocation": resource_allocation,
            "building_info": building_info,
        }

    async def reason(self, perception: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        risk = perception.get("risk_report") or {}
        victims = perception.get("victim_map") or {}
        building = perception.get("building_info") or {}
        resource_plan = perception.get("resource_allocation") or {}

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

        # Resource handoff context: keep SOPs aligned with the deployed team plan.
        assignments = resource_plan.get("assignments", []) or []
        if assignments:
            recommendations.append(
                f"Align search procedures with deployed plan ({len(assignments)} assignments)"
            )

        sop_names = [s["title"] for s in relevant_sops[:3]]
        reasoning = (
            f"Matched {len(relevant_sops)} SOPs ({', '.join(sop_names)}) and "
            f"{len(relevant_codes)} building codes against the {risk_level} risk level. "
            f"Generated {len(recommendations)} safety recommendations for {len(high_prob_zones)} priority zones."
        )

        return {
            "action": "query_knowledge",
            "relevant_sops": relevant_sops[:3],
            "relevant_codes": relevant_codes[:2],
            "recommendations": recommendations,
            "resource_context": len(assignments),
            "confidence": round(min(0.6 + len(relevant_sops) * 0.1, 0.9), 2),
            "reasoning": reasoning,
        }

    async def act(self, decision: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        report = {
            "sops": decision["relevant_sops"],
            "building_codes": decision["relevant_codes"],
            "recommendations": decision["recommendations"],
        }
        reasoning = decision.get("reasoning", "")
        return build_contract_output(
            confidence=decision["confidence"],
            produced_artifacts={"knowledge_results": report},
            reasoning_summary=reasoning or (
                f"Matched {len(report['sops'])} SOPs and {len(report['building_codes'])} "
                f"building codes against the {decision.get('resource_context', 0)}-assignment plan"
            ),
            next_handoff={
                "agent": "rescue_coordination",
                "reason": "knowledge base scopes the rescue handoff",
            },
        )
