"""Phase 1: Enhanced Error Recovery Implementation Test

This script tests the Phase 1 enhanced error recovery features:
1. Unified LLM Integration in BaseAgent
2. Enhanced ResourceCoordinationAgent with LLM optimization
3. Circuit Breaker and Dead-Letter Queue in EnhancedGraphExecutor
4. Enhanced Orchestrator with recovery commands

Usage: python3 phase1_recovery_test.py
"""

import asyncio
import json
import logging
import sys
from typing import Dict, Any
from datetime import datetime

from backend.agents.resource_coordination.agent import ResourceCoordinationAgent
from backend.orchestration.orchestrator import Orchestrator
from backend.core.gop import TERRAState


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Phase1RecoveryTest:
    """Test Phase 1 enhanced error recovery features."""
    
    def __init__(self):
        self.test_results = []
        
    def log_test(self, test_name: str, passed: bool, details: str = ""):
        """Record test result."""
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "details": details,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} {test_name}: {details}")
        
    def run_all_tests(self):
        """Run all Phase 1 tests."""
        print("🧪 Starting Phase 1 Enhanced Error Recovery Tests")
        print("=" * 60)
        
        self.test_unified_llm_integration()
        self.test_enhanced_resource_agent()
        self.test_circuit_breaker()
        self.test_dead_letter_queue()
        self.test_enhanced_orchestrator()
        
        self.print_summary()
        
    def test_unified_llm_integration(self):
        """Test unified LLM integration in BaseAgent."""
        print("\n🔧 Testing Unified LLM Integration...")
        
        try:
            # Test BaseAgent has LLM integration methods
            from backend.agents.base import BaseAgent
            
            # Create a simple test agent
            class TestAgent(BaseAgent):
                version = "1.0"
                description = "Test agent"
                capabilities = ["test"]
                reads = frozenset({"test"})
                writes = frozenset({"result"})
                
                def __init__(self):
                    super().__init__(name="test_agent")
                    
                async def perceive(self, gop: Any) -> Dict[str, Any]:
                    return {"test": "data"}
                    
                async def reason(self, perception: Dict[str, Any], gop: Any) -> Dict[str, Any]:
                    return {"confidence": 0.8, "likelihood": "LOW"}
                    
                async def act(self, decision: Dict[str, Any], gop: Any) -> Dict[str, Any]:
                    return {"result": "test output"}
            
            agent = TestAgent()
            
            # Test LLM integration methods exist
            assert hasattr(agent, '_should_use_llm'), "BaseAgent missing _should_use_llm method"
            assert hasattr(agent, '_router_enabled'), "BaseAgent missing _router_enabled method"
            assert hasattr(agent, '_get_router'), "BaseAgent missing _get_router method"
            assert hasattr(agent, '_enhance_with_llm'), "BaseAgent missing _enhance_with_llm method"
            assert hasattr(agent, '_prepare_llm_context'), "BaseAgent missing _prepare_llm_context method"
            assert hasattr(agent, '_merge_llm_result'), "BaseAgent missing _merge_llm_result method"
            
            self.log_test("Unified LLM Integration", True,
                         "BaseAgent has all required LLM integration methods")
                         
        except Exception as e:
            self.log_test("Unified LLM Integration", False,
                         f"Failed to test LLM integration: {e}")
    
    def test_enhanced_resource_agent(self):
        """Test enhanced ResourceCoordinationAgent with LLM optimization."""
        print("\n🔧 Testing Enhanced Resource Agent...")
        
        try:
            # Test that the enhanced agent class exists
            from backend.agents.resource_coordination.agent import EnhancedResourceCoordinationAgent
            
            agent = EnhancedResourceCoordinationAgent()
            
            # Test that it has LLM optimization capabilities
            assert hasattr(agent, '_get_resource_allocation_prompt'), "Missing LLM optimization prompt"
            assert hasattr(agent, '_should_optimize_with_llm'), "Missing LLM optimization decision"
            assert hasattr(agent, '_router_enabled'), "Missing router enable check"
            assert hasattr(agent, '_get_router'), "Missing router access"
            
            # Test team database setup
            assert hasattr(agent, 'teams'), "Missing team database"
            assert len(agent.teams) > 0, "Team database should not be empty"
            
            self.log_test("Enhanced Resource Agent", True,
                         "Enhanced ResourceCoordinationAgent has LLM optimization features")
                         
        except Exception as e:
            self.log_test("Enhanced Resource Agent", False,
                         f"Failed to test enhanced resource agent: {e}")
    
    def test_circuit_breaker(self):
        """Test circuit breaker functionality."""
        print("\n🔧 Testing Circuit Breaker...")
        
        try:
            from backend.orchestration.executor import CircuitBreaker
            
            # Test circuit breaker initialization
            breaker = CircuitBreaker(threshold=3, timeout=60.0)
            
            # Test initial state
            assert not breaker.is_open(), "Circuit breaker should be closed initially"
            assert breaker.get_status()["failure_count"] == 0, "Should start with 0 failures"
            
            # Test failure recording
            for i in range(3):
                breaker.record_failure()
                assert breaker.is_open(), f"Circuit breaker should be open after {i+1} failures"
                
            status = breaker.get_status()
            assert status["failure_count"] == 3, "Failure count should be 3"
            assert status["is_open"] == True, "Should be open"
            
            # Test success reset (after timeout simulation)
            breaker.record_success()
            assert breaker.get_status()["failure_count"] == 0, "Should reset on success"
            
            self.log_test("Circuit Breaker", True,
                         "Circuit breaker functionality working correctly")
                         
        except Exception as e:
            self.log_test("Circuit Breaker", False,
                         f"Failed to test circuit breaker: {e}")
    
    def test_dead_letter_queue(self):
        """Test dead-letter queue functionality."""
        print("\n🔧 Testing Dead-Letter Queue...")
        
        try:
            from backend.orchestration.executor import DeadLetterQueue
            from backend.core.mission_state import MissionState
            from unittest.mock import Mock
            
            # Mock context for testing
            mock_context = Mock()
            mock_context.agent_name = "test_agent"
            mock_context.level = 1
            mock_context.cycle_id = "CYC-1"
            mock_context.inputs = {}
            mock_context.dependencies = {}
            mock_context.cancelled = False
            
            mock_node = Mock()
            mock_node.slug = "test_node"
            
            # Test dead-letter queue initialization
            dl_queue = DeadLetterQueue(retention_hours=1)
            
            # Test enqueuing entry
            test_error = ValueError("Test error for DLQ")
            dl_queue.enqueue("test_node", mock_node, mock_context, test_error, 1)
            
            assert len(dl_queue.entries) == 1, "Should have 1 entry"
            
            # Test entry structure
            entry = dl_queue.entries[0]
            assert entry["node_id"] == "test_node"
            assert entry["context"]["agent_name"] == "test_agent"
            assert entry["error"]["type"] == "ValueError"
            assert entry["error"]["message"] == "Test error for DLQ"
            
            # Test statistics
            stats = dl_queue.get_statistics()
            assert stats["total_entries"] == 1, "Statistics should show 1 entry"
            assert "entries_by_agent" in stats, "Should have entries by agent breakdown"
            
            # Test entry filtering
            agent_entries = dl_queue.get_entries("test_agent")
            assert len(agent_entries) == 1, "Should have 1 entry for test_agent"
            
            self.log_test("Dead-Letter Queue", True,
                         "Dead-letter queue functionality working correctly")
                         
        except Exception as e:
            self.log_test("Dead-Letter Queue", False,
                         f"Failed to test dead-letter queue: {e}")
    
    def test_enhanced_orchestrator(self):
        """Test enhanced orchestrator with recovery methods."""
        print("\n🔧 Testing Enhanced Orchestrator...")
        
        try:
            orchestrator = Orchestrator()
            
            # Test that enhanced recovery methods exist
            assert hasattr(orchestrator, 'get_circuit_breaker_status'), "Missing circuit breaker status method"
            assert hasattr(orchestrator, 'get_dead_letter_statistics'), "Missing dead-letter statistics method"
            assert hasattr(orchestrator, 'clear_circuit_breaker'), "Missing circuit breaker clear method"
            assert hasattr(orchestrator, 'recover_from_dead_letter'), "Missing dead-letter recovery method"
            assert hasattr(orchestrator, 'get_agent_health_score'), "Missing agent health score method"
            
            # Test that recovery methods return appropriate defaults when no executor
            circuit_status = orchestrator.get_circuit_breaker_status()
            assert circuit_status == {}, "Should return empty dict when no executor"
            
            dead_letter_stats = orchestrator.get_dead_letter_statistics()
            assert "status" in dead_letter_stats, "Should have status field"
            
            self.log_test("Enhanced Orchestrator", True,
                         "Orchestrator has all enhanced recovery methods")
                         
        except Exception as e:
            self.log_test("Enhanced Orchestrator", False,
                         f"Failed to test enhanced orchestrator: {e}")
    
    def print_summary(self):
        """Print test summary."""
        print_header("Phase 1 Test Summary")
        
        passed = sum(1 for result in self.test_results if result["passed"])
        total = len(self.test_results)
        
        print(f"\n📊 Test Results: {passed}/{total} tests passed")
        
        if passed == total:
            print_success("🎉 All Phase 1 tests passed!")
            print_info("Enhanced error recovery implementation is complete and ready for Phase 2")
        else:
            print_error(f"⚠️  {total - passed} tests failed")
            
        print("\n📋 Test Details:")
        for result in self.test_results:
            status = "✅" if result["passed"] else "❌"
            print(f"  {status} {result['test']}: {result['details']}")
            
        return passed == total


if __name__ == "__main__":
    from datetime import datetime
    
    test = Phase1RecoveryTest()
    success = test.run_all_tests()
    
    if not success:
        sys.exit(1)
    
    print("\n🚀 Phase 1 implementation complete!")
    print("\n📝 Next Steps:")
    print("  1. Run Phase 2 tests (LLM integration with real providers)")
    print("  2. Deploy to staging environment")
    print("  3. Run integration tests with frontend")
    print("  4. Monitor production metrics")
