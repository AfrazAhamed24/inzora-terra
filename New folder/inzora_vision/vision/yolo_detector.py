"""
INZORA-X YOLO Detector
Person detection using Ultralytics YOLO with simple identity association.
"""

import threading
import time
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from inzora_vision.config.config import config
from inzora_vision.utils.logging import VisionLogger


class Detection:
    """A single detected object."""

    def __init__(
        self,
        label: str,
        confidence: float,
        bbox: Tuple[int, int, int, int],  # x, y, w, h
        center: Tuple[int, int],
        frame_w: int,
        frame_h: int,
    ):
        self.label = label
        self.confidence = confidence
        self.bbox = bbox  # pixel coords
        self.center = center
        # Relative position in frame (0-1)
        self.rel_x = center[0] / frame_w if frame_w > 0 else 0
        self.rel_y = center[1] / frame_h if frame_h > 0 else 0

    def to_dict(self) -> dict:
        return {
            "label": self.label,
            "confidence": round(self.confidence, 2),
            "bbox": list(self.bbox),
            "center": list(self.center),
            "rel_x": round(self.rel_x, 3),
            "rel_y": round(self.rel_y, 3),
        }


class PersonTrack:
    """A tracked person with temporary ID."""

    def __init__(self, person_id: str, detection: Detection):
        self.id = person_id
        self.detection = detection
        self.first_seen = time.time()
        self.last_seen = time.time()
        self.detection_count = 1
        self.max_confidence = detection.confidence
        self.active = True

    def update(self, detection: Detection):
        self.detection = detection
        self.last_seen = time.time()
        self.detection_count += 1
        self.max_confidence = max(self.max_confidence, detection.confidence)
        self.active = True

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "confidence": round(self.detection.confidence, 2),
            "max_confidence": round(self.max_confidence, 2),
            "detection_count": self.detection_count,
            "rel_x": round(self.detection.rel_x, 3),
            "rel_y": round(self.detection.rel_y, 3),
            "active": self.active,
            "first_seen": self.first_seen,
            "last_seen": self.last_seen,
        }


class YOLODetector:
    """YOLO object detection with person tracking."""

    def __init__(self, model_path: Optional[str] = None):
        self._model_path = model_path or config.YOLO_MODEL_PATH
        self._model = None
        self._online = False
        self._lock = threading.Lock()
        self._person_counter = 0
        self._tracks: Dict[str, PersonTrack] = {}
        self._max_lost_time = 2.0  # seconds before marking track as inactive

    @property
    def is_online(self) -> bool:
        return self._online

    @property
    def person_count(self) -> int:
        return len([t for t in self._tracks.values() if t.active])

    @property
    def active_tracks(self) -> List[PersonTrack]:
        return [t for t in self._tracks.values() if t.active]

    def load(self) -> bool:
        """Load YOLO model. Returns True on success."""
        try:
            from ultralytics import YOLO

            self._model = YOLO(self._model_path)
            self._online = True
            VisionLogger.system("YOLO loaded", self._model_path)
            return True
        except Exception as e:
            VisionLogger.system("YOLO load FAILED", str(e))
            self._online = False
            return False

    def detect(self, frame: np.ndarray) -> List[Detection]:
        """Run person detection on a frame."""
        if not self._online or self._model is None:
            return []

        try:
            results = self._model(frame, verbose=False, conf=0.4)
            detections: List[Detection] = []
            h, w = frame.shape[:2]

            for r in results:
                if r.boxes is None:
                    continue
                for box in r.boxes:
                    cls = int(box.cls[0])
                    label = self._model.names.get(cls, "unknown")
                    if label != "person":
                        continue
                    conf = float(box.conf[0])
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    bx, by = x1, y1
                    bw, bh = x2 - x1, y2 - y1
                    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                    det = Detection(
                        label="person",
                        confidence=conf,
                        bbox=(bx, by, bw, bh),
                        center=(cx, cy),
                        frame_w=w,
                        frame_h=h,
                    )
                    detections.append(det)

            self._associate(detections)
            return detections

        except Exception as e:
            VisionLogger.vision("DETECT_ERROR", str(e))
            return []

    def _associate(self, detections: List[Detection]):
        """Simple nearest-centroid association to maintain temporary IDs."""
        now = time.time()

        # Deactivate old tracks
        for track in self._tracks.values():
            if now - track.last_seen > self._max_lost_time:
                track.active = False

        # Match detections to existing active tracks
        matched_tracks = set()
        matched_dets = set()

        active_tracks = [t for t in self._tracks.values() if t.active]
        for i, det in enumerate(detections):
            best_track = None
            best_dist = float("inf")
            for track in active_tracks:
                if track.id in matched_tracks:
                    continue
                td = track.detection
                dist = ((td.center[0] - det.center[0]) ** 2 + (td.center[1] - det.center[1]) ** 2) ** 0.5
                if dist < best_dist and dist < 200:  # 200px threshold
                    best_dist = dist
                    best_track = track
            if best_track:
                best_track.update(det)
                matched_tracks.add(best_track.id)
                matched_dets.add(i)

        # Create new tracks for unmatched detections
        for i, det in enumerate(detections):
            if i not in matched_dets:
                self._person_counter += 1
                pid = f"PERSON-{self._person_counter:03d}"
                self._tracks[pid] = PersonTrack(pid, det)
                VisionLogger.vision("PERSON_DETECTED", f"{pid}   {det.confidence:.0%}")

    def draw(self, frame: np.ndarray) -> np.ndarray:
        """Draw detection overlays on frame."""
        overlay = frame.copy()
        for track in self._tracks.values():
            if not track.active:
                continue
            det = track.detection
            x, y, w, h = det.bbox
            # Color by confidence
            color = (0, 255, 0) if det.confidence > 0.7 else (0, 200, 255)
            cv2.rectangle(overlay, (x, y), (x + w, y + h), color, 2)
            label = f"{track.id} {det.confidence:.0%}"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
            cv2.rectangle(overlay, (x, y - th - 8), (x + tw + 4, y), color, -1)
            cv2.putText(overlay, label, (x + 2, y - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)
        return overlay

    def get_tracks_dict(self) -> List[dict]:
        """Return serializable list of active person tracks."""
        return [t.to_dict() for t in self._tracks.values() if t.active]

    def reset(self):
        """Clear all tracks."""
        with self._lock:
            self._tracks.clear()
            self._person_counter = 0
