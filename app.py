"""
MAGGI BOWL - Smart Intruder Detection System
Flask Backend  (SSE edition — no Socket.IO needed)

Server → Browser communication: Server-Sent Events (SSE) on /api/sse
Browser → Server communication: regular POST/GET REST endpoints
Arduino → Flask:  Serial thread reads "PERSON_DETECTED" / "PERSON_CLEARED"
Flask → Arduino:  send_arduino("GRANT" | "DENY" | "ALARM" | "IDLE")
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import os
import json
import time
import queue
import sqlite3
import threading
import numpy as np

from datetime import datetime
from flask import Flask, render_template, jsonify, request, Response
from flask_cors import CORS

try:
    import serial
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False
    print("[WARNING] pyserial not installed. Arduino connection disabled.")

# ─────────────────────────────────────────────
#  CONFIGURATION
# ─────────────────────────────────────────────

COM_PORT          = "COM5"
BAUD_RATE         = 9600
OVERRIDE_PASSWORD = "maggie2025"   # Change before deployment!
MODELS_DIR        = os.path.join(os.path.dirname(__file__), "models")
DB_PATH           = os.path.join(os.path.dirname(__file__), "maggi_guard.db")

# ─────────────────────────────────────────────
#  APP SETUP
# ─────────────────────────────────────────────

app = Flask(__name__)
CORS(app)

# ─────────────────────────────────────────────
#  SSE BROADCAST  (Server → Browser)
# ─────────────────────────────────────────────

_sse_clients      = []           # list of queue.Queue, one per browser tab
_sse_clients_lock = threading.Lock()


def _sse_push(event_type: str, data: dict):
    """Push an SSE event to every connected browser client."""
    payload = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
    with _sse_clients_lock:
        dead = []
        for q in _sse_clients:
            try:
                q.put_nowait(payload)
            except queue.Full:
                dead.append(q)
        for q in dead:
            _sse_clients.remove(q)


@app.route("/api/sse")
def sse_stream():
    """
    Long-lived SSE endpoint.
    Each browser tab connecting here gets its own queue.
    Flask pushes events into the queue; the generator streams them out.
    """
    client_q = queue.Queue(maxsize=50)
    with _sse_clients_lock:
        _sse_clients.append(client_q)
    print(f"[SSE] Client connected  — total: {len(_sse_clients)}")

    def generate():
        # Send an immediate 'connected' ping so the browser knows it's live
        yield f"event: connected\ndata: {{}}\n\n"
        try:
            while True:
                try:
                    msg = client_q.get(timeout=25)   # 25-s heartbeat interval
                    yield msg
                except queue.Empty:
                    yield ": heartbeat\n\n"          # keep connection alive
        except GeneratorExit:
            pass
        finally:
            with _sse_clients_lock:
                if client_q in _sse_clients:
                    _sse_clients.remove(client_q)
            print(f"[SSE] Client disconnected — total: {len(_sse_clients)}")

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control"    : "no-cache",
            "X-Accel-Buffering": "no",
            "Connection"       : "keep-alive",
            "Access-Control-Allow-Origin": "*",
        },
    )


# ─────────────────────────────────────────────
#  ARDUINO STATE
# ─────────────────────────────────────────────

arduino           = None
arduino_connected = False
arduino_lock      = threading.Lock()


def connect_arduino():
    global arduino, arduino_connected
    if not SERIAL_AVAILABLE:
        return
    try:
        arduino = serial.Serial(COM_PORT, BAUD_RATE, timeout=1)
        time.sleep(2)
        arduino_connected = True
        print(f"[ARDUINO] Connected on {COM_PORT}")
    except Exception as e:
        arduino_connected = False
        print(f"[ARDUINO] Cannot connect to {COM_PORT}: {e}")


def send_arduino(command: str):
    global arduino, arduino_connected
    with arduino_lock:
        if arduino and arduino_connected:
            try:
                arduino.write(f"{command}\n".encode())
                print(f"[ARDUINO TX] {command}")
            except Exception as e:
                print(f"[ARDUINO] Send error: {e}")
                arduino_connected = False


def arduino_read_loop():
    """Background thread: read Serial lines from Arduino, push SSE to browser."""
    global arduino, arduino_connected
    retry_delay = 5
    while True:
        if arduino and arduino_connected:
            retry_delay = 5
            try:
                raw = arduino.readline()
                if not raw:
                    continue
                line = raw.decode("utf-8", errors="ignore").strip()
                if not line:
                    continue

                print(f"[ARDUINO RX] {line}")

                if line == "MAGGI_GUARD_READY":
                    arduino_connected = True
                    _sse_push("arduino_status", {
                        "connected": True,
                        "message"  : "MAGGI GUARD online"
                    })

                elif line == "PERSON_DETECTED":
                    print("[SSE] Pushing person_detected to browsers...")
                    _sse_push("person_detected", {
                        "message"  : "Motion detected by IR sensor!",
                        "timestamp": datetime.now().isoformat()
                    })
                    log_event("sensor_trigger", 0.0, False, False, False)

                elif line == "PERSON_CLEARED":
                    _sse_push("person_cleared", {
                        "message"  : "Area clear",
                        "timestamp": datetime.now().isoformat()
                    })

            except Exception as e:
                print(f"[ARDUINO] Read error: {e}")
                arduino_connected = False
                time.sleep(retry_delay)
                connect_arduino()
        else:
            time.sleep(retry_delay)
            retry_delay = min(retry_delay * 2, 60)
            connect_arduino()


# ─────────────────────────────────────────────
#  DATABASE
# ─────────────────────────────────────────────

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS access_log (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp  TEXT,
            identity   TEXT,
            confidence REAL,
            granted    INTEGER,
            override   INTEGER,
            alarm      INTEGER
        )
    """)
    conn.commit()
    conn.close()
    print("[DB] Database ready")


def log_event(identity, confidence, granted, override, alarm):
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute(
        "INSERT INTO access_log (timestamp,identity,confidence,granted,override,alarm)"
        " VALUES (?,?,?,?,?,?)",
        (datetime.now().isoformat(), identity, float(confidence),
         1 if granted else 0, 1 if override else 0, 1 if alarm else 0)
    )
    conn.commit()
    conn.close()


# ─────────────────────────────────────────────
#  MODEL / USER DATA
# ─────────────────────────────────────────────

def get_enrolled_users():
    users = []
    if not os.path.exists(MODELS_DIR):
        return users
    for fname in sorted(os.listdir(MODELS_DIR)):
        if not fname.endswith("_metadata.json"):
            continue
        stem      = fname.replace("_metadata.json", "")
        meta_path = os.path.join(MODELS_DIR, fname)
        emb_path  = os.path.join(MODELS_DIR, f"{stem}_all_embeddings.npy")
        mean_path = os.path.join(MODELS_DIR, f"{stem}_mean_embedding.npy")
        if not os.path.exists(emb_path):
            continue
        with open(meta_path) as f:
            meta = json.load(f)
        embeddings = np.load(emb_path).tolist()
        mean_emb   = np.load(mean_path).tolist() if os.path.exists(mean_path) else None
        users.append({
            "name"          : meta.get("identity", stem),
            "stem"          : stem,
            "total_images"  : meta.get("total_images", len(embeddings)),
            "threshold"     : meta.get("threshold", 0.45),
            "embeddings"    : embeddings,
            "mean_embedding": mean_emb,
        })
    return users


# ─────────────────────────────────────────────
#  ROUTES
# ─────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/admin")
def admin():
    return render_template("admin.html")


@app.route("/api/users")
def api_users():
    users = get_enrolled_users()
    if request.args.get("summary") == "1":
        summary = [{"name": u["name"], "total_images": u["total_images"]} for u in users]
        return jsonify({"users": summary, "count": len(summary)})
    return jsonify({"users": users, "count": len(users)})


@app.route("/api/access", methods=["POST"])
def api_access():
    data       = request.get_json(force=True)
    identity   = data.get("identity",   "unknown")
    confidence = float(data.get("confidence", 0))
    granted    = bool(data.get("granted",    False))
    alarm      = bool(data.get("alarm",      False))

    if alarm:
        send_arduino("ALARM")
        _sse_push("access_result", {"granted": False, "alarm": True, "identity": "intruder"})
        log_event(identity, confidence, False, False, True)
        return jsonify({"success": True, "granted": False, "alarm": True})

    if granted:
        send_arduino("GRANT")
        _sse_push("access_result", {"granted": True, "identity": identity, "confidence": confidence})
        log_event(identity, confidence, True, False, False)
        return jsonify({"success": True, "granted": True})

    send_arduino("DENY")
    _sse_push("access_result", {"granted": False, "identity": "intruder"})
    log_event(identity, confidence, False, False, False)
    return jsonify({"success": True, "granted": False})


@app.route("/api/verify_password", methods=["POST"])
def verify_password():
    data     = request.get_json(force=True)
    password = data.get("password", "")
    if password == OVERRIDE_PASSWORD:
        send_arduino("GRANT")
        log_event("password_override", 1.0, True, True, False)
        _sse_push("access_result", {"granted": True, "identity": "override", "override": True})
        return jsonify({"success": True, "granted": True})
    return jsonify({"success": False, "granted": False})


@app.route("/api/logs")
def api_logs():
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("SELECT * FROM access_log ORDER BY id DESC LIMIT 100")
    rows = c.fetchall()
    conn.close()
    logs = [
        {
            "id"        : r[0],
            "timestamp" : r[1],
            "identity"  : r[2],
            "confidence": round((r[3] or 0) * 100, 1),
            "granted"   : bool(r[4]),
            "override"  : bool(r[5]),
            "alarm"     : bool(r[6]),
        }
        for r in rows
    ]
    return jsonify({"logs": logs})


@app.route("/api/health")
def api_health():
    enrolled = get_enrolled_users()
    return jsonify({
        "arduino_connected": arduino_connected,
        "com_port"         : COM_PORT,
        "enrolled_count"   : len(enrolled),
        "enrolled_names"   : [u["name"] for u in enrolled],
        "sse_clients"      : len(_sse_clients),
        "status"           : "online",
        "timestamp"        : datetime.now().isoformat(),
    })


@app.route("/api/simulate_trigger")
def simulate_trigger():
    """Dev endpoint — simulate an IR sensor trigger without hardware."""
    print("[SIM] Simulating PERSON_DETECTED via API...")
    _sse_push("person_detected", {
        "message"  : "Simulated trigger (API call)",
        "timestamp": datetime.now().isoformat()
    })
    log_event("sensor_trigger", 0.0, False, False, False)
    return jsonify({"success": True, "message": "person_detected event pushed to browsers"})


# ─────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    connect_arduino()

    t = threading.Thread(target=arduino_read_loop, daemon=True)
    t.start()

    print("\n" + "=" * 52)
    print("  MAGGI BOWL -- Smart Security System  (SSE)")
    print("  http://localhost:5000")
    print("  Admin:   http://localhost:5000/admin")
    print("  Test:    http://localhost:5000/api/simulate_trigger")
    print("=" * 52 + "\n")

    # Use Flask's built-in threaded server (no eventlet/gevent needed)
    app.run(host="0.0.0.0", port=5000, debug=False,
            threaded=True, use_reloader=False)
