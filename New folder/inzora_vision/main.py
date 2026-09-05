#!/usr/bin/env python3
"""
INZORA-X Vision System — Main Entry Point

Standalone disaster-rescue perception layer.
Run: python main.py
"""

import os
import sys
import time
import threading
import signal

# Ensure the project root (parent of this file) is on the path
# so 'from inzora_vision import ...' works both standalone and via top-level main.py
_parent = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _parent not in sys.path:
    sys.path.insert(0, _parent)
# Working directory = inzora_vision/ (relative paths for models etc.)
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from inzora_vision.config.config import config
from inzora_vision.utils.logging import VisionLogger
from inzora_vision.vision.camera import Camera
from inzora_vision.vision.yolo_detector import YOLODetector
from inzora_vision.vision.face_detector import FaceDetector
from inzora_vision.vision.gesture_detector import GestureDetector
from inzora_vision.vision.thermal import ThermalSensor
from inzora_vision.vision.fire_smoke_detector import FireSmokeDetector
from inzora_vision.core.state_manager import AppState
from inzora_vision.core.events import (
    PERSON_DETECTED, PERSON_LOST, FIRE_DETECTED, SMOKE_DETECTED,
    FACE_DETECTED, GESTURE_DETECTED, THERMAL_SIGNATURE_DETECTED,
    CAMERA_CONNECTED, CAMERA_DISCONNECTED,
)


class INZORAXSystem:
    """Main orchestrator for the INZORA-X vision system."""

    def __init__(self):
        self.state = AppState()
        self.camera = Camera()
        self.yolo = YOLODetector()
        self.face = FaceDetector()
        self.gesture = GestureDetector()
        self.thermal = ThermalSensor()
        self.fire_smoke = FireSmokeDetector()

        self._running = False
        self._processing_thread = None
        self._frame_count = 0

    def startup(self):
        """Initialize all components with clean startup sequence."""
        VisionLogger.banner()
        print()

        # Config
        VisionLogger.startup("Configuration loaded")

        # YOLO
        if self.yolo.load():
            VisionLogger.startup("YOLO loaded")
        else:
            VisionLogger.startup_warn("YOLO: FAILED TO LOAD")

        # Fire/smoke model
        if self.fire_smoke.load():
            VisionLogger.startup("Fire/Smoke model loaded")
        else:
            VisionLogger.startup_warn("Fire/Smoke model: NOT CONFIGURED")

        # Face detection
        if self.face.load():
            VisionLogger.startup("Face detection initialized")
        else:
            VisionLogger.startup_warn("Face detection: FAILED")

        # Gesture detection
        if self.gesture.load():
            VisionLogger.startup("Gesture detection initialized")
        else:
            VisionLogger.startup_warn("Gesture detection: FAILED")

        # Thermal
        self.thermal.initialize()

        # GPS
        self.gps = self.state.gps
        self.gps.initialize()

        # Camera
        cam_ok = self.camera.start()
        if cam_ok:
            VisionLogger.startup("Camera connected")
        else:
            VisionLogger.startup_warn("Camera: OFFLINE")

        # Register sensors
        self.state.sensors.register("CAMERA", self.camera.is_online, "online" if self.camera.is_online else "offline")
        self.state.sensors.register("YOLO", self.yolo.is_online, "online" if self.yolo.is_online else "offline")
        self.state.sensors.register("FACE", self.face.is_online, "online" if self.face.is_online else "offline")
        self.state.sensors.register("GESTURE", self.gesture.is_online, "online" if self.gesture.is_online else "offline")
        self.state.sensors.register("THERMAL", self.thermal.is_online, self.thermal.status)
        self.state.sensors.register("GPS", self.gps.is_online, self.gps.status)
        self.state.sensors.register("FIRE_MODEL", self.fire_smoke.is_online, "online" if self.fire_smoke.is_online else "not_configured")

        # Update state
        self.state.camera_online = self.camera.is_online
        self.state.yolo_online = self.yolo.is_online
        self.state.face_online = self.face.is_online
        self.state.gesture_online = self.gesture.is_online
        self.state.thermal_status = self.thermal.status
        self.state.fire_model_online = self.fire_smoke.is_online

        # Emit startup events
        if self.camera.is_online:
            self.state.events.emit(CAMERA_CONNECTED, source="camera")

        # Test mode
        if config.TEST_MODE:
            VisionLogger.startup_warn("TEST MODE ENABLED — simulated events available")
            print()

        # System status summary
        print()
        print("-" * 50)
        VisionLogger.system("System status:")
        print(self.state.sensors.summary())
        print("-" * 50)
        print()

    def _get_thermal_frame(self):
        """Get thermal frame if available."""
        rgb = self.camera.get_frame()
        if rgb is not None:
            return self.thermal.process_frame(rgb)
        return None

    def _process_loop(self):
        """Main processing loop — runs in background thread."""
        VisionLogger.system("Processing loop started")

        while self._running:
            try:
                frame = self.camera.get_frame()
                if frame is None:
                    time.sleep(0.1)
                    # Update camera status
                    self.state.camera_online = self.camera.is_online
                    self.state.sensors.update("CAMERA", self.camera.is_online, "online" if self.camera.is_online else "offline")
                    continue

                self._frame_count += 1
                self.state.camera_online = True
                self.state.sensors.update("CAMERA", True, "online")

                # --- YOLO Person Detection ---
                if self._frame_count % config.YOLO_INTERVAL == 0 and self.yolo.is_online:
                    detections = self.yolo.detect(frame)

                    # Update victim tracker
                    current_ids = set()
                    for det in self.yolo.active_tracks:
                        t = det  # PersonTrack
                        pid = t.id
                        current_ids.add(pid)
                        face_visible = any(
                            f.confidence > 0.5 for f in self.face._faces
                        ) if self.face.is_online else False
                        gesture = None
                        if self.gesture.is_online and self.gesture.current_gestures:
                            gesture = self.gesture.current_gestures[0].gesture
                        thermal = len(self.thermal.get_hotspots()) > 0

                        self.state.victims.update_person(
                            pid,
                            confidence=t.detection.confidence,
                            face_visible=face_visible,
                            gesture=gesture,
                            thermal_signature=thermal,
                            rel_x=t.detection.rel_x,
                            rel_y=t.detection.rel_y,
                        )

                    # Emit events for new detections
                    for track in self.yolo.active_tracks:
                        if track.detection_count == 1:
                            self.state.events.emit(
                                PERSON_DETECTED,
                                source="yolo",
                                confidence=track.detection.confidence,
                                person_id=track.id,
                            )

                # --- Face Detection ---
                if self._frame_count % config.FACE_INTERVAL == 0 and self.face.is_online:
                    faces = self.face.detect(frame)
                    if faces:
                        # Don't emit event every frame — let alert engine cooldown handle it
                        pass

                # --- Gesture Detection ---
                if self._frame_count % config.GESTURE_INTERVAL == 0 and self.gesture.is_online:
                    gestures = self.gesture.detect(frame)
                    for g in gestures:
                        # Let alert engine cooldown deduplicate
                        pass

                # --- Thermal ---
                if self._frame_count % config.THERMAL_INTERVAL == 0 and self.thermal.is_online:
                    thermal_frame = self.thermal.process_frame(frame)
                    hotspots = self.thermal.get_hotspots()
                    for h in hotspots:
                        pass  # Events handled by alert cooldown

                # --- Fire/Smoke Detection ---
                if self._frame_count % config.YOLO_INTERVAL == 0 and self.fire_smoke.is_online:
                    fs_detections = self.fire_smoke.detect(frame)
                    for det in fs_detections:
                        if det.label == "fire":
                            self.state.events.emit(
                                FIRE_DETECTED,
                                source="fire_model",
                                confidence=det.confidence,
                                lat=self.gps.location.latitude,
                                lon=self.gps.location.longitude,
                            )
                            self.state.sensors.update("FIRE_MODEL", True, "online")
                        elif det.label == "smoke":
                            self.state.events.emit(
                                SMOKE_DETECTED,
                                source="fire_model",
                                confidence=det.confidence,
                                lat=self.gps.location.latitude,
                                lon=self.gps.location.longitude,
                            )

                # --- Hazard proximity check ---
                if self._frame_count % 30 == 0:
                    fire_hotspots = [
                        {"rel_x": 0.5, "rel_y": 0.5}
                        for _ in range(len(self.thermal.get_hotspots()) + len(
                            [d for d in (self.fire_smoke.detect(frame) if self.fire_smoke.is_online else [])
                             if d.label == "fire"]
                        ))
                    ]
                    self.state.update_victim_hazards(fire_hotspots)

                # Update sensor health
                self.state.sensors.update("YOLO", self.yolo.is_online, "online")
                self.state.sensors.update("FACE", self.face.is_online, "online")
                self.state.sensors.update("GESTURE", self.gesture.is_online, "online")
                self.state.sensors.update("THERMAL", self.thermal.is_online, self.thermal.status)
                self.state.sensors.update("GPS", self.gps.is_online, self.gps.status)

                time.sleep(1.0 / config.CAMERA_FPS)

            except Exception as e:
                VisionLogger.system("PROCESS_ERROR", str(e))
                time.sleep(0.5)

    def run(self):
        """Start everything and enter main loop."""
        self._running = True

        # Start processing thread
        self._processing_thread = threading.Thread(target=self._process_loop, daemon=True)
        self._processing_thread.start()

        # Start web server (blocking)
        from inzora_vision.web.server import WebServer
        server = WebServer(self.state)
        server.set_frame_providers(
            camera_fn=self.camera.get_frame,
            thermal_fn=self._get_thermal_frame,
        )
        server.set_camera_frame_submitter(self.camera.submit_frame)
        self.state.server_online = True
        self.state.sensors.register("SERVER", True, "online")

        print(f"LOCAL DASHBOARD:")
        print(f"http://{config.HOST}:{config.PORT}")
        print("=" * 50)
        print()

        try:
            server.start(host=config.HOST, port=config.PORT)
        except KeyboardInterrupt:
            print("\nShutting down...")
        finally:
            self.shutdown()

    def shutdown(self):
        """Clean shutdown of all components."""
        self._running = False
        self.camera.stop()
        VisionLogger.system("INZORA-X shut down")


def main():
    system = INZORAXSystem()
    system.startup()
    system.run()


if __name__ == "__main__":
    main()
