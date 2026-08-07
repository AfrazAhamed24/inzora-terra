from typing import Dict, List, Any, Optional

from backend.interfaces.protocol import AgentProtocol
from backend.core.gop import TERRAState
from backend.core.permissions import ORCHESTRATOR
from backend.core.state_manager import MissionStateManager
from backend.agents.risk_assessment.agent import RiskAssessmentAgent
from backend.agents.victim_localization.agent import VictimLocalizationAgent
from backend.agents.resource_coordination.agent import ResourceCoordinationAgent
from backend.agents.knowledge.agent import KnowledgeRetrievalAgent
from backend.agents.registry import AgentRegistry
from backend.orchestration.briefing import BriefingGenerator, collect_handoffs
from backend.orchestration.executor import ExecutionResult, GraphExecutor


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
        executor = GraphExecutor(
            manager,
            registry=self.registry,
            handlers={"briefing_generator": BriefingGenerator()},
        )
        self._executor = executor
        result = await executor.run()
        for slug, node_result in sorted(result.results().items()):
            self._log(slug, f"{slug}: {node_result.status}")
        return result

    def get_state(self) -> TERRAState:
        return self.state

    def abort(self, reason: str = ""):
        """Cancel running cycles and move the mission to ``aborted``."""
        if self._executor is not None:
            self._executor.cancel()
        manager = self._ensure_manager()
        if manager.state.status.stage not in ("completed", "aborted", "errored"):
            manager.advance(ORCHESTRATOR, "aborted")
        self._log("Orchestrator", f"Mission aborted: {reason}")

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
