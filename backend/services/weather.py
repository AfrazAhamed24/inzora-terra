import random
from typing import Dict, Any

def get_live_weather_snapshot() -> Dict[str, Any]:
    """Simulates live weather and seismic telemetry data."""
    return {
        "wind_speed_kmh": round(random.uniform(0, 120), 1),
        "precipitation_mm": round(random.uniform(0, 50), 1),
        "visibility_meters": round(random.uniform(100, 5000), 0),
        "seismic_index": round(random.uniform(0, 1.0), 2),
        "timestamp": "2026-10-01T03:45:00Z"
    }
