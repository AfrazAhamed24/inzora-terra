"""
INZORA-X Thermal Abstraction
Provides thermal imaging via a real sensor or simulation from RGB.
Never claims simulation is genuine thermal data.
"""

import time
from typing import Optional, Tuple

import cv2
import numpy as np

from inzora_vision.config.config import config
from inzora_vision.utils.logging import VisionLogger


class ThermalSensor:
    """Thermal sensor abstraction — simulation or real hardware."""

    def __init__(self):
        self._online = False
        self._simulation = True
        self._thermal_frame: Optional[np.ndarray] = None
        self._hotspots: list = []
        self._last_update = 0.0

    @property
    def is_online(self) -> bool:
        return self._online

    @property
    def is_simulation(self) -> bool:
        return self._simulation

    @property
    def status(self) -> str:
        if not self._online:
            return "offline"
        return "simulation" if self._simulation else "online"

    def initialize(self) -> bool:
        """Try real thermal first, fall back to simulation."""
        # Try real thermal sensor (placeholder for future hardware)
        if self._try_real_thermal():
            self._online = True
            self._simulation = False
            VisionLogger.thermal("REAL THERMAL CONNECTED")
            return True

        # Fall back to simulation if enabled
        if config.ENABLE_THERMAL_SIMULATION:
            self._online = True
            self._simulation = True
            VisionLogger.startup_warn("Thermal sensor: SIMULATION")
            return True

        self._online = False
        VisionLogger.startup_warn("Thermal sensor: NOT AVAILABLE")
        return False

    def _try_real_thermal(self) -> bool:
        """Attempt to connect to real thermal hardware.
        
        This is a placeholder for real thermal camera integration.
        Common interfaces: FLIR Lepton, Seek Thermal, etc.
        """
        # Future: Check for FLIR, Seek Thermal, etc.
        # For now, no real thermal hardware is assumed.
        return False

    def process_frame(self, rgb_frame: np.ndarray) -> Optional[np.ndarray]:
        """Generate thermal visualization from RGB frame.
        
        Returns a pseudo-thermal heatmap for testing/simulation.
        For real thermal hardware, this would return actual thermal data.
        """
        if not self._online:
            return None

        if self._simulation:
            return self._simulate_thermal(rgb_frame)
        else:
            return self._read_real_thermal()

    def _simulate_thermal(self, rgb_frame: np.ndarray) -> np.ndarray:
        """Create a pseudo-thermal image from RGB. Clearly labeled as simulation."""
        gray = cv2.cvtColor(rgb_frame, cv2.COLOR_BGR2GRAY)
        # Invert so bright = hot, apply colormap
        inv = 255 - gray
        blurred = cv2.GaussianBlur(inv, (15, 15), 0)
        thermal = cv2.applyColorMap(blurred, cv2.COLORMAP_JET)

        # Add "SIMULATION" watermark
        h, w = thermal.shape[:2]
        cv2.putText(
            thermal,
            "SIMULATION",
            (w // 2 - 80, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (255, 255, 255),
            2,
        )

        # Detect simulated hotspots (brightest regions)
        self._detect_hotspots(blurred)

        return thermal

    def _read_real_thermal(self) -> Optional[np.ndarray]:
        """Read from real thermal hardware. Placeholder."""
        # Future implementation with real thermal sensor
        return None

    def _detect_hotspots(self, intensity: np.ndarray):
        """Find hotspots (brightest regions) in thermal data."""
        self._hotspots = []
        h, w = intensity.shape

        # Simple threshold-based hotspot detection
        _, thresh = cv2.threshold(intensity, 200, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area > 500:  # Minimum area
                M = cv2.moments(cnt)
                if M["m00"] > 0:
                    cx = int(M["m10"] / M["m00"])
                    cy = int(M["m01"] / M["m00"])
                    self._hotspots.append({
                        "x": round(cx / w, 3),
                        "y": round(cy / h, 3),
                        "area": int(area),
                        "temperature": "simulated",
                    })

    def get_hotspots(self) -> list:
        return self._hotspots
