/**
 * Choreography & Interaction State Machine
 * Drives the 5-phase initiatory arc, the deterministic 18-second seamless
 * showcase loop, sustained attention, stillness emergence, the Impossible
 * Relic's quaternion orientation & unfolding, and Resonant Fold utterances.
 */

export const SHOWCASE_DURATION = 18.0; // seconds — exact seamless loop
export const JOURNEY_DURATION = 72.0;  // seconds — contemplative full initiation

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Smooth bell pulse centered at `center` with half-width `width`
function bell(x, center, width) {
  const d = (x - center) / width;
  if (Math.abs(d) >= 1) return 0;
  const c = Math.cos(d * Math.PI * 0.5);
  return c * c;
}

// Quaternion helpers for smooth, gimbal-free Impossible Relic manipulation
function quatMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function quatNormalize(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

function quatFromAxisAngle(ax, ay, az, angle) {
  const s = Math.sin(angle * 0.5);
  return [ax * s, ay * s, az * s, Math.cos(angle * 0.5)];
}

function quatSlerp(a, b, t) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  if (dot < 0) {
    dot = -dot;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  if (dot > 0.9995) {
    return quatNormalize([
      lerp(a[0], bx, t),
      lerp(a[1], by, t),
      lerp(a[2], bz, t),
      lerp(a[3], bw, t),
    ]);
  }
  const theta0 = Math.acos(clamp(dot, -1, 1));
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
  const s1 = sinTheta / sinTheta0;
  return [
    s0 * a[0] + s1 * bx,
    s0 * a[1] + s1 * by,
    s0 * a[2] + s1 * bz,
    s0 * a[3] + s1 * bw,
  ];
}

function quatToMat3(q) {
  const [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;
  // Column-major 3x3 for WebGL uniformMatrix3fv
  return new Float32Array([
    1 - 2 * (yy + zz), 2 * (xy + wz),     2 * (xz - wy),
    2 * (xy - wz),     1 - 2 * (xx + zz), 2 * (yz + wx),
    2 * (xz + wy),     2 * (yz - wx),     1 - 2 * (xx + yy),
  ]);
}

export class Choreography {
  constructor() {
    // Mode: 'journey' | 'showcase'
    this.mode = 'journey';
    this.paused = false;

    // Timers
    this.time = 0;            // continuous animation clock
    this.journeyProgress = 0; // 0..1 across phases I..V
    this.showcaseTime = 0;    // 0..18 exact periodic loop

    // User Controls
    this.intensity = 0.80;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
    this.stabilizeCamera = false;

    // Pointer & Gaze
    this.pointerActive = false;
    this.pointerNDC = [0, 0];
    this.smoothGaze = [0, 0];
    this.pointerSpeed = 0;
    this.idleSeconds = 0;
    this.steadySeconds = 0;

    // Emergent perceptual states
    this.attention = 0;   // 0..1 sustained attention response
    this.stillness = 0;   // 0..1 quiet layer emergence

    // Impossible Relic state
    this.relicQuat = [0, 0, 0, 1];
    this.relicVel = [0, 0]; // angular inertia [vx, vy]
    this.relicUnfold = 0.14;
    this.relicUnfoldTarget = 0.14;
    this.isDraggingRelic = false;

    // Resonant Fold (Signature Hold & Release interaction)
    this.isHolding = false;
    this.holdTime = 0;
    this.holdCharge = 0;
    this.holdOrigin = [0, 0];
    this.pulseAge = 10.0; // seconds since last release
    this.pulseStrength = 0;
    this.pulseOrigin = [0, 0];
    this.utteranceCount = 0;
    this.utteranceSeed = 1.37;
    this.utteranceVec = [0, 0.25, 0.8];

    // Smooth return transition
    this.returning = false;
    this.returnTimer = 0;

    // Computed frame output (fed directly to WebGL shader & audio)
    this.uniforms = {
      time: 0,
      phaseProgress: 0,
      ornamentAmt: 0,
      foldAmt: 0,
      chamberAmt: 0,
      presenceAmt: 0,
      dialogueAmt: 0,
      echoAmt: 0,
      gaze: [0, 0],
      attention: 0,
      stillness: 0,
      relicMat: quatToMat3([0, 0, 0, 1]),
      relicUnfold: 0.14,
      holdCharge: 0,
      holdOrigin: [0, 0],
      pulseProgress: 0,
      pulseStrength: 0,
      pulseOrigin: [0, 0],
      utteranceCount: 0,
      utteranceSeed: 1.37,
      utteranceVec: [0, 0.25, 0.8],
      intensity: 0.8,
      reducedMotion: 0,
      stabilizeCamera: 0,
      showcaseMode: 0,
    };

    // Event hooks for audio/UI/state-machine
    this.onFoldRelease = null;
    this.onRelicMove = null;
    this.onReturnComplete = null;
  }

  /**
   * Synchronize transport flags directly from the authoritative AppStateMachine.
   */
  syncTransport(transport) {
    if (transport === 'journey_playing') {
      this.mode = 'journey';
      this.paused = false;
      this.returning = false;
    } else if (transport === 'journey_paused') {
      this.mode = 'journey';
      this.paused = true;
      this.returning = false;
    } else if (transport === 'returning') {
      this.mode = 'journey';
      this.paused = false;
      this.returning = true;
    } else if (transport === 'showcase_playing') {
      this.mode = 'showcase';
      this.paused = false;
      this.returning = false;
    } else if (transport === 'showcase_paused') {
      this.mode = 'showcase';
      this.paused = true;
      this.returning = false;
    }
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'showcase') {
      this.showcaseTime = 0;
      this.returning = false;
      this.returnTimer = 0;
    }
  }

  restartShowcase() {
    this.mode = 'showcase';
    this.showcaseTime = 0;
    this.paused = false;
    this.returning = false;
    this.returnTimer = 0;
  }

  jumpToPhase(progress) {
    this.mode = 'journey';
    this.journeyProgress = clamp(progress, 0, 0.999);
    this.returning = false;
    this.returnTimer = 0;
  }

  scrubTo(progress) {
    const p = clamp(progress, 0, 0.999);
    if (this.mode === 'showcase') {
      this.showcaseTime = p * SHOWCASE_DURATION;
    } else {
      this.journeyProgress = p;
      this.returning = false;
      this.returnTimer = 0;
    }
  }

  triggerReturn() {
    this.mode = 'journey';
    this.paused = false;
    this.returning = true;
    this.returnTimer = 0;
    this.relicUnfoldTarget = 0.08;
    this.utteranceCount = Math.max(0, this.utteranceCount - 1);
  }

  updatePointer(ndcX, ndcY) {
    const dx = ndcX - this.pointerNDC[0];
    const dy = ndcY - this.pointerNDC[1];
    const dist = Math.hypot(dx, dy);
    this.pointerNDC[0] = clamp(ndcX, -1, 1);
    this.pointerNDC[1] = clamp(ndcY, -1, 1);
    this.pointerActive = true;
    if (dist > 0.0025) {
      this.idleSeconds = 0;
    }
    this.pointerSpeed = lerp(this.pointerSpeed, dist * 60, 0.35);
  }

  pointerLeave() {
    this.pointerActive = false;
  }

  dragRelic(dx, dy) {
    // Rotate Impossible Relic around world Y and X
    const scale = 3.2;
    const qY = quatFromAxisAngle(0, 1, 0, -dx * scale);
    const qX = quatFromAxisAngle(1, 0, 0, dy * scale);
    this.relicQuat = quatNormalize(quatMul(qY, quatMul(qX, this.relicQuat)));
    this.relicVel[0] = -dx * scale * 18;
    this.relicVel[1] = dy * scale * 18;
    this.idleSeconds = 0;
    if (this.onRelicMove) {
      this.onRelicMove(Math.hypot(dx, dy));
    }
  }

  adjustRelicUnfold(delta) {
    this.relicUnfoldTarget = clamp(this.relicUnfoldTarget + delta, 0, 1);
    this.idleSeconds = 0;
  }

  toggleRelicUnfold() {
    this.relicUnfoldTarget = this.relicUnfoldTarget > 0.5 ? 0.12 : 0.92;
    this.idleSeconds = 0;
  }

  beginHold(ndcX, ndcY) {
    this.isHolding = true;
    this.holdTime = 0;
    this.holdOrigin = [clamp(ndcX, -1, 1), clamp(ndcY, -1, 1)];
    this.idleSeconds = 0;
  }

  updateHoldOrigin(ndcX, ndcY) {
    if (this.isHolding) {
      this.holdOrigin[0] = lerp(this.holdOrigin[0], clamp(ndcX, -1, 1), 0.25);
      this.holdOrigin[1] = lerp(this.holdOrigin[1], clamp(ndcY, -1, 1), 0.25);
    }
  }

  cancelHold() {
    this.isHolding = false;
    this.holdTime = 0;
  }

  abortGesture() {
    this.isHolding = false;
    this.holdTime = 0;
    this.isDraggingRelic = false;
  }

  endHold() {
    if (!this.isHolding) return;
    this.isHolding = false;
    const strength = clamp(0.28 + this.holdCharge * 0.72, 0.28, 1.0);
    if (this.holdTime > 0.16) {
      this._fireFoldPulse(strength, this.holdOrigin[0], this.holdOrigin[1], true);
    }
    this.holdTime = 0;
  }

  _fireFoldPulse(strength, ox, oy, userTriggered = true) {
    this.pulseAge = 0;
    this.pulseStrength = strength;
    this.pulseOrigin = [ox, oy];
    if (userTriggered) {
      this.utteranceCount = Math.min(this.utteranceCount + 1, 7);
      this.utteranceSeed = (this.utteranceSeed * 1.6180339 + 0.417) % 10.0;
      const len = Math.hypot(ox, oy, 0.75) || 1;
      this.utteranceVec = [ox / len, oy / len, 0.75 / len];
      // Nudge the Impossible Relic into a deeper nested reveal on strong folds
      if (strength > 0.55) {
        this.relicUnfoldTarget = clamp(
          this.relicUnfoldTarget > 0.7 ? 0.28 : this.relicUnfoldTarget + 0.36,
          0.1,
          1.0
        );
      }
    }
    if (this.onFoldRelease) {
      this.onFoldRelease(strength, ox, oy);
    }
  }

  step(dt) {
    const safeDt = Math.min(dt, 0.05);
    const motionScale = this.reducedMotion ? 0.28 : 1.0;

    if (!this.paused) {
      this.time += safeDt * motionScale;

      if (this.mode === 'showcase') {
        const prevS = this.showcaseTime / SHOWCASE_DURATION;
        this.showcaseTime = (this.showcaseTime + safeDt) % SHOWCASE_DURATION;
        const currS = this.showcaseTime / SHOWCASE_DURATION;
        // Fire choreographed Resonant Fold audio/visual climax right at s = 0.49
        if (prevS < 0.49 && currS >= 0.49 && this.onFoldRelease) {
          this.onFoldRelease(0.95, 0.0, 0.04);
        }
      } else {
        if (this.returning) {
          // Gracefully glide to Echoed Return (0.92) then settle near 0.02
          this.returnTimer += safeDt;
          const target = this.returnTimer < 2.2 ? 0.92 : 0.03;
          let diff = target - this.journeyProgress;
          if (diff < -0.5) diff += 1.0;
          if (diff > 0.5) diff -= 1.0;
          this.journeyProgress = (this.journeyProgress + diff * Math.min(1, safeDt * 1.9) + 1) % 1;
          if (this.returnTimer > 4.6) {
            this.returning = false;
            this.returnTimer = 0;
            if (this.onReturnComplete) {
              this.onReturnComplete();
            }
          }
        } else {
          this.journeyProgress = (this.journeyProgress + (safeDt * motionScale) / JOURNEY_DURATION) % 1.0;
        }
      }
    }

    // Pointer stillness & sustained attention physics (frozen when paused)
    this.pointerSpeed = lerp(this.pointerSpeed, 0, Math.min(1, safeDt * 7));
    if (!this.paused && !this.isDraggingRelic && !this.isHolding) {
      this.idleSeconds += safeDt;
    }

    const isFocused = this.pointerActive && this.pointerSpeed < 0.32 && !this.isDraggingRelic;
    if (isFocused && this.idleSeconds < 4.5) {
      this.steadySeconds = Math.min(this.steadySeconds + safeDt, 5.0);
    } else {
      this.steadySeconds = Math.max(this.steadySeconds - safeDt * 1.3, 0);
    }

    const targetAttention = smoothstep(0.35, 2.4, this.steadySeconds);
    this.attention = lerp(this.attention, targetAttention, Math.min(1, safeDt * 2.2));

    // Stillness layer blooms softly when user keeps hands still > 2.2s
    const targetStillness = smoothstep(2.2, 6.2, this.idleSeconds);
    this.stillness = lerp(this.stillness, targetStillness, Math.min(1, safeDt * (targetStillness > this.stillness ? 0.9 : 3.2)));

    // Smooth gaze vector
    const targetGazeX = this.pointerActive ? this.pointerNDC[0] : Math.sin(this.time * 0.21) * 0.14;
    const targetGazeY = this.pointerActive ? this.pointerNDC[1] : Math.cos(this.time * 0.17) * 0.10;
    this.smoothGaze[0] = lerp(this.smoothGaze[0], targetGazeX, Math.min(1, safeDt * 3.8));
    this.smoothGaze[1] = lerp(this.smoothGaze[1], targetGazeY, Math.min(1, safeDt * 3.8));

    // Hold charge
    if (this.isHolding) {
      this.holdTime += safeDt;
      const chargeTarget = clamp((this.holdTime - 0.12) / 1.45, 0, 1);
      this.holdCharge = lerp(this.holdCharge, chargeTarget, Math.min(1, safeDt * 6.0));
    } else {
      this.holdCharge = lerp(this.holdCharge, 0, Math.min(1, safeDt * 8.0));
    }

    // Pulse decay
    if (!this.paused) {
      this.pulseAge += safeDt;
    }

    // Relic angular momentum & gentle autonomous drift
    if (!this.isDraggingRelic && !this.paused && this.mode !== 'showcase') {
      const autoSpin = 0.22 * motionScale;
      const qAuto = quatFromAxisAngle(0.28, 0.92, 0.25, autoSpin * safeDt);
      const qVelY = quatFromAxisAngle(0, 1, 0, this.relicVel[0] * safeDt);
      const qVelX = quatFromAxisAngle(1, 0, 0, this.relicVel[1] * safeDt);
      this.relicQuat = quatNormalize(quatMul(qVelY, quatMul(qVelX, quatMul(qAuto, this.relicQuat))));
      const damp = Math.exp(-safeDt * 3.8);
      this.relicVel[0] *= damp;
      this.relicVel[1] *= damp;
    }

    this.relicUnfold = lerp(this.relicUnfold, this.relicUnfoldTarget, Math.min(1, safeDt * 3.4));

    // Compute phase weights & final uniforms
    if (this.mode === 'showcase') {
      this._computeShowcaseUniforms();
    } else {
      this._computeJourneyUniforms();
    }

    return this.uniforms;
  }

  _computeJourneyUniforms() {
    const p = this.journeyProgress;
    // Smooth overlapping dramatic weights for the 5 initiatory phases
    const ornamentAmt = smoothstep(0.10, 0.30, p) * (1.0 - smoothstep(0.86, 0.98, p) * 0.65);
    const foldAmt = smoothstep(0.18, 0.42, p) * (1.0 - smoothstep(0.82, 0.96, p));
    const chamberAmt = smoothstep(0.32, 0.52, p) * (1.0 - smoothstep(0.82, 0.95, p));
    const presenceAmt = smoothstep(0.36, 0.56, p) * (1.0 - smoothstep(0.84, 0.95, p))
      + this.attention * 0.42;
    const dialogueAmt = smoothstep(0.62, 0.76, p) * (1.0 - smoothstep(0.86, 0.96, p));
    const echoAmt = smoothstep(0.82, 0.94, p) + (1.0 - smoothstep(0.0, 0.08, p)) * 0.25;

    const pulseDur = 2.8;
    const pulseProgress = clamp(this.pulseAge / pulseDur, 0, 1);
    const activePulseStrength = this.pulseAge < pulseDur
      ? this.pulseStrength * (1.0 - smoothstep(0.65, 1.0, pulseProgress))
      : 0;

    // Relic naturally unfolds somewhat during Glossolalia phase while preserving user control
    const effectiveUnfold = clamp(
      this.relicUnfold + dialogueAmt * 0.38 + this.holdCharge * 0.25,
      0,
      1
    );

    const u = this.uniforms;
    u.time = this.time;
    u.phaseProgress = p;
    u.ornamentAmt = clamp(ornamentAmt, 0, 1);
    u.foldAmt = clamp(foldAmt, 0, 1);
    u.chamberAmt = clamp(chamberAmt, 0, 1);
    u.presenceAmt = clamp(presenceAmt, 0, 1);
    u.dialogueAmt = clamp(dialogueAmt, 0, 1);
    u.echoAmt = clamp(echoAmt, 0, 1);
    u.gaze[0] = this.smoothGaze[0];
    u.gaze[1] = this.smoothGaze[1];
    u.attention = this.attention;
    u.stillness = this.stillness;
    u.relicMat = quatToMat3(this.relicQuat);
    u.relicUnfold = effectiveUnfold;
    u.holdCharge = this.holdCharge;
    u.holdOrigin[0] = this.holdOrigin[0];
    u.holdOrigin[1] = this.holdOrigin[1];
    u.pulseProgress = pulseProgress;
    u.pulseStrength = activePulseStrength;
    u.pulseOrigin[0] = this.pulseOrigin[0];
    u.pulseOrigin[1] = this.pulseOrigin[1];
    u.utteranceCount = this.utteranceCount;
    u.utteranceSeed = this.utteranceSeed;
    u.utteranceVec[0] = this.utteranceVec[0];
    u.utteranceVec[1] = this.utteranceVec[1];
    u.utteranceVec[2] = this.utteranceVec[2];
    u.intensity = this.intensity;
    u.reducedMotion = this.reducedMotion ? 1.0 : 0.0;
    u.stabilizeCamera = this.stabilizeCamera ? 1.0 : 0.0;
    u.showcaseMode = 0.0;
  }

  /**
   * Deterministic 18-second Showcase Loop:
   * Strictly periodic so t=0 and t=18.0 produce identical geometry, rotation,
   * light, and camera — an arrestingly crisp opening frame, unmistakable
   * mid-loop transformation + Presence reveal + Resonant Fold, and seamless seam.
   */
  _computeShowcaseUniforms() {
    const s = this.showcaseTime / SHOWCASE_DURATION; // 0..1 exact
    const tau = s * Math.PI * 2.0;

    // Periodic phase envelope (0 at s=0 and s=1)
    const ornamentAmt = smoothstep(0.06, 0.22, s) * (1.0 - smoothstep(0.84, 0.97, s));
    const foldAmt = smoothstep(0.14, 0.34, s) * (1.0 - smoothstep(0.80, 0.95, s));
    const chamberAmt = smoothstep(0.26, 0.44, s) * (1.0 - smoothstep(0.78, 0.93, s));
    const presenceAmt = smoothstep(0.32, 0.48, s) * (1.0 - smoothstep(0.80, 0.93, s));
    const dialogueAmt = smoothstep(0.50, 0.64, s) * (1.0 - smoothstep(0.80, 0.91, s));
    const echoAmt = bell(s, 0.88, 0.14) * 0.95;

    // Periodic exact full rotations of the Relic (2 full turns around Y, 1 subtle nutation)
    const rotY = tau * 2.0;
    const rotX = Math.sin(tau) * 0.48;
    const rotZ = Math.sin(tau * 2.0) * 0.22;
    const qY = quatFromAxisAngle(0, 1, 0, rotY);
    const qX = quatFromAxisAngle(1, 0, 0, rotX);
    const qZ = quatFromAxisAngle(0, 0, 1, rotZ);
    const showcaseQuat = quatNormalize(quatMul(qY, quatMul(qX, qZ)));

    // Choreographed Resonant Fold climax right at s = 0.46..0.68
    const autoCharge = bell(s, 0.45, 0.08) * 0.85;
    const pulseStart = 0.49;
    const pulseLen = 0.19;
    let pulseProgress = 0;
    let pulseStrength = 0;
    if (s >= pulseStart && s <= pulseStart + pulseLen) {
      pulseProgress = (s - pulseStart) / pulseLen;
      pulseStrength = 0.95 * (1.0 - smoothstep(0.65, 1.0, pulseProgress));
    }

    // Periodic gentle gaze choreography (subtle recognition sweep)
    const gazeX = Math.sin(tau) * 0.32 * chamberAmt;
    const gazeY = Math.sin(tau * 2.0) * 0.16 * chamberAmt;

    // Showcase Relic unfolds dramatically during dialogue climax, returns closed at seam
    const relicUnfold = clamp(0.14 + smoothstep(0.38, 0.54, s) * 0.82 * (1.0 - smoothstep(0.76, 0.92, s)), 0, 1);

    // Stillness pearlescent shimmer blooms gracefully on return exhale
    const stillness = bell(s, 0.86, 0.14) * 0.85;

    // Blend user's live gaze/fold slightly if they interact during showcase
    const userPulseDur = 2.6;
    const userPulseActive = this.pulseAge < userPulseDur;
    const finalPulseProg = userPulseActive ? clamp(this.pulseAge / userPulseDur, 0, 1) : pulseProgress;
    const finalPulseStr = userPulseActive
      ? this.pulseStrength * (1.0 - smoothstep(0.65, 1.0, finalPulseProg))
      : pulseStrength;

    const u = this.uniforms;
    // Periodic shader clock (0..18 exact) — shader uses periodic trig when showcaseMode > 0.5
    u.time = this.showcaseTime;
    u.phaseProgress = s;
    u.ornamentAmt = ornamentAmt;
    u.foldAmt = foldAmt;
    u.chamberAmt = chamberAmt;
    u.presenceAmt = clamp(presenceAmt + this.attention * 0.25, 0, 1);
    u.dialogueAmt = dialogueAmt;
    u.echoAmt = echoAmt;
    u.gaze[0] = this.pointerActive ? lerp(gazeX, this.smoothGaze[0], 0.6) : gazeX;
    u.gaze[1] = this.pointerActive ? lerp(gazeY, this.smoothGaze[1], 0.6) : gazeY;
    u.attention = Math.max(bell(s, 0.55, 0.22) * 0.85, this.attention);
    u.stillness = Math.max(stillness, this.stillness * 0.5);
    u.relicMat = quatToMat3(this.isDraggingRelic ? this.relicQuat : showcaseQuat);
    u.relicUnfold = relicUnfold;
    u.holdCharge = Math.max(autoCharge, this.holdCharge);
    u.holdOrigin[0] = this.isHolding ? this.holdOrigin[0] : 0.0;
    u.holdOrigin[1] = this.isHolding ? this.holdOrigin[1] : 0.04;
    u.pulseProgress = finalPulseProg;
    u.pulseStrength = finalPulseStr;
    u.pulseOrigin[0] = userPulseActive ? this.pulseOrigin[0] : 0.0;
    u.pulseOrigin[1] = userPulseActive ? this.pulseOrigin[1] : 0.04;
    u.utteranceCount = Math.max(this.utteranceCount, s > 0.50 && s < 0.88 ? 2 : 0);
    u.utteranceSeed = 2.618;
    u.utteranceVec[0] = 0.0;
    u.utteranceVec[1] = 0.18;
    u.utteranceVec[2] = 0.95;
    u.intensity = this.intensity;
    u.reducedMotion = this.reducedMotion ? 1.0 : 0.0;
    u.stabilizeCamera = this.stabilizeCamera ? 1.0 : 0.0;
    u.showcaseMode = 1.0;
  }
}
