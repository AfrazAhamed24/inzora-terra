"""
INZORA-X Vision Fire/Smoke Detector Wrapper
Uses a separate custom model (models/fire_smoke.pt).
Does NOT assume YOLOv8n can detect fire or smoke.
"""

from typing import List, Optional, Tuple

import cv2
import numpy as np

from inzora_vision.config.config import config
from inzora_vision.utils.logging import VisionLogger


class FireSmokeDetection:
    """Single fire or smoke detection result."""

    def __init__(self, label: str, confidence: float, bbox: Tuple[int, int, int, int]):
        self.label = label
        self.confidence = confidence
        self.bbox = bbox

    def to_dict(self) -> dict:
        return {
            "label": self.label,
            "confidence": round(self.confidence, 2),
            "bbox": list(self.bbox),
        }


class FireSmokeDetector:
    """Fire and smoke detection using a custom-trained model."""

    def __init__(self, model_path: Optional[str] = None):
        self._model_path = model_path or config.FIRE_SMOKE_MODEL_PATH
        self._model = None
        self._online = False

    @property
    def is_online(self) -> bool:
        return self._online

    def load(self) -> bool:
        """Load the fire/smoke model. Returns False if model file doesn't exist."""
        import os

        if not os.path.isfile(self._model_path):
            self._online = False
            VisionLogger.startup_warn(
                f"Fire/Smoke model: NOT CONFIGURED ({self._model_path} not found)"
            )
            return False

        try:
            from ultralytics import YOLO

            self._model = YOLO(self._model_path)
            self._online = True
            VisionLogger.startup("Fire/Smoke model loaded")
            return True
        except Exception as e:
            VisionLogger.startup_fail(f"Fire/Smoke model FAILED: {e}")
            self._online = False
            return False

    def detect(self, frame: np.ndarray) -> List[FireSmokeDetection]:
        """Run fire/smoke detection on a frame."""
        if not self._online or self._model is None:
            return []

        try:
            results = self._model(frame, verbose=False, conf=0.35)
            detections: List[FireSmokeDetection] = []
            h, w = frame.shape[:2]

            for r in results:
                if r.boxes is None:
                    continue
                for box in r.boxes:
                    cls = int(box.cls[0])
                    label = self._model.names.get(cls, "unknown")
                    label_lower = label.lower()
                    if label_lower not in ("fire", "smoke"):
                        continue
                    conf = float(box.conf[0])
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    detections.append(
                        FireSmokeDetection(
                            label=label_lower,
                            confidence=conf,
                            bbox=(x1, y1, x2 - x1, y2 - y1),
                        )
                    )

            return detections

        except Exception as e:
            VisionLogger.hazard("DETECT_ERROR", str(e))
            return []

    def draw(self, frame: np.ndarray, detections: List[FireSmokeDetection]) -> np.ndarray:
        """Draw fire/smoke detection overlays."""
        overlay = frame.copy()
        for det in detections:
            x, y, w, h = det.bbox
            color = (0, 0, 255) if det.label == "fire" else (128, 128, 128)
            cv2.rectangle(overlay, (x, y), (x + w, y + h), color, 2)
            icon = "FIRE" if det.label == "fire" else "SMOKE"
            label = f"{icon} {det.confidence:.0%}"
            cv2.putText(
                overlay, label, (x, y - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2
            )
        return overlay
