import asyncio
from datetime import datetime
from backend.core.gop import TERRAState
from backend.core.tools import get_sensor_data, get_weather, get_building_info
from backend.orchestration.orchestrator import Orchestrator


def print_header(title):
    print("+" + "=" * 58 + "+")
    print(f"|  {title:<54} |")
    print("+" + "-" * 58 + "+")


def print_report(label, value, bar_val=None):
    if bar_val is not None:
        b = "#" * max(1, int(bar_val * 20)) + " " * (20 - max(1, int(bar_val * 20)))
        print(f"|  {label}: {value}")
        print(f"|  [{b}] ({bar_val:.1f})")
    else:
        print(f"|  {label}: {value}")


def print_divider():
    print("+" + "=" * 58 + "+")


def print_tasks(state):
    print(f"\nActive Tasks ({len(state.tasks)}):")
    for t in state.tasks:
        p = "[HIGH]" if t.priority == "HIGH" else "[MED]" if t.priority == "MEDIUM" else "[LOW]"
        s = "PENDING" if t.status == "PENDING" else "DONE"
        c = " [needs confirm]" if t.requires_confirmation and t.confirmed is None else ""
        print(f"  {p} {t.description} -- {s}{c}")


async def main():
    print("\n" + "=" * 60)
    print("  TERRA-X | Multi-Agent Disaster Response System")
    print("=" * 60)

    state = TERRAState()
    state.incident_text = "Two-floor building collapsed after heavy rainfall. 3 missing persons."
    state.stage = "initialized"

    print(f"\n[INCIDENT] {state.incident_text}")
    print(f"[TIME] {datetime.utcnow().strftime('%H:%M:%S UTC')}\n")

    print("[SENSOR] Collecting evidence feeds...")
    state.add_evidence("sensor:north_wall", get_sensor_data("north_wall"), 0.9)
    state.add_evidence("sensor:basement", {"tilt_deg": 2, "trend": "stable", "thermal": "heat signature detected in basement", "gpr": "cracks at basement level"}, 0.85)
    state.add_evidence("weather:current", get_weather("current"), 0.85)
    state.add_evidence("building:bld_001", get_building_info("bld_001"), 0.95)
    state.add_evidence("witness:report_001", {"source": "neighbor", "last_seen": "basement", "persons": 3}, 0.60)

    orchestrator = Orchestrator()
    orchestrator.state = state
    orchestrator.setup_default_agents()

    print("\n[ORCHESTRATOR] Running full agent pipeline...")
    briefing = await orchestrator.run(state.incident_text)

    print_header("MISSION BRIEFING")
    mb = briefing["mission_briefing"]
    print(f"|  Incident ID: {mb['incident_id']}")
    print(f"|  Overall Risk: {mb['overall_risk']}")
    print(f"|  Priority Zones: {', '.join(mb['priority_zones'])}")
    print(f"|  Victims Estimated: {mb['total_victims_estimated']}")
    print(f"|  Resource Status: {mb['resource_status']}")
    print(f"|  Next Update: {mb['next_update_in']}")
    print_divider()

    print_header("RISK ASSESSMENT")
    risk = briefing["risk_report"]
    print_report("Collapse Likelihood", f"[{risk.get('likelihood', 'N/A')}]")
    print_report("Risk Score", f"{risk.get('risk_score', 0):.2f}", risk.get("risk_score", 0))
    print_report("Confidence", f"{risk.get('confidence', 0):.2f}", risk.get("confidence", 0))
    print(f"|  Hazards ({len(risk.get('hazards', []))}):")
    for h in risk.get("hazards", []):
        print(f"|    - {h}")
    print(f"|  Recommendation: {risk.get('recommendation', 'N/A')}")
    print_divider()

    print_header("VICTIM LOCALIZATION")
    victims = briefing["victim_map"]
    print(f"|  Primary Search Zone: {victims.get('primary_search_zone', 'N/A')}")
    print(f"|  Total Victims: {victims.get('total_victims_estimated', 0)}")
    print(f"|  Confidence: {victims.get('confidence', 0):.2f}")
    print("|  Zone Probability Map:")
    for z in victims.get("zones", []):
        p = "[HIGH]" if z.get("priority") == "HIGH" else "[MED]"
        prob = z.get("probability", 0)
        prob_bar = "#" * int(prob * 20) + " " * (20 - int(prob * 20))
        print(f"|    {z['zone']:>4}  [{prob_bar}] {prob:.0%}  {p}")
    print_divider()

    print_tasks(state)

    print(f"\nAgent Confidence Scores:")
    for agent_name, score in briefing.get("confidence_scores", {}).items():
        bar = "#" * int(score * 20) + " " * (20 - int(score * 20))
        print(f"  [{bar}] {agent_name}: {score:.2f}")

    print(f"\nAgent Communication Log:")
    for entry in briefing.get("agent_log", []):
        print(f"  [{entry['timestamp']}] {entry['agent']}: {entry['message']}")

    print(f"\nWorkflow Stage: {state.stage}")
    print("=" * 60 + "\n")

    print("All 4 agents executed successfully.")
    print("Frontend can now render full dashboard with live data.\n")


if __name__ == "__main__":
    asyncio.run(main())
