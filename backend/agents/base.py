"""Base class for all TERRA-X agents.

Implements the universal contract (AGENT_CONTRACT.md): identity metadata that is queryable
without executing the agent, the ``initialize → perceive → reason → act → handoff`` lifecycle,
and a standard output envelope. ``perceive``/``reason``/``act`` remain abstract; the four
concrete agents keep their decision logic unchanged and return the envelope from ``act``
instead of writing to the mission state directly.
"""

import json
import os
import time
from abc import ABC, abstractmethod
from typing import Any, Dict, FrozenSet, List


class BaseAgent(ABC):
    version: str = "1.0"
    description: str = ""
    capabilities: List[str] = []
    reads: FrozenSet[str] = frozenset()
    writes: FrozenSet[str] = frozenset()

    def __init__(self, name: str):
        self.name = name
        self.state: Dict[str, Any] = {}
        self.tools: list = []
        self.confidence: float = 0.0

    def register_tool(self, tool_name: str, tool_fn) -> None:
        self.tools.append({"name": tool_name, "fn": tool_fn})

    def set_state(self, key: str, value: Any) -> None:
        self.state[key] = value

    def get_state(self, key: str, default: Any = None) -> Any:
        return self.state.get(key, default)

    def identity(self) -> Dict[str, Any]:
        """Identity metadata (AGENT_CONTRACT.md §2.1), queryable without executing."""
        return {
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "capabilities": list(self.capabilities),
            "reads": sorted(self.reads),
            "writes": sorted(self.writes),
        }

    async def initialize(self, context: Any) -> None:
        """Lifecycle step 1: per-cycle setup. Default is a no-op (idempotent)."""

    async def handoff(self, output: Dict[str, Any], context: Any) -> Dict[str, Any]:
        """Lifecycle step 5: validate/finalize the output before the executor persists it."""
        return output

    @abstractmethod
    async def perceive(self, gop: Any) -> Dict[str, Any]:
        pass

    @abstractmethod
    async def reason(self, perception: Dict[str, Any], gop: Any) -> Dict[str, Any]:
        pass

    @abstractmethod
    async def act(self, decision: Dict[str, Any], gop: Any) -> Dict[str, Any]:
        pass

    async def run(self, gop: Any) -> Dict[str, Any]:
        """Legacy convenience pipeline (not part of the scheduling path).

        The GraphExecutor schedules through the contract lifecycle (initialize → perceive →
        reason → act → handoff) via ``backend/orchestration/contract.run_contract_agent``.
        """
        perception = await self.perceive(gop)
        decision = await self.reason(perception, gop)
        result = await self.act(decision, gop)
        return result

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "state": self.state,
            "confidence": self.confidence,
            "tools": [t["name"] for t in self.tools],
            "version": self.version,
            "description": self.description,
            "capabilities": list(self.capabilities),
        }

    # ------------------------------------------------------------------
    # LLM Integration Support (consistent across all agents)
    # ------------------------------------------------------------------

    def _should_use_llm(self, decision: Dict[str, Any]) -> bool:
        """Determine if LLM enhancement is appropriate based on confidence and risk level"""
        confidence_threshold = float(os.getenv("LLM_CONFIDENCE_THRESHOLD", "0.7"))
        if decision.get("confidence", 0.0) >= confidence_threshold:
            return False
            
        likelihood = decision.get("likelihood", "LOW")
        if likelihood not in ("HIGH", "CRITICAL"):
            return False
            
        return self._router_enabled()

    def _router_enabled(self) -> bool:
        """Check if the LLM router is enabled and configured"""
        return os.getenv("TERRA_LLM_ROUTER", "0") in ("1", "true", "yes")

    def _get_router(self):
        """Get the LLM router instance (cached)"""
        if not hasattr(self, '_router') or self._router is None:
            from backend.llm.router import get_router
            self._router = get_router()
        return self._router

    async def _enhance_with_llm(
        self,
        decision: Dict[str, Any],
        gop: Any,
        system_prompt: str
    ) -> Dict[str, Any]:
        """Consistent LLM enhancement across all agents using crisis-bench fallback"""
        
        if self._router_enabled() and self._router is not None:
            try:
                return await self._call_router_enhancement(
                    decision, gop, system_prompt
                )
            except Exception as e:
                self._log_error(f"Crisis-bench router failed: {e}")
        
        try:
            from backend.core.llm_client import is_available as llm_available, generate_json
            if llm_available() and generate_json:
                return await self._call_legacy_client(
                    decision, gop, system_prompt
                )
        except ImportError:
            pass
            
        return decision

    async def _call_router_enhancement(
        self,
        decision: Dict[str, Any],
        gop: Any,
        system_prompt: str
    ) -> Dict[str, Any]:
        """Call the crisis-bench LLM router with agent-specific context"""
        router = self._get_router()
        
        context_data = self._prepare_llm_context(decision, gop)
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Agent context: {context_data}\n\nDecision to enhance: {decision}"},
        ]
        
        result = router.call("critical", messages, max_tokens=1200, temperature=0.2)
        text = result.content.strip()
        
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines)
        
        try:
            llm_result = json.loads(text)
            return self._merge_llm_result(decision, llm_result, result)
        except json.JSONDecodeError as e:
            self._log_error(f"LLM router returned invalid JSON: {e}")
            return decision

    async def _call_legacy_client(
        self,
        decision: Dict[str, Any],
        gop: Any,
        system_prompt: str
    ) -> Dict[str, Any]:
        """Legacy single-provider LLM client fallback"""
        from backend.core.llm_client import generate_json
        
        context_data = self._prepare_llm_context(decision, gop)
        
        try:
            llm_result = await generate_json(
                system_prompt,
                f"Agent: {self.name}\nContext: {context_data}\nCurrent decision: {decision}"
            )
            return self._merge_llm_result(decision, llm_result, None)
        except Exception as e:
            self._log_error(f"Legacy LLM client failed: {e}")
            return decision

    def _prepare_llm_context(self, decision: Dict[str, Any], gop: Any) -> str:
        """Prepare agent-specific context for LLM enhancement"""
        context_parts = [f"Agent: {self.name}"]
        
        context_parts.append(f"Current decision confidence: {decision.get('confidence', 0.0)}")
        context_parts.append(f"Current likelihood: {decision.get('likelihood', 'LOW')}")
        
        if hasattr(gop, 'incident_text'):
            context_parts.append(f"Incident: {gop.incident_text}")
        
        if self.name == "risk_assessment":
            context_parts.append(f"Risk score: {decision.get('risk_score', 0.0)}")
            context_parts.append(f"Hazards: {', '.join(decision.get('hazards', []))}")
        
        return "\n".join(context_parts)

    def _merge_llm_result(
        self,
        original: Dict[str, Any],
        enhanced: Dict[str, Any],
        router_result: Any
    ) -> Dict[str, Any]:
        """Merge LLM enhancement with original decision, taking conservative approach"""
        merged = original.copy()
        
        if "risk_score" in enhanced:
            merged["risk_score"] = max(original.get("risk_score", 0.0), 
                                      float(enhanced["risk_score"]))
        
        merged["hazards"] = list(set(original.get("hazards", []) + 
                                   enhanced.get("hazards", [])))
        
        if enhanced.get("recommendation"):
            merged["recommendation"] = enhanced["recommendation"]
        
        original_conf = original.get("confidence", 0.0)
        llm_conf = float(enhanced.get("confidence", original_conf))
        merged["confidence"] = round((original_conf + llm_conf) / 2 + 0.1, 2)
        
        merged["_enhanced_by_llm"] = True
        if router_result is not None:
            merged["_provider"] = getattr(router_result, 'provider', None)
            merged["_cost_usd"] = round(getattr(router_result, 'cost_usd', 0), 6)
            merged["_latency_s"] = round(getattr(router_result, 'latency_s', 0), 3)
            
        return merged

    def _log_error(self, message: str):
        """Log agent-specific errors"""
        import logging
        logger = logging.getLogger(f"agent.{self.name}")
        logger.warning(message)
