"""
INZORA-X Face Detector
Face detection using MediaPipe Face Detection.
This is detection/tracking ONLY — no identity recognition.
"""

import threading
import time
from typing import List, Optional, Tuple

import cv2
import numpy as np

from inzora_vision.config.config import config
from inzora_vision.utils.logging import VisionLogger


class FaceDetection:
    """A single detected face."""

    def __init__(self, bbox: Tuple[int, int, int, int], confidence: float, face_id: int):
        self.bbox = bbox
        self.confidence = confidence
        self.face_id = face_id

    def to_dict(self) -> dict:
        return {
            "face_id": self.face_id,
            "confidence": round(self.confidence, 2),
            "bbox": list(self.bbox),
        }


class FaceDetector:
    """MediaPipe-based face detector."""

    def __init__(self):
        self._detector = None
        self._online = False
        self._face_counter = 0
        self._faces: List[FaceDetection] = []

    @property
    def is_online(self) -> bool:
        return self._online

    @property
    def face_count(self) -> int:
        return len(self._faces)

    def load(self) -> bool:
        """Initialize MediaPipe face detection."""
        try:
            import mediapipe as mp

            self._detector = mp.solutions.face_detection.FaceDetection(
                model_selection=1,  # 1 = full range, good for webcam distances
                min_detection_confidence=0.5,
            )
            self._online = True
            VisionLogger.system("Face detection initialized", "MediaPipe")
            return True
        except Exception as e:
            VisionLogger.system("Face detection FAILED", str(e))
            self._online = False
            return False

    def detect(self, frame: np.ndarray) -> List[FaceDetection]:
        """Run face detection on a frame."""
        if not self._online or self._detector is None:
            return []

        try:
            h, w = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self._detector.process(rgb)

            self._faces = []
            if results.detections:
                self._face_counter += 1
                for i, detection in enumerate(results.detections):
                    conf = detection.score[0]
                    bbox_mp = detection.location_data.relative_bounding_box
                    x1 = max(0, int(bbox_mp.xmin * w))
                    y1 = max(0, int(bbox_mp.ymin * h))
                    bw = int(bbox_mp.width * w)
                    bh = int(bbox_mp.height * h)
                    self._faces.append(
                        FaceDetection(bbox=(x1, y1, bw, bh), confidence=conf, face_id=i + 1)
                    )

            return self._faces

        except Exception as e:
            VisionLogger.face("DETECT_ERROR", str(e))
            return []

    def draw(self, frame: np.ndarray) -> np.ndarray:
        """Draw face detection overlays on frame."""
        overlay = frame.copy()
        for face in self._faces:
            x, y, w, h = face.bbox
            cv2.rectangle(overlay, (x, y), (x + w, y + h), (255, 200, 0), 2)
            label = f"Face {face.face_id} {face.confidence:.0%}"
            cv2.putText(
                overlay, label, (x, y - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 200, 0), 1
            )
        return overlay

    def get_faces_dict(self) -> List[dict]:
        return [f.to_dict() for f in self._faces]
