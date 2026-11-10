# INZORA-X Vision System

**Standalone disaster-rescue computer-vision and sensor dashboard.**

A self-contained multimodal perception layer for disaster-rescue operations — camera, AI detection, sensors, alerts, and an interactive command-center dashboard.

> **This is a standalone testing system.** It is designed to independently verify that camera, AI perception, sensor handling, dashboard, alerts, and remote access work correctly before they are later integrated into DEXTER.

---

## Architecture

```
RGB Webcam → Vision Engine → Event/State Engine → Rescue Dashboard
              ├─ YOLO Person Detection
              ├─ Fire Detection (custom model)
              ├─ Smoke Detection (custom model)
              ├─ Face Detection (MediaPipe)
              ├─ Gesture Detection (MediaPipe Hands)
              └─ Thermal Input (real or simulation)
```

---

## Requirements

- **Python 3.9+**
- **Webcam** (USB or built-in) — required for live camera
- **~500 MB disk** for models and dependencies
- Camera indexes `0`, `1`, `2` are common

---

## Installation

### 1. Clone / Copy

```bash
cd inzora_vision
```

### 2. Create Virtual Environment

```bash
python -m venv venv

# Linux / macOS
source venv/bin/activate

# Windows
venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

Key packages installed:
| Package | Purpose |
|---------|---------|
| `opencv-python` | Camera capture and image processing |
| `ultralytics` | YOLO object detection |
| `mediapipe` | Face and hand gesture detection |
| `flask` + `flask-socketio` | Web dashboard and real-time updates |
| `python-dotenv` | Configuration via `.env` |
| `pyngrok` | Optional remote access via ngrok |
| `requests` | IP-based location fallback |
| `numpy` | Numerical operations |
| `Pillow` | Image format handling |
| `eventlet` | Async WebSocket support |

### 4. Configure

```bash
cp .env.example .env
# Edit .env as needed
```

### 5. Run

```bash
python main.py
```

Then open: **http://127.0.0.1:8000**

---

## Configuration (`.env`)

```bash
# Camera
CAMERA_INDEX=0
CAMERA_WIDTH=1280
CAMERA_HEIGHT=720

# Models
YOLO_MODEL_PATH=models/yolov8n.pt
FIRE_SMOKE_MODEL_PATH=models/fire_smoke.pt

# Thermal
ENABLE_THERMAL_SIMULATION=true

# GPS
GPS_MODE=ip          # real | device | manual | ip
GPS_MANUAL_LAT=0     # Used when GPS_MODE=manual
GPS_MANUAL_LON=0

# AI Intervals (frames between model runs — higher = less CPU)
YOLO_INTERVAL=3
FACE_INTERVAL=5
GESTURE_INTERVAL=5
THERMAL_INTERVAL=10

# Server
HOST=0.0.0.0
PORT=8000

# Remote access (optional)
ENABLE_NGROK=false
NGROK_AUTH_TOKEN=

# Test mode
TEST_MODE=false
```

---

## Model Setup

### YOLO (Person Detection)

The system uses `yolov8n.pt` for person detection. Ultralytics will **download it automatically** on first run if not present.

To download manually:

```bash
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"
```

### Fire/Smoke Detection (Optional)

A separate custom-trained model (`models/fire_smoke.pt`) is required for fire and smoke detection. This is **not** bundled — the system clearly shows "NOT CONFIGURED" when absent.

If you have a verified fire/smoke detection model trained with YOLOv8, place it at:

```
models/fire_smoke.pt
```

**Never use an unverified model and claim it detects fire.**

---

## Camera Configuration

| Index | Typical Use |
|-------|-------------|
| `0` | Built-in laptop webcam |
| `1` | External USB webcam |
| `2+` | Additional cameras |

If the selected camera cannot be opened, the dashboard shows:

```
CAMERA ● OFFLINE
```

All other systems (YOLO, face, gesture, etc.) continue to operate independently.

---

## Dashboard Features

### Live Camera View

Selectable overlay modes:
- **RAW** — unprocessed camera feed
- **AI DETECT** — YOLO bounding boxes and person labels
- **FACE** — face detection boxes
- **GESTURE** — detected hand gesture overlay
- **THERMAL** — pseudo-thermal heatmap (simulation)
- **ALL VIEWS** — grid showing all modes simultaneously

### Map

Interactive Leaflet map showing:
- 📷 Camera location
- 👤 Detected persons
- 🆘 High-risk persons (near hazards)
- 🔥 Fire markers
- 💨 Smoke markers
- 🌡️ Thermal hotspots

### Victims Panel

Each tracked person shows:
- ID (e.g., `PERSON-001`)
- Priority (P1/P2/P3)
- State (OBSERVED/POSSIBLE_SURVIVOR/HIGH_RISK)
- Confidence percentage
- Face visible indicator
- Gesture indicator

### Alerts

Real-time alerts with severity levels:
- 🔴 **CRITICAL** — fire detected, hazards near persons
- 🟠 **HIGH** — smoke, camera disconnect
- 🟡 **MEDIUM** — new person detected, gestures
- 🔵 **INFO** — system events

Alerts include cooldown/debouncing to prevent spam.

### System Health Bar

Shows online/offline/degraded status for every sensor and model.

---

## Testing Gestures

Hold your hand in front of the webcam:

1. **Open Palm** (all five fingers extended) → detected as `OPEN PALM`
2. **Thumbs Up** (thumb up, other fingers closed) → detected as `THUMBS UP`

The dashboard shows the current gesture and an interpretation (e.g., "POSSIBLE SAFE SIGNAL").

> Gestures are **observations only** — the system does not automatically classify anyone as safe or confirmed survivor.

---

## Testing Person Detection

Simply stand or sit in view of the webcam. The system assigns temporary IDs like `PERSON-001`, `PERSON-002`, etc. and tracks them as long as they remain visible.

---

## Testing Thermal Simulation

When `ENABLE_THERMAL_SIMULATION=true` (default), the system generates a pseudo-thermal heatmap from the RGB camera image. The dashboard clearly labels this as:

```
THERMAL ● SIMULATION
```

This is for testing the pipeline only — never treat it as real thermal data.

---

## Configuring GPS

| `GPS_MODE` | Behavior |
|-------------|----------|
| `ip` | IP geolocation via ipinfo.io (low accuracy) |
| `manual` | Uses `GPS_MANUAL_LAT` and `GPS_MANUAL_LON` |
| `real` | Placeholder for real GPS hardware |
| `device` | Placeholder for device GPS |

The dashboard shows the GPS source and accuracy:

```
LOCATION: 12.XXXX, 78.XXXX
SOURCE: IP FALLBACK
ACCURACY: LOW
```

IP-based location is **never** presented as precise rescue-grade GPS.

---

## Enabling ngrok (Remote Access)

1. Set `ENABLE_NGROK=true` in `.env`
2. Set `NGROK_AUTH_TOKEN=your_token_here` in `.env`
3. Restart the system
4. The public URL will appear in the console and dashboard

---

## Troubleshooting Camera

| Problem | Solution |
|---------|----------|
| Camera shows OFFLINE | Try `CAMERA_INDEX=1` or `2` |
| Permission denied (Linux) | Add user to `video` group: `sudo usermod -aG video $USER` |
| Poor frame rate | Reduce `CAMERA_WIDTH` and `CAMERA_HEIGHT` |
| Camera works but is slow | Increase `YOLO_INTERVAL` and `FACE_INTERVAL` |

---

## Hardware for Real Thermal

The thermal abstraction layer supports integration with:
- **FLIR Lepton** (via PureThermal or SPI)
- **Seek Thermal** cameras
- **InfiRay** thermal sensors

Connecting real thermal hardware requires updating `vision/thermal.py` to read from the device interface. The rest of the system will automatically use real thermal data.

---

## Test Mode

Set `TEST_MODE=true` in `.env` to enable test controls in the dashboard.

The test panel allows triggering:
- 🔥 Fake fire event
- 💨 Fake smoke event
- 👤 Fake person detection
- 🤚 Fake gesture
- 🌡️ Fake thermal hotspot

All simulated events are clearly labeled `[SIMULATION]` in both the console and dashboard.

---

## Limitations

| Capability | Limitation |
|------------|-----------|
| RGB camera | Not a thermal camera |
| IP location | Not precise GPS (~city level) |
| Face detection | Detection only — no identity recognition |
| Person detection | Observation — not confirmed survivor status |
| Gesture recognition | Observation only — not certain medical status |
| Fire/smoke model | Not included — requires custom training |
| YOLO output | Not ground truth — confidence scores vary |
| Thermal simulation | Pseudo-heatmap — not real temperature data |

---

## Project Structure

```
inzora_vision/
├── main.py                  # Entry point
├── requirements.txt         # Dependencies
├── .env.example             # Configuration template
├── models/                  # Model weights
│   ├── yolov8n.pt           # YOLO (auto-downloaded)
│   └── fire_smoke.pt        # Custom (optional, not bundled)
├── config/
│   └── config.py            # Central configuration
├── vision/
│   ├── camera.py            # Webcam capture
│   ├── yolo_detector.py     # YOLO person detection
│   ├── face_detector.py     # MediaPipe face detection
│   ├── gesture_detector.py  # MediaPipe hand gestures
│   ├── thermal.py           # Thermal abstraction
│   └── fire_smoke_detector.py  # Fire/smoke model
├── sensors/
│   ├── gps.py               # GPS / location provider
│   └── sensor_manager.py    # Sensor health management
├── core/
│   ├── events.py            # Event system
│   ├── victim_tracker.py    # Person/victim tracking
│   ├── alert_engine.py      # Alert generation
│   └── state_manager.py     # Central state
├── web/
│   ├── server.py            # Flask + SocketIO server
│   ├── templates/
│   │   └── dashboard.html   # Dashboard UI
│   └── static/
│       ├── css/dashboard.css
│       └── js/dashboard.js
└── utils/
    └── logging.py           # Structured logger
```

---

## Integration with DEXTER

This standalone system is designed to later become the **DEXTER Perception Layer**. After full testing and validation, the vision, sensor, and event modules will be connected to the DEXTER mission orchestration system.

During this phase, **no integration with DEXTER occurs.**

---

## License

Internal research prototype. Not for production use.
