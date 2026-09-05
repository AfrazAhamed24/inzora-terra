"""
INZORA-X Sensor Manager
Unified sensor health and status management.
"""

import time
from typing import Dict

from inzora_vision.config.config import config
from inzora_vision.utils.logging import VisionLogger


class SensorStatus:
    """Status of a single sensor/component."""

    def __init__(self, name: str, online: bool = False, status: str = "unknown", detail: str = ""):
        self.name = name
        self.online = online
        self.status = status
        self.detail = detail
        self.last_check = time.time()

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "online": self.online,
            "status": self.status,
            "detail": self.detail,
            "last_check": self.last_check,
        }


class SensorManager:
    """Manages health status of all sensors and components."""

    def __init__(self):
        self._sensors: Dict[str, SensorStatus] = {}

    def register(self, name: str, online: bool = False, status: str = "unknown", detail: str = ""):
        self._sensors[name] = SensorStatus(name, online, status, detail)

    def update(self, name: str, online: bool, status: str = "", detail: str = ""):
        if name not in self._sensors:
            self.register(name, online, status, detail)
            return
        self._sensors[name].online = online
        if status:
            self._sensors[name].status = status
        if detail:
            self._sensors[name].detail = detail
        self._sensors[name].last_check = time.time()

    def get_status(self, name: str) -> SensorStatus:
        return self._sensors.get(name, SensorStatus(name))

    def get_all(self) -> Dict[str, dict]:
        return {name: s.to_dict() for name, s in self._sensors.items()}

    def summary(self) -> str:
        lines = ["SENSOR STATUS"]
        for name, s in self._sensors.items():
            icon = "●" if s.online else "○"
            detail = f" ({s.detail})" if s.detail else ""
            lines.append(f"  {icon} {name:<12} {s.status.upper()}{detail}")
        return "\n".join(lines)
