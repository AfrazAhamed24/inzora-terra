#!/usr/bin/env python3
"""TERRA-X Enhanced Error Recovery CLI

Command-line interface for managing enhanced error recovery features:
- Circuit breaker status and management
- Dead-letter queue inspection and recovery
- Agent health monitoring
- Manual intervention tools

Usage:
  terra-cli --help
  terra-cli circuit-breaker status [agent]
  terra-cli dead-letter list [agent]
  terra-cli dead-letter recover <execution_id>
  terra-cli health score <agent>
  terra-cli clear-circuit <agent>
  terra-cli recovery-stats
"""

import asyncio
import argparse
import json
import sys
from typing import Optional
from pathlib import Path

from backend.orchestration.orchestrator import Orchestrator
from backend.core.mission_state import MissionState


def print_success(message: str):
    print(f"✅ {message}")


def print_error(message: str):
    print(f"❌ {message}", file=sys.stderr)


def print_info(message: str):
    print(f"ℹ️  {message}")


def print_header(text: str):
    print(f"\n{'=' * 60}")
    print(f"{text}")
    print(f"{'=' * 60}")


async def main():
    parser = argparse.ArgumentParser(
        description="TERRA-X Enhanced Error Recovery CLI",
        epilog="Use 'terra-cli <command> --help' for detailed command information."
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Circuit breaker commands
    circuit_parser = subparsers.add_parser("circuit-breaker", help="Circuit breaker management")
    circuit_subparsers = circuit_parser.add_subparsers(dest="circuit_action")
    
    status_parser = circuit_subparsers.add_parser("status", help="Get circuit breaker status")
    status_parser.add_argument("agent", nargs="?", help="Agent name (optional, shows all if not specified)")
    
    clear_parser = circuit_subparsers.add_parser("clear", help="Clear circuit breaker for agent")
    clear_parser.add_argument("agent", help="Agent name to clear")
    
    # Dead-letter queue commands
    dl_parser = subparsers.add_parser("dead-letter", help="Dead-letter queue management")
    dl_subparsers = dl_parser.add_subparsers(dest="dl_action")
    
    list_parser = dl_subparsers.add_parser("list", help="List dead-letter entries")
    list_parser.add_argument("agent", nargs="?", help="Agent name (optional, shows all if not specified)")
    
    recover_parser = dl_subparsers.add_parser("recover", help="Recover specific execution")
    recover_parser.add_argument("execution_id", help="Execution ID to recover")
    
    # Health monitoring commands
    health_parser = subparsers.add_parser("health", help="Agent health monitoring")
    health_subparsers = health_parser.add_subparsers(dest="health_action")
    
    score_parser = health_subparsers.add_parser("score", help="Get agent health score")
    score_parser.add_argument("agent", help="Agent name")
    
    # Statistics command
    stats_parser = subparsers.add_parser("recovery-stats", help="Show recovery system statistics")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
        
    try:
        orchestrator = Orchestrator()
        
        if args.command == "circuit-breaker":
            await handle_circuit_commands(orchestrator, args)
        elif args.command == "dead-letter":
            await handle_dead_letter_commands(orchestrator, args)
        elif args.command == "health":
            await handle_health_commands(orchestrator, args)
        elif args.command == "recovery-stats":
            await handle_recovery_stats(orchestrator, args)
            
    except Exception as e:
        print_error(f"Command failed: {e}")
        sys.exit(1)


async def handle_circuit_commands(orchestrator: Orchestrator, args):
    """Handle circuit breaker commands."""
    if args.circuit_action == "status":
        await show_circuit_status(orchestrator, args.agent)
    elif args.circuit_action == "clear":
        await clear_circuit_breaker(orchestrator, args.agent)


async def handle_dead_letter_commands(orchestrator: Orchestrator, args):
    """Handle dead-letter queue commands."""
    if args.dl_action == "list":
        await list_dead_letter_entries(orchestrator, args.agent)
    elif args.dl_action == "recover":
        await recover_dead_letter_entry(orchestrator, args.execution_id)


async def handle_health_commands(orchestrator: Orchestrator, args):
    """Handle health monitoring commands."""
    if args.health_action == "score":
        await show_health_score(orchestrator, args.agent)


async def handle_recovery_stats(orchestrator: Orchestrator, args):
    """Show recovery system statistics."""
    await show_recovery_statistics(orchestrator)


async def show_circuit_status(orchestrator: Orchestrator, agent_name: Optional[str]):
    """Display circuit breaker status."""
    print_header("Circuit Breaker Status")
    
    status = orchestrator.get_circuit_breaker_status(agent_name)
    
    if not status:
        print_info("No circuit breaker information available")
        return
        
    if agent_name and agent_name in status:
        # Single agent view
        agent_status = status[agent_name]
        if "circuit_open" in str(agent_status):
            print_error(f"Agent '{agent_name}' has open circuit breaker")
        else:
            print_success(f"Agent '{agent_name}' is healthy")
        print(f"Status: {agent_status}")
    else:
        # All agents view
        for agent, agent_status in status.items():
            if isinstance(agent_status, dict):
                if agent_status.get("is_open", False):
                    print_error(f"❌ {agent}: BLOCKED (circuit open)")
                    print(f"   Failures: {agent_status.get('failure_count', 0)}/{agent_status.get('threshold', 0)}")
                    print(f"   Timeout remaining: {agent_status.get('timeout_remaining', 0):.1f}s")
                else:
                    print_success(f"✅ {agent}: healthy")
                    print(f"   Failure count: {agent_status.get('failure_count', 0)}")


async def clear_circuit_breaker(orchestrator: Orchestrator, agent_name: str):
    """Clear circuit breaker for specified agent."""
    print_header(f"Clearing Circuit Breaker - {agent_name}")
    
    orchestrator.clear_circuit_breaker(agent_name)
    print_success(f"Circuit breaker cleared for agent '{agent_name}'")
    print_info("Agent can now resume execution")


async def list_dead_letter_entries(orchestrator: Orchestrator, agent_name: Optional[str]):
    """List dead-letter queue entries."""
    print_header("Dead-Letter Queue Entries")
    
    stats = orchestrator.get_dead_letter_statistics()
    
    if "dead_letter_queue" not in stats:
        print_info("Dead-letter queue not available")
        return
        
    entries = stats["dead_letter_queue"]
    total = entries["total_entries"]
    
    if total == 0:
        print_info("No dead-letter entries")
        return
        
    print_info(f"Total entries: {total}")
    print_info(f"Retention period: {entries.get('retention_hours', 0)} hours")
    
    if agent_name:
        print_info(f"Filtered by agent: {agent_name}")
        
    # Show recent entries
    all_entries = orchestrator._executor._dead_letter_queue.get_entries(agent_name) if orchestrator._executor else []
    
    for entry in all_entries[-5:]:  # Show last 5 entries
        agent = entry["context"]["agent_name"]
        error_type = entry["error"]["type"]
        timestamp = entry["timestamp"]
        execution_id = entry["execution_id"]
        
        print(f"\n🔴 Entry: {execution_id}")
        print(f"   Agent: {agent}")
        print(f"   Error: {error_type}")
        print(f"   Timestamp: {timestamp}")
        print(f"   Message: {entry['error']['message'][:100]}...")
        
    if total > 5:
        print(f"\n... and {total - 5} more entries")


async def recover_dead_letter_entry(orchestrator: Orchestrator, execution_id: str):
    """Attempt to recover a specific dead-letter entry."""
    print_header(f"Recovering Dead-Letter Entry - {execution_id}")
    
    success = orchestrator.recover_from_dead_letter(execution_id)
    
    if success:
        print_success(f"Successfully queued recovery for execution '{execution_id}'")
        print_info("The execution will be retried automatically")
    else:
        print_error(f"Failed to recover execution '{execution_id}'")
        print_info("The entry may not exist or recovery may not be supported")


async def show_health_score(orchestrator: Orchestrator, agent_name: str):
    """Show agent health score."""
    print_header(f"Agent Health Score - {agent_name}")
    
    score = orchestrator.get_agent_health_score(agent_name)
    
    if score == 0.0:
        print_info(f"Agent '{agent_name}' not found or no health data available")
        return
        
    # Color-coded score display
    if score >= 0.8:
        status = "🟢 Excellent"
        level = "very healthy"
    elif score >= 0.6:
        status = "🟡 Good"
        level = "healthy"
    elif score >= 0.4:
        status = "🟠 Fair"
        level = "moderately healthy"
    else:
        status = "🔴 Poor"
        level = "needs attention"
        
    print(f"Health Score: {score:.3f} ({status})")
    print(f"Agent is {level}")
    
    # Show recovery recommendations
    if orchestrator._executor and hasattr(orchestrator._executor, '_health_monitor'):
        recommendations = orchestrator._executor._health_monitor.get_recovery_recommendations(agent_name)
        if recommendations:
            print("\nRecovery Recommendations:")
            for rec in recommendations:
                print(f"  • {rec}")


async def show_recovery_statistics(orchestrator: Orchestrator):
    """Display comprehensive recovery system statistics."""
    print_header("Enhanced Error Recovery Statistics")
    
    stats = orchestrator.get_dead_letter_statistics()
    
    print("\n📊 Dead-Letter Queue:")
    dl_stats = stats.get("dead_letter_queue", {})
    print(f"  Total entries: {dl_stats.get('total_entries', 0)}")
    print(f"  Retention period: {dl_stats.get('retention_hours', 0)} hours")
    
    if "entries_by_agent" in dl_stats:
        print("  Entries by agent:")
        for agent, count in dl_stats["entries_by_agent"].items():
            print(f"    {agent}: {count}")
            
    print("\n🏥 Agent Health Monitor:")
    health_stats = stats.get("health_monitor", {})
    
    if "total_agents" in health_stats:
        print(f"  Total agents monitored: {health_stats['total_agents']}")
        print(f"  Overall system health: {health_stats.get('overall_health', 0.0):.3f}")
        
        print("\nAgent Health Scores:")
        for agent_name, agent_data in health_stats.get("agent_health", {}).items():
            score = agent_data.get("health_score", 0.0)
            status = "🟢" if score >= 0.8 else "🟡" if score >= 0.6 else "🟠" if score >= 0.4 else "🔴"
            print(f"  {status} {agent_name}: {score:.3f} (successes: {agent_data.get('success_count', 0)}, "
                  f"failures: {agent_data.get('failure_count', 0)})")
                  
    # Show circuit breaker status summary
    if orchestrator._executor and hasattr(orchestrator._executor, 'get_circuit_breaker_status'):
        circuit_status = orchestrator._executor.get_circuit_breaker_status()
        open_count = sum(1 for status in circuit_status.values() 
                        if isinstance(status, dict) and status.get("is_open", False))
        
        print(f"\n⚡ Circuit Breakers: {open_count} open, {len(circuit_status) - open_count} closed")
        
    print("\n✨ Recovery System Status: Enhanced error recovery is operational")


if __name__ == "__main__":
    asyncio.run(main())
