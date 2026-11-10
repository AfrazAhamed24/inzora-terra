"""
INZORA-X Gesture Detector
Hand gesture recognition using MediaPipe Hands.
Recognizes: open palm, thumbs up.
All gestures are OBSERVATIONS only — never auto-classify a person as safe.
"""

from typing import List, Optional

import cv2
import numpy as np

from inzora_vision.config.config import config
from inzora_vision.utils.logging import VisionLogger


class GestureResult:
    """A detected gesture."""

    def __init__(self, gesture: str, confidence: float, hand_label: str):
        self.gesture = gesture
        self.confidence = confidence
        self.hand_label = hand_label  # 'Left' or 'Right'

    @property
    def display(self) -> str:
        if self.gesture == "thumbs_up":
            return "👍 THUMBS UP"
        elif self.gesture == "open_palm":
            return "🖐️ OPEN PALM"
        return f"🤚 {self.gesture.upper()}"

    @property
    def interpretation(self) -> str:
        if self.gesture == "thumbs_up":
            return "POSSIBLE SAFE SIGNAL"
        elif self.gesture == "open_palm":
            return "POSSIBLE HELLO / HALT SIGNAL"
        return "UNKNOWN GESTURE"

    def to_dict(self) -> dict:
        return {
            "gesture": self.gesture,
            "display": self.display,
            "interpretation": self.interpretation,
            "confidence": round(self.confidence, 2),
            "hand": self.hand_label,
        }


class GestureDetector:
    """MediaPipe-based hand gesture detector."""

    def __init__(self):
        self._hands = None
        self._online = False
        self._gestures: List[GestureResult] = []

    @property
    def is_online(self) -> bool:
        return self._online

    @property
    def current_gestures(self) -> List[GestureResult]:
        return self._gestures

    def load(self) -> bool:
        """Initialize MediaPipe Hands."""
        try:
            import mediapipe as mp

            self._hands = mp.solutions.hands.Hands(
                static_image_mode=False,
                max_num_hands=2,
                min_detection_confidence=0.6,
                min_tracking_confidence=0.5,
            )
            self._online = True
            VisionLogger.system("Gesture detection initialized", "MediaPipe Hands")
            return True
        except Exception as e:
            VisionLogger.system("Gesture detection FAILED", str(e))
            self._online = False
            return False

    def detect(self, frame: np.ndarray) -> List[GestureResult]:
        """Detect hand gestures in a frame."""
        if not self._online or self._hands is None:
            return []

        try:
            h, w = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self._hands.process(rgb)

            self._gestures = []
            if results.multi_hand_landmarks:
                for hand_idx, (hand_landmarks, handedness) in enumerate(
                    zip(results.multi_hand_landmarks, results.multi_handedness)
                ):
                    hand_label = handedness.classification[0].label
                    lm = hand_landmarks.landmark
                    gesture = self._classify_gesture(lm)
                    if gesture:
                        conf = handedness.classification[0].score
                        self._gestures.append(
                            GestureResult(gesture=gesture, confidence=conf, hand_label=hand_label)
                        )

            return self._gestures

        except Exception as e:
            VisionLogger.gesture("DETECT_ERROR", str(e))
            return []

    def _classify_gesture(self, landmarks) -> Optional[str]:
        """Classify gesture from hand landmarks."""
        # Thumb tip (4), Index tip (8), Middle tip (12), Ring tip (16), Pinky tip (20)
        # Thumb IP (3), Index PIP (6), Middle PIP (10), Ring PIP (14), Pinky PIP (18)

        thumb_tip = landmarks[4]
        thumb_ip = landmarks[3]
        index_tip = landmarks[8]
        index_pip = landmarks[6]
        middle_tip = landmarks[12]
        middle_pip = landmarks[10]
        ring_tip = landmarks[16]
        ring_pip = landmarks[14]
        pinky_tip = landmarks[20]
        pinky_pip = landmarks[18]
        wrist = landmarks[0]

        # Check if fingers are extended (tip above pip in y)
        index_ext = index_tip.y < index_pip.y
        middle_ext = middle_tip.y < middle_pip.y
        ring_ext = ring_tip.y < ring_pip.y
        pinky_ext = pinky_tip.y < pinky_pip.y
        thumb_ext = thumb_tip.y < thumb_ip.y

        # Thumbs up: thumb extended, all other fingers closed
        if thumb_ext and not index_ext and not middle_ext and not ring_ext and not pinky_ext:
            return "thumbs_up"

        # Open palm: all fingers extended
        if index_ext and middle_ext and ring_ext and pinky_ext:
            return "open_palm"

        return None

    def draw(self, frame: np.ndarray) -> np.ndarray:
        """Draw gesture overlay text on frame."""
        overlay = frame.copy()
        if self._gestures:
            y_offset = 30
            for g in self._gestures:
                text = f"{g.display} ({g.confidence:.0%})"
                cv2.putText(
                    overlay,
                    text,
                    (10, y_offset),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    (0, 255, 255),
                    2,
                )
                y_offset += 35
        return overlay

    def get_gestures_dict(self) -> List[dict]:
        return [g.to_dict() for g in self._gestures]
