from typing import Dict, List, Any, Optional

from backend.interfaces.protocol import AgentProtocol
from backend.core.gop import TERRAState
from backend.core.permissions import ORCHESTRATOR
from backend.core.state_manager import MissionStateManager
from backend.agents.risk_assessment.agent import RiskAssessmentAgent
from backend.agents.victim_localization.agent import VictimLocalizationAgent
from backend.agents.resource_coordination.agent import ResourceCoordinationAgent
from backend.agents.knowledge.agent import KnowledgeRetrievalAgent
from backend.agents.rescue_coordination.agent import RescueCoordinationAgent
from backend.agents.registry import AgentRegistry
from backend.orchestration.briefing import BriefingGenerator, collect_handoffs
from backend.orchestration.executor import (
    ExecutionResult, 
    GraphExecutor, 
    EnhancedGraphExecutor,
    CircuitBreaker,
    DeadLetterQueue,
    AgentHealthMonitor,
)
from backend.orchestration.graph import DependencyGraph


class Orchestrator(AgentProtocol):
    """Mission conductor: owns the lifecycle and schedules agents over the dependency graph.

    Implements the lifecycle API from ORCHESTRATOR.md §8 on top of the ``GraphExecutor``. The
    legacy ``run()`` entry point is preserved so ``backend/run.py`` (and its tests) keep working
    unchanged — it now delegates agent scheduling to the graph executor instead of a hardcoded
    sequential loop.
    """

    def __init__(self):
        super().__init__(name="orchestrator")
        self.agents: Dict[str, AgentProtocol] = {}
        self.registry = AgentRegistry()
        self.state = TERRAState()
        self.agent_log: List[Dict[str, Any]] = []
        self._manager: Optional[MissionStateManager] = None
        self._executor: Optional[GraphExecutor] = None

    def register_agent(self, agent: AgentProtocol):
        self.agents[agent.name] = agent
        self.registry.register(agent)

    def setup_default_agents(self):
        """Register all default TERRA-X agents."""
        self.register_agent(RiskAssessmentAgent())
        self.register_agent(VictimLocalizationAgent())
        self.register_agent(ResourceCoordinationAgent())
        self.register_agent(KnowledgeRetrievalAgent())
        self.register_agent(RescueCoordinationAgent())

    # ------------------------------------------------------------------
    # Lifecycle API (ORCHESTRATOR.md §8)
    # ------------------------------------------------------------------

    def start(self, incident_text: str, *, environment_id: str = "", mission_name: str = "") -> str:
        """Create a mission and move it to ``initialized``. Returns the mission id."""
        self._manager = MissionStateManager()
        state = self._manager.create(
            incident_text,
            environment_id=environment_id,
            mission_name=mission_name,
        )
        self.state = state
        self._log("Orchestrator", f"Mission started: {incident_text}")
        return state.metadata.mission_id

    def ingest(self, evidence_bundle: List[Dict[str, Any]]):
        """Append evidence and advance to ``evidence_ingested``."""
        manager = self._ensure_manager()
        for item in evidence_bundle:
            manager.append_evidence(
                ORCHESTRATOR,
                item["source"],
                item["data"],
                item.get("confidence", 0.0),
            )
        if manager.state.evidence:
            manager.advance(ORCHESTRATOR, "evidence_ingested")

    async def run_graph(self) -> ExecutionResult:
        """Execute L1 → L2 → briefing over the dependency graph. Returns the aggregate result."""
        manager = self._ensure_manager()
        
        # Use EnhancedGraphExecutor with error recovery and circuit breakers
        executor = EnhancedGraphExecutor(
            manager,
            registry=self.registry,
            handlers={"briefing_generator": BriefingGenerator()},
            enable_circuit_breaker=True,
            dead_letter_retention_hours=72,
        )
        self._executor = executor
        result = await executor.run()
        for slug, node_result in sorted(result.results().items()):
            self._log(slug, f"{slug}: {node_result.status}")
        
        # Log any dead-letter entries for monitoring
        if hasattr(executor, '_dead_letter_queue'):
            dead_letter_stats = executor.get_dead_letter_statistics()
            if dead_letter_stats['dead_letter_queue']['total_entries'] > 0:
                self._log("orchestrator", 
                         f"Dead-letter queue contains {dead_letter_stats['dead_letter_queue']['total_entries']} entries")
                
        return result

    def abort(self, reason: str = ""):
        """Cancel running cycles and move the mission to ``aborted``."""
        if self._executor is not None:
            self._executor.cancel()
        manager = self._ensure_manager()
        if manager.state.status.stage not in ("completed", "aborted", "errored"):
            manager.advance(ORCHESTRATOR, "aborted")
        self._log("Orchestrator", f"Mission aborted: {reason}")

    # ------------------------------------------------------------------
    # Enhanced error recovery and health monitoring
    # ------------------------------------------------------------------

    def get_circuit_breaker_status(self, agent_name: Optional[str] = None) -> Dict[str, Any]:
        """Get circuit breaker status for monitoring and manual recovery."""
        if self._executor is None:
            return {}
        
        # EnhancedGraphExecutor has additional recovery methods
        if hasattr(self._executor, 'get_circuit_breaker_status'):
            return self._executor.get_circuit_breaker_status(agent_name)
        
        # Fallback for standard GraphExecutor
        return {"status": "enhanced_executor_required"}

    def get_dead_letter_statistics(self) -> Dict[str, Any]:
        """Get dead-letter queue statistics for audit and recovery planning."""
        if self._executor is None:
            return {"status": "no_executor_running"}
            
        if hasattr(self._executor, 'get_dead_letter_statistics'):
            return self._executor.get_dead_letter_statistics()
            
        return {"status": "enhanced_executor_required"}

    def clear_circuit_breaker(self, agent_name: str) -> None:
        """Manually clear circuit breaker for emergency recovery."""
        if self._executor is None:
            return
            
        if hasattr(self._executor, 'clear_circuit_breaker'):
            self._executor.clear_circuit_breaker(agent_name)
            self._log("orchestrator", f"Circuit breaker cleared for {agent_name}")
            
    def recover_from_dead_letter(self, execution_id: str) -> bool:
        """Attempt recovery of specific execution from dead-letter queue."""
        if self._executor is None:
            return False
            
        if hasattr(self._executor, 'recover_from_dead_letter'):
            return self._executor.recover_from_dead_letter(execution_id)
            
        return False

    def get_agent_health_score(self, agent_name: str) -> float:
        """Get health score for specific agent."""
        if self._executor is None:
            return 0.0
            
        if hasattr(self._executor, '_health_monitor'):
            return self._executor._health_monitor.get_health_score(agent_name)
            
        return 0.0

    # ------------------------------------------------------------------
    # Legacy entry point (backend/run.py) — now graph-scheduled
    # ------------------------------------------------------------------

    async def run(self, incident: str) -> Dict[str, Any]:
        """Process the entire rescue workflow via the dependency graph."""
        self.state.incident_text = incident
        self.state.stage = "initialized"
        self._log("Orchestrator", f"Mission started: {incident}")

        await self.run_graph()

        self.state.stage = "complete"
        self._log("Orchestrator", "Mission briefing generated")

        return self._generate_briefing()

    def _log(self, agent: str, message: str):
        from datetime import datetime
        self.agent_log.append({
            "agent": agent,
            "message": message,
            "timestamp": datetime.utcnow().strftime("%H:%M:%S"),
        })

    def _generate_briefing(self) -> Dict[str, Any]:
        risk = self.state.risk_report
        victims = self.state.victim_map
        resources = self.state.resource_allocation
        knowledge = self.state.knowledge_results
        rescue = self.state.rescue_guidance

        overall_risk = risk.get("likelihood", "LOW")
        priority_zones = [z["zone"] for z in victims.get("zones", []) if z.get("priority") == "HIGH"]
        total_victims = victims.get("total_victims_estimated", 0)
        recommendations = knowledge.get("recommendations", [])

        return {
            "mission_briefing": {
                "incident_id": self.state.incident_id or "INC-2026-001",
                "overall_risk": overall_risk,
                "priority_zones": priority_zones,
                "total_victims_estimated": total_victims,
                "immediate_actions": recommendations[:3],
                "resource_status": "Deployed" if resources else "Pending",
                "next_update_in": "15 minutes",
                "rescue_guidance": {
                    "summary": rescue.get("summary", ""),
                    "entry_clearance": rescue.get("entry_clearance", "HOLD"),
                    "priority_sequence": rescue.get("priority_sequence", []),
                    "objectives": rescue.get("objectives", []),
                    "extraction_guidance": rescue.get("extraction_guidance", []),
                    "safety_constraints": rescue.get("safety_constraints", []),
                    "triage_notes": rescue.get("triage_notes", []),
                    "comms_guidance": rescue.get("comms_guidance", ""),
                },
            },
            "risk_report": risk,
            "victim_map": victims,
            "tasks": [t.model_dump() for t in self.state.tasks],
            "agent_log": self.agent_log,
            "confidence_scores": self.state.confidence_scores,
            "handoffs": collect_handoffs(self.state),
        }

    # ------------------------------------------------------------------
    # AgentProtocol contract (kept for compatibility; not part of scheduling)
    # ------------------------------------------------------------------

    async def perceive(self, gop: TERRAState) -> Dict[str, Any]:
        return {"state": gop.model_dump()}

    async def reason(self, perception: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        return {"action": "orchestrate"}

    async def act(self, decision: Dict[str, Any], gop: TERRAState) -> Dict[str, Any]:
        return self._generate_briefing()

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _ensure_manager(self) -> MissionStateManager:
        if self._manager is None or self._manager.state is not self.state:
            self._manager = MissionStateManager(self.state)
        return self._manager
