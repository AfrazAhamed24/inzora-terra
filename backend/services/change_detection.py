from typing import Dict, Any, List
import random

class ChangeDetectionService:
    def __init__(self):
        # Stores baselines for sensor values per zone
        self.baselines: Dict[str, Dict[str, float]] = {}

    def analyze(self, zone_id: str, current_data: Dict[str, float]) -> Dict[str, Any]:
        """Compares current sensor data against baseline and detects significant drift."""
        if zone_id not in self.baselines:
            self.baselines[zone_id] = current_data
            return {"status": "baseline_established"}

        baseline = self.baselines[zone_id]
        diffs = {}
        significant_changes = []

        for sensor, value in current_data.items():
            if sensor in baseline:
                diff = abs(value - baseline[sensor])
                # Threshold for significant change (e.g., 20% deviation)
                if diff > (baseline[sensor] * 0.2):
                    significant_changes.append(sensor)
                    diffs[sensor] = value - baseline[sensor]

        if significant_changes:
            return {
                "status": "significant_drift_detected",
                "affected_sensors": significant_changes,
                "magnitude": diffs,
                "alert_level": "WARNING" if len(significant_changes) < 2 else "CRITICAL"
            }
        
        return {"status": "stable"}

# Global instance for simulation
change_detector = ChangeDetectionService()
