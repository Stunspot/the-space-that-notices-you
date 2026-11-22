/**
 * Explicit State Model for THE SPACE THAT NOTICES YOU
 *
 * Centralizes ownership of the app's coupled discrete lifecycles while leaving
 * continuous dynamical systems (attention/stillness springs, Relic quaternion
 * inertia, adaptive FPS quality EMA) in their dedicated modules.
 *
 * Orthogonal & Coupled Dimensions:
 *  1. transport : 'journey_playing' | 'journey_paused' | 'returning'
 *               | 'showcase_playing' | 'showcase_paused'
 *  2. surface   : 'interactive' | 'guide' | 'capture'   (mutually exclusive)
 *  3. recording : 'idle' | 'recording' | 'stopping' | 'unsupported' | 'error'
 *  4. gesture   : 'idle' | 'holding_pointer' | 'dragging_relic' | 'pinching' | 'holding_space'
 *  5. audio     : 'off' | 'starting' | 'on' | 'unsupported' | 'error'
 *  6. aspect    : 'full' | 'cinema' | 'portrait'
 *  7. renderer  : 'initializing' | 'webgl2' | 'canvas2d' | 'context_lost'
 *
 * Pure & DOM-free: directly unit-testable in Node and inspectable by agents.
 */

export const TRANSPORT_STATES = Object.freeze([
  'journey_playing',
  'journey_paused',
  'returning',
  'showcase_playing',
  'showcase_paused',
]);

export const SURFACE_STATES = Object.freeze([
  'interactive',
  'guide',
  'capture',
]);

export const RECORDING_STATES = Object.freeze([
  'idle',
  'recording',
  'stopping',
  'unsupported',
  'error',
]);

export const GESTURE_STATES = Object.freeze([
  'idle',
  'holding_pointer',
  'dragging_relic',
  'pinching',
  'holding_space',
]);

export const AUDIO_STATES = Object.freeze([
  'off',
  'starting',
  'on',
  'unsupported',
  'error',
]);

export const ASPECT_MODES = Object.freeze([
  'full',
  'cinema',
  'portrait',
]);

export const RENDERER_STATES = Object.freeze([
  'initializing',
  'webgl2',
  'canvas2d',
  'context_lost',
]);

/**
 * Verify all cross-machine invariants. Returns an array of violation strings
 * (empty array means every invariant holds).
 */
export function checkInvariants(state) {
  const violations = [];

  if (!TRANSPORT_STATES.includes(state.transport)) {
    violations.push(`Invalid transport state: ${state.transport}`);
  }
  if (!SURFACE_STATES.includes(state.surface)) {
    violations.push(`Invalid surface state: ${state.surface}`);
  }
  if (!RECORDING_STATES.includes(state.recording)) {
    violations.push(`Invalid recording state: ${state.recording}`);
  }
  if (!GESTURE_STATES.includes(state.gesture)) {
    violations.push(`Invalid gesture state: ${state.gesture}`);
  }
  if (!AUDIO_STATES.includes(state.audio)) {
    violations.push(`Invalid audio state: ${state.audio}`);
  }
  if (!ASPECT_MODES.includes(state.aspect)) {
    violations.push(`Invalid aspect mode: ${state.aspect}`);
  }
  if (!RENDERER_STATES.includes(state.renderer)) {
    violations.push(`Invalid renderer state: ${state.renderer}`);
  }

  // Invariant 1: Recording can only be active during showcase_playing in capture surface
  if (state.recording === 'recording') {
    if (state.transport !== 'showcase_playing') {
      violations.push(`Recording active while transport is ${state.transport} (expected showcase_playing)`);
    }
    if (state.surface !== 'capture') {
      violations.push(`Recording active while surface is ${state.surface} (expected capture)`);
    }
  }

  // Invariant 2: Guide manual tab only meaningful while guide surface is open
  if (state.surface !== 'guide' && state.guideManualTabId !== null) {
    violations.push(`guideManualTabId (${state.guideManualTabId}) set while surface is ${state.surface}`);
  }

  // Invariant 3: Scrubbing timeline cannot coexist with active canvas gesture or recording
  if (state.scrubbing && state.gesture !== 'idle') {
    violations.push(`scrubbing true while gesture is ${state.gesture}`);
  }
  if (state.scrubbing && state.recording === 'recording') {
    violations.push('scrubbing true while recording is active');
  }

  // Invariant 4: Active audio transition serializes via 'starting'
  if (state.audio === 'starting' && state.audioTarget === null) {
    violations.push('audio is starting without an audioTarget');
  }

  return violations;
}

export function createInitialState(overrides = {}) {
  return {
    transport: 'journey_playing',
    surface: 'interactive',
    recording: overrides.supportsVideoCapture === false ? 'unsupported' : 'idle',
    gesture: 'idle',
    audio: overrides.supportsAudio === false ? 'unsupported' : 'off',
    audioTarget: null,
    aspect: 'full',
    renderer: overrides.renderer || 'initializing',
    guideManualTabId: null,
    scrubbing: false,
    reducedMotion: Boolean(overrides.reducedMotion),
    stabilizeCamera: false,
    intensity: 0.80,
    statusMessage: null,
    lastError: null,
    transitionSeq: 0,
  };
}

/**
 * Pure transition function: (state, event) -> { accepted, reason, state, effects }
 * Every effect is returned as a declarative descriptor so callers can execute
 * side effects cleanly and tests can verify exact side-effect sequences.
 */
export function transition(state, event) {
  if (!event || typeof event.type !== 'string') {
    return reject(state, 'INVALID_EVENT', 'Event must be an object with a string type.');
  }

  const next = { ...state };
  const effects = [];
  const isRecording = state.recording === 'recording' || state.recording === 'stopping';

  switch (event.type) {
    // -----------------------------------------------------------------------
    // M1: TRANSPORT (Journey / Pause / Return / Showcase / Scrub)
    // -----------------------------------------------------------------------
    case 'TOGGLE_PAUSE': {
      if (isRecording) {
        return reject(state, 'RECORDING_ACTIVE', 'Stop recording before pausing playback.');
      }
      if (state.transport === 'journey_playing' || state.transport === 'returning') {
        next.transport = 'journey_paused';
        effects.push({ type: 'SYNC_TRANSPORT', transport: next.transport });
      } else if (state.transport === 'journey_paused') {
        next.transport = 'journey_playing';
        effects.push({ type: 'SYNC_TRANSPORT', transport: next.transport });
      } else if (state.transport === 'showcase_playing') {
        next.transport = 'showcase_paused';
        effects.push({ type: 'SYNC_TRANSPORT', transport: next.transport });
      } else if (state.transport === 'showcase_paused') {
        next.transport = 'showcase_playing';
        effects.push({ type: 'SYNC_TRANSPORT', transport: next.transport });
      }
      return accept(state, next, effects);
    }

    case 'TRIGGER_RETURN': {
      if (isRecording) {
        return reject(state, 'RECORDING_ACTIVE', 'Stop recording before returning to threshold.');
      }
      // Always unpauses cleanly and exits showcase so Return visibly acts immediately
      next.transport = 'returning';
      next.statusMessage = 'Returning to the opening threshold…';
      effects.push({ type: 'START_RETURN' });
      effects.push({ type: 'SYNC_TRANSPORT', transport: next.transport });
      return accept(state, next, effects);
    }

    case 'RETURN_COMPLETE': {
      if (state.transport !== 'returning') {
        return reject(state, 'NOT_RETURNING', 'Return completion ignored outside returning state.');
      }
      next.transport = 'journey_playing';
      if (next.statusMessage === 'Returning to the opening threshold…') {
        next.statusMessage = null;
      }
      effects.push({ type: 'SYNC_TRANSPORT', transport: next.transport });
      return accept(state, next, effects);
    }

    case 'TOGGLE_SHOWCASE': {
      if (isRecording) {
        return reject(state, 'RECORDING_ACTIVE', 'Stop recording before exiting 18s Loop.');
      }
      if (state.transport === 'showcase_playing' || state.transport === 'showcase_paused') {
        next.transport = 'journey_playing';
        effects.push({ type: 'SYNC_TRANSPORT', transport: next.transport });
      } else {
        next.transport = 'showcase_playing';
        effects.push({ type: 'RESTART_SHOWCASE' });
        effects.push({ type: 'SYNC_TRANSPORT', transport: next.transport });
      }
      return accept(state, next, effects);
    }

    case 'JUMP_PHASE': {
      if (isRecording) {
        return reject(state, 'RECORDING_ACTIVE', 'Stop recording before jumping phases.');
      }
      const progress = typeof event.progress === 'number'
        ? Math.max(0, Math.min(0.999, event.progress))
        : null;
      if (progress === null || Number.isNaN(progress)) {
        return reject(state, 'INVALID_PROGRESS', 'JUMP_PHASE requires numeric progress in [0, 1).');
      }
      // Jumping from showcase or returning enters journey; preserves pause only if already journey_paused
      next.transport = state.transport === 'journey_paused' ? 'journey_paused' : 'journey_playing';
      effects.push({ type: 'JUMP_PHASE', progress });
      effects.push({ type: 'SYNC_TRANSPORT', transport: next.transport });
      return accept(state, next, effects);
    }

    case 'SCRUB_START': {
      if (isRecording) {
        return reject(state, 'RECORDING_ACTIVE', 'Stop recording before scrubbing the timeline.');
      }
      if (state.gesture !== 'idle') {
        next.gesture = 'idle';
        effects.push({ type: 'ABORT_GESTURE' });
      }
      next.scrubbing = true;
      if (state.transport === 'returning') {
        next.transport = 'journey_playing';
        effects.push({ type: 'SYNC_TRANSPORT', transport: next.transport });
      }
      if (typeof event.progress === 'number' && !Number.isNaN(event.progress)) {
        effects.push({ type: 'SCRUB_TO', progress: Math.max(0, Math.min(0.999, event.progress)) });
      }
      return accept(state, next, effects);
    }

    case 'SCRUB_MOVE': {
      if (!state.scrubbing) {
        return reject(state, 'NOT_SCRUBBING', 'SCRUB_MOVE ignored while not scrubbing.');
      }
      if (typeof event.progress !== 'number' || Number.isNaN(event.progress)) {
        return reject(state, 'INVALID_PROGRESS', 'SCRUB_MOVE requires numeric progress.');
      }
      effects.push({ type: 'SCRUB_TO', progress: Math.max(0, Math.min(0.999, event.progress)) });
      return accept(state, next, effects);
    }

    case 'SCRUB_END': {
      if (!state.scrubbing) {
        return reject(state, 'NOT_SCRUBBING', 'Already not scrubbing.');
      }
      next.scrubbing = false;
      return accept(state, next, effects);
    }

    // -----------------------------------------------------------------------
    // M2: SURFACE (Interactive / Guide / Capture) & RECORDING
    // -----------------------------------------------------------------------
    case 'OPEN_GUIDE': {
      if (state.surface === 'capture') {
        return reject(state, 'IN_CAPTURE_MODE', 'Exit Clean Capture Mode before opening the guide.');
      }
      if (state.surface === 'guide') {
        return reject(state, 'ALREADY_OPEN', 'Guide is already open.');
      }
      next.surface = 'guide';
      next.guideManualTabId = null;
      effects.push({ type: 'OPEN_GUIDE' });
      return accept(state, next, effects);
    }

    case 'CLOSE_GUIDE': {
      if (state.surface !== 'guide') {
        return reject(state, 'GUIDE_NOT_OPEN', 'Guide is not open.');
      }
      next.surface = 'interactive';
      next.guideManualTabId = null;
      return accept(state, next, effects);
    }

    case 'TOGGLE_GUIDE': {
      if (state.surface === 'guide') {
        return transition(state, { type: 'CLOSE_GUIDE' });
      }
      return transition(state, { type: 'OPEN_GUIDE' });
    }

    case 'SELECT_GUIDE_TAB': {
      if (state.surface !== 'guide') {
        return reject(state, 'GUIDE_NOT_OPEN', 'Cannot select a guide tab while guide is closed.');
      }
      if (typeof event.phaseId !== 'string' || !event.phaseId) {
        return reject(state, 'INVALID_PHASE_ID', 'SELECT_GUIDE_TAB requires a phaseId.');
      }
      next.guideManualTabId = event.phaseId;
      effects.push({ type: 'RENDER_GUIDE_PHASE', phaseId: event.phaseId });
      return accept(state, next, effects);
    }

    case 'ENTER_CAPTURE': {
      if (state.surface === 'capture') {
        return reject(state, 'ALREADY_IN_CAPTURE', 'Already in Clean Capture Mode.');
      }
      next.surface = 'capture';
      next.guideManualTabId = null;
      return accept(state, next, effects);
    }

    case 'EXIT_CAPTURE': {
      if (state.surface !== 'capture') {
        return reject(state, 'NOT_IN_CAPTURE', 'Not in Clean Capture Mode.');
      }
      if (state.recording === 'recording') {
        // Safely stop & save active recording before exiting so no recorder is orphaned
        next.recording = 'stopping';
        next.surface = 'interactive';
        next.statusMessage = 'Stopping and saving 18s clip…';
        effects.push({ type: 'STOP_RECORDING' });
        return accept(state, next, effects);
      }
      next.surface = 'interactive';
      return accept(state, next, effects);
    }

    case 'TOGGLE_CAPTURE': {
      if (state.surface === 'capture') {
        return transition(state, { type: 'EXIT_CAPTURE' });
      }
      return transition(state, { type: 'ENTER_CAPTURE' });
    }

    case 'ESCAPE': {
      if (state.surface === 'guide') {
        return transition(state, { type: 'CLOSE_GUIDE' });
      }
      if (state.surface === 'capture') {
        return transition(state, { type: 'EXIT_CAPTURE' });
      }
      if (state.gesture !== 'idle') {
        next.gesture = 'idle';
        effects.push({ type: 'ABORT_GESTURE' });
        return accept(state, next, effects);
      }
      return reject(state, 'NOTHING_TO_DISMISS', 'No overlay or active gesture to dismiss.');
    }

    case 'CAPTURE_PNG': {
      if (state.renderer === 'context_lost') {
        return reject(state, 'RENDERER_UNAVAILABLE', 'Cannot capture PNG while WebGL context is lost.');
      }
      effects.push({ type: 'CAPTURE_PNG', aspect: state.aspect });
      next.statusMessage = `Saved ${state.aspect} PNG snapshot.`;
      return accept(state, next, effects);
    }

    case 'START_RECORDING': {
      if (state.recording === 'unsupported') {
        next.statusMessage = 'WebM recording is not supported in this browser. Use PNG Still or your OS recorder.';
        return reject(state, 'VIDEO_UNSUPPORTED', next.statusMessage, next);
      }
      if (state.recording === 'recording' || state.recording === 'stopping') {
        return reject(state, 'RECORDING_IN_PROGRESS', 'A recording is already active or finalizing.');
      }
      if (state.renderer === 'context_lost') {
        return reject(state, 'RENDERER_UNAVAILABLE', 'Cannot start recording while WebGL context is lost.');
      }
      // Enforce invariants: enter capture surface, start synchronized 18s showcase from t=0, abort gestures/scrubbing
      if (state.gesture !== 'idle') {
        next.gesture = 'idle';
        effects.push({ type: 'ABORT_GESTURE' });
      }
      next.scrubbing = false;
      next.surface = 'capture';
      next.guideManualTabId = null;
      next.transport = 'showcase_playing';
      next.recording = 'recording';
      next.lastError = null;
      next.statusMessage = 'Recording synchronized 18s showcase loop…';
      effects.push({ type: 'RESTART_SHOWCASE' });
      effects.push({ type: 'SYNC_TRANSPORT', transport: next.transport });
      effects.push({ type: 'START_RECORDING' });
      return accept(state, next, effects);
    }

    case 'STOP_RECORDING': {
      if (state.recording !== 'recording') {
        return reject(state, 'NOT_RECORDING', 'No active recording to stop.');
      }
      next.recording = 'stopping';
      next.statusMessage = 'Finalizing WebM loop…';
      effects.push({ type: 'STOP_RECORDING' });
      return accept(state, next, effects);
    }

    case 'RECORDING_COMPLETE': {
      if (state.recording !== 'recording' && state.recording !== 'stopping') {
        return reject(state, 'STALE_RECORDING_COMPLETE', 'Ignored stale recording completion.');
      }
      next.recording = 'idle';
      next.statusMessage = 'Saved 18-second showcase loop (WebM).';
      return accept(state, next, effects);
    }

    case 'RECORDING_FAILED': {
      if (state.recording !== 'recording' && state.recording !== 'stopping') {
        return reject(state, 'STALE_RECORDING_ERROR', 'Ignored stale recording error.');
      }
      next.recording = 'error';
      next.lastError = event.message || 'Recording failed.';
      next.statusMessage = `Recording error: ${next.lastError}`;
      return accept(state, next, effects);
    }

    case 'CLEAR_RECORDING_ERROR': {
      if (state.recording !== 'error') {
        return reject(state, 'NO_RECORDING_ERROR', 'No recording error to clear.');
      }
      next.recording = 'idle';
      next.lastError = null;
      next.statusMessage = null;
      return accept(state, next, effects);
    }

    // -----------------------------------------------------------------------
    // M3: DIRECT CANVAS GESTURES & RESONANT FOLD ARBITRATION
    // -----------------------------------------------------------------------
    case 'GESTURE_HOLD_START': {
      if (state.scrubbing) {
        return reject(state, 'SCRUBBING_ACTIVE', 'Cannot begin hold while scrubbing timeline.');
      }
      const source = event.source === 'space' ? 'holding_space' : 'holding_pointer';
      if (state.gesture !== 'idle') {
        return reject(state, 'GESTURE_BUSY', `Gesture already in ${state.gesture}.`);
      }
      next.gesture = source;
      effects.push({ type: 'BEGIN_HOLD', x: event.x ?? 0, y: event.y ?? 0 });
      return accept(state, next, effects);
    }

    case 'GESTURE_PROMOTE_DRAG': {
      if (state.gesture !== 'holding_pointer') {
        return reject(state, 'NOT_HOLDING_POINTER', 'Only pointer hold can promote to Relic drag.');
      }
      next.gesture = 'dragging_relic';
      effects.push({ type: 'CANCEL_HOLD_ENTER_DRAG' });
      return accept(state, next, effects);
    }

    case 'GESTURE_PINCH_START': {
      if (state.scrubbing) {
        return reject(state, 'SCRUBBING_ACTIVE', 'Cannot pinch while scrubbing.');
      }
      if (state.gesture === 'holding_space') {
        return reject(state, 'SPACE_HOLD_ACTIVE', 'Space hold active.');
      }
      next.gesture = 'pinching';
      effects.push({ type: 'CANCEL_HOLD_AND_DRAG' });
      return accept(state, next, effects);
    }

    case 'GESTURE_END': {
      const source = event.source; // 'pointer' | 'space' | 'pinch' | 'blur'
      if (state.gesture === 'idle') {
        return reject(state, 'GESTURE_IDLE', 'No active gesture to end.');
      }
      // Prevent space release from cancelling a pointer drag, or pointer release cancelling space hold
      if (source === 'space' && state.gesture !== 'holding_space') {
        return reject(state, 'SOURCE_MISMATCH', 'Space release ignored while pointer gesture is active.');
      }
      if (source === 'pointer' && state.gesture === 'holding_space') {
        return reject(state, 'SOURCE_MISMATCH', 'Pointer release ignored while Space hold is active.');
      }

      const wasHolding = state.gesture === 'holding_pointer' || state.gesture === 'holding_space';
      next.gesture = 'idle';

      if (source === 'blur' || event.abort) {
        effects.push({ type: 'ABORT_GESTURE' });
      } else if (wasHolding) {
        effects.push({ type: 'END_HOLD_RELEASE' });
      } else {
        effects.push({ type: 'END_DRAG_OR_PINCH' });
      }
      return accept(state, next, effects);
    }

    case 'TOGGLE_RELIC_UNFOLD': {
      if (state.transport === 'showcase_playing' || state.transport === 'showcase_paused') {
        next.statusMessage = 'Relic unfolding is choreographed during 18s Loop — exit loop to control manually.';
        return reject(state, 'LOCKED_BY_SHOWCASE', next.statusMessage, next);
      }
      effects.push({ type: 'TOGGLE_RELIC_UNFOLD' });
      return accept(state, next, effects);
    }

    // -----------------------------------------------------------------------
    // M4: ASYNC WEB AUDIO LIFECYCLE (Serialized against re-entrancy races)
    // -----------------------------------------------------------------------
    case 'TOGGLE_AUDIO': {
      if (state.audio === 'unsupported') {
        next.statusMessage = 'Web Audio is not supported in this browser.';
        return reject(state, 'AUDIO_UNSUPPORTED', next.statusMessage, next);
      }
      if (state.audio === 'starting') {
        return reject(state, 'AUDIO_TRANSITION_IN_FLIGHT', 'Audio is already starting.');
      }
      const targetOn = state.audio !== 'on';
      next.audio = 'starting';
      next.audioTarget = targetOn;
      next.lastError = null;
      effects.push({ type: 'SET_AUDIO_ENABLED', enabled: targetOn });
      return accept(state, next, effects);
    }

    case 'AUDIO_SETTLED': {
      if (state.audio !== 'starting') {
        return reject(state, 'STALE_AUDIO_SETTLE', 'Ignored stale audio settlement.');
      }
      next.audio = event.enabled ? 'on' : 'off';
      next.audioTarget = null;
      return accept(state, next, effects);
    }

    case 'AUDIO_FAILED': {
      if (state.audio !== 'starting' && state.audio !== 'on') {
        return reject(state, 'STALE_AUDIO_ERROR', 'Ignored stale audio error.');
      }
      next.audio = event.unsupported ? 'unsupported' : 'error';
      next.audioTarget = null;
      next.lastError = event.message || 'Unable to start audio.';
      next.statusMessage = next.lastError;
      return accept(state, next, effects);
    }

    // -----------------------------------------------------------------------
    // M6/M8: ASPECT, COMFORT & RENDERER LIFECYCLE
    // -----------------------------------------------------------------------
    case 'SET_ASPECT': {
      if (!ASPECT_MODES.includes(event.aspect)) {
        return reject(state, 'INVALID_ASPECT', `Unknown aspect mode: ${event.aspect}`);
      }
      if (isRecording) {
        return reject(state, 'RECORDING_ACTIVE', 'Stop recording before changing framing aspect.');
      }
      if (state.aspect === event.aspect) {
        return reject(state, 'NO_CHANGE', `Aspect is already ${event.aspect}.`);
      }
      next.aspect = event.aspect;
      effects.push({ type: 'APPLY_ASPECT', aspect: next.aspect });
      return accept(state, next, effects);
    }

    case 'SET_INTENSITY': {
      if (typeof event.value !== 'number' || Number.isNaN(event.value)) {
        return reject(state, 'INVALID_INTENSITY', 'Intensity must be a number.');
      }
      next.intensity = Math.max(0.2, Math.min(1.0, event.value));
      effects.push({ type: 'SET_INTENSITY', value: next.intensity });
      return accept(state, next, effects);
    }

    case 'TOGGLE_STABILIZE': {
      next.stabilizeCamera = !state.stabilizeCamera;
      effects.push({ type: 'SET_STABILIZE', value: next.stabilizeCamera });
      return accept(state, next, effects);
    }

    case 'TOGGLE_REDUCED_MOTION': {
      next.reducedMotion = !state.reducedMotion;
      effects.push({ type: 'SET_REDUCED_MOTION', value: next.reducedMotion });
      return accept(state, next, effects);
    }

    case 'RENDERER_READY': {
      if (event.mode !== 'webgl2' && event.mode !== 'canvas2d') {
        return reject(state, 'INVALID_RENDERER_MODE', `Invalid renderer mode: ${event.mode}`);
      }
      next.renderer = event.mode;
      return accept(state, next, effects);
    }

    case 'RENDERER_CONTEXT_LOST': {
      next.renderer = 'context_lost';
      next.statusMessage = 'Graphics context paused — waiting for GPU recovery…';
      if (state.recording === 'recording') {
        next.recording = 'stopping';
        effects.push({ type: 'STOP_RECORDING' });
      }
      return accept(state, next, effects);
    }

    case 'RENDERER_CONTEXT_RESTORED': {
      next.renderer = event.mode === 'canvas2d' ? 'canvas2d' : 'webgl2';
      next.statusMessage = 'Graphics context restored.';
      return accept(state, next, effects);
    }

    case 'CLEAR_STATUS': {
      if (state.statusMessage === null) {
        return reject(state, 'NO_STATUS', 'No status message to clear.');
      }
      next.statusMessage = null;
      return accept(state, next, effects);
    }

    default:
      return reject(state, 'UNKNOWN_EVENT', `Unknown event type: ${event.type}`);
  }
}

function accept(prev, next, effects) {
  next.transitionSeq = prev.transitionSeq + 1;
  return {
    accepted: true,
    reason: 'OK',
    prev,
    state: next,
    effects,
  };
}

function reject(state, reason, message, updatedState = state) {
  return {
    accepted: false,
    reason,
    message,
    prev: state,
    state: updatedState,
    effects: [],
  };
}

/**
 * Computes the exact list of currently legal user/agent actions for the active state.
 * Enables both human UI affordances (disabled states/titles) and operating-agent discovery.
 */
export function getAvailableActions(state) {
  const actions = [];
  const recLocked = state.recording === 'recording' || state.recording === 'stopping';
  const inShowcase = state.transport === 'showcase_playing' || state.transport === 'showcase_paused';

  if (!recLocked) {
    actions.push('TOGGLE_PAUSE', 'TRIGGER_RETURN', 'TOGGLE_SHOWCASE', 'JUMP_PHASE', 'SCRUB_START', 'SET_ASPECT');
  }
  if (!inShowcase) {
    actions.push('TOGGLE_RELIC_UNFOLD');
  }

  if (state.surface === 'interactive') {
    actions.push('OPEN_GUIDE', 'ENTER_CAPTURE');
  } else if (state.surface === 'guide') {
    actions.push('CLOSE_GUIDE', 'SELECT_GUIDE_TAB', 'ENTER_CAPTURE', 'ESCAPE');
  } else if (state.surface === 'capture') {
    actions.push('EXIT_CAPTURE', 'ESCAPE');
  }

  if (state.renderer !== 'context_lost') {
    actions.push('CAPTURE_PNG');
  }

  if (state.recording === 'idle' || state.recording === 'error') {
    if (state.renderer !== 'context_lost') {
      actions.push('START_RECORDING');
    }
  } else if (state.recording === 'recording') {
    actions.push('STOP_RECORDING');
  }

  if (state.audio === 'off' || state.audio === 'on' || state.audio === 'error') {
    actions.push('TOGGLE_AUDIO');
  }

  if (!state.scrubbing && state.gesture === 'idle') {
    actions.push('GESTURE_HOLD_START', 'GESTURE_PINCH_START');
  } else if (state.gesture !== 'idle') {
    actions.push('GESTURE_END');
    if (state.gesture === 'holding_pointer') {
      actions.push('GESTURE_PROMOTE_DRAG');
    }
  }

  actions.push('SET_INTENSITY', 'TOGGLE_STABILIZE', 'TOGGLE_REDUCED_MOTION');
  return actions;
}

/**
 * Stateful store wrapper around the pure transition engine with subscriber notifications.
 */
export function createAppMachine(initialOverrides = {}, effectRunner = null) {
  let current = createInitialState(initialOverrides);
  const listeners = new Set();

  return {
    getState() {
      return { ...current };
    },
    getAvailableActions() {
      return getAvailableActions(current);
    },
    checkInvariants() {
      return checkInvariants(current);
    },
    dispatch(event) {
      const result = transition(current, event);
      const changed = result.state !== current;
      current = result.state;
      if (result.accepted && effectRunner) {
        for (const eff of result.effects) {
          effectRunner(eff, current);
        }
      }
      if (changed) {
        for (const fn of listeners) {
          fn(current, event, result);
        }
      }
      return result;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
