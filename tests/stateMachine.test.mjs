import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAppMachine,
  checkInvariants,
  getAvailableActions,
} from '../src/stateMachine.js';

function createTrackedMachine(overrides = {}) {
  const executedEffects = [];
  const machine = createAppMachine(
    { renderer: 'webgl2', supportsVideoCapture: true, supportsAudio: true, ...overrides },
    (eff) => executedEffects.push(eff)
  );
  return { machine, executedEffects };
}

test('M1 Transport: Return from paused or showcase unpauses cleanly and Return completion returns to journey_playing', () => {
  const { machine, executedEffects } = createTrackedMachine();

  assert.equal(machine.dispatch({ type: 'TOGGLE_PAUSE' }).accepted, true);
  assert.equal(machine.getState().transport, 'journey_paused');

  // Previously stuck: Return while paused now visibly unpauses into 'returning'
  const ret = machine.dispatch({ type: 'TRIGGER_RETURN' });
  assert.equal(ret.accepted, true);
  assert.equal(machine.getState().transport, 'returning');
  assert.ok(executedEffects.some((e) => e.type === 'START_RETURN'));
  assert.deepEqual(machine.checkInvariants(), []);

  // Toggling Showcase during Return cleanly cancels returning and starts showcase_playing
  const show = machine.dispatch({ type: 'TOGGLE_SHOWCASE' });
  assert.equal(show.accepted, true);
  assert.equal(machine.getState().transport, 'showcase_playing');
  // Stale RETURN_COMPLETE after switching to showcase is safely rejected
  assert.equal(machine.dispatch({ type: 'RETURN_COMPLETE' }).accepted, false);

  // Exiting Showcase returns to journey_playing (never snaps back to stale 'returning')
  assert.equal(machine.dispatch({ type: 'TOGGLE_SHOWCASE' }).accepted, true);
  assert.equal(machine.getState().transport, 'journey_playing');
  assert.deepEqual(machine.checkInvariants(), []);
});

test('M1+M6: Unfold Relic is explicitly guarded during Showcase Loop and available in Journey', () => {
  const { machine } = createTrackedMachine();

  assert.ok(machine.getAvailableActions().includes('TOGGLE_RELIC_UNFOLD'));
  assert.equal(machine.dispatch({ type: 'TOGGLE_RELIC_UNFOLD' }).accepted, true);

  machine.dispatch({ type: 'TOGGLE_SHOWCASE' });
  assert.ok(!machine.getAvailableActions().includes('TOGGLE_RELIC_UNFOLD'));
  const rejected = machine.dispatch({ type: 'TOGGLE_RELIC_UNFOLD' });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, 'LOCKED_BY_SHOWCASE');
  assert.match(machine.getState().statusMessage, /18s Loop/i);
});

test('M2 Surface: Guide and Capture are mutually exclusive; Escape never gets trapped on an invisible guide', () => {
  const { machine } = createTrackedMachine();

  machine.dispatch({ type: 'OPEN_GUIDE' });
  machine.dispatch({ type: 'SELECT_GUIDE_TAB', phaseId: 'chamber' });
  assert.equal(machine.getState().guideManualTabId, 'chamber');

  // Entering Capture closes Guide and clears guideManualTabId
  machine.dispatch({ type: 'ENTER_CAPTURE' });
  assert.equal(machine.getState().surface, 'capture');
  assert.equal(machine.getState().guideManualTabId, null);
  assert.deepEqual(machine.checkInvariants(), []);

  // Previously leaked bug: opening guide in capture is now rejected
  const leaked = machine.dispatch({ type: 'TOGGLE_GUIDE' });
  assert.equal(leaked.accepted, false);
  assert.equal(leaked.reason, 'IN_CAPTURE_MODE');
  assert.equal(machine.getState().surface, 'capture');

  // Escape exits capture cleanly on first press
  assert.equal(machine.dispatch({ type: 'ESCAPE' }).accepted, true);
  assert.equal(machine.getState().surface, 'interactive');
});

test('M2 Recording: Synchronizes capture + showcase, locks conflicting actions, stops safely on exit, and rejects stale completions', () => {
  const { machine, executedEffects } = createTrackedMachine();

  // Hold a gesture before recording to verify recording cleanly aborts it
  machine.dispatch({ type: 'GESTURE_HOLD_START', source: 'pointer', x: 0.1, y: 0.2 });
  assert.equal(machine.getState().gesture, 'holding_pointer');

  const start = machine.dispatch({ type: 'START_RECORDING' });
  assert.equal(start.accepted, true);
  assert.equal(machine.getState().recording, 'recording');
  assert.equal(machine.getState().surface, 'capture');
  assert.equal(machine.getState().transport, 'showcase_playing');
  assert.equal(machine.getState().gesture, 'idle');
  assert.deepEqual(machine.checkInvariants(), []);

  // Conflicting actions are locked while recording
  for (const ev of [
    { type: 'TOGGLE_PAUSE' },
    { type: 'TRIGGER_RETURN' },
    { type: 'TOGGLE_SHOWCASE' },
    { type: 'JUMP_PHASE', progress: 0.5 },
    { type: 'SET_ASPECT', aspect: 'portrait' },
    { type: 'SCRUB_START', progress: 0.3 },
    { type: 'START_RECORDING' },
  ]) {
    assert.equal(machine.dispatch(ev).accepted, false, `${ev.type} should be rejected while recording`);
  }

  // Exiting Capture while recording stops the recorder rather than orphaning it
  const exit = machine.dispatch({ type: 'EXIT_CAPTURE' });
  assert.equal(exit.accepted, true);
  assert.equal(machine.getState().surface, 'interactive');
  assert.equal(machine.getState().recording, 'stopping');
  assert.ok(executedEffects.some((e) => e.type === 'STOP_RECORDING'));
  assert.deepEqual(machine.checkInvariants(), []);

  // Completion settles to idle; duplicate stale completion is rejected
  assert.equal(machine.dispatch({ type: 'RECORDING_COMPLETE' }).accepted, true);
  assert.equal(machine.getState().recording, 'idle');
  assert.equal(machine.dispatch({ type: 'RECORDING_COMPLETE' }).accepted, false);

  // Failure & clean retry recovery
  machine.dispatch({ type: 'START_RECORDING' });
  assert.equal(machine.dispatch({ type: 'RECORDING_FAILED', message: 'Codec unavailable' }).accepted, true);
  assert.equal(machine.getState().recording, 'error');
  assert.ok(machine.getAvailableActions().includes('START_RECORDING'));
  assert.equal(machine.dispatch({ type: 'START_RECORDING' }).accepted, true);
  assert.equal(machine.getState().recording, 'recording');
});

test('M3 Gesture Arbitration: Pointer and Space holds never collide; drag promotion clears hold; blur aborts cleanly', () => {
  const { machine, executedEffects } = createTrackedMachine();

  assert.equal(machine.dispatch({ type: 'GESTURE_HOLD_START', source: 'pointer', x: 0, y: 0 }).accepted, true);
  assert.equal(machine.getState().gesture, 'holding_pointer');

  // Space press while pointer is holding is rejected (no collision)
  assert.equal(machine.dispatch({ type: 'GESTURE_HOLD_START', source: 'space' }).accepted, false);
  // Space release cannot prematurely end pointer hold
  assert.equal(machine.dispatch({ type: 'GESTURE_END', source: 'space' }).accepted, false);
  assert.equal(machine.getState().gesture, 'holding_pointer');

  // Promoting pointer hold to Relic drag cancels hold cleanly
  const prom = machine.dispatch({ type: 'GESTURE_PROMOTE_DRAG' });
  assert.equal(prom.accepted, true);
  assert.equal(machine.getState().gesture, 'dragging_relic');
  assert.equal(executedEffects.at(-1).type, 'CANCEL_HOLD_ENTER_DRAG');

  // Pointer release ends drag without firing a fold pulse
  const endDrag = machine.dispatch({ type: 'GESTURE_END', source: 'pointer' });
  assert.equal(endDrag.accepted, true);
  assert.equal(executedEffects.at(-1).type, 'END_DRAG_OR_PINCH');
  assert.equal(machine.getState().gesture, 'idle');

  // Space hold aborted cleanly by window blur
  machine.dispatch({ type: 'GESTURE_HOLD_START', source: 'space' });
  assert.equal(machine.getState().gesture, 'holding_space');
  const blurEnd = machine.dispatch({ type: 'GESTURE_END', source: 'blur', abort: true });
  assert.equal(blurEnd.accepted, true);
  assert.equal(executedEffects.at(-1).type, 'ABORT_GESTURE');
  assert.equal(machine.getState().gesture, 'idle');
});

test('M4 Audio Lifecycle: Serializes concurrent toggles, rejects stale settlements, and recovers from errors', () => {
  const { machine } = createTrackedMachine();

  assert.equal(machine.dispatch({ type: 'TOGGLE_AUDIO' }).accepted, true);
  assert.equal(machine.getState().audio, 'starting');
  assert.ok(!machine.getAvailableActions().includes('TOGGLE_AUDIO'));

  // Rapid double-click while resume() is in flight is rejected cleanly
  const dup = machine.dispatch({ type: 'TOGGLE_AUDIO' });
  assert.equal(dup.accepted, false);
  assert.equal(dup.reason, 'AUDIO_TRANSITION_IN_FLIGHT');

  // Settle to on; duplicate stale settlement rejected
  assert.equal(machine.dispatch({ type: 'AUDIO_SETTLED', enabled: true }).accepted, true);
  assert.equal(machine.getState().audio, 'on');
  assert.equal(machine.dispatch({ type: 'AUDIO_SETTLED', enabled: true }).accepted, false);

  // Error recovery: failed toggle lands in 'error' and allows retry
  machine.dispatch({ type: 'TOGGLE_AUDIO' });
  machine.dispatch({ type: 'AUDIO_FAILED', unsupported: false, message: 'Autoplay blocked' });
  assert.equal(machine.getState().audio, 'error');
  assert.ok(machine.getAvailableActions().includes('TOGGLE_AUDIO'));
  assert.equal(machine.dispatch({ type: 'TOGGLE_AUDIO' }).accepted, true);
  assert.equal(machine.getState().audio, 'starting');

  // Unsupported browser cleanly disables audio
  const { machine: unsup } = createTrackedMachine({ supportsAudio: false });
  assert.equal(unsup.getState().audio, 'unsupported');
  assert.equal(unsup.dispatch({ type: 'TOGGLE_AUDIO' }).accepted, false);
});

test('M7 Renderer Context Loss & Restoration: Stops active recording and blocks capture until restored', () => {
  const { machine, executedEffects } = createTrackedMachine();

  machine.dispatch({ type: 'START_RECORDING' });
  assert.equal(machine.getState().recording, 'recording');

  machine.dispatch({ type: 'RENDERER_CONTEXT_LOST' });
  assert.equal(machine.getState().renderer, 'context_lost');
  assert.equal(machine.getState().recording, 'stopping');
  assert.ok(executedEffects.some((e) => e.type === 'STOP_RECORDING'));
  assert.equal(machine.dispatch({ type: 'CAPTURE_PNG' }).accepted, false);
  assert.equal(machine.dispatch({ type: 'START_RECORDING' }).accepted, false);

  machine.dispatch({ type: 'RECORDING_COMPLETE' });
  machine.dispatch({ type: 'RENDERER_CONTEXT_RESTORED', mode: 'webgl2' });
  assert.equal(machine.getState().renderer, 'webgl2');
  assert.equal(machine.dispatch({ type: 'CAPTURE_PNG' }).accepted, true);
  assert.deepEqual(machine.checkInvariants(), []);
});

test('Adversarial event-ordering stress test: invariants hold after every single transition', () => {
  const { machine } = createTrackedMachine();
  const events = [
    { type: 'TOGGLE_PAUSE' },
    { type: 'TRIGGER_RETURN' },
    { type: 'OPEN_GUIDE' },
    { type: 'SELECT_GUIDE_TAB', phaseId: 'glossolalia' },
    { type: 'GESTURE_HOLD_START', source: 'pointer', x: 0.2, y: -0.1 },
    { type: 'SCRUB_START', progress: 0.42 },
    { type: 'SCRUB_MOVE', progress: 0.65 },
    { type: 'START_RECORDING' },
    { type: 'TOGGLE_GUIDE' },
    { type: 'TOGGLE_PAUSE' },
    { type: 'SET_ASPECT', aspect: 'portrait' },
    { type: 'ESCAPE' },
    { type: 'RECORDING_COMPLETE' },
    { type: 'SET_ASPECT', aspect: 'portrait' },
    { type: 'TOGGLE_AUDIO' },
    { type: 'TOGGLE_AUDIO' },
    { type: 'AUDIO_SETTLED', enabled: true },
    { type: 'GESTURE_HOLD_START', source: 'space' },
    { type: 'GESTURE_PINCH_START' },
    { type: 'GESTURE_END', source: 'blur', abort: true },
    { type: 'TOGGLE_SHOWCASE' },
    { type: 'TOGGLE_RELIC_UNFOLD' },
    { type: 'TOGGLE_SHOWCASE' },
    { type: 'TOGGLE_RELIC_UNFOLD' },
    { type: 'RENDERER_CONTEXT_LOST' },
    { type: 'RENDERER_CONTEXT_RESTORED', mode: 'canvas2d' },
  ];

  for (const ev of events) {
    machine.dispatch(ev);
    const violations = checkInvariants(machine.getState());
    assert.deepEqual(violations, [], `Invariant violated after ${ev.type}: ${violations.join('; ')}`);
    const avail = getAvailableActions(machine.getState());
    assert.ok(Array.isArray(avail) && avail.length > 0);
  }
});
