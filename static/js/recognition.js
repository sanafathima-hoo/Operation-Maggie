/**
 * MAGGI BOWL — Face Recognition Engine  (SSE edition)
 * ──────────────────────────────────────────────────────
 * Server → Browser:  EventSource listening on /api/sse
 * Browser → Server:  regular fetch() POST requests
 *
 * Flow:
 *  1. Connect SSE stream  →  receives person_detected events from Flask
 *  2. Load face-api.js neural net weights in parallel
 *  3. Load enrolled users' embeddings from /api/users
 *  4. IDLE  — camera is OFF, SSE stream is always listening
 *  5. person_detected event received → IMMEDIATELY open webcam
 *  6. Recognition loop starts; shows "Loading AI…" until models ready
 *  7. Known face  → GRANT  (Arduino: door unlock)
 *     Unknown     → INTRUDER  (shake + eerie sound + password modal)
 *     3× wrong pw → ALARM
 */

'use strict';

// ─────────────────────────────────────────────
//  MANUAL TEST (browser console or Test Trigger button)
// ─────────────────────────────────────────────
window.simulateTrigger = function () {
  console.log('[TEST] Manual trigger fired, state:', currentState);
  if (currentState === STATE.IDLE || currentState === STATE.GRANTED) {
    triggerAlert();
  }
};


// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const FACE_MODELS_URL       = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
const RECOGNITION_COOLDOWN  = 3000;
const MAX_PASSWORD_ATTEMPTS = 3;
const DETECTION_INTERVAL_MS = 500;


// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
const STATE = Object.freeze({
  IDLE     : 'idle',
  ALERT    : 'alert',
  SCANNING : 'scanning',
  GRANTED  : 'granted',
  INTRUDER : 'intruder',
  ALARM    : 'alarm',
});

let currentState          = STATE.IDLE;
let wrongPasswordAttempts = 0;
let detectionInterval     = null;
let cooldownActive        = false;
let faceMatcher           = null;
let enrolledUsers         = [];
let stream                = null;
let modelsLoaded          = false;
let audioCtx              = null;


// ─────────────────────────────────────────────
//  DOM REFS
// ─────────────────────────────────────────────
const body            = document.body;
const videoEl         = document.getElementById('videoEl');
const overlayCanvas   = document.getElementById('overlayCanvas');
const idleOverlay     = document.getElementById('idleOverlay');
const bannerIcon      = document.getElementById('bannerIcon');
const bannerText      = document.getElementById('bannerText');
const bannerSub       = document.getElementById('bannerSub');
const resultIcon      = document.getElementById('resultIcon');
const resultName      = document.getElementById('resultName');
const confBar         = document.getElementById('confBar');
const confLabel       = document.getElementById('confLabel');
const enrolledList    = document.getElementById('enrolledList');
const recentList      = document.getElementById('recentList');
const intruderOverlay = document.getElementById('intruderOverlay');
const alarmOverlay    = document.getElementById('alarmOverlay');
const passwordInput   = document.getElementById('passwordInput');
const passwordHint    = document.getElementById('passwordHint');
const arduinoDot      = document.getElementById('arduinoDot');
const arduinoLabel    = document.getElementById('arduinoLabel');
const arduinoBadge    = document.getElementById('arduinoBadge');
const modelBadge      = document.getElementById('modelBadge');
const usersBadge      = document.getElementById('usersBadge');

const ctx = overlayCanvas.getContext('2d');


// ─────────────────────────────────────────────
//  SSE  (Server-Sent Events — replaces Socket.IO)
// ─────────────────────────────────────────────

let evtSource = null;

function connectSSE() {
  if (evtSource) { evtSource.close(); }

  evtSource = new EventSource('/api/sse');

  evtSource.addEventListener('connected', () => {
    console.log('[SSE] Connected to Flask backend');
    updateSSEStatus(true);
  });

  evtSource.addEventListener('person_detected', (e) => {
    const data = JSON.parse(e.data);
    console.log('[SSE] *** person_detected ***', data);
    if (currentState === STATE.IDLE || currentState === STATE.GRANTED) {
      triggerAlert();
    } else {
      console.log('[SSE] person_detected ignored — state:', currentState);
    }
  });

  evtSource.addEventListener('person_cleared', (e) => {
    console.log('[SSE] person_cleared');
    if (currentState === STATE.ALERT || currentState === STATE.SCANNING) {
      setTimeout(() => {
        if (currentState === STATE.SCANNING || currentState === STATE.ALERT) {
          transitionTo(STATE.IDLE);
          stopCamera();
          setBanner('🛡️', 'STANDBY', 'Area clear — awaiting next trigger…');
        }
      }, 5000);
    }
  });

  evtSource.addEventListener('arduino_status', (e) => {
    const data = JSON.parse(e.data);
    updateArduinoStatus(data.connected, data.message);
  });

  evtSource.addEventListener('access_result', (e) => {
    const data = JSON.parse(e.data);
    addRecentEvent(data);
  });

  evtSource.onerror = () => {
    console.warn('[SSE] Connection error — will auto-reconnect');
    updateSSEStatus(false);
  };
}

function updateSSEStatus(connected) {
  const wsDot   = document.getElementById('wsDot');
  const wsLabel = document.getElementById('wsLabel');
  if (wsDot) {
    wsDot.style.background = connected ? '#22c55e' : '#ef4444';
    wsDot.style.boxShadow  = connected ? '0 0 8px #22c55e' : 'none';
  }
  if (wsLabel) wsLabel.textContent = connected ? 'SSE: live' : 'SSE: reconnecting…';
}


// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
(async function init() {
  setBanner('🛡️', 'LOADING', 'Starting up…');

  // Connect SSE stream immediately — start listening for triggers
  connectSSE();

  // Load models and users in parallel
  await Promise.all([loadFaceModels(), loadEnrolledUsers()]);
  await checkHealth();

  transitionTo(STATE.IDLE);
  setBanner('🛡️', 'STANDBY', 'Awaiting IR sensor trigger…');
  setInterval(checkHealth, 10000);
})();


// ─────────────────────────────────────────────
//  FACE-API MODELS
// ─────────────────────────────────────────────
async function loadFaceModels() {
  try {
    modelBadge.textContent = 'Loading…';
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_MODELS_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODELS_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODELS_URL),
    ]);
    modelsLoaded = true;
    modelBadge.textContent = 'Ready ✓';
    modelBadge.className   = 'badge badge-green';
    console.log('[AI] face-api.js models loaded');
  } catch (err) {
    modelBadge.textContent = 'Error!';
    modelBadge.className   = 'badge badge-red';
    console.error('[AI] Model load error:', err);
  }
}


// ─────────────────────────────────────────────
//  ENROLLED USERS
// ─────────────────────────────────────────────
async function loadEnrolledUsers() {
  try {
    const res  = await fetch('/api/users');
    const data = await res.json();
    enrolledUsers = data.users || [];

    const labeled = enrolledUsers.map(u => {
      const descriptors = u.embeddings.map(emb => new Float32Array(emb));
      return new faceapi.LabeledFaceDescriptors(u.name, descriptors);
    });

    if (labeled.length > 0) {
      const threshold = Math.min(...enrolledUsers.map(u => u.threshold || 0.45));
      faceMatcher = new faceapi.FaceMatcher(labeled, threshold);
      console.log(`[AI] FaceMatcher ready — ${labeled.length} user(s), threshold: ${threshold}`);
    }

    usersBadge.textContent = `${enrolledUsers.length} user(s)`;
    usersBadge.className   = 'badge badge-blue';
    renderEnrolledUsers();
  } catch (err) {
    console.error('[USERS] Failed:', err);
    usersBadge.textContent = 'Error';
    usersBadge.className   = 'badge badge-red';
  }
}

function renderEnrolledUsers() {
  enrolledList.innerHTML = '';
  if (!enrolledUsers.length) {
    enrolledList.innerHTML = '<p style="font-size:0.75rem;color:var(--text-muted);text-align:center;padding:8px">No users enrolled</p>';
    return;
  }
  enrolledUsers.forEach(user => {
    const chip = document.createElement('div');
    chip.className = 'user-chip';
    const initials    = user.name.slice(0, 2).toUpperCase();
    const displayName = user.name.charAt(0).toUpperCase() + user.name.slice(1);
    chip.innerHTML = `
      <div class="user-avatar-sm">${initials}</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:0.82rem">${displayName}</div>
        <div style="font-size:0.68rem;color:var(--text-muted)">📸 ${user.total_images} images</div>
      </div>
      <span class="badge badge-green" style="font-size:0.6rem">✓</span>`;
    enrolledList.appendChild(chip);
  });
}


// ─────────────────────────────────────────────
//  HEALTH CHECK
// ─────────────────────────────────────────────
async function checkHealth() {
  try {
    const res  = await fetch('/api/health');
    const data = await res.json();
    updateArduinoStatus(data.arduino_connected,
      data.arduino_connected ? `${data.com_port} connected` : 'Disconnected');
  } catch {
    updateArduinoStatus(false, 'Backend offline');
  }
}

function updateArduinoStatus(connected, message) {
  if (arduinoDot)   arduinoDot.className   = `status-dot ${connected ? 'connected' : 'error'}`;
  if (arduinoLabel) arduinoLabel.textContent = message || (connected ? 'Connected' : 'Disconnected');
  if (arduinoBadge) {
    arduinoBadge.textContent = connected ? 'Online' : 'Offline';
    arduinoBadge.className   = `badge ${connected ? 'badge-green' : 'badge-red'}`;
  }
}


// ─────────────────────────────────────────────
//  STATE MACHINE
// ─────────────────────────────────────────────
function transitionTo(newState) {
  body.className = `state-${newState}`;
  currentState   = newState;
  console.log(`[STATE] → ${newState}`);
}


// ─────────────────────────────────────────────
//  ALERT TRIGGER  (called when SSE person_detected fires)
// ─────────────────────────────────────────────
async function triggerAlert() {
  console.log('[ALERT] Triggered! modelsLoaded:', modelsLoaded, 'faceMatcher:', !!faceMatcher);
  transitionTo(STATE.ALERT);
  setBanner('⚠️', 'MOTION DETECTED', 'IR sensor triggered — opening camera…');
  playAlertTone();
  await sleep(500);
  await startCamera();
  startRecognitionLoop();
}


// ─────────────────────────────────────────────
//  CAMERA
// ─────────────────────────────────────────────
async function startCamera() {
  // ── Step 1: enumerate all video input devices ──────────────────
  let videoDevices = [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    videoDevices = devices.filter(d => d.kind === 'videoinput');
    console.log('[CAM] Found video devices:', videoDevices.map(d => d.label || d.deviceId));
  } catch (enumErr) {
    console.warn('[CAM] Could not enumerate devices:', enumErr);
  }

  if (videoDevices.length === 0) {
    showCameraError(
      'No camera found',
      'No webcam/camera is connected to this computer. Please plug in a USB webcam and try again.',
      videoDevices
    );
    return;
  }

  // ── Step 2: try progressively looser constraints ────────────────
  const constraintSets = [
    { video: { width: 640, height: 480, facingMode: 'user' } },
    { video: { width: 640, height: 480 } },
    { video: true },
  ];

  // If a specific device was selected by the user, try it first
  const selectedId = window._selectedCameraId;
  if (selectedId) {
    constraintSets.unshift({ video: { deviceId: { exact: selectedId } } });
  }

  let lastErr = null;
  for (const constraints of constraintSets) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      break;  // success
    } catch (err) {
      console.warn('[CAM] Constraints failed:', JSON.stringify(constraints), err.name, err.message);
      lastErr = err;
      stream  = null;
    }
  }

  if (!stream) {
    showCameraError(
      lastErr.name === 'NotAllowedError' ? 'Camera access denied' : 'Camera not found',
      lastErr.name === 'NotAllowedError'
        ? 'Browser blocked camera access. Click the camera icon in the address bar and allow access, then try again.'
        : `Could not open any camera. Error: ${lastErr.message}`,
      videoDevices
    );
    return;
  }

  // ── Step 3: camera is open — wire up video element ──────────────
  videoEl.srcObject = stream;
  await new Promise(resolve => { videoEl.onloadedmetadata = resolve; });

  idleOverlay.style.opacity     = '0';
  idleOverlay.style.pointerEvents = 'none';
  setTimeout(() => { idleOverlay.style.display = 'none'; }, 350);
  videoEl.style.display = 'block';

  overlayCanvas.width  = videoEl.videoWidth  || 640;
  overlayCanvas.height = videoEl.videoHeight || 480;

  transitionTo(STATE.SCANNING);
  setBanner('🔍', 'SCANNING', 'Identifying face — please look at camera…');
  console.log('[CAM] Camera started ✓', stream.getVideoTracks()[0]?.label);
}

function showCameraError(title, detail, videoDevices) {
  transitionTo(STATE.IDLE);
  setBanner('📷', title.toUpperCase(), detail);

  // Build a helpful error panel inside the idle overlay
  const deviceList = videoDevices.length
    ? videoDevices.map((d, i) =>
        `<option value="${d.deviceId}">${d.label || 'Camera ' + (i+1)}</option>`
      ).join('')
    : '';

  idleOverlay.innerHTML = `
    <div style="text-align:center;padding:20px;max-width:380px">
      <div style="font-size:3rem;margin-bottom:12px">📷</div>
      <h3 style="color:#E74C3C;font-size:1rem;margin-bottom:8px;font-weight:800">${title}</h3>
      <p style="color:var(--text-dim);font-size:0.78rem;line-height:1.7;margin-bottom:16px">${detail}</p>
      ${videoDevices.length > 1 ? `
        <p style="color:var(--text-muted);font-size:0.72rem;margin-bottom:8px">Or choose a specific camera:</p>
        <select id="cameraSelect" style="background:var(--card2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:7px 12px;font-size:0.78rem;width:100%;margin-bottom:12px">
          ${deviceList}
        </select>` : ''}
      <button onclick="retryCamera()" style="background:linear-gradient(135deg,#E8A020,#F5B835);color:#000;font-weight:800;font-size:0.82rem;padding:10px 24px;border:none;border-radius:999px;cursor:pointer;margin-top:4px">
        🔄 Retry Camera
      </button>
    </div>`;
  idleOverlay.style.display      = 'flex';
  idleOverlay.style.opacity      = '1';
  idleOverlay.style.pointerEvents = '';
}

window.retryCamera = async function () {
  const sel = document.getElementById('cameraSelect');
  if (sel) window._selectedCameraId = sel.value;

  // Restore idle overlay to default state
  idleOverlay.innerHTML = `
    <div class="idle-noodle">🍜</div>
    <p class="idle-msg">Camera offline<br/><span>Will activate when motion is detected</span></p>
    <div class="scan-ring"></div>`;

  // Re-trigger camera open
  await startCamera();
  if (stream) startRecognitionLoop();
};

function stopCamera() {
  if (detectionInterval) { clearInterval(detectionInterval); detectionInterval = null; }
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }

  videoEl.style.display = 'none';
  videoEl.srcObject     = null;
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  idleOverlay.style.display     = 'flex';
  idleOverlay.style.opacity     = '1';
  idleOverlay.style.pointerEvents = '';
  cooldownActive = false;
}


// ─────────────────────────────────────────────
//  RECOGNITION LOOP
// ─────────────────────────────────────────────
function startRecognitionLoop() {
  if (detectionInterval) clearInterval(detectionInterval);

  let autoTimeoutStarted = false;
  let autoTimeout        = null;

  detectionInterval = setInterval(async () => {
    if (cooldownActive) return;
    if (currentState !== STATE.SCANNING) {
      clearInterval(detectionInterval);
      if (autoTimeout) clearTimeout(autoTimeout);
      return;
    }

    // Wait for models to finish loading
    if (!modelsLoaded || !faceMatcher) {
      setBanner('⏳', 'LOADING AI MODELS', 'Downloading face recognition models — please wait…');
      return;
    }

    // Models ready — set up auto-timeout once
    if (!autoTimeoutStarted) {
      autoTimeoutStarted = true;
      setBanner('🔍', 'SCANNING', 'Identifying face — please look at camera…');
      autoTimeout = setTimeout(() => {
        if (currentState === STATE.SCANNING) {
          transitionTo(STATE.IDLE);
          stopCamera();
          setBanner('🛡️', 'STANDBY', 'No face detected — standing by…');
        }
      }, 20000);
    }

    try {
      const detections = await faceapi
        .detectAllFaces(videoEl, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      drawDetections(detections);
      if (detections.length === 0) return;

      if (autoTimeout) { clearTimeout(autoTimeout); autoTimeout = null; }

      const results = detections.map(d => faceMatcher.findBestMatch(d.descriptor));
      const best    = results.reduce((a, b) => a.distance < b.distance ? a : b);
      console.log(`[AI] Best: "${best.label}" dist=${best.distance.toFixed(3)}`);

      if (best.label !== 'unknown') {
        await handleKnownPerson(best);
      } else {
        await handleIntruder();
      }
    } catch (err) {
      console.error('[AI] Detection error:', err);
    }
  }, DETECTION_INTERVAL_MS);
}


// ─────────────────────────────────────────────
//  FACE DRAWING
// ─────────────────────────────────────────────
function drawDetections(detections) {
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  detections.forEach(det => {
    const box   = det.detection.box;
    const color = (currentState === STATE.INTRUDER) ? '#E74C3C' : '#E8A020';
    const cs    = 16;

    ctx.shadowColor = color;
    ctx.shadowBlur  = 12;
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.shadowBlur  = 0;

    // Corner brackets
    ctx.lineWidth = 3;
    [[0,0],[1,0],[0,1],[1,1]].forEach(([rx, ry]) => {
      const x = box.x + rx * box.width;
      const y = box.y + ry * box.height;
      const sx = rx === 0 ? 1 : -1;
      const sy = ry === 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(x, y + sy * cs); ctx.lineTo(x, y); ctx.lineTo(x + sx * cs, y);
      ctx.stroke();
    });
  });
}


// ─────────────────────────────────────────────
//  KNOWN PERSON
// ─────────────────────────────────────────────
async function handleKnownPerson(match) {
  cooldownActive = true;
  const name       = match.label.charAt(0).toUpperCase() + match.label.slice(1);
  const confidence = Math.round((1 - match.distance) * 100);

  transitionTo(STATE.GRANTED);
  setBanner('✅', `WELCOME, ${name.toUpperCase()}!`, 'Access granted — door unlocking…');
  setResultCard('✅', `Welcome, ${name}!`, confidence);
  playGrantTone();

  await postAccess({ identity: match.label, confidence: confidence / 100, granted: true });
  addRecentEvent({ granted: true, identity: name });

  await sleep(3000);
  transitionTo(STATE.IDLE);
  stopCamera();
  setBanner('🛡️', 'STANDBY', 'Awaiting IR sensor trigger…');
  clearResultCard();
  cooldownActive = false;
}


// ─────────────────────────────────────────────
//  INTRUDER
// ─────────────────────────────────────────────
async function handleIntruder() {
  cooldownActive = true;
  clearInterval(detectionInterval);

  transitionTo(STATE.INTRUDER);
  setBanner('🚨', 'INTRUDER DETECTED', 'Unknown face — enter override password');
  setResultCard('🚨', 'Unrecognised Person', 0);
  playIntruderSound();

  await postAccess({ identity: 'unknown', confidence: 0, granted: false });
  addRecentEvent({ granted: false, identity: 'Intruder' });

  wrongPasswordAttempts = 0;
  resetAttemptDots();
  passwordInput.value        = '';
  passwordHint.textContent   = '';
  intruderOverlay.style.display = 'flex';
  setTimeout(() => passwordInput.focus(), 100);
}


// ─────────────────────────────────────────────
//  PASSWORD
// ─────────────────────────────────────────────
window.submitPassword = async function () {
  const pw = passwordInput.value.trim();
  if (!pw) return;
  try {
    const res  = await fetch('/api/verify_password', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ password: pw }),
    });
    const data = await res.json();

    if (data.granted) {
      intruderOverlay.style.display = 'none';
      transitionTo(STATE.GRANTED);
      setBanner('✅', 'OVERRIDE ACCEPTED', 'Password correct — access granted');
      setResultCard('🔑', 'Override Access', 100);
      playGrantTone();
      addRecentEvent({ granted: true, identity: 'Override', override: true });
      await sleep(3000);
      resetSystem();
    } else {
      wrongPasswordAttempts++;
      passwordInput.value = '';
      passwordInput.classList.add('error');
      setTimeout(() => passwordInput.classList.remove('error'), 500);
      playDenyTone();
      markAttemptDot(wrongPasswordAttempts);

      if (wrongPasswordAttempts >= MAX_PASSWORD_ATTEMPTS) {
        intruderOverlay.style.display = 'none';
        triggerAlarm();
      } else {
        const left = MAX_PASSWORD_ATTEMPTS - wrongPasswordAttempts;
        passwordHint.textContent = `❌ Wrong password — ${left} attempt${left !== 1 ? 's' : ''} remaining`;
        passwordInput.focus();
      }
    }
  } catch (err) {
    passwordHint.textContent = '⚠️ Server error — try again';
  }
};

window.dismissIntruder = function () {
  intruderOverlay.style.display = 'none';
  cooldownActive = false;
  startRecognitionLoop();
  transitionTo(STATE.SCANNING);
  setBanner('🔍', 'SCANNING', 'Re-scanning…');
};

function markAttemptDot(n) {
  const dot = document.getElementById(`dot${n}`);
  if (dot) { dot.classList.remove('active'); dot.style.borderColor = '#555'; dot.style.background = 'transparent'; }
}
function resetAttemptDots() {
  for (let i = 1; i <= 3; i++) {
    const d = document.getElementById(`dot${i}`);
    if (d) { d.className = 'attempt-dot active'; d.style.borderColor = ''; d.style.background = ''; }
  }
}


// ─────────────────────────────────────────────
//  ALARM
// ─────────────────────────────────────────────
async function triggerAlarm() {
  transitionTo(STATE.ALARM);
  setBanner('🚨', 'ALARM TRIGGERED', 'Max attempts exceeded — security alarm!');
  playAlarmSound();
  await postAccess({ identity: 'unknown', confidence: 0, granted: false, alarm: true });
  addRecentEvent({ granted: false, identity: 'ALARM', alarm: true });
  alarmOverlay.style.display = 'flex';
  stopCamera();
}

window.resetSystem = function () {
  alarmOverlay.style.display    = 'none';
  intruderOverlay.style.display = 'none';
  wrongPasswordAttempts = 0;
  cooldownActive        = false;
  if (detectionInterval) { clearInterval(detectionInterval); detectionInterval = null; }
  stopCamera();
  transitionTo(STATE.IDLE);
  setBanner('🛡️', 'STANDBY', 'System reset — awaiting IR trigger…');
  clearResultCard();
};


// ─────────────────────────────────────────────
//  API HELPERS
// ─────────────────────────────────────────────
async function postAccess(payload) {
  try {
    await fetch('/api/access', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[API] postAccess failed:', err);
  }
}


// ─────────────────────────────────────────────
//  UI HELPERS
// ─────────────────────────────────────────────
function setBanner(icon, text, sub) {
  bannerIcon.textContent = icon;
  bannerText.textContent = text;
  bannerSub.textContent  = sub;
}

function setResultCard(icon, name, pct) {
  resultIcon.textContent  = icon;
  resultName.textContent  = name;
  confBar.style.width     = `${pct}%`;
  confLabel.textContent   = pct ? `${pct}% match` : '—';
}
function clearResultCard() {
  resultIcon.textContent = '—';
  resultName.textContent = 'Waiting…';
  confBar.style.width    = '0%';
  confLabel.textContent  = '—';
}

function addRecentEvent(data) {
  const noMsg = recentList.querySelector('.no-events');
  if (noMsg) noMsg.remove();
  while (recentList.children.length >= 8) recentList.removeChild(recentList.lastChild);

  const div  = document.createElement('div');
  div.className = `recent-event ${data.granted ? 'granted' : data.alarm ? 'alarm' : 'denied'}`;
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const who  = data.granted ? `✅ ${data.identity || 'Unknown'}`
             : data.alarm   ? `🚨 ALARM`
             :                `🚫 Intruder`;

  div.innerHTML = `<div class="recent-event-who">${who}</div>
                   <div class="recent-event-time">${time}</div>`;
  recentList.prepend(div);
}


// ─────────────────────────────────────────────
//  AUDIO (Web Audio API — no files needed)
// ─────────────────────────────────────────────
function getAC() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playAlertTone() {
  try {
    const ac = getAC(), o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'sine'; o.frequency.setValueAtTime(880, ac.currentTime);
    o.frequency.linearRampToValueAtTime(440, ac.currentTime + 0.3);
    g.gain.setValueAtTime(0.3, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
    o.start(); o.stop(ac.currentTime + 0.4);
  } catch(e) {}
}

function playGrantTone() {
  try {
    const ac = getAC();
    [523, 659, 784].forEach((freq, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.type = 'sine'; o.frequency.value = freq;
      const t = ac.currentTime + i * 0.15;
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.start(t); o.stop(t + 0.3);
    });
  } catch(e) {}
}

function playDenyTone() {
  try {
    const ac = getAC(), o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'sawtooth'; o.frequency.setValueAtTime(200, ac.currentTime);
    o.frequency.linearRampToValueAtTime(100, ac.currentTime + 0.4);
    g.gain.setValueAtTime(0.3, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5);
    o.start(); o.stop(ac.currentTime + 0.5);
  } catch(e) {}
}

function playIntruderSound() {
  try {
    const ac = getAC();
    // Deep rumble
    const o1 = ac.createOscillator(), g1 = ac.createGain();
    o1.connect(g1); g1.connect(ac.destination);
    o1.type = 'sawtooth'; o1.frequency.setValueAtTime(80, ac.currentTime);
    o1.frequency.linearRampToValueAtTime(40, ac.currentTime + 2);
    g1.gain.setValueAtTime(0.4, ac.currentTime); g1.gain.linearRampToValueAtTime(0, ac.currentTime + 2);
    // Eerie whine
    const o2 = ac.createOscillator(), g2 = ac.createGain();
    o2.connect(g2); g2.connect(ac.destination);
    o2.type = 'sine';
    [600,300,700,200,800].forEach((f,i) => o2.frequency.setValueAtTime(f, ac.currentTime + i*0.4));
    g2.gain.setValueAtTime(0.2, ac.currentTime); g2.gain.linearRampToValueAtTime(0, ac.currentTime + 2);
    // Alarm pulse
    const o3 = ac.createOscillator(), g3 = ac.createGain();
    o3.connect(g3); g3.connect(ac.destination);
    o3.type = 'square'; o3.frequency.value = 2200;
    for (let i = 0; i < 6; i++) {
      g3.gain.setValueAtTime(0.15, ac.currentTime + i*0.3);
      g3.gain.setValueAtTime(0,    ac.currentTime + i*0.3 + 0.15);
    }
    [o1,o2,o3].forEach(o => { o.start(); o.stop(ac.currentTime + 2.2); });
  } catch(e) {}
}

function playAlarmSound() {
  let i = 0;
  const iv = setInterval(() => {
    if (currentState !== STATE.ALARM || i++ > 20) { clearInterval(iv); return; }
    try {
      const ac = getAC(), o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.type = 'sawtooth'; o.frequency.value = i % 2 === 0 ? 2800 : 1400;
      g.gain.setValueAtTime(0.35, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.45);
      o.start(); o.stop(ac.currentTime + 0.5);
    } catch(e) {}
  }, 500);
}


// ─────────────────────────────────────────────
//  UTILITY
// ─────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
