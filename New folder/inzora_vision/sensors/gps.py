"""
INZORA-X GPS / Location Provider
Supports real GPS, device GPS, manual coordinates, and IP-based fallback.
IP location is NEVER presented as precise rescue-grade GPS.
"""

import threading
import time
from typing import Optional, Tuple

import requests

from inzora_vision.config.config import config
from inzora_vision.utils.logging import VisionLogger


class Location:
    """Location data with source attribution."""

    def __init__(
        self,
        lat: float = 0.0,
        lon: float = 0.0,
        source: str = "none",
        accuracy: str = "unknown",
    ):
        self.latitude = lat
        self.longitude = lon
        self.source = source
        self.accuracy = accuracy

    def to_dict(self) -> dict:
        return {
            "latitude": round(self.latitude, 6),
            "longitude": round(self.longitude, 6),
            "source": self.source,
            "accuracy": self.accuracy,
        }


class GPSProvider:
    """Location provider with multiple fallback strategies."""

    def __init__(self):
        self._location = Location(source="none", accuracy="unknown")
        self._online = False
        self._lock = threading.Lock()

    @property
    def is_online(self) -> bool:
        return self._online

    @property
    def location(self) -> Location:
        with self._lock:
            return self._location

    @property
    def status(self) -> str:
        if not self._online:
            return "offline"
        return self._location.source

    def initialize(self) -> bool:
        """Initialize GPS based on configured mode."""
        mode = config.GPS_MODE

        if mode == "manual" and config.GPS_MANUAL_LAT != 0 and config.GPS_MANUAL_LON != 0:
            with self._lock:
                self._location = Location(
                    lat=config.GPS_MANUAL_LAT,
                    lon=config.GPS_MANUAL_LON,
                    source="manual_config",
                    accuracy="configured",
                )
            self._online = True
            VisionLogger.gps("MANUAL", f"{config.GPS_MANUAL_LAT}, {config.GPS_MANUAL_LON}")
            return True

        if mode == "real" or mode == "device":
            if self._try_real_gps():
                return True

        # IP fallback
        if self._try_ip_location():
            return True

        # Default coordinates (0, 0) with low accuracy
        with self._lock:
            self._location = Location(source="default", accuracy="unknown")
        self._online = True
        VisionLogger.startup_warn("GPS: Using default coordinates (0, 0)")
        return True

    def _try_real_gps(self) -> bool:
        """Attempt to read from a real GPS device.
        
        Placeholder for serial GPS, USB GPS, or other hardware.
        """
        # Future: Check /dev/ttyUSB0 or similar for NMEA GPS
        return False

    def _try_ip_location(self) -> bool:
        """Use IP geolocation as low-accuracy fallback."""
        try:
            resp = requests.get("https://ipinfo.io/json", timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                loc = data.get("loc", "")
                if loc and "," in loc:
                    lat_str, lon_str = loc.split(",")
                    lat, lon = float(lat_str.strip()), float(lon_str.strip())
                    with self._lock:
                        self._location = Location(
                            lat=lat,
                            lon=lon,
                            source="ip_fallback",
                            accuracy="low",
                        )
                    self._online = True
                    VisionLogger.gps("IP FALLBACK", f"{lat}, {lon} (low accuracy)")
                    return True
        except Exception as e:
            VisionLogger.gps("IP_FALLBACK_FAILED", str(e))
        return False

    def get_location(self) -> Location:
        with self._lock:
            return self._location
