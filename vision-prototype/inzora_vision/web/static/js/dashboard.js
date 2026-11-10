/**
 * INZORA-X Vision Command Center — Dashboard JavaScript
 * Handles WebSocket updates, camera display, Leaflet map, and UI rendering.
 */

(function () {
    "use strict";

    // ── State ──
    let currentState = {};
    let map = null;
    let markers = {};
    let cameraMode = "raw";
    let videoImg = null;
    let webcamVideo = null;
    let webcamCanvas = null;
    let webcamContext = null;
    let webcamUploadBusy = false;
    let pollingId = null;

    // ── Init ──
    document.addEventListener("DOMContentLoaded", init);

    function init() {
        initClock();
        initMap();
        initCameraStream();
        initModeButtons();
        connectSocket();
        pollState(); // Fallback polling for camera + state
    }

    // ── Clock ──
    function initClock() {
        function tick() {
            const now = new Date();
            document.getElementById("clock").textContent =
                now.toLocaleTimeString("en-GB");
        }
        tick();
        setInterval(tick, 1000);
    }

    // ── WebSocket ──
    function connectSocket() {
        try {
            const socket = io({ transports: ["websocket", "polling"] });
            socket.on("connect", function () {
                console.log("[INZORA-X] Socket connected");
            });
            socket.on("state_update", function (data) {
                currentState = data;
                renderState(data);
            });
            socket.on("disconnect", function () {
                console.log("[INZORA-X] Socket disconnected");
            });
        } catch (e) {
            console.warn("[INZORA-X] Socket failed, using polling fallback", e);
        }
    }

    // ── Polling fallback (also gets camera frames) ──
    function pollState() {
        function poll() {
            fetch("/api/state")
                .then((r) => r.json())
                .then((data) => {
                    currentState = data;
                    renderState(data);
                })
                .catch(() => {});
        }
        poll();
        setInterval(poll, 1500);
    }

    // ── Camera streaming via <img> fed to canvas ──
    function initCameraStream() {
        webcamVideo = document.createElement("video");
        webcamVideo.autoplay = true;
        webcamVideo.playsInline = true;
        webcamCanvas = document.createElement("canvas");
        webcamContext = webcamCanvas.getContext("2d");

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ video: true, audio: false })
                .then(function (stream) {
                    webcamVideo.srcObject = stream;
                    webcamVideo.onloadedmetadata = function () {
                        webcamCanvas.width = webcamVideo.videoWidth || 1280;
                        webcamCanvas.height = webcamVideo.videoHeight || 720;
                        drawWebcamFrame();
                    };
                })
                .catch(function (error) {
                    console.warn("[INZORA-X] Browser webcam unavailable", error);
                    initServerCameraStream();
                });
            return;
        }
        initServerCameraStream();
    }

    function initServerCameraStream() {
        videoImg = new Image();
        videoImg.crossOrigin = "anonymous";
        // Stream MJPEG from the server
        videoImg.src = "/api/camera/stream?" + Date.now();
        videoImg.onload = drawVideoFrame;
        videoImg.onerror = function () {
            // Retry after a delay
            setTimeout(initCameraStream, 2000);
        };
    }

    function drawWebcamFrame() {
        if (!webcamVideo || webcamVideo.readyState < 2) return;
        webcamContext.drawImage(webcamVideo, 0, 0, webcamCanvas.width, webcamCanvas.height);
        drawFrameToCanvases(webcamCanvas);
        if (!webcamUploadBusy) {
            webcamUploadBusy = true;
            webcamCanvas.toBlob(function (blob) {
                fetch("/api/camera/frame", {
                    method: "POST",
                    headers: { "Content-Type": "image/jpeg" },
                    body: blob,
                }).catch(function () {}).finally(function () {
                    webcamUploadBusy = false;
                });
            }, "image/jpeg", 0.75);
        }
        requestAnimationFrame(drawWebcamFrame);
    }

    function drawVideoFrame() {
        if (!videoImg || !videoImg.complete) return;
        drawFrameToCanvases(videoImg);
        requestAnimationFrame(drawVideoFrame);
    }

    function drawFrameToCanvases(source) {
        const canvases = getActiveCanvases();
        canvases.forEach((c) => {
            if (!c) return;
            const ctx = c.getContext("2d");
            if (!ctx) return;
            // Scale to fit
            const ratio = Math.min(
                c.width / (source.videoWidth || source.naturalWidth || 640),
                c.height / (source.videoHeight || source.naturalHeight || 480)
            );
            const w = (source.videoWidth || source.naturalWidth || 640) * ratio;
            const h = (source.videoHeight || source.naturalHeight || 480) * ratio;
            const x = (c.width - w) / 2;
            const y = (c.height - h) / 2;
            ctx.clearRect(0, 0, c.width, c.height);
            ctx.drawImage(source, x, y, w, h);
        });
    }

    function getActiveCanvases() {
        if (cameraMode === "all_views") {
            return [
                document.getElementById("grid-raw"),
                document.getElementById("grid-ai"),
                document.getElementById("grid-face"),
                document.getElementById("grid-gesture"),
                document.getElementById("grid-thermal"),
            ];
        }
        return [document.getElementById("cam-canvas")];
    }

    // ── Vision Mode Buttons ──
    function initModeButtons() {
        document.querySelectorAll(".mode-btn").forEach((btn) => {
            btn.addEventListener("click", function () {
                document
                    .querySelectorAll(".mode-btn")
                    .forEach((b) => b.classList.remove("active"));
                this.classList.add("active");
                cameraMode = this.dataset.mode;

                const mainView = document.getElementById("camera-main");
                const gridView = document.getElementById("grid-views");
                if (cameraMode === "all_views") {
                    mainView.style.display = "none";
                    gridView.style.display = "grid";
                } else {
                    mainView.style.display = "block";
                    gridView.style.display = "none";
                }

                // Tell server the mode
                fetch("/api/vision/mode", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mode: cameraMode }),
                }).catch(() => {});
            });
        });
    }

    // ── Leaflet Map ──
    function initMap() {
        map = L.map("map", {
            zoomControl: true,
            attributionControl: false,
        }).setView([0, 0], 2);

        L.tileLayer(
            "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
            { maxZoom: 19 }
        ).addTo(map);

        // Camera marker (will update position)
        markers.camera = L.marker([0, 0], {
            icon: L.divIcon({
                className: "",
                html: '<div style="font-size:20px">📷</div>',
                iconSize: [24, 24],
                iconAnchor: [12, 12],
            }),
        }).addTo(map);

        setTimeout(() => map.invalidateSize(), 100);
    }

    // ── Render full state ──
    function renderState(state) {
        renderSystemStatus(state.system || {});
        renderVictims(state.people || []);
        renderAlerts(state.alerts || []);
        renderSensorHealth(state.sensors || {});
        renderStats(state);
        renderMap(state);
        renderCameraOnline(state.camera_online);
        renderGesture(state);

        // Test mode badge
        const testBadge = document.getElementById("test-mode-badge");
        if (state.system && state.system.test_mode) {
            testBadge.style.display = "inline-block";
            document.getElementById("test-controls").style.display = "block";
        }
    }

    function renderSystemStatus(sys) {
        const badge = document.getElementById("sys-status");
        const allOk =
            sys.camera === "online" || sys.yolo === "online" || sys.face === "online";
        if (allOk) {
            badge.textContent = "● SYSTEM OK";
            badge.className = "status-badge status-ok";
        } else if (sys.camera === "offline" && sys.yolo === "offline") {
            badge.textContent = "● ALL OFFLINE";
            badge.className = "status-badge status-error";
        } else {
            badge.textContent = "● DEGRADED";
            badge.className = "status-badge status-warn";
        }
    }

    function renderCameraOnline(online) {
        const offlineDiv = document.getElementById("camera-offline");
        if (offlineDiv) {
            offlineDiv.style.display = online ? "none" : "flex";
        }
    }

    function renderVictims(people) {
        const container = document.getElementById("victims-list");
        const countEl = document.getElementById("person-count");

        const active = people.filter((p) => p.active !== false);
        countEl.textContent = String(active.length).padStart(2, "0");

        if (active.length === 0) {
            container.innerHTML = '<div class="empty-state">No persons detected</div>';
            return;
        }

        let html = "";
        active.forEach((p) => {
            const priClass = "priority-" + (p.priority || "UNK");
            const stateText = p.state || "UNKNOWN";
            const faceIcon = p.face_visible ? "👁️" : "";
            const gestureIcon = p.gesture
                ? p.gesture === "thumbs_up"
                    ? "👍"
                    : "🖐️"
                : "";
            const hazardIcon = p.nearby_hazard ? "⚠️" : "";
            html += `
                <div class="victim-item">
                    <span class="victim-id">${p.id}</span>
                    <div class="victim-meta">
                        <span class="priority-badge ${priClass}">${p.priority || "UNK"}</span>
                        <span class="state-badge">${stateText}</span>
                        <span>${faceIcon} ${gestureIcon} ${hazardIcon}</span>
                        <span>${(p.confidence * 100).toFixed(0)}%</span>
                    </div>
                </div>`;
        });
        container.innerHTML = html;
    }

    function renderAlerts(alerts) {
        const container = document.getElementById("alerts-list");
        const countEl = document.getElementById("alert-count");
        countEl.textContent = alerts.length;

        if (alerts.length === 0) {
            container.innerHTML = '<div class="empty-state">No alerts</div>';
            return;
        }

        // Reverse so newest first
        const recent = alerts.slice().reverse().slice(0, 30);
        let html = "";
        recent.forEach((a) => {
            const sevClass = "severity-" + (a.severity || "INFO");
            html += `
                <div class="alert-item ${sevClass}">
                    <span class="alert-icon">${a.icon || "⚪"}</span>
                    <div class="alert-body">
                        <div class="alert-title">${a.title || ""}</div>
                        <div class="alert-detail">${a.detail || ""}</div>
                    </div>
                    <span class="alert-time">${a.timestamp || ""}</span>
                </div>`;
        });
        container.innerHTML = html;
    }

    function renderSensorHealth(sensors) {
        const container = document.getElementById("sensor-health");
        let html = "";
        for (const [name, s] of Object.entries(sensors)) {
            let dotClass = "offline";
            let statusText = s.status || "unknown";
            if (s.online) {
                if (statusText === "simulation") {
                    dotClass = "simulation";
                } else {
                    dotClass = "online";
                }
            }
            html += `
                <div class="sensor-item">
                    <span class="sensor-dot ${dotClass}">●</span>
                    <span class="sensor-name">${name}</span>
                    <span class="sensor-status">${statusText.toUpperCase()}</span>
                </div>`;
        }
        container.innerHTML = html;
    }

    function renderStats(state) {
        const people = (state.people || []).filter((p) => p.active !== false);
        document.getElementById("stat-persons").textContent = people.length;

        // Face count from state (not available directly, use placeholder)
        let faceCount = 0;
        people.forEach((p) => {
            if (p.face_visible) faceCount++;
        });
        document.getElementById("stat-faces").textContent = faceCount;

        // Current gesture
        let gestureText = "—";
        people.forEach((p) => {
            if (p.gesture) {
                gestureText =
                    p.gesture === "thumbs_up"
                        ? "👍 THUMB"
                        : p.gesture === "open_palm"
                        ? "🖐️ PALM"
                        : p.gesture;
            }
        });
        document.getElementById("stat-gestures").textContent = gestureText;

        // Fire / Smoke from alerts
        let hasFire = false,
            hasSmoke = false;
        (state.alerts || []).forEach((a) => {
            if (a.title && a.title.includes("FIRE")) hasFire = true;
            if (a.title && a.title.includes("SMOKE")) hasSmoke = true;
        });
        document.getElementById("stat-fire").textContent = hasFire ? "🔥 YES" : "—";
        document.getElementById("stat-smoke").textContent = hasSmoke ? "💨 YES" : "—";

        const hotspots = state.thermal_hotspots || [];
        document.getElementById("stat-hotspots").textContent = hotspots.length;
    }

    function renderMap(state) {
        if (!map) return;
        const loc = state.location || {};
        const lat = loc.latitude || 0;
        const lon = loc.longitude || 0;

        // Update camera marker
        if (markers.camera) {
            markers.camera.setLatLng([lat, lon]);
            markers.camera.setPopupContent(
                `📷 Camera<br>${loc.source || "unknown"}<br>${lat.toFixed(4)}, ${lon.toFixed(4)}`
            );
        }

        // Fit map to camera location if non-zero
        if (lat !== 0 || lon !== 0) {
            map.setView([lat, lon], 15, { animate: false });
        }

        // Remove old person/hazard markers
        Object.keys(markers).forEach((k) => {
            if (k !== "camera") {
                map.removeLayer(markers[k]);
                delete markers[k];
            }
        });

        // Add person markers
        (state.people || []).forEach((p) => {
            if (p.active === false) return;
            // Position near camera with some offset based on rel_x/y
            const pLat = lat + (p.rel_x - 0.5) * 0.001;
            const pLon = lon + (p.rel_y - 0.5) * 0.001;
            const icon = p.nearby_hazard ? "🆘" : "👤";
            const m = L.marker([pLat, pLon], {
                icon: L.divIcon({
                    className: "",
                    html: `<div style="font-size:18px">${icon}</div>`,
                    iconSize: [20, 20],
                    iconAnchor: [10, 10],
                }),
            }).addTo(map);
            m.bindPopup(
                `<b>${p.id}</b><br>Priority: ${p.priority}<br>State: ${p.state}<br>Confidence: ${(p.confidence * 100).toFixed(0)}%`
            );
            markers["person_" + p.id] = m;
        });
    }

    function renderGesture(state) {
        // Update gesture display if visible
        // (Could update a dedicated panel, currently shown in stats)
    }

    // ── Test mode API calls ──
    window.testEvent = function (type) {
        fetch("/api/test/" + type, { method: "POST" })
            .then((r) => r.json())
            .then((d) => {
                console.log("[TEST] Sent:", type, d);
            })
            .catch((e) => {
                console.error("[TEST] Failed:", e);
            });
    };
})();
