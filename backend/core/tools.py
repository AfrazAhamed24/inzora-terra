from typing import Any, Dict


def get_sensor_data(zone: str = "north_wall") -> Dict[str, Any]:
    data = {
        "north_wall": {"tilt_deg": 4, "trend": "increasing", "thermal": "heat signature detected"},
        "south_wall": {"tilt_deg": 1, "trend": "stable", "thermal": "no anomaly"},
        "basement": {"tilt_deg": 2, "trend": "stable", "thermal": "heat signature detected"},
    }
    return data.get(zone, {"tilt_deg": 0, "trend": "unknown", "thermal": "no data"})


def get_weather(site: str = "current") -> Dict[str, Any]:
    return {
        "rain": "heavy",
        "forecast": "more rain expected in 2 hours",
        "aftershock_probability": "low",
    }


def get_building_info(building_id: str = "bld_001") -> Dict[str, Any]:
    return {
        "age_years": 20,
        "material": "concrete frame",
        "floors": 2,
        "occupancy": "residential",
        "basement": True,
    }
