"""
INZORA-X Victim / Person Tracker
Tracks detected people with risk assessment based on available observations only.
Does NOT make unsupported medical claims.
"""

import time
from typing import Dict, List, Optional

from inzora_vision.utils.logging import VisionLogger


class VictimState:
    """Possible states for a detected person."""
    OBSERVED = "OBSERVED"
    POSSIBLE_SURVIVOR = "POSSIBLE_SURVIVOR"
    HIGH_RISK = "HIGH_RISK"
    UNKNOWN = "UNKNOWN"
    LOST = "LOST"


PRIORITY_NONE = "N/A"
PRIORITY_P1 = "P1"  # highest — person near hazard, face visible, gesture
PRIORITY_P2 = "P2"  # medium — person detected, some risk factors
PRIORITY_P3 = "P3"  # lower — person observed, no immediate risk
PRIORITY_UNKNOWN = "UNK"


class VictimProfile:
    """A tracked person's observation profile."""

    def __init__(self, person_id: str):
        self.id = person_id
        self.state = VictimState.OBSERVED
        self.priority = PRIORITY_P3
        self.face_visible = False
        self.gesture: Optional[str] = None
        self.thermal_signature = False
        self.nearby_hazard = False
        self.confidence = 0.0
        self.rel_x = 0.0
        self.rel_y = 0.0
        self.first_seen = time.time()
        self.last_seen = time.time()
        self.active = True

    def update_observation(
        self,
        confidence: float = 0.0,
        face_visible: bool = False,
        gesture: Optional[str] = None,
        thermal_signature: bool = False,
        nearby_hazard: bool = False,
        rel_x: float = 0.0,
        rel_y: float = 0.0,
    ):
        """Update observations and recompute state/priority."""
        self.confidence = confidence
        self.rel_x = rel_x
        self.rel_y = rel_y
        self.last_seen = time.time()

        if face_visible:
            self.face_visible = True
        if gesture:
            self.gesture = gesture
        if thermal_signature:
            self.thermal_signature = True
        if nearby_hazard:
            self.nearby_hazard = True

        self._recompute_state()

    def _recompute_state(self):
        """Derive risk state from available observations."""
        if self.nearby_hazard:
            self.state = VictimState.HIGH_RISK
            self.priority = PRIORITY_P1
        elif self.gesture and self.gesture in ("thumbs_up", "open_palm"):
            # Gesture observed — treat as possible survivor indication, NOT certainty
            self.state = VictimState.POSSIBLE_SURVIVOR
            self.priority = PRIORITY_P2
        elif self.face_visible and self.confidence > 0.7:
            self.state = VictimState.POSSIBLE_SURVIVOR
            self.priority = PRIORITY_P2
        else:
            self.state = VictimState.OBSERVED
            self.priority = PRIORITY_P3

    def mark_lost(self):
        self.state = VictimState.LOST
        self.active = False
        self.priority = PRIORITY_UNKNOWN

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "state": self.state,
            "priority": self.priority,
            "confidence": round(self.confidence, 2),
            "face_visible": self.face_visible,
            "gesture": self.gesture,
            "thermal_signature": self.thermal_signature,
            "nearby_hazard": self.nearby_hazard,
            "rel_x": round(self.rel_x, 3),
            "rel_y": round(self.rel_y, 3),
            "active": self.active,
            "first_seen": self.first_seen,
            "last_seen": self.last_seen,
        }


class VictimTracker:
    """Central person/victim tracking system."""

    def __init__(self):
        self._victims: Dict[str, VictimProfile] = {}

    @property
    def active_victims(self) -> List[VictimProfile]:
        return [v for v in self._victims.values() if v.active]

    def update_person(
        self,
        person_id: str,
        confidence: float = 0.0,
        face_visible: bool = False,
        gesture: Optional[str] = None,
        thermal_signature: bool = False,
        nearby_hazard: bool = False,
        rel_x: float = 0.0,
        rel_y: float = 0.0,
    ):
        """Update or create a person profile."""
        if person_id not in self._victims:
            self._victims[person_id] = VictimProfile(person_id)
            VisionLogger.vision("NEW_PERSON", person_id)

        self._victims[person_id].update_observation(
            confidence=confidence,
            face_visible=face_visible,
            gesture=gesture,
            thermal_signature=thermal_signature,
            nearby_hazard=nearby_hazard,
            rel_x=rel_x,
            rel_y=rel_y,
        )

    def remove_person(self, person_id: str):
        if person_id in self._victims:
            self._victims[person_id].mark_lost()
            VisionLogger.vision("PERSON_LOST", person_id)

    def get_victims_list(self) -> List[dict]:
        return [v.to_dict() for v in self._victims.values() if v.active]

    def get_all_list(self) -> List[dict]:
        return [v.to_dict() for v in self._victims.values()]

    def set_hazard_nearby(self, person_id: str, nearby: bool = True):
        if person_id in self._victims:
            self._victims[person_id].nearby_hazard = nearby
            self._victims[person_id]._recompute_state()

    def get_victim(self, person_id: str) -> Optional[VictimProfile]:
        return self._victims.get(person_id)
