"""
INZORA-X Event System
Structured event creation and distribution for all perception events.
"""

import time
import uuid
from typing import Any, Callable, Dict, List, Optional
from dataclasses import dataclass, field

from inzora_vision.utils.logging import VisionLogger


@dataclass
class VisionEvent:
    """A structured event from the perception system."""

    event_type: str
    source: str = "system"
    confidence: float = 0.0
    timestamp: float = field(default_factory=time.time)
    latitude: float = 0.0
    longitude: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    event_id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])

    @property
    def timestamp_iso(self) -> str:
        return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(self.timestamp))

    def to_dict(self) -> dict:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "source": self.source,
            "confidence": round(self.confidence, 2),
            "timestamp": self.timestamp_iso,
            "location": {"latitude": self.latitude, "longitude": self.longitude},
            "metadata": self.metadata,
        }


# Event type constants
PERSON_DETECTED = "PERSON_DETECTED"
PERSON_LOST = "PERSON_LOST"
FIRE_DETECTED = "FIRE_DETECTED"
SMOKE_DETECTED = "SMOKE_DETECTED"
FACE_DETECTED = "FACE_DETECTED"
GESTURE_DETECTED = "GESTURE_DETECTED"
THERMAL_SIGNATURE_DETECTED = "THERMAL_SIGNATURE_DETECTED"
HAZARD_DETECTED = "HAZARD_DETECTED"
CAMERA_CONNECTED = "CAMERA_CONNECTED"
CAMERA_DISCONNECTED = "CAMERA_DISCONNECTED"
THERMAL_CONNECTED = "THERMAL_CONNECTED"
THERMAL_DISCONNECTED = "THERMAL_DISCONNECTED"
GPS_UPDATED = "GPS_UPDATED"
TEST_EVENT = "TEST_EVENT"


class EventEngine:
    """Event creation, dispatch, and history."""

    def __init__(self):
        self._listeners: Dict[str, List[Callable]] = {}
        self._history: List[VisionEvent] = []
        self._max_history = 200

    def emit(
        self,
        event_type: str,
        source: str = "system",
        confidence: float = 0.0,
        lat: float = 0.0,
        lon: float = 0.0,
        **metadata,
    ) -> VisionEvent:
        """Create and dispatch an event."""
        event = VisionEvent(
            event_type=event_type,
            source=source,
            confidence=confidence,
            latitude=lat,
            longitude=lon,
            metadata=metadata,
        )
        self._history.append(event)
        if len(self._history) > self._max_history:
            self._history = self._history[-self._max_history:]

        # Notify listeners
        for callback in self._listeners.get(event_type, []):
            try:
                callback(event)
            except Exception:
                pass
        for callback in self._listeners.get("*", []):
            try:
                callback(event)
            except Exception:
                pass

        return event

    def on(self, event_type: str, callback: Callable):
        """Register a listener for an event type."""
        if event_type not in self._listeners:
            self._listeners[event_type] = []
        self._listeners[event_type].append(callback)

    def history(self, n: int = 50) -> List[dict]:
        """Return recent events as dicts."""
        return [e.to_dict() for e in self._history[-n:]]

    def clear_history(self):
        self._history.clear()
