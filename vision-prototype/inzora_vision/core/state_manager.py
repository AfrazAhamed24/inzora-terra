"""
INZORA-X State Manager
Central application state that all components read/write.
Thread-safe. Frontend consumes this state via API.
"""

import json
import time
import threading
from typing import Any, Dict, List, Optional

from inzora_vision.config.config import config
from inzora_vision.core.victim_tracker import VictimTracker
from inzora_vision.core.alert_engine import AlertEngine
from inzora_vision.core.events import EventEngine
from inzora_vision.sensors.sensor_manager import SensorManager
from inzora_vision.sensors.gps import GPSProvider


class AppState:
    """Central application state singleton."""

    def __init__(self):
        self._lock = threading.Lock()

        # Sub-systems
        self.events = EventEngine()
        self.alerts = AlertEngine(self.events)
        self.victims = VictimTracker()
        self.sensors = SensorManager()
        self.gps = GPSProvider()

        # System status
        self.camera_online = False
        self.thermal_status = "offline"
        self.yolo_online = False
        self.face_online = False
        self.gesture_online = False
        self.fire_model_online = False
        self.server_online = False

        # Vision mode
        self.vision_mode = "ai_detection"

        # Last update time
        self._last_update = time.time()

    def to_dict(self) -> dict:
        """Serialize the full state for the frontend."""
        with self._lock:
            loc = self.gps.get_location()
            return {
                "system": {
                    "camera": "online" if self.camera_online else "offline",
                    "thermal": self.thermal_status,
                    "gps": loc.source if self.camera_online or self.gps.is_online else "offline",
                    "yolo": "online" if self.yolo_online else "offline",
                    "face": "online" if self.face_online else "offline",
                    "gesture": "online" if self.gesture_online else "offline",
                    "fire_model": "online" if self.fire_model_online else "not_configured",
                    "server": "online" if self.server_online else "offline",
                    "test_mode": config.TEST_MODE,
                },
                "people": self.victims.get_victims_list(),
                "alerts": self.alerts.get_alerts(30),
                "location": loc.to_dict(),
                "sensors": self.sensors.get_all(),
                "thermal_hotspots": [],
                "camera_online": self.camera_online,
                "last_update": time.strftime("%H:%M:%S", time.localtime()),
            }

    def update_victim_hazards(self, hazard_positions: List[dict]):
        """Check if any victims are near detected hazards."""
        for victim in self.victims.active_victims:
            near = False
            for hz in hazard_positions:
                dx = victim.rel_x - hz.get("rel_x", 0)
                dy = victim.rel_y - hz.get("rel_y", 0)
                dist = (dx ** 2 + dy ** 2) ** 0.5
                if dist < 0.3:  # Within 30% of frame
                    near = True
                    break
            was_near = victim.nearby_hazard
            self.victims.set_hazard_nearby(victim.id, near)
            if near and not was_near:
                self.events.emit(
                    "HAZARD_DETECTED",
                    source="state_manager",
                    confidence=0.9,
                    person_id=victim.id,
                    detail=f"Hazard near {victim.id}",
                )

    def get_full_state(self) -> dict:
        return self.to_dict()
