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
    showIdle(false);
  }, { once: true });

  // Wire up ended events
  videoA.addEventListener('ended', onActiveVideoEnded);
  videoB.addEventListener('ended', onActiveVideoEnded);

  // Listen for state from main
  api.onStateUpdate(handleStateUpdate);

  showBadge('IDLE', 'idle');
  showIdle(true);
}

// ─── State Handler ───────────────────────────
function handleStateUpdate({ state }) {
  console.log('[PLAYER] State:', state);

  switch (state) {

    case 'IDLE':
      showBadge('IDLE', 'idle');
      showIdle(false);
      // videoA was pre-seeked to frame 0 the moment video 2 ended.
      // Keep videoB opaque underneath while we snap videoA in.
      videoB.pause();
      videoB.classList.add('leaving');
      videoB.classList.remove('active');
      activeLayer = 'a';

      const revealVideoA = () => {
        // Snap in instantly — no opacity fade that would expose the black background.
        videoA.style.transition = 'none';
        videoA.classList.add('active');
        // Two rAF cycles flush the style override to the compositor before
        // re-enabling transitions for normal use.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          videoA.style.transition = '';
        }));
        // Keep videoB as an opaque backdrop until videoA is fully painted.
        setTimeout(() => {
          videoB.classList.remove('leaving');
          // Re-preload video 2 for next cycle
          videoB.src = video2Src;
          videoB.load();
        }, 500);
      };

      // If the pre-seek from onActiveVideoEnded already finished, reveal instantly.
      // Otherwise fall back to waiting for the seeked event.
      if (videoA.readyState >= 2 && Math.abs(videoA.currentTime) < 0.1) {
        revealVideoA();
      } else {
        videoA.pause();
        videoA.currentTime = 0;
        videoA.addEventListener('seeked', revealVideoA, { once: true });
      }
      break;

    case 'PLAYING_VIDEO_1':
      showIdle(false);
      showBadge('VIDEO 1 ▶', 'video1');
      videoA.currentTime = 0;
      videoA.classList.add('active');
      videoA.play().catch(e => console.error('[PLAYER] Play error:', e));
      activeLayer = 'a';
      break;

    case 'WAITING_FOR_VIDEO_2':
      showBadge('WAITING ●', 'waiting');
      // Video 1 just ended — it's frozen on its last frame naturally.
      // Now decode + show video 2's first frame so it's already visible
      // when the play command arrives. No black flash possible.
      showVideo2FirstFrame();
      break;

    case 'PLAYING_VIDEO_2':
      showBadge('VIDEO 2 ▶', 'video2');
      // Video 2 is already on screen at frame 0 — just start playing.
      videoB.play().catch(e => console.error('[PLAYER] Play error:', e));
      break;

    case 'RESETTING':
      showBadge('RESETTING ↺', 'resetting');
      // Video 2 is paused at its last frame; wait for main to send IDLE
      break;
  }
}

// ─── Show Video 2 First Frame (frozen) ───────
// Called during WAITING_FOR_VIDEO_2.
// Seeks videoB to t=0, waits for the frame to be decoded,
// then instantly swaps it in on top of videoA's last frame.
function showVideo2FirstFrame() {
  // Ensure videoB is loaded and at position 0
  if (videoB.src !== video2Src) {
    videoB.src = video2Src;
    videoB.load();
  }
  videoB.pause();
  videoB.currentTime = 0;

  const swap = () => {
    // Keep videoA fully visible underneath during the instant swap
    videoA.classList.add('leaving');
    videoA.classList.remove('active');
    // Show videoB (first frame, still paused)
    videoB.classList.add('active');
    activeLayer = 'b';
    // Clean up videoA after CSS transition finishes
    setTimeout(() => {
      videoA.classList.remove('leaving');
      videoA.pause();
    }, 450);
  };

  if (videoB.readyState >= 2) {
    // Frame data already available — seeked event confirms decode is done
    videoB.addEventListener('seeked', swap, { once: true });
  } else {
    // Not ready yet — wait for canplay, then seek
    videoB.addEventListener('canplay', () => {
      videoB.addEventListener('seeked', swap, { once: true });
      videoB.currentTime = 0;
    }, { once: true });
  }
}

// ─── Video Control Helpers ────────────────────
function stopAll() {
  videoA.pause();
  videoB.pause();
  videoA.currentTime = 0;
  videoB.currentTime = 0;
  videoA.classList.remove('active', 'leaving');
  videoB.classList.remove('active', 'leaving');
}

// ─── Event: Video Ended ──────────────────────
function onActiveVideoEnded(e) {
  const which = e.target === videoA ? 'a' : 'b';
  if (which !== activeLayer) return; // ignore non-active layer

  if (activeLayer === 'a') {
    // Video 1 ended — notify main (main will send WAITING_FOR_VIDEO_2)
    api.notifyVideo1Ended();
  } else {
    // Video 2 ended — freeze on last frame, notify main.
    // Immediately pre-seek videoA to frame 0 in the background while videoB
    // is still visible, so IDLE can snap it in instantly with no black gap.
    videoB.pause();
    videoA.pause();
    videoA.currentTime = 0;
    api.notifyVideo2Ended();
  }
}

// ─── UI Helpers ──────────────────────────────
function showIdle(show) {
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
