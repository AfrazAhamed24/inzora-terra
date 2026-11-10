from typing import Dict, Any, List

class TriageEngine:
    """Calculates priority scores for zones based on risk and victim presence."""
    
    def calculate_priority(self, zone_id: str, risk_score: float, victim_count: int) -> str:
        """
        Determines priority level.
        High risk + High victims = CRITICAL
        High risk + Low victims = HIGH
        Low risk + High victims = HIGH
        Else = MEDIUM/LOW
        """
        if risk_score > 0.7 and victim_count > 0:
            return "CRITICAL"
        if risk_score > 0.5 or victim_count > 2:
            return "HIGH"
        if victim_count > 0:
            return "MEDIUM"
        return "LOW"

triage_engine = TriageEngine()
