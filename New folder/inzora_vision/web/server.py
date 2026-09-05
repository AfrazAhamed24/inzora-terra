"""
INZORA-X Flask + SocketIO Web Server
Serves the dashboard, provides REST API, and streams real-time updates via WebSocket.
"""

import base64
import os
import time
import threading
from typing import Optional

import cv2
import numpy as np
from flask import Flask, render_template, jsonify, Response, request
from flask_socketio import SocketIO

from inzora_vision.config.config import config
from inzora_vision.utils.logging import VisionLogger


class WebServer:
    """Flask web server with SocketIO for real-time updates."""

    def __init__(self, state_manager):
        self._state = state_manager
        self._app = Flask(
            __name__,
            template_folder=str(config.TEMPLATES_DIR),
            static_folder=str(config.STATIC_DIR),
        )
        self._app.config["SECRET_KEY"] = "inzora-x-vision"
        self._socketio = SocketIO(
            self._app,
            cors_allowed_origins="*",
            async_mode="threading",
            logger=False,
            engineio_logger=False,
        )
        self._camera_frame_provider = None
        self._camera_frame_submitter = None
        self._thermal_frame_provider = None
        self._running = False
        self._broadcast_thread: Optional[threading.Thread] = None

        self._setup_routes()
        self._setup_socket_events()

    def set_frame_providers(self, camera_fn, thermal_fn):
        """Set functions that return the latest frame (as numpy array)."""
        self._camera_frame_provider = camera_fn
        self._thermal_frame_provider = thermal_fn
        self._detection_overlay_provider = None

    def set_camera_frame_submitter(self, fn):
        """Set the callback used for frames captured by a browser webcam."""
        self._camera_frame_submitter = fn

    def set_detection_overlay_provider(self, fn):
        self._detection_overlay_provider = fn

    def _setup_routes(self):
        @self._app.route("/")
        def dashboard():
            return render_template("dashboard.html")

        # ── Camera MJPEG Stream ──
        @self._app.route("/api/camera/stream")
        def api_camera_stream():
            def generate():
                while True:
                    if self._camera_frame_provider is None:
                        time.sleep(0.5)
                        continue
                    frame = self._camera_frame_provider()
                    if frame is None:
                        time.sleep(0.2)
                        continue
                    _, jpeg = cv2.imencode(
                        ".jpeg", frame,
                        [cv2.IMWRITE_JPEG_QUALITY, 60],
                    )
                    if not _:
                        continue
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n\r\n"
                        + jpeg.tobytes()
                        + b"\r\n"
                    )
                    time.sleep(1.0 / 20)  # ~20 fps stream

            return Response(
                generate(),
                mimetype="multipart/x-mixed-replace; boundary=frame",
            )

        @self._app.route("/api/camera/frame", methods=["POST"])
        def api_camera_frame():
            """Receive a webcam frame captured in the user's browser."""
            if self._camera_frame_provider is None:
                return jsonify({"error": "Camera provider unavailable"}), 503
            payload = request.get_data()
            if not payload:
                return jsonify({"error": "Empty frame"}), 400
            frame = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
            if frame is None:
                return jsonify({"error": "Invalid JPEG frame"}), 400
            if self._camera_frame_submitter is None:
                return jsonify({"error": "Browser camera is not enabled"}), 503
            self._camera_frame_submitter(frame)
            return jsonify({"ok": True})

        # ── Thermal frame (JPEG) ──
        @self._app.route("/api/thermal/stream")
        def api_thermal_stream():
            def generate():
                while True:
                    if self._thermal_frame_provider is None:
                        time.sleep(0.5)
                        continue
                    frame = self._thermal_frame_provider()
                    if frame is None:
                        time.sleep(0.3)
                        continue
                    _, jpeg = cv2.imencode(
                        ".jpeg", frame,
                        [cv2.IMWRITE_JPEG_QUALITY, 50],
                    )
                    if not _:
                        continue
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n\r\n"
                        + jpeg.tobytes()
                        + b"\r\n"
                    )
                    time.sleep(1.0 / 10)

            return Response(
                generate(),
                mimetype="multipart/x-mixed-replace; boundary=frame",
            )

        @self._app.route("/api/state")
        def api_state():
            return jsonify(self._state.get_full_state())

        @self._app.route("/api/victims")
        def api_victims():
            return jsonify(self._state.victims.get_victims_list())

        @self._app.route("/api/alerts")
        def api_alerts():
            return jsonify(self._state.alerts.get_alerts(50))

        @self._app.route("/api/events")
        def api_events():
            return jsonify(self._state.events.history(50))

        @self._app.route("/api/sensors")
        def api_sensors():
            return jsonify(self._state.sensors.get_all())

        @self._app.route("/api/vision/mode", methods=["POST"])
        def api_set_vision_mode():
            data = request.get_json() or {}
            mode = data.get("mode", "ai_detection")
            self._state.vision_mode = mode
            return jsonify({"mode": mode})

        # --- Test mode endpoints ---
        @self._app.route("/api/test/fire", methods=["POST"])
        def api_test_fire():
            if not config.TEST_MODE:
                return jsonify({"error": "Test mode not enabled"}), 403
            from inzora_vision.core.events import FIRE_DETECTED
            self._state.events.emit(
                FIRE_DETECTED, source="test_mode", confidence=0.94,
                lat=self._state.gps.location.latitude,
                lon=self._state.gps.location.longitude,
                simulated=True, title="Test fire event",
            )
            return jsonify({"ok": True})

        @self._app.route("/api/test/smoke", methods=["POST"])
        def api_test_smoke():
            if not config.TEST_MODE:
                return jsonify({"error": "Test mode not enabled"}), 403
            from inzora_vision.core.events import SMOKE_DETECTED
            self._state.events.emit(
                SMOKE_DETECTED, source="test_mode", confidence=0.89,
                lat=self._state.gps.location.latitude,
                lon=self._state.gps.location.longitude,
                simulated=True, title="Test smoke event",
            )
            return jsonify({"ok": True})

        @self._app.route("/api/test/person", methods=["POST"])
        def api_test_person():
            if not config.TEST_MODE:
                return jsonify({"error": "Test mode not enabled"}), 403
            self._state.victims.update_person(
                "TEST-PERSON-001", confidence=0.88,
                face_visible=True, gesture="thumbs_up",
            )
            from inzora_vision.core.events import PERSON_DETECTED
            self._state.events.emit(
                PERSON_DETECTED, source="test_mode", confidence=0.88,
                lat=self._state.gps.location.latitude,
                lon=self._state.gps.location.longitude,
                simulated=True, person_id="TEST-PERSON-001",
                title="Test person detection",
            )
            return jsonify({"ok": True})

        @self._app.route("/api/test/gesture", methods=["POST"])
        def api_test_gesture():
            if not config.TEST_MODE:
                return jsonify({"error": "Test mode not enabled"}), 403
            self._state.victims.update_person(
                "TEST-PERSON-001", gesture="thumbs_up",
            )
            from inzora_vision.core.events import GESTURE_DETECTED
            self._state.events.emit(
                GESTURE_DETECTED, source="test_mode", confidence=0.9,
                lat=self._state.gps.location.latitude,
                lon=self._state.gps.location.longitude,
                simulated=True, gesture="thumbs_up",
                title="Test gesture",
            )
            return jsonify({"ok": True})

        @self._app.route("/api/test/hotspot", methods=["POST"])
        def api_test_hotspot():
            if not config.TEST_MODE:
                return jsonify({"error": "Test mode not enabled"}), 403
            from inzora_vision.core.events import THERMAL_SIGNATURE_DETECTED
            self._state.events.emit(
                THERMAL_SIGNATURE_DETECTED, source="test_mode", confidence=0.91,
                lat=self._state.gps.location.latitude,
                lon=self._state.gps.location.longitude,
                simulated=True, rel_x=0.5, rel_y=0.5,
                title="Test thermal hotspot",
            )
            return jsonify({"ok": True})

    def _setup_socket_events(self):
        @self._socketio.on("connect")
        def handle_connect():
            VisionLogger.system("Client connected to dashboard")

        @self._socketio.on("disconnect")
        def handle_disconnect():
            VisionLogger.system("Client disconnected")

    def broadcast_state(self):
        """Emit current state to all connected clients."""
        try:
            state = self._state.to_dict()
            self._socketio.emit("state_update", state)
        except Exception:
            pass

    def _broadcast_loop(self):
        """Background loop that broadcasts state every second."""
        while self._running:
            self.broadcast_state()
            time.sleep(1.0)

    def start(self, host: str = "0.0.0.0", port: int = 8000):
        """Start the web server."""
        self._running = True
        self._broadcast_thread = threading.Thread(target=self._broadcast_loop, daemon=True)
        self._broadcast_thread.start()

        VisionLogger.startup("Web server started")

        # Use eventlet if available for better concurrency
        try:
            self._socketio.run(
                self._app,
                host=host,
                port=port,
                debug=False,
                use_reloader=False,
                log_output=False,
                allow_unsafe_werkzeug=True,
            )
        except TypeError:
            # Fallback for older flask-socketio
            self._socketio.run(
                self._app,
                host=host,
                port=port,
                debug=False,
                use_reloader=False,
                log_output=False,
            )

    def stop(self):
        self._running = False
