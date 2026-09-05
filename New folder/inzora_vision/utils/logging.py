"""
INZORA-X Structured Logger
Concise, timestamped log output for the vision system.
"""

import io
import os
import sys
import time
import threading
from typing import Optional

# Force UTF-8 stdout on Windows so Unicode symbols render correctly
if sys.platform == "win32":
    try:
        sys.stdout = io.TextIOWrapper(
            sys.stdout.buffer, encoding="utf-8", errors="replace"
        )
        sys.stderr = io.TextIOWrapper(
            sys.stderr.buffer, encoding="utf-8", errors="replace"
        )
    except Exception:
        pass


class VisionLogger:
    """Structured logger with concise one-line output."""

    _lock = threading.Lock()

    @staticmethod
    def _ts() -> str:
        return time.strftime("%H:%M:%S", time.localtime())

    @classmethod
    def _log(cls, category: str, message: str, detail: Optional[str] = None):
        ts = cls._ts()
        line = f"{ts} {category:<10} {message}"
        if detail:
            line += f"   {detail}"
        with cls._lock:
            print(line)

    # Convenience methods
    @classmethod
    def vision(cls, event: str, detail: Optional[str] = None):
        cls._log("VISION", event, detail)

    @classmethod
    def gesture(cls, event: str, detail: Optional[str] = None):
        cls._log("GESTURE", event, detail)

    @classmethod
    def hazard(cls, event: str, detail: Optional[str] = None):
        cls._log("HAZARD", event, detail)

    @classmethod
    def alert(cls, severity: str, detail: Optional[str] = None):
        cls._log("ALERT", severity, detail)

    @classmethod
    def sensor(cls, event: str, detail: Optional[str] = None):
        cls._log("SENSOR", event, detail)

    @classmethod
    def system(cls, event: str, detail: Optional[str] = None):
        cls._log("SYSTEM", event, detail)

    @classmethod
    def gps(cls, event: str, detail: Optional[str] = None):
        cls._log("GPS", event, detail)

    @classmethod
    def thermal(cls, event: str, detail: Optional[str] = None):
        cls._log("THERMAL", event, detail)

    @classmethod
    def camera(cls, event: str, detail: Optional[str] = None):
        cls._log("CAMERA", event, detail)

    @classmethod
    def face(cls, event: str, detail: Optional[str] = None):
        cls._log("FACE", event, detail)

    @classmethod
    def startup(cls, message: str):
        ts = cls._ts()
        with cls._lock:
            print(f"[✓] {ts} {message}")

    @classmethod
    def startup_warn(cls, message: str):
        ts = cls._ts()
        with cls._lock:
            print(f"[!] {ts} {message}")

    @classmethod
    def startup_fail(cls, message: str):
        ts = cls._ts()
        with cls._lock:
            print(f"[✗] {ts} {message}")

    @classmethod
    def banner(cls):
        print("=" * 50)
        print("        INZORA-X VISION SYSTEM")
        print("        DISASTER RESCUE PERCEPTION")
        print("=" * 50)
