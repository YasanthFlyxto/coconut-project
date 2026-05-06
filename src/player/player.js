// ─────────────────────────────────────────────
//  Flyxto Video Player — Renderer
// ─────────────────────────────────────────────
const api = window.electronAPI;

const videoA = document.getElementById('video-a');
const videoB = document.getElementById('video-b');
const idleOverlay = document.getElementById('idle-overlay');
const stateBadge = document.getElementById('state-badge');

let config = {};
let activeLayer = null;  // 'a' or 'b'
let video1Src = '';
let video2Src = '';

// ─── Init ───────────────────────────────────
async function init() {
  config = await api.getConfig();
  video1Src = `file://${config.video1.replace(/\\/g, '/')}`;
  video2Src = `file://${config.video2.replace(/\\/g, '/')}`;

  // Preload video 2 into layer B (silent background preload)
  videoB.src = video2Src;
  videoB.load();

  // Load video 1 into layer A and freeze on first frame for idle screen
  videoA.src = video1Src;
  videoA.load();
  videoA.addEventListener('loadeddata', () => {
    videoA.currentTime = 0;
    videoA.pause();
    videoA.classList.add('active');
    activeLayer = 'a';
    // Hide the overlay once first frame is ready
    showIdle(false);
  }, { once: true });

  // Wire up ended events
  videoA.addEventListener('ended', onActiveVideoEnded);
  videoB.addEventListener('ended', onActiveVideoEnded);

  // Listen for state from main
  api.onStateUpdate(handleStateUpdate);

  showBadge('IDLE', 'idle');
  // Overlay stays visible until first frame is decoded
  showIdle(true);
}

// ─── State Handler ───────────────────────────
function handleStateUpdate({ state, resetDelayMs }) {
  console.log('[PLAYER] State:', state);

  switch (state) {
    case 'IDLE':
      // Crossfade back to video 1 first frame (from video 2 last frame)
      showBadge('IDLE', 'idle');
      showIdle(false);
      // Reload video 1 and freeze on first frame
      videoB.pause();
      videoB.classList.remove('active');
      videoA.currentTime = 0;
      videoA.pause();
      videoA.classList.add('active');
      activeLayer = 'a';
      // Preload video 2 again for next cycle
      videoB.src = video2Src;
      videoB.load();
      break;

    case 'PLAYING_VIDEO_1':
      showIdle(false);
      showBadge('VIDEO 1 ▶', 'video1');
      // Video A is already loaded at frame 0 — just press play
      videoA.currentTime = 0;
      videoA.play().catch(e => console.error('[PLAYER] Play error:', e));
      videoA.classList.add('active');
      activeLayer = 'a';
      break;

    case 'WAITING_FOR_VIDEO_2':
      showBadge('WAITING ●', 'waiting');
      // video-b is already preloaded — just freeze video-a
      videoA.pause();
      break;

    case 'PLAYING_VIDEO_2':
      showBadge('VIDEO 2 ▶', 'video2');
      // Crossfade from A to B
      crossfadeTo('b', video2Src);
      break;

    case 'RESETTING':
      showBadge('RESETTING ↺', 'resetting');
      // Video 2 is already paused at end, show badge and wait
      break;
  }
}

// ─── Video Control ───────────────────────────
function playLayer(layer, src) {
  const el = layer === 'a' ? videoA : videoB;
  el.currentTime = 0;
  if (el.src !== src) {
    el.src = src;
    el.load();
  }
  el.play().catch(e => console.error('[PLAYER] Play error:', e));
  el.classList.add('active');
  activeLayer = layer;
}

function crossfadeTo(targetLayer, src) {
  const incoming = targetLayer === 'a' ? videoA : videoB;
  const outgoing = targetLayer === 'a' ? videoB : videoA;

  incoming.currentTime = 0;
  if (incoming.src !== `${src}`) {
    incoming.src = src;
    incoming.load();
  }

  incoming.play().catch(e => console.error('[PLAYER] Crossfade play error:', e));
  incoming.classList.add('active');

  // After transition duration, deactivate outgoing
  setTimeout(() => {
    outgoing.pause();
    outgoing.classList.remove('active');
    outgoing.currentTime = 0;
  }, 450);

  activeLayer = targetLayer;
}

function stopAll() {
  videoA.pause();
  videoB.pause();
  videoA.currentTime = 0;
  videoB.currentTime = 0;
  videoA.classList.remove('active');
  videoB.classList.remove('active');
}

// ─── Event: Video Ended ──────────────────────
function onActiveVideoEnded(e) {
  const which = e.target === videoA ? 'a' : 'b';
  if (which !== activeLayer) return; // ignore non-active layer

  if (activeLayer === 'a') {
    // Video 1 ended
    api.notifyVideo1Ended();
  } else {
    // Video 2 ended — pause on last frame
    videoB.pause();
    api.notifyVideo2Ended();
  }
}

// ─── UI Helpers ──────────────────────────────
function showIdle(show) {
  // Overlay is only used as a loading splash until first frame is ready
  if (show) {
    idleOverlay.classList.add('visible');
  } else {
    idleOverlay.classList.remove('visible');
  }
}

function showBadge(text, cls) {
  stateBadge.textContent = text;
  stateBadge.className = `show ${cls}`;
}

// ─── Boot ────────────────────────────────────
init();
