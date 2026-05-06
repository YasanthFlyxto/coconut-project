// ─────────────────────────────────────────────
//  Flyxto Dashboard — Renderer
// ─────────────────────────────────────────────
const api = window.electronAPI;

// ── DOM refs ─────────────────────────────────
const statusCard        = document.getElementById('status-card');
const statusIcon        = document.getElementById('status-icon');
const statusLabel       = document.getElementById('status-label');
const statusDescription = document.getElementById('status-description');
const serialBadge       = document.getElementById('serial-badge');
const serialLabel       = document.getElementById('serial-label');

const btnPlayV2         = document.getElementById('btn-play-v2');
const portSelect        = document.getElementById('port-select');
const baudInput         = document.getElementById('baud-input');
const btnConnect        = document.getElementById('btn-connect');
const btnDisconnect     = document.getElementById('btn-disconnect');
const btnRefreshPorts   = document.getElementById('btn-refresh-ports');

const file1Badge        = document.getElementById('file1-badge');
const file1Status       = document.getElementById('file1-status');
const file2Badge        = document.getElementById('file2-badge');
const file2Status       = document.getElementById('file2-status');

const countdownWrap     = document.getElementById('countdown-wrap');
const countdownSecs     = document.getElementById('countdown-secs');
const countdownBar      = document.getElementById('countdown-bar');

const btnSimSensor      = document.getElementById('btn-sim-sensor');
const btnSimR1          = document.getElementById('btn-sim-r1');
const btnSimR2          = document.getElementById('btn-sim-r2');

// ── State ─────────────────────────────────────
const STATES = {
  IDLE:               { label: 'IDLE',              desc: 'Waiting for IR sensor or Remote 1 trigger',   icon: '⏸',  cls: 'state-idle' },
  PLAYING_VIDEO_1:    { label: 'PLAYING VIDEO 1',   desc: 'IR sensor or Remote 1 triggered — playing',   icon: '▶',  cls: 'state-video1' },
  WAITING_FOR_VIDEO_2:{ label: 'WAITING FOR VIDEO 2',desc: 'Video 1 complete — press Play or Remote 2',  icon: '⏯',  cls: 'state-waiting' },
  PLAYING_VIDEO_2:    { label: 'PLAYING VIDEO 2',   desc: 'Dashboard or Remote 2 triggered — playing',   icon: '▶',  cls: 'state-video2' },
  RESETTING:          { label: 'RESETTING',          desc: 'Video 2 complete — returning to idle shortly',icon: '↺',  cls: 'state-resetting' }
};

let currentState = 'IDLE';
let countdownInterval = null;
let resetMs = 10000;
let isConnected = false;

// ── Init ─────────────────────────────────────
async function init() {
  const config = await api.getConfig();
  baudInput.value = config.baudRate || 9600;

  // Video file status
  updateFileStatus(1, config.videosFound?.video1);
  updateFileStatus(2, config.videosFound?.video2);

  // Populate ports
  populatePorts(config.availablePorts || []);
  if (config.serialPort) {
    portSelect.value = config.serialPort;
  }

  // Listen for events
  api.onStateUpdate(handleStateUpdate);
  api.onSerialStatus(handleSerialStatus);
  api.onPortsList(populatePorts);

  // Initial render
  applyState('IDLE');
}

// ── State rendering ───────────────────────────
function handleStateUpdate({ state, resetDelayMs }) {
  currentState = state;
  if (resetDelayMs) resetMs = resetDelayMs;
  applyState(state);
}

function applyState(state) {
  const s = STATES[state] || STATES.IDLE;

  // Remove all state classes
  Object.values(STATES).forEach(v => statusCard.classList.remove(v.cls));
  statusCard.classList.add(s.cls);

  statusIcon.textContent = s.icon;
  statusLabel.textContent = s.label;
  statusDescription.textContent = s.desc;

  // Play V2 button
  btnPlayV2.disabled = (state !== 'WAITING_FOR_VIDEO_2');

  // Countdown
  if (state === 'RESETTING') {
    startCountdown(resetMs);
  } else {
    stopCountdown();
  }
}

// ── Countdown ─────────────────────────────────
function startCountdown(ms) {
  stopCountdown();
  countdownWrap.classList.remove('hidden');
  const totalSecs = Math.ceil(ms / 1000);
  let remaining = totalSecs;

  const update = () => {
    countdownSecs.textContent = remaining;
    const pct = (remaining / totalSecs) * 100;
    countdownBar.style.width = `${pct}%`;
    if (remaining <= 0) {
      stopCountdown();
    }
  };

  update();
  countdownInterval = setInterval(() => {
    remaining--;
    update();
  }, 1000);
}

function stopCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
  countdownWrap.classList.add('hidden');
  countdownBar.style.width = '100%';
}

// ── Serial Status ─────────────────────────────
function handleSerialStatus({ connected, port, error }) {
  isConnected = connected;

  if (connected) {
    serialBadge.className = 'serial-badge connected';
    serialLabel.textContent = port || 'Connected';
    btnConnect.disabled = true;
    btnDisconnect.disabled = false;
  } else {
    serialBadge.className = 'serial-badge disconnected';
    serialLabel.textContent = error ? 'Error' : 'Disconnected';
    btnConnect.disabled = false;
    btnDisconnect.disabled = true;
  }
}

// ── Port List ─────────────────────────────────
function populatePorts(ports) {
  const current = portSelect.value;
  // Clear existing (except placeholder)
  while (portSelect.options.length > 1) portSelect.remove(1);

  ports.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.path;
    opt.textContent = p.manufacturer ? `${p.path} — ${p.manufacturer}` : p.path;
    portSelect.appendChild(opt);
  });

  if (current) portSelect.value = current;
}

// ── File Status ───────────────────────────────
function updateFileStatus(num, found) {
  const badge = num === 1 ? file1Badge : file2Badge;
  const status = num === 1 ? file1Status : file2Status;

  if (found === true) {
    badge.textContent = 'FOUND';
    badge.className = 'file-badge found';
    status.textContent = 'Ready to play';
  } else if (found === false) {
    badge.textContent = 'MISSING';
    badge.className = 'file-badge missing';
    status.textContent = 'Place file in videos/ folder';
  } else {
    badge.textContent = '—';
    badge.className = 'file-badge';
    status.textContent = 'Checking...';
  }
}

// ── Button Handlers ───────────────────────────
btnPlayV2.addEventListener('click', () => {
  api.playVideo2();
});

btnRefreshPorts.addEventListener('click', async () => {
  btnRefreshPorts.textContent = '⌛';
  const ports = await api.listPorts();
  populatePorts(ports);
  setTimeout(() => { btnRefreshPorts.textContent = '↻'; }, 500);
});

btnConnect.addEventListener('click', () => {
  const port = portSelect.value;
  if (!port) { alert('Please select a COM port.'); return; }
  const baud = parseInt(baudInput.value) || 9600;
  api.connectSerial(port, baud);
});

btnDisconnect.addEventListener('click', () => {
  api.disconnectSerial();
});

// ── Simulate ──────────────────────────────────
btnSimSensor.addEventListener('click', () => api.simulateSensor());
btnSimR1.addEventListener('click',     () => api.simulateRemote1());
btnSimR2.addEventListener('click',     () => api.simulateRemote2());

// ── Boot ─────────────────────────────────────
init();
