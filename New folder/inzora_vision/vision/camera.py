"""
INZORA-X Camera Module
Thread-safe webcam capture with automatic error handling and recovery.
"""

import threading
import time
from typing import Optional, Tuple

import cv2
import numpy as np

from inzora_vision.config.config import config
from inzora_vision.utils.logging import VisionLogger


class Camera:
    """Thread-safe camera capture with automatic reconnection."""

    def __init__(
        self,
        index: Optional[int] = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
    ):
        self.index = index if index is not None else config.CAMERA_INDEX
        self.width = width if width is not None else config.CAMERA_WIDTH
        self.height = height if height is not None else config.CAMERA_HEIGHT
        self._cap: Optional[cv2.VideoCapture] = None
        self._frame: Optional[np.ndarray] = None
        self._lock = threading.Lock()
        self._running = False
        self._online = False
        self._thread: Optional[threading.Thread] = None
        self._fps_actual: float = 0.0

    @property
    def is_online(self) -> bool:
        return self._online

    @property
    def fps(self) -> float:
        return self._fps_actual

    @property
    def resolution(self) -> Tuple[int, int]:
        return (self.width, self.height)

    def _open(self) -> bool:
        """Try to open the camera."""
        try:
            if self._cap is not None:
                self._cap.release()
                self._cap = None

            cap = cv2.VideoCapture(self.index)
            if not cap.isOpened():
                return False

            cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            cap.set(cv2.CAP_PROP_FPS, config.CAMERA_FPS)

            # Verify we can read a frame
            ret, test_frame = cap.read()
            if not ret or test_frame is None:
                cap.release()
                return False

            self._cap = cap
            self._online = True
            VisionLogger.camera("CONNECTED", f"Camera {self.index}")
            return True
        except Exception as e:
            VisionLogger.camera("CONNECT_FAILED", str(e))
            return False

    def start(self) -> bool:
        """Start camera capture thread. Returns True if camera connected."""
        ok = self._open()
        self._running = True
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        return ok

    def _capture_loop(self):
        """Background capture loop."""
        while self._running:
            if self._cap is None or not self._cap.isOpened():
                # Try to reconnect
                self._online = False
                time.sleep(2.0)
                self._open()
                continue

            try:
                t0 = time.time()
                ret, frame = self._cap.read()
                if not ret or frame is None:
                    VisionLogger.camera("FRAME_LOST", "Reconnecting...")
                    self._online = False
                    time.sleep(1.0)
                    self._open()
                    continue

                with self._lock:
                    self._frame = frame

                dt = time.time() - t0
                if dt > 0:
                    self._fps_actual = 1.0 / dt

                time.sleep(1.0 / config.CAMERA_FPS)

            except Exception as e:
                VisionLogger.camera("CAPTURE_ERROR", str(e))
                time.sleep(1.0)

    def get_frame(self) -> Optional[np.ndarray]:
        """Return the latest frame (thread-safe)."""
        with self._lock:
            if self._frame is not None:
                return self._frame.copy()
        return None

    def submit_frame(self, frame: np.ndarray):
        """Accept a frame captured by a browser webcam."""
        if frame is None or frame.size == 0:
            return
        with self._lock:
            self._frame = frame.copy()
        self._online = True

    def stop(self):
        """Stop capture and release resources."""
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3.0)
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:
                pass
            self._cap = None
        self._online = False
        VisionLogger.camera("STOPPED")
