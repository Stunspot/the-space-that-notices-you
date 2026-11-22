/**
 * THE SPACE THAT NOTICES YOU — Main Orchestrator
 * Routes all discrete interactions, shortcuts, recording, audio, and surface
 * lifecycles through the single authoritative AppStateMachine (src/stateMachine.js),
 * keeps DOM + semantic data-* attributes deterministically synced, and exposes
 * the self-describing window.__SPACE_APP__ contract for inspection and agents.
 */

import { Choreography, SHOWCASE_DURATION } from './choreography.js';
import { RenderEngine } from './engine.js';
import { SoundEngine } from './audio.js';
import { createAppMachine } from './stateMachine.js';
import {
  GUIDE_FRAMING,
  PHASES,
  INTERACTION_MOTIFS,
  PRIMARY_SOURCES,
  getPhaseByProgress,
} from './guideData.js';

const rootEl = document.documentElement;
const stageShell = document.getElementById('stage-shell');
const viewportFrame = document.getElementById('viewport-frame');
const canvas = document.getElementById('scene-canvas');
const recBadge = document.getElementById('rec-badge');
const recTimer = document.getElementById('rec-timer');
const statusToast = document.getElementById('status-toast');

const phaseNumeralEl = document.getElementById('phase-numeral');
const phaseNameEl = document.getElementById('phase-name');
const stateWhisperEl = document.getElementById('state-whisper');
const gestureWhisperEl = document.getElementById('gesture-whisper');

const arcTrack = document.getElementById('arc-track');
const arcFill = document.getElementById('arc-fill');
const phasePips = Array.from(document.querySelectorAll('.phase-pip'));

const btnGuide = document.getElementById('btn-guide');
const btnCloseGuide = document.getElementById('btn-close-guide');
const btnAudio = document.getElementById('btn-audio');
const audioLabel = document.getElementById('audio-label');
const btnShowcase = document.getElementById('btn-showcase');
const showcaseLabel = document.getElementById('showcase-label');
const btnCaptureMode = document.getElementById('btn-capture-mode');
const btnExitCapture = document.getElementById('btn-exit-capture');
const captureBar = document.getElementById('capture-bar');
const btnSnapPng = document.getElementById('btn-snap-png');
const btnRecLoop = document.getElementById('btn-rec-loop');

const btnPause = document.getElementById('btn-pause');
const btnReturn = document.getElementById('btn-return');
const btnUnfold = document.getElementById('btn-unfold');
const sliderIntensity = document.getElementById('slider-intensity');
const btnStabilize = document.getElementById('btn-stabilize');
const btnReduced = document.getElementById('btn-reduced');
const aspectBtns = Array.from(document.querySelectorAll('.aspect-btn'));

const guideDrawer = document.getElementById('guide-drawer');
const guideDisclaimer = document.getElementById('guide-disclaimer');
const guideTabs = document.getElementById('guide-tabs');
const guideBody = document.getElementById('guide-body');
const guideInteractionList = document.getElementById('guide-interaction-list');
const guideSourcesList = document.getElementById('guide-sources-list');
const fallbackNotice = document.getElementById('fallback-notice');

// Initialize Core Subsystems
const choreo = new Choreography();
const engine = new RenderEngine(canvas);
const audio = new SoundEngine();

// Ephemeral handles owned strictly by effect execution (never duplicated as flags)
let hasInteracted = false;
let lastPhaseId = '';
let stopRecordingFn = null;
let recStartTime = 0;
let aspectResizeTimer = null;
let statusClearTimer = null;

function fadeGestureHint() {
  if (!hasInteracted) {
    hasInteracted = true;
    setTimeout(() => gestureWhisperEl.classList.add('faded'), 2200);
  }
}

function syncCanvasSize() {
  const rect = viewportFrame.getBoundingClientRect();
  engine.resize(rect.width, rect.height);
}

// =========================================================================
// AUTHORITATIVE DISCRETE STATE MACHINE & EFFECT EXECUTOR
// =========================================================================
const machine = createAppMachine(
  {
    supportsVideoCapture: engine.supportsVideoCapture(),
    supportsAudio: audio.isSupported(),
    reducedMotion: choreo.reducedMotion,
    renderer: engine.mode === 'webgl2' || engine.mode === 'canvas2d' ? engine.mode : 'initializing',
  },
  executeEffect
);

function executeEffect(effect, state) {
  switch (effect.type) {
    case 'SYNC_TRANSPORT':
      choreo.syncTransport(effect.transport);
      break;

    case 'START_RETURN':
      choreo.triggerReturn();
      break;

    case 'RESTART_SHOWCASE':
      choreo.restartShowcase();
      break;

    case 'JUMP_PHASE':
      choreo.jumpToPhase(effect.progress);
      break;

    case 'SCRUB_TO':
      choreo.scrubTo(effect.progress);
      break;

    case 'OPEN_GUIDE': {
      const current = getPhaseByProgress(choreo.uniforms.phaseProgress);
      renderGuidePhase(current.id);
      break;
    }

    case 'RENDER_GUIDE_PHASE':
      renderGuidePhase(effect.phaseId);
      break;

    case 'CAPTURE_PNG': {
      const tag = effect.aspect === 'portrait' ? '9x16' : effect.aspect === 'cinema' ? '16x9' : 'full';
      engine.capturePNG(`the-space-that-notices-you-${tag}.png`);
      break;
    }

    case 'START_RECORDING': {
      recStartTime = performance.now();
      stopRecordingFn = engine.startVideoCapture(
        SHOWCASE_DURATION * 1000,
        () => {
          stopRecordingFn = null;
          machine.dispatch({ type: 'RECORDING_COMPLETE' });
        },
        (msg) => {
          stopRecordingFn = null;
          machine.dispatch({ type: 'RECORDING_FAILED', message: msg });
        }
      );
      break;
    }

    case 'STOP_RECORDING': {
      const stop = stopRecordingFn;
      stopRecordingFn = null;
      if (stop) stop();
      break;
    }

    case 'BEGIN_HOLD':
      choreo.beginHold(effect.x, effect.y);
      break;

    case 'CANCEL_HOLD_ENTER_DRAG':
      choreo.cancelHold();
      choreo.isDraggingRelic = true;
      break;

    case 'CANCEL_HOLD_AND_DRAG':
      choreo.abortGesture();
      break;

    case 'END_HOLD_RELEASE':
      choreo.endHold();
      break;

    case 'END_DRAG_OR_PINCH':
      choreo.isDraggingRelic = false;
      break;

    case 'ABORT_GESTURE':
      choreo.abortGesture();
      resetLocalPointerTracking();
      break;

    case 'TOGGLE_RELIC_UNFOLD':
      choreo.toggleRelicUnfold();
      fadeGestureHint();
      break;

    case 'SET_AUDIO_ENABLED': {
      audio.setEnabled(effect.enabled).then((res) => {
        if (res.ok) {
          machine.dispatch({ type: 'AUDIO_SETTLED', enabled: res.enabled });
        } else {
          machine.dispatch({
            type: 'AUDIO_FAILED',
            unsupported: res.unsupported,
            message: res.message,
          });
        }
      });
      break;
    }

    case 'APPLY_ASPECT': {
      stageShell.classList.remove('aspect-full', 'aspect-cinema', 'aspect-portrait');
      stageShell.classList.add(`aspect-${effect.aspect}`);
      if (aspectResizeTimer !== null) clearTimeout(aspectResizeTimer);
      requestAnimationFrame(syncCanvasSize);
      aspectResizeTimer = setTimeout(() => {
        aspectResizeTimer = null;
        syncCanvasSize();
      }, 380);
      break;
    }

    case 'SET_INTENSITY':
      choreo.intensity = effect.value;
      break;

    case 'SET_STABILIZE':
      choreo.stabilizeCamera = effect.value;
      break;

    case 'SET_REDUCED_MOTION':
      choreo.reducedMotion = effect.value;
      break;
  }
}

// =========================================================================
// DETERMINISTIC UI & SEMANTIC DOM PROJECTION (Single Source of Truth)
// =========================================================================
function renderUI(state) {
  const isPaused = state.transport === 'journey_paused' || state.transport === 'showcase_paused';
  const isShowcase = state.transport === 'showcase_playing' || state.transport === 'showcase_paused';
  const isReturning = state.transport === 'returning';
  const recLocked = state.recording === 'recording' || state.recording === 'stopping';

  // Semantic data-* contract on <html> for human dev-tools & operating agents
  rootEl.dataset.transport = state.transport;
  rootEl.dataset.surface = state.surface;
  rootEl.dataset.recording = state.recording;
  rootEl.dataset.gesture = state.gesture;
  rootEl.dataset.audio = state.audio;
  rootEl.dataset.aspect = state.aspect;
  rootEl.dataset.renderer = state.renderer;

  // Surface: Interactive vs Guide vs Clean Capture
  const inCapture = state.surface === 'capture';
  const inGuide = state.surface === 'guide';
  document.body.classList.toggle('capture-mode', inCapture);
  captureBar.classList.toggle('hidden', !inCapture);
  guideDrawer.classList.toggle('hidden', !inGuide);
  btnGuide.setAttribute('aria-expanded', String(inGuide));
  btnGuide.classList.toggle('active', inGuide);
  btnGuide.disabled = inCapture;

  // Transport buttons
  btnPause.setAttribute('aria-pressed', String(isPaused));
  btnPause.textContent = isPaused ? 'Resume' : 'Pause';
  btnPause.disabled = recLocked;

  btnReturn.setAttribute('aria-pressed', String(isReturning));
  btnReturn.disabled = recLocked;

  btnShowcase.setAttribute('aria-pressed', String(isShowcase));
  showcaseLabel.textContent = isShowcase ? '18s Loop · On' : '18s Loop';
  btnShowcase.disabled = recLocked;

  phasePips.forEach((pip) => {
    pip.disabled = recLocked;
  });

  // Unfold Relic: clearly communicate when Showcase Loop owns Relic unfolding
  btnUnfold.disabled = isShowcase;
  btnUnfold.title = isShowcase
    ? 'Choreographed during 18s Loop — exit loop to control manually'
    : 'Unfold / invert the Impossible Relic (U)';

  // Aspect controls
  aspectBtns.forEach((b) => {
    b.classList.toggle('active', b.dataset.aspect === state.aspect);
    b.disabled = recLocked;
  });

  // Comfort toggles & slider
  btnStabilize.setAttribute('aria-pressed', String(state.stabilizeCamera));
  btnReduced.setAttribute('aria-pressed', String(state.reducedMotion));
  if (parseFloat(sliderIntensity.value) !== state.intensity) {
    sliderIntensity.value = String(state.intensity);
  }

  // Audio button
  btnAudio.setAttribute('aria-pressed', String(state.audio === 'on'));
  btnAudio.disabled = state.audio === 'starting' || state.audio === 'unsupported';
  audioLabel.textContent =
    state.audio === 'starting'
      ? 'Starting…'
      : state.audio === 'on'
        ? 'Sound On'
        : state.audio === 'unsupported'
          ? 'Audio N/A'
          : 'Sound Off';

  // Recording indicator & button
  const showRecBadge = state.recording === 'recording' || state.recording === 'stopping';
  recBadge.classList.toggle('hidden', !showRecBadge);
  btnRecLoop.classList.toggle('recording', state.recording === 'recording');
  btnRecLoop.disabled = state.recording === 'stopping' || state.renderer === 'context_lost';
  btnRecLoop.textContent =
    state.recording === 'recording'
      ? 'Stop Rec'
      : state.recording === 'stopping'
        ? 'Saving…'
        : state.recording === 'unsupported'
          ? 'Rec N/A'
          : 'Rec 18s Loop';
  btnSnapPng.disabled = state.renderer === 'context_lost';

  // Canvas drag cursor
  canvas.classList.toggle('dragging', state.gesture === 'dragging_relic');

  // Renderer fallback banner
  fallbackNotice.classList.toggle('hidden', state.renderer !== 'canvas2d');

  // Non-blocking status toast (auto-clears transient messages, stays visible during active recording/context loss)
  if (statusClearTimer !== null) {
    clearTimeout(statusClearTimer);
    statusClearTimer = null;
  }
  if (state.statusMessage) {
    statusToast.textContent = state.statusMessage;
    statusToast.classList.remove('hidden');
    const persistent =
      state.recording === 'recording' ||
      state.recording === 'stopping' ||
      state.renderer === 'context_lost' ||
      state.transport === 'returning';
    if (!persistent) {
      statusClearTimer = setTimeout(() => {
        statusClearTimer = null;
        machine.dispatch({ type: 'CLEAR_STATUS' });
      }, 3600);
    }
  } else {
    statusToast.classList.add('hidden');
  }
}

machine.subscribe((state) => renderUI(state));

// Wire subsystem callbacks into the state machine
choreo.onFoldRelease = (strength) => {
  audio.triggerFoldRelease(strength);
  fadeGestureHint();
};

choreo.onRelicMove = (vel) => {
  audio.triggerRelicChime(vel);
  fadeGestureHint();
};

choreo.onReturnComplete = () => {
  machine.dispatch({ type: 'RETURN_COMPLETE' });
};

engine.onContextLost = () => {
  machine.dispatch({ type: 'RENDERER_CONTEXT_LOST' });
};

engine.onContextRestored = (mode) => {
  machine.dispatch({ type: 'RENDERER_CONTEXT_RESTORED', mode });
};

// =========================================================================
// VIEWPORT RESIZING
// =========================================================================
const resizeObserver = new ResizeObserver(() => syncCanvasSize());
resizeObserver.observe(viewportFrame);
window.addEventListener('resize', syncCanvasSize);
syncCanvasSize();

// =========================================================================
// "WHAT AM I SEEING?" PERIPHERAL DISCOVERY DRAWER
// =========================================================================
guideDisclaimer.textContent = GUIDE_FRAMING.disclaimer;

function initGuideStatic() {
  guideTabs.innerHTML = '';
  PHASES.forEach((p) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'guide-tab';
    tab.dataset.phaseId = p.id;
    tab.setAttribute('role', 'tab');
    tab.textContent = `${p.numeral}. ${p.shortLabel}`;
    tab.addEventListener('click', () => {
      machine.dispatch({ type: 'SELECT_GUIDE_TAB', phaseId: p.id });
    });
    guideTabs.appendChild(tab);
  });

  guideInteractionList.innerHTML = INTERACTION_MOTIFS.map(
    (m) => `<div class="interaction-item"><strong>${m.title}:</strong> ${m.desc}</div>`
  ).join('');
}

function renderGuidePhase(phaseId) {
  const phase = PHASES.find((p) => p.id === phaseId) || PHASES[0];
  Array.from(guideTabs.children).forEach((el) => {
    el.classList.toggle('active', el.dataset.phaseId === phase.id);
  });

  guideBody.innerHTML = `
    <div class="guide-phase-head">
      <h3 class="guide-phase-title">${phase.numeral}. ${phase.name}</h3>
      <button type="button" class="guide-jump-btn" id="guide-jump-here">Visit stage</button>
    </div>
    <div class="guide-card">
      <span class="badge badge-reported">Reported Motif</span>
      <p>${phase.reported}</p>
    </div>
    <div class="guide-card">
      <span class="badge badge-invention">Artistic Invention</span>
      <p>${phase.invention}</p>
    </div>
    <div class="guide-card">
      <span class="badge badge-unresolved">Unresolved Interpretation</span>
      <p>${phase.unresolved}</p>
    </div>
  `;

  const jumpBtn = document.getElementById('guide-jump-here');
  if (jumpBtn) {
    jumpBtn.addEventListener('click', () => {
      const mid = (phase.range[0] + phase.range[1]) * 0.5;
      machine.dispatch({ type: 'JUMP_PHASE', progress: mid });
    });
  }

  guideSourcesList.innerHTML = phase.sources
    .map((key) => PRIMARY_SOURCES[key])
    .filter(Boolean)
    .map(
      (s) =>
        `<li>${s.citation} <em>${s.journal}</em> <a href="${s.url}" target="_blank" rel="noopener noreferrer">DOI ↗</a></li>`
    )
    .join('');
}

initGuideStatic();

// =========================================================================
// BUTTON & CONTROL BINDINGS (All routed through AppStateMachine)
// =========================================================================
btnGuide.addEventListener('click', () => machine.dispatch({ type: 'TOGGLE_GUIDE' }));
btnCloseGuide.addEventListener('click', () => machine.dispatch({ type: 'CLOSE_GUIDE' }));
btnCaptureMode.addEventListener('click', () => machine.dispatch({ type: 'ENTER_CAPTURE' }));
btnExitCapture.addEventListener('click', () => machine.dispatch({ type: 'EXIT_CAPTURE' }));
btnSnapPng.addEventListener('click', () => machine.dispatch({ type: 'CAPTURE_PNG' }));
btnRecLoop.addEventListener('click', () => {
  const st = machine.getState();
  if (st.recording === 'recording') {
    machine.dispatch({ type: 'STOP_RECORDING' });
  } else {
    machine.dispatch({ type: 'START_RECORDING' });
  }
});

btnShowcase.addEventListener('click', () => machine.dispatch({ type: 'TOGGLE_SHOWCASE' }));
btnAudio.addEventListener('click', () => machine.dispatch({ type: 'TOGGLE_AUDIO' }));
btnPause.addEventListener('click', () => machine.dispatch({ type: 'TOGGLE_PAUSE' }));
btnReturn.addEventListener('click', () => machine.dispatch({ type: 'TRIGGER_RETURN' }));
btnUnfold.addEventListener('click', () => machine.dispatch({ type: 'TOGGLE_RELIC_UNFOLD' }));
btnStabilize.addEventListener('click', () => machine.dispatch({ type: 'TOGGLE_STABILIZE' }));
btnReduced.addEventListener('click', () => machine.dispatch({ type: 'TOGGLE_REDUCED_MOTION' }));

sliderIntensity.addEventListener('input', (e) => {
  machine.dispatch({ type: 'SET_INTENSITY', value: parseFloat(e.target.value) });
});

aspectBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    machine.dispatch({ type: 'SET_ASPECT', aspect: btn.dataset.aspect });
  });
});

phasePips.forEach((pip) => {
  pip.addEventListener('click', () => {
    machine.dispatch({ type: 'JUMP_PHASE', progress: parseFloat(pip.dataset.phase) });
  });
});

// Scrubbable Timeline
function progressFromTrackEvent(e) {
  const rect = arcTrack.getBoundingClientRect();
  return Math.max(0, Math.min(0.999, (e.clientX - rect.left) / Math.max(1, rect.width)));
}

arcTrack.addEventListener('pointerdown', (e) => {
  const res = machine.dispatch({ type: 'SCRUB_START', progress: progressFromTrackEvent(e) });
  if (res.accepted) {
    arcTrack.setPointerCapture(e.pointerId);
  }
});
arcTrack.addEventListener('pointermove', (e) => {
  if (machine.getState().scrubbing) {
    machine.dispatch({ type: 'SCRUB_MOVE', progress: progressFromTrackEvent(e) });
  }
});
arcTrack.addEventListener('pointerup', () => machine.dispatch({ type: 'SCRUB_END' }));
arcTrack.addEventListener('pointercancel', () => machine.dispatch({ type: 'SCRUB_END' }));

// =========================================================================
// DIRECT CANVAS GESTURE INTERACTION (Arbitrated via AppStateMachine)
// =========================================================================
const activePointers = new Map();
let primaryId = null;
let lastPos = [0, 0];
let movedDist = 0;
let lastPinchDist = 0;

function resetLocalPointerTracking() {
  activePointers.clear();
  primaryId = null;
  movedDist = 0;
  lastPinchDist = 0;
}

function toNDC(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
  const y = -(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
  return [x, y];
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  canvas.setPointerCapture(e.pointerId);
  activePointers.set(e.pointerId, [e.clientX, e.clientY]);

  if (activePointers.size === 1) {
    primaryId = e.pointerId;
    lastPos = [e.clientX, e.clientY];
    movedDist = 0;
    const [nx, ny] = toNDC(e.clientX, e.clientY);
    choreo.updatePointer(nx, ny);
    machine.dispatch({ type: 'GESTURE_HOLD_START', source: 'pointer', x: nx, y: ny });
  } else if (activePointers.size === 2) {
    const pts = Array.from(activePointers.values());
    lastPinchDist = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
    machine.dispatch({ type: 'GESTURE_PINCH_START' });
  }
});

canvas.addEventListener('pointermove', (e) => {
  const [nx, ny] = toNDC(e.clientX, e.clientY);
  choreo.updatePointer(nx, ny);

  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, [e.clientX, e.clientY]);

  const gState = machine.getState().gesture;
  if (gState === 'pinching' && activePointers.size >= 2) {
    const pts = Array.from(activePointers.values());
    const dist = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
    if (lastPinchDist > 0) {
      choreo.adjustRelicUnfold((dist - lastPinchDist) * 0.0045);
    }
    lastPinchDist = dist;
    return;
  }

  if (e.pointerId === primaryId && (gState === 'holding_pointer' || gState === 'dragging_relic')) {
    const dxPx = e.clientX - lastPos[0];
    const dyPx = e.clientY - lastPos[1];
    movedDist += Math.hypot(dxPx, dyPx);
    lastPos = [e.clientX, e.clientY];

    if (movedDist > 9) {
      if (gState === 'holding_pointer') {
        machine.dispatch({ type: 'GESTURE_PROMOTE_DRAG' });
      }
      const rect = canvas.getBoundingClientRect();
      choreo.dragRelic(dxPx / Math.max(1, rect.width), dyPx / Math.max(1, rect.height));
    } else {
      choreo.updateHoldOrigin(nx, ny);
    }
  }
});

function releasePointer(e) {
  const wasCancel = e.type === 'pointercancel';
  activePointers.delete(e.pointerId);

  const gState = machine.getState().gesture;
  if (gState === 'pinching') {
    if (activePointers.size < 2) {
      lastPinchDist = 0;
      primaryId = null;
      machine.dispatch({ type: 'GESTURE_END', source: 'pinch', abort: wasCancel });
    }
    return;
  }

  if (e.pointerId === primaryId) {
    primaryId = null;
    movedDist = 0;
    machine.dispatch({ type: 'GESTURE_END', source: 'pointer', abort: wasCancel });
  }
}

canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('pointerleave', () => {
  if (activePointers.size === 0) choreo.pointerLeave();
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const st = machine.getState();
    if (st.transport === 'showcase_playing' || st.transport === 'showcase_paused') return;
    choreo.adjustRelicUnfold(-e.deltaY * 0.00075);
    fadeGestureHint();
  },
  { passive: false }
);

canvas.addEventListener('dblclick', () => {
  machine.dispatch({ type: 'TOGGLE_RELIC_UNFOLD' });
});

// Prevent stuck Space/pointer holds when tab loses focus or switches away
window.addEventListener('blur', () => {
  if (machine.getState().gesture !== 'idle') {
    machine.dispatch({ type: 'GESTURE_END', source: 'blur', abort: true });
  }
  if (machine.getState().scrubbing) {
    machine.dispatch({ type: 'SCRUB_END' });
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && machine.getState().gesture !== 'idle') {
    machine.dispatch({ type: 'GESTURE_END', source: 'blur', abort: true });
  }
});

// =========================================================================
// KEYBOARD ACCESSIBILITY & SHORTCUTS (Same guarded transitions as buttons)
// =========================================================================
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) {
      machine.dispatch({
        type: 'GESTURE_HOLD_START',
        source: 'space',
        x: choreo.smoothGaze[0],
        y: choreo.smoothGaze[1],
      });
    }
    return;
  }

  const key = e.key.toLowerCase();
  if (key === 'escape') {
    machine.dispatch({ type: 'ESCAPE' });
  } else if (key === 'p') {
    machine.dispatch({ type: 'TOGGLE_PAUSE' });
  } else if (key === 'r') {
    machine.dispatch({ type: 'TRIGGER_RETURN' });
  } else if (key === 'u') {
    machine.dispatch({ type: 'TOGGLE_RELIC_UNFOLD' });
  } else if (key === 'l') {
    machine.dispatch({ type: 'TOGGLE_SHOWCASE' });
  } else if (key === 'c') {
    machine.dispatch({ type: 'TOGGLE_CAPTURE' });
  } else if (key === 's') {
    machine.dispatch({ type: 'CAPTURE_PNG' });
  } else if (key === 'a') {
    machine.dispatch({ type: 'TOGGLE_AUDIO' });
  } else if (key === 'm') {
    machine.dispatch({ type: 'TOGGLE_REDUCED_MOTION' });
  } else if (key === 'k') {
    machine.dispatch({ type: 'TOGGLE_STABILIZE' });
  } else if (key === '?' || key === 'i') {
    machine.dispatch({ type: 'TOGGLE_GUIDE' });
  } else if (key >= '1' && key <= '5') {
    const idx = parseInt(key, 10) - 1;
    const target = PHASES[idx];
    if (target) {
      machine.dispatch({
        type: 'JUMP_PHASE',
        progress: (target.range[0] + target.range[1]) * 0.5,
      });
    }
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    machine.dispatch({ type: 'GESTURE_END', source: 'space' });
  }
});

// =========================================================================
// SELF-DESCRIBING AGENT & DEVELOPER RUNTIME CONTRACT
// =========================================================================
window.__SPACE_APP__ = Object.freeze({
  getState() {
    const s = machine.getState();
    const u = choreo.uniforms;
    const phase = getPhaseByProgress(u.phaseProgress);
    return {
      ...s,
      derived: {
        phaseId: phase.id,
        phaseNumeral: phase.numeral,
        phaseName: phase.name,
        phaseProgress: Number(u.phaseProgress.toFixed(4)),
        showcaseTime: Number(choreo.showcaseTime.toFixed(2)),
        attention: Number(u.attention.toFixed(3)),
        stillness: Number(u.stillness.toFixed(3)),
        relicUnfold: Number(u.relicUnfold.toFixed(3)),
        utteranceCount: u.utteranceCount,
        fpsEma: Math.round(engine.fpsEma),
        renderQuality: Number(engine.quality.toFixed(2)),
      },
      invariantsOk: machine.checkInvariants().length === 0,
    };
  },
  getAvailableActions() {
    return machine.getAvailableActions();
  },
  checkInvariants() {
    return machine.checkInvariants();
  },
  dispatch(event) {
    return machine.dispatch(event);
  },
  subscribe(fn) {
    return machine.subscribe(fn);
  },
});

// Initial deterministic render of all UI & data-* attributes
renderUI(machine.getState());

// =========================================================================
// MAIN ANIMATION LOOP (Continuous dynamics + derived HUD projection)
// =========================================================================
let prevNow = performance.now();

function tick(now) {
  const dtMs = now - prevNow;
  prevNow = now;
  const dt = dtMs * 0.001;

  const u = choreo.step(dt);
  engine.render(u, dtMs);
  audio.update(u);

  const st = machine.getState();

  // Sync continuous progress & phase readout
  arcFill.style.width = `${(u.phaseProgress * 100).toFixed(2)}%`;

  const currentPhase = getPhaseByProgress(u.phaseProgress);
  if (currentPhase.id !== lastPhaseId) {
    lastPhaseId = currentPhase.id;
    rootEl.dataset.phase = currentPhase.id;
    phaseNumeralEl.textContent = currentPhase.numeral;
    phaseNameEl.textContent = currentPhase.name;
    phasePips.forEach((pip, idx) => {
      pip.classList.toggle('active', PHASES[idx].id === currentPhase.id);
    });
    if (st.surface === 'guide' && !st.guideManualTabId) {
      renderGuidePhase(currentPhase.id);
    }
  }

  // Diegetic state whisper
  if (st.transport === 'returning') {
    stateWhisperEl.textContent = '· Returning';
  } else if (u.holdCharge > 0.12) {
    stateWhisperEl.textContent = '· Gathering Fold';
  } else if (u.pulseStrength > 0.15) {
    stateWhisperEl.textContent = '· Architectural Utterance';
  } else if (u.attention > 0.55) {
    stateWhisperEl.textContent = '· Attention Returned';
  } else if (u.stillness > 0.55) {
    stateWhisperEl.textContent = '· Stillness Layer';
  } else if (u.relicUnfold > 0.65) {
    stateWhisperEl.textContent = '· Nested Interior Open';
  } else if (st.transport === 'showcase_playing' || st.transport === 'showcase_paused') {
    const suffix = st.transport === 'showcase_paused' ? ' (Paused)' : '';
    stateWhisperEl.textContent = `· Loop ${choreo.showcaseTime.toFixed(1)}s / ${SHOWCASE_DURATION.toFixed(0)}s${suffix}`;
  } else if (st.transport === 'journey_paused') {
    stateWhisperEl.textContent = '· Paused';
  } else {
    stateWhisperEl.textContent = '';
  }

  // Unfold button reflects user manual target outside showcase
  const inShowcase = st.transport === 'showcase_playing' || st.transport === 'showcase_paused';
  btnUnfold.setAttribute('aria-pressed', String(!inShowcase && choreo.relicUnfoldTarget > 0.5));

  // Recording countdown timer
  if (st.recording === 'recording') {
    const elapsed = Math.min(SHOWCASE_DURATION, (now - recStartTime) * 0.001);
    recTimer.textContent = `REC ${elapsed.toFixed(1)} / ${SHOWCASE_DURATION.toFixed(1)}s`;
  } else if (st.recording === 'stopping') {
    recTimer.textContent = 'SAVING…';
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
