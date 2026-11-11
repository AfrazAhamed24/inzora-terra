"""Knowledge query API endpoint.

Provides a standalone RAG (Retrieval-Augmented Generation) query that works
without an active mission. Uses the local knowledge base markdown files and
optionally the LLM when available and beneficial.

Endpoint: GET /api/v1/knowledge/query?question=<text>
Returns: matched SOPs, building codes, recommendations, confidence, reasoning.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List

from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

from backend.agents.knowledge.agent import KnowledgeRetrievalAgent
from backend.core.gop import TERRAState
from backend.core.llm_client import is_available as llm_available
from backend.core.config import AppSettings

router = APIRouter(tags=["knowledge"])


# ---- Helpers -------------------------------------------------------

def _load_knowledge_files() -> tuple[List[Dict], List[Dict]]:
    """Load SOP and building code data from markdown files in backend/knowledge/."""
    knowledge_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "knowledge")
    sops: List[Dict] = []
    codes: List[Dict] = []
    if os.path.isdir(knowledge_dir):
        for md in sorted(os.listdir(knowledge_dir)):
            if not md.endswith(".md"):
                continue
            try:
                text = open(os.path.join(knowledge_dir, md), encoding="utf-8").read().strip()
                title_line = next((l for l in text.splitlines() if l.startswith("#")), None)
                title = title_line.lstrip("# ").strip() if title_line else md.replace(".md", "")
                summary = text[:200]
                # Determine type by content keywords
                lower = text.lower()
                if "earthquake" in lower or "response" in lower or "evacuation" in lower:
                    sops.append(
                        {
                            "id": md.replace(".md", ""),
                            "title": title,
                            "content": summary,
                            "tags": ["disaster", "response"],
                            "relevance_keywords": [k.lower() for k in text.lower().split() if len(k) > 4],
                        }
                    )
                if "building" in lower or "code" in lower or "ibc" in lower:
                    codes.append(
                        {
                            "code": md.replace(".md", ""),
                            "title": title,
                            "content": summary,
                            "applicable_to": ["all"],
                        }
                    )
            except Exception:
                pass
    return sops, codes


def _keyword_match(query: str, items: List[Dict]) -> List[Dict]:
    """Simple keyword overlap ranker; higher count = higher relevance."""
    q = query.lower()
    ranked: List[Dict] = []
    for item in items:
        keywords = item.get("relevance_keywords", [])
        # count matches in query + item content
        content = (item.get("content", "")).lower()
        score = sum(1 for kw in keywords if kw in q) + sum(1 for kw in keywords if kw in content)
        if score > 0:
            ranked.append({**item, "relevance": min(score / max(len(keywords), 1), 1.0)})
    ranked.sort(key=lambda x: x["relevance"], reverse=True)
    return ranked


# ---- Pydantic models for the response ----------------------------

class KnowledgeResult(BaseModel):
    id: str
    title: str
    relevance: float
    content: str


class CodeResult(BaseModel):
    code: str
    title: str
    relevance: float


class KnowledgeQueryResponse(BaseModel):
    question: str
    relevant_sops: List[KnowledgeResult]
    relevant_codes: List[CodeResult]
    recommendations: List[str]
    confidence: float
    reasoning: str
    sources_analyzed: int


# ---- Dependency injection helpers -------------------------------

def _get_agent() -> KnowledgeRetrievalAgent:
    """Instantiate the knowledge retrieval agent (no mission state required)."""
    return KnowledgeRetrievalAgent()


# ---- Route --------------------------------------------------------

@router.get("/knowledge/query", response_model=KnowledgeQueryResponse)
async def query_knowledge(question: str = Query(..., min_length=1, description="User question about disaster response")):
    """Retrieve knowledge answers without requiring an active mission.

    Uses keyword matching against local markdown knowledge bases (SOPs, building codes).
    Optionally enhances with LLM when available and beneficial (token-cautious).

    Returns:
        - relevant_sops: SOPs matched with relevance scores
        - relevant_codes: Building codes matched with relevance scores
        - recommendations: Safety recommendations generated from matches
        - confidence: 0.0–1.0 based on number of matched SOPs
        - reasoning: Human-readable explanation of the matches
    """
    agent = _get_agent()

    # 1) Keyword retrieval from loaded knowledge files
    sops, codes = _load_knowledge_files()

    # 2) Rank by keyword overlap
    matched_sops = _keyword_match(question, sops)
    matched_codes = _keyword_match(question, codes)

    # 3) Optional LLM enhancement (token-cautious)
    use_llm = False
    if (
        llm_available()
        and "CRITICAL" in question.upper() or "HIGH" in question.upper()
        and len(matched_sops) < 2
    ):
        use_llm = True

    recommendations: List[str] = []
    # Base recommendations from risk level detected in question
    q_lower = question.lower()
    if "critical" in q_lower:
        recommendations.append("Do NOT enter structure without heavy rescue equipment")
        recommendations.append("Establish 100m perimeter")
    if "high" in q_lower:
        recommendations.append("Evacuate all non-essential personnel immediately")
        recommendations.append("Deploy structural monitors to track tilt progression")
    if "victim" in q_lower or "search" in q_lower:
        recommendations.append("Prioritize zones with highest probability first")
    if "building" in q_lower or "structure" in q_lower:
        recommendations.append("Assess structural integrity before entry")

    # 4) LLM enhancement if enabled
    if use_llm:
        try:
            from backend.core.llm_client import generate_json
            prompt = (
                f"Given the following user question about disaster response, provide 3 concise safety recommendations "
                f"(each <= 20 words). Question: '{question}'. Return ONLY a JSON array of strings."
            )
            llm_result = generate_json(prompt, "")
            if llm_result and isinstance(llm_result, list):
                recommendations.extend(llm_result)
        except Exception:
            pass

    # 5) Build confidence and reasoning
    sop_count = len(matched_sops)
    code_count = len(matched_codes)
    confidence = round(min(0.6 + sop_count * 0.15, 0.9), 2)
    reasoning = (
        f"Matched {sop_count} SOPs and {code_count} building codes against the question. "
        f"Generated {len(recommendations)} safety recommendations. "
        f"Keyword matches provided offline-first retrieval; LLM enhancement "
        f"{'was' if use_llm else 'was not'} applied."
    )

    return KnowledgeQueryResponse(
        question=question,
        relevant_sops=[KnowledgeResult(**s) for s in matched_sops[:3]],
        relevant_codes=[CodeResult(**c) for c in matched_codes[:2]],
        recommendations=recommendations,
        confidence=confidence,
        reasoning=reasoning,
        sources_analyzed=sop_count + code_count,
    )


# Register the router so it's included by the app factory.
# The factory in app.py mounts routers under /api/v1, so this adds /api/v1/knowledge/query.
# We'll register it in the app factory below.