"""
INZORA-X Alert Engine
Converts perception events into dashboard alerts with severity levels.
Includes cooldown/debouncing to prevent alert spam.
"""

import time
from typing import Dict, List, Optional

from inzora_vision.core.events import VisionEvent, EventEngine
from inzora_vision.utils.logging import VisionLogger


class Alert:
    """A dashboard alert."""

    # Severity constants
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    INFO = "INFO"

    def __init__(self, severity: str, title: str, detail: str = "", source: str = ""):
        self.severity = severity
        self.title = title
        self.detail = detail
        self.source = source
        self.timestamp = time.time()
        self.alert_id = f"alert_{int(self.timestamp * 1000)}"

    @property
    def timestamp_iso(self) -> str:
        return time.strftime("%H:%M:%S", time.localtime(self.timestamp))

    @property
    def icon(self) -> str:
        return {
            "CRITICAL": "🔴",
            "HIGH": "🟠",
            "MEDIUM": "🟡",
            "INFO": "🔵",
        }.get(self.severity, "⚪")

    def to_dict(self) -> dict:
        return {
            "alert_id": self.alert_id,
            "severity": self.severity,
            "title": self.title,
            "detail": self.detail,
            "source": self.source,
            "timestamp": self.timestamp_iso,
            "icon": self.icon,
        }


class AlertEngine:
    """Generates alerts from events with deduplication and cooldowns."""

    def __init__(self, event_engine: EventEngine):
        self._alerts: List[Alert] = []
        self._max_alerts = 100
        self._cooldowns: Dict[str, float] = {}  # event_key -> last_fire_time
        self._cooldown_seconds: Dict[str, float] = {
            "FIRE_DETECTED": 5.0,
            "SMOKE_DETECTED": 5.0,
            "PERSON_DETECTED": 10.0,
            "FACE_DETECTED": 15.0,
            "GESTURE_DETECTED": 5.0,
            "THERMAL_SIGNATURE_DETECTED": 10.0,
            "HAZARD_DETECTED": 5.0,
            "CAMERA_CONNECTED": 60.0,
            "CAMERA_DISCONNECTED": 30.0,
            "GPS_UPDATED": 120.0,
            "TEST_EVENT": 2.0,
        }
        self._register_listeners(event_engine)

    def _register_listeners(self, engine: EventEngine):
        engine.on("*", self._on_event)

    def _on_event(self, event: VisionEvent):
        """Process an event and potentially generate an alert."""
        # Check cooldown
        key = event.event_type
        now = time.time()
        cd = self._cooldown_seconds.get(key, 5.0)
        last = self._cooldowns.get(key, 0)
        if now - last < cd:
            return  # Still in cooldown
        self._cooldowns[key] = now

        # Map events to alerts
        alert = self._event_to_alert(event)
        if alert:
            self._add_alert(alert)

    def _event_to_alert(self, event: VisionEvent) -> Optional[Alert]:
        """Convert an event to an alert."""
        meta = event.metadata
        is_sim = meta.get("simulated", False)
        sim_label = " [SIMULATION]" if is_sim else ""

        if event.event_type == "FIRE_DETECTED":
            return Alert(
                Alert.CRITICAL,
                f"🔥 FIRE DETECTED{sim_label}",
                f"Confidence: {event.confidence:.0%}",
                event.source,
            )
        elif event.event_type == "SMOKE_DETECTED":
            return Alert(
                Alert.HIGH,
                f"💨 SMOKE DETECTED{sim_label}",
                f"Confidence: {event.confidence:.0%}",
                event.source,
            )
        elif event.event_type == "HAZARD_DETECTED":
            return Alert(
                Alert.CRITICAL,
                f"⚠️ HAZARD NEAR PERSON{sim_label}",
                f"Confidence: {event.confidence:.0%}",
                event.source,
            )
        elif event.event_type == "PERSON_DETECTED":
            pid = meta.get("person_id", "UNKNOWN")
            return Alert(
                Alert.MEDIUM,
                f"👤 New person detected: {pid}",
                f"Confidence: {event.confidence:.0%}",
                event.source,
            )
        elif event.event_type == "GESTURE_DETECTED":
            gesture = meta.get("gesture", "unknown")
            return Alert(
                Alert.MEDIUM,
                f"🤚 Gesture: {gesture}{sim_label}",
                "Possible signal — observation only",
                event.source,
            )
        elif event.event_type == "THERMAL_SIGNATURE_DETECTED":
            return Alert(
                Alert.HIGH,
                f"🌡️ Thermal hotspot detected{sim_label}",
                "Heat signature observed",
                event.source,
            )
        elif event.event_type == "CAMERA_CONNECTED":
            return Alert(Alert.INFO, "📷 Camera connected", event.source)
        elif event.event_type == "CAMERA_DISCONNECTED":
            return Alert(Alert.HIGH, "📷 Camera disconnected", event.source)
        elif event.event_type == "TEST_EVENT":
            title = meta.get("title", "Test event")
            return Alert(Alert.INFO, f"🧪 {title} [SIMULATION]", meta.get("detail", ""), event.source)
        elif event.event_type == "FACE_DETECTED":
            return None  # Don't alert on every face detection — too frequent

        return None

    def _add_alert(self, alert: Alert):
        self._alerts.append(alert)
        if len(self._alerts) > self._max_alerts:
            self._alerts = self._alerts[-self._max_alerts:]
        VisionLogger.alert(alert.severity, alert.title)

    def force_alert(self, severity: str, title: str, detail: str = "", source: str = ""):
        """Manually inject an alert (e.g. for test mode)."""
        alert = Alert(severity, title, detail, source)
        self._add_alert(alert)

    def get_alerts(self, n: int = 50) -> List[dict]:
        return [a.to_dict() for a in self._alerts[-n:]]

    def clear(self):
        self._alerts.clear()
