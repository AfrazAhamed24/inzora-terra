"""
INZORA-X Configuration
Loads settings from environment variables with sensible defaults.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from the inzora_vision directory
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_PATH)


class Config:
    """Central configuration for INZORA-X."""

    # --- Camera ---
    CAMERA_INDEX: int = int(os.getenv("CAMERA_INDEX", "0"))
    CAMERA_WIDTH: int = int(os.getenv("CAMERA_WIDTH", "1280"))
    CAMERA_HEIGHT: int = int(os.getenv("CAMERA_HEIGHT", "720"))
    CAMERA_FPS: int = int(os.getenv("CAMERA_FPS", "30"))

    # --- Models ---
    YOLO_MODEL_PATH: str = os.getenv("YOLO_MODEL_PATH", "models/yolov8n.pt")
    FIRE_SMOKE_MODEL_PATH: str = os.getenv("FIRE_SMOKE_MODEL_PATH", "models/fire_smoke.pt")

    # --- Thermal ---
    ENABLE_THERMAL_SIMULATION: bool = os.getenv("ENABLE_THERMAL_SIMULATION", "true").lower() == "true"

    # --- GPS ---
    GPS_MODE: str = os.getenv("GPS_MODE", "ip")  # real | device | manual | ip
    GPS_MANUAL_LAT: float = float(os.getenv("GPS_MANUAL_LAT", "0"))
    GPS_MANUAL_LON: float = float(os.getenv("GPS_MANUAL_LON", "0"))

    # --- Intervals (frames between model runs) ---
    YOLO_INTERVAL: int = int(os.getenv("YOLO_INTERVAL", "3"))
    FACE_INTERVAL: int = int(os.getenv("FACE_INTERVAL", "5"))
    GESTURE_INTERVAL: int = int(os.getenv("GESTURE_INTERVAL", "5"))
    THERMAL_INTERVAL: int = int(os.getenv("THERMAL_INTERVAL", "10"))

    # --- Web server ---
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # --- ngrok ---
    ENABLE_NGROK: bool = os.getenv("ENABLE_NGROK", "false").lower() == "true"
    NGROK_AUTH_TOKEN: str = os.getenv("NGROK_AUTH_TOKEN", "")

    # --- Test / simulation mode ---
    TEST_MODE: bool = os.getenv("TEST_MODE", "false").lower() == "true"

    # --- Paths ---
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    MODELS_DIR: Path = BASE_DIR / "models"
    TEMPLATES_DIR: Path = BASE_DIR / "web" / "templates"
    STATIC_DIR: Path = BASE_DIR / "web" / "static"


config = Config()
