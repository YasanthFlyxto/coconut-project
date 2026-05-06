const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// ─────────────────────────────────────────────
//  USER CONFIGURATION  (edit here or use Dashboard settings)
// ─────────────────────────────────────────────
let config = {
  serialPort: 'COM3',
  baudRate: 9600,
  video1: path.join(__dirname, 'videos', 'video1.mp4'),
  video2: path.join(__dirname, 'videos', 'video2.mp4'),
  resetDelayMs: 10000,        // pause after video2 ends before resetting
  crossfadeDurationMs: 400,   // crossfade between videos
  video2DisplayIndex: 0,      // 0 = primary, 1 = secondary display
  autoConnect: true
};

const configPath = path.join(app.getPath('userData'), 'config.json');
if (fs.existsSync(configPath)) {
  try {
    config = Object.assign(config, JSON.parse(fs.readFileSync(configPath, 'utf8')));
  } catch (e) { /* use defaults */ }
}

// ─────────────────────────────────────────────
//  STATE MACHINE
// ─────────────────────────────────────────────
const STATES = {
  IDLE: 'IDLE',
  PLAYING_VIDEO_1: 'PLAYING_VIDEO_1',
  WAITING_FOR_VIDEO_2: 'WAITING_FOR_VIDEO_2',
  PLAYING_VIDEO_2: 'PLAYING_VIDEO_2',
  RESETTING: 'RESETTING'
};

let currentState = STATES.IDLE;
let resetTimer = null;
let playerWindow = null;
let dashboardWindow = null;
let serialPort = null;
let availablePorts = [];

// ─────────────────────────────────────────────
//  STATE TRANSITIONS
// ─────────────────────────────────────────────
function setState(newState, extra = {}) {
  currentState = newState;
  console.log(`[STATE] → ${newState}`);
  broadcastState({ state: newState, ...extra });
}

function broadcastState(payload) {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('state-update', payload);
  }
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.send('state-update', payload);
  }
}

function triggerVideo1() {
  if (currentState === STATES.IDLE) {
    console.log('[TRIGGER] Video 1 triggered');
    setState(STATES.PLAYING_VIDEO_1);
  } else {
    console.log(`[TRIGGER] Video 1 ignored — state is ${currentState}`);
  }
}

function triggerVideo2() {
  if (currentState === STATES.WAITING_FOR_VIDEO_2) {
    console.log('[TRIGGER] Video 2 triggered');
    setState(STATES.PLAYING_VIDEO_2);
  } else {
    console.log(`[TRIGGER] Video 2 ignored — state is ${currentState}`);
  }
}

function onVideo1Ended() {
  if (currentState === STATES.PLAYING_VIDEO_1) {
    console.log('[EVENT] Video 1 ended → waiting for video 2');
    setState(STATES.WAITING_FOR_VIDEO_2);
  }
}

function onVideo2Ended() {
  if (currentState === STATES.PLAYING_VIDEO_2) {
    console.log(`[EVENT] Video 2 ended → resetting in ${config.resetDelayMs}ms`);
    setState(STATES.RESETTING, { resetDelayMs: config.resetDelayMs });
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      console.log('[EVENT] Reset → IDLE');
      setState(STATES.IDLE);
    }, config.resetDelayMs);
  }
}

// ─────────────────────────────────────────────
//  SERIAL PORT
// ─────────────────────────────────────────────
async function listPorts() {
  try {
    const { SerialPort } = require('serialport');
    const ports = await SerialPort.list();
    availablePorts = ports.map(p => ({ path: p.path, manufacturer: p.manufacturer || '' }));
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send('ports-list', availablePorts);
    }
    return availablePorts;
  } catch (e) {
    console.error('[SERIAL] Error listing ports:', e.message);
    return [];
  }
}

function connectSerial(portPath, baudRate) {
  if (serialPort && serialPort.isOpen) {
    serialPort.close(() => connectSerial(portPath, baudRate));
    return;
  }
  try {
    const { SerialPort } = require('serialport');
    const { ReadlineParser } = require('@serialport/parser-readline');

    serialPort = new SerialPort({ path: portPath, baudRate: baudRate || config.baudRate });
    const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

    serialPort.on('open', () => {
      console.log(`[SERIAL] Connected to ${portPath}`);
      config.serialPort = portPath;
      broadcastSerial({ connected: true, port: portPath });
    });

    serialPort.on('error', (err) => {
      console.error('[SERIAL] Error:', err.message);
      broadcastSerial({ connected: false, error: err.message });
    });

    serialPort.on('close', () => {
      console.log('[SERIAL] Port closed');
      broadcastSerial({ connected: false });
    });

    parser.on('data', (line) => {
      const cmd = line.trim();
      console.log(`[SERIAL] Received: "${cmd}"`);
      handleSerialCommand(cmd);
    });

  } catch (e) {
    console.error('[SERIAL] Cannot open port:', e.message);
    broadcastSerial({ connected: false, error: e.message });
  }
}

function handleSerialCommand(cmd) {
  switch (cmd) {
    case 'SENSOR_TRIGGER':
    case 'REMOTE1_PLAY':
      triggerVideo1();
      break;
    case 'REMOTE2_PLAY':
      triggerVideo2();
      break;
    default:
      console.log(`[SERIAL] Unknown command: "${cmd}"`);
  }
}

function broadcastSerial(payload) {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.send('serial-status', payload);
  }
}

function disconnectSerial() {
  if (serialPort && serialPort.isOpen) {
    serialPort.close();
    serialPort = null;
  }
}

// ─────────────────────────────────────────────
//  WINDOWS
// ─────────────────────────────────────────────
function createWindows() {
  const displays = screen.getAllDisplays();

  // ── Video Player Window ──
  const videoDisplay = displays[Math.min(config.video2DisplayIndex, displays.length - 1)];
  playerWindow = new BrowserWindow({
    x: videoDisplay.bounds.x,
    y: videoDisplay.bounds.y,
    width: videoDisplay.bounds.width,
    height: videoDisplay.bounds.height,
    fullscreen: displays.length > 1, // fullscreen only if secondary display
    backgroundColor: '#000000',
    frame: displays.length === 1,
    titleBarStyle: 'hiddenInset',
    title: 'Flyxto — Video Player',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  playerWindow.loadFile(path.join(__dirname, 'src', 'player', 'player.html'));

  // ── Dashboard Window ──
  const primaryDisplay = screen.getPrimaryDisplay();
  dashboardWindow = new BrowserWindow({
    x: primaryDisplay.bounds.x + 50,
    y: primaryDisplay.bounds.y + 50,
    width: 560,
    height: 720,
    minWidth: 480,
    minHeight: 600,
    backgroundColor: '#0a0a0f',
    title: 'Flyxto — Dashboard',
    alwaysOnTop: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  dashboardWindow.loadFile(path.join(__dirname, 'src', 'dashboard', 'dashboard.html'));

  // Dev tools in dev mode
  if (process.argv.includes('--dev')) {
    playerWindow.webContents.openDevTools({ mode: 'detach' });
    dashboardWindow.webContents.openDevTools({ mode: 'detach' });
  }

  playerWindow.on('closed', () => { playerWindow = null; });
  dashboardWindow.on('closed', () => { dashboardWindow = null; app.quit(); });
}

// ─────────────────────────────────────────────
//  IPC HANDLERS
// ─────────────────────────────────────────────
ipcMain.handle('get-config', () => ({
  ...config,
  videosFound: {
    video1: fs.existsSync(config.video1),
    video2: fs.existsSync(config.video2)
  },
  availablePorts
}));

ipcMain.handle('save-config', (event, updates) => {
  config = Object.assign(config, updates);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return config;
});

ipcMain.handle('list-ports', async () => {
  return await listPorts();
});

ipcMain.handle('connect-serial', (event, { port, baudRate }) => {
  connectSerial(port, baudRate);
  return true;
});

ipcMain.handle('disconnect-serial', () => {
  disconnectSerial();
  return true;
});

ipcMain.on('play-video2', () => triggerVideo2());
ipcMain.on('video1-ended', () => onVideo1Ended());
ipcMain.on('video2-ended', () => onVideo2Ended());

// Dashboard → simulate triggers (for testing without hardware)
ipcMain.on('simulate-sensor', () => triggerVideo1());
ipcMain.on('simulate-remote1', () => triggerVideo1());
ipcMain.on('simulate-remote2', () => triggerVideo2());

// ─────────────────────────────────────────────
//  APP LIFECYCLE
// ─────────────────────────────────────────────
app.whenReady().then(async () => {
  createWindows();
  await listPorts();

  if (config.autoConnect && config.serialPort) {
    setTimeout(() => connectSerial(config.serialPort, config.baudRate), 1500);
  }
});

app.on('window-all-closed', () => {
  disconnectSerial();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindows();
});
