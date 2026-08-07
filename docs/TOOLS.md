# Inzora Terra OS — Tool Definitions

All tools in `backend/core/tools.py` are **simulated** for demo purposes. They produce
deterministic mock data so the pipeline runs without hardware. Phase 4 (Telemetry Simulation)
replaces these with a realistic streaming layer; real hardware adapters come later.

## Sensor Tools

### get_sensor_data(zone: str) -> dict
- Returns: `tilt_deg`, `trend` (increasing/stable), `thermal`
- Source: IoT sensors in building structure
- Fallback: simulated data for demo
- Known zones: `north_wall`, `south_wall`, `basement`

## Weather Tools

### get_weather(site: str) -> dict
- Returns: `rain`, `forecast`, `aftershock_probability`
- Source: simulated conditions (OpenWeatherMap planned)

## Building Tools

### get_building_info(building_id: str) -> dict
- Returns: `age_years`, `material`, `floors`, `occupancy`, `basement`
- Source: simulated building database

## Future Hardware Adapters
- Drone camera integration
- Robot sensor feeds
- Emergency vehicle GPS
- GPR / thermal / gas telemetry streams
