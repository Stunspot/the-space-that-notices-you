/**
 * Spatial Procedural Web Audio Architecture for THE SPACE THAT NOTICES YOU
 *
 * Clearly audible on both laptop speakers and headphones, click-free, stereo-panned,
 * and coupled directly to every spatial-geometry rule & gesture:
 *  1. Obsidian Cathedral Pad (mid-warmth D-Lydian resonance breathing with KIFS fold depth)
 *  2. Generative Crystalline Lattice (FM glass/brass partials emerging in Phases II–IV)
 *  3. Reciprocal Attention Formant Choir (warm vocal-like swell answering sustained gaze)
 *  4. Stillness Layer Shimmer (delicate high pearlescent overtones when hands rest)
 *  5. Tactile Relic Harmonics (stereo-panned metallic-crystal chimes on drag & unfold)
 *  6. Resonant Fold (unmistakable rising harmonic tension on hold -> lush cathedral chord + sub-drop on release)
 *
 * Muted by default; the entire visual & interactive experience remains complete when muted.
 */

// D-Lydian harmonic lattice (D4, E4, F#4, G#4, A4, C#5, D5, E5, F#5)
const LYDIAN_SCALE = [
  293.66, 329.63, 369.99, 415.30, 440.00, 554.37, 587.33, 659.25, 739.99,
];
const STILLNESS_NOTES = [880.0, 1108.73, 1318.51, 1479.98, 1760.0];

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.capturing = false;
    this.masterGain = null;
    this.speakerGain = null;
    this.captureGain = null;
    this.captureDest = null;
    this.nodes = null;

    this.lastChimeTime = 0;
    this.lastLatticeTime = 0;
    this.lastStillTime = 0;
    this.latticeStep = 0;
    this.prevUnfold = 0.14;
  }

  isEnabled() {
    return this.enabled;
  }

  _isActive() {
    return this.enabled || this.capturing;
  }

  isSupported() {
    return Boolean(window.AudioContext || window.webkitAudioContext);
  }

  _syncOutputGains() {
    if (!this.ctx || !this.masterGain || !this.speakerGain) return;
    const now = this.ctx.currentTime;
    const active = this._isActive();

    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(active ? 0.85 : 0.0, now + 0.16);

    this.speakerGain.gain.cancelScheduledValues(now);
    this.speakerGain.gain.setValueAtTime(this.speakerGain.gain.value, now);
    this.speakerGain.gain.linearRampToValueAtTime(this.enabled ? 0.72 : 0.0, now + 0.22);

    if (this.captureGain) {
      this.captureGain.gain.cancelScheduledValues(now);
      this.captureGain.gain.setValueAtTime(this.captureGain.gain.value, now);
      this.captureGain.gain.linearRampToValueAtTime(this.capturing ? 0.92 : 0.0, now + 0.12);
    }
  }

  async setEnabled(targetOn) {
    if (!this.isSupported()) {
      return { ok: false, enabled: false, unsupported: true, message: 'Web Audio is not supported in this browser.' };
    }

    try {
      if (!this.ctx) {
        this._init();
      }
      if (!this.ctx) {
        return { ok: false, enabled: false, unsupported: true, message: 'Unable to initialize Web Audio context.' };
      }

      if (targetOn && this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      const wasEnabled = this.enabled;
      this.enabled = Boolean(targetOn);
      this._syncOutputGains();

      if (this.enabled && !wasEnabled) {
        this._triggerWelcomeChord();
      }

      return { ok: true, enabled: this.enabled, unsupported: false, message: null };
    } catch (err) {
      this.enabled = false;
      this._syncOutputGains();
      return {
        ok: false,
        enabled: false,
        unsupported: false,
        message: err?.message || 'Audio playback could not start.',
      };
    }
  }

  /**
   * Prepare stereo Web Audio MediaStreamTrack for synchronized MP4/WebM capture.
   * Works both when speakers are enabled AND when muted (keeps speakers silent if muted).
   */
  async beginCapture() {
    if (!this.isSupported()) return null;
    try {
      if (!this.ctx) {
        this._init();
      }
      if (!this.ctx || !this.captureDest) return null;
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      this.capturing = true;
      this._syncOutputGains();
      // Fresh opening Threshold chord synced to t=0 of the 18s showcase loop
      this._triggerWelcomeChord();
      const tracks = this.captureDest.stream.getAudioTracks();
      return tracks[0] || null;
    } catch (err) {
      console.warn('[SoundEngine] Could not attach stereo audio to video capture:', err);
      this.capturing = false;
      this._syncOutputGains();
      return null;
    }
  }

  endCapture() {
    if (!this.capturing) return;
    this.capturing = false;
    this._syncOutputGains();
  }

  async toggle() {
    const res = await this.setEnabled(!this.enabled);
    return res.enabled;
  }

  _init() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    // Gentle mastering limiter/compressor
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 16;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.008;
    comp.release.value = 0.18;

    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(comp);
    this.masterGain = master;

    // Independent speaker bus vs. MediaStream capture bus
    const speakerGain = ctx.createGain();
    speakerGain.gain.value = 0.0;
    comp.connect(speakerGain);
    speakerGain.connect(ctx.destination);
    this.speakerGain = speakerGain;

    if (typeof ctx.createMediaStreamDestination === 'function') {
      const captureGain = ctx.createGain();
      captureGain.gain.value = 0.0;
      const captureDest = ctx.createMediaStreamDestination();
      comp.connect(captureGain);
      captureGain.connect(captureDest);
      this.captureGain = captureGain;
      this.captureDest = captureDest;
    }

    // --- Stereo Cathedral Space Reverb (Cross-Coupled Filtered Delay Network) ---
    const revIn = ctx.createGain();
    revIn.gain.value = 0.72;

    const delayL = ctx.createDelay(1.5);
    const delayR = ctx.createDelay(1.5);
    delayL.delayTime.value = 0.29;
    delayR.delayTime.value = 0.41;

    const dampL = ctx.createBiquadFilter();
    dampL.type = 'lowpass';
    dampL.frequency.value = 2600;

    const dampR = ctx.createBiquadFilter();
    dampR.type = 'lowpass';
    dampR.frequency.value = 2300;

    const fbL = ctx.createGain();
    const fbR = ctx.createGain();
    fbL.gain.value = 0.46;
    fbR.gain.value = 0.46;

    const panL = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const panR = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panL) panL.pan.value = -0.68;
    if (panR) panR.pan.value = 0.68;

    const revOut = ctx.createGain();
    revOut.gain.value = 0.52;

    revIn.connect(delayL);
    revIn.connect(delayR);
    delayL.connect(dampL);
    delayR.connect(dampR);
    dampL.connect(fbL);
    dampR.connect(fbR);
    fbL.connect(delayR);
    fbR.connect(delayL);

    if (panL && panR) {
      dampL.connect(panL);
      dampR.connect(panR);
      panL.connect(revOut);
      panR.connect(revOut);
    } else {
      dampL.connect(revOut);
      dampR.connect(revOut);
    }
    revOut.connect(master);

    // --- 1. Obsidian Cathedral Resonance Pad (audible on laptop speakers & headphones) ---
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 540;
    padFilter.Q.value = 1.6;

    const padGain = ctx.createGain();
    padGain.gain.value = 0.28;

    const padPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    padFilter.connect(padGain);
    if (padPan) {
      padGain.connect(padPan);
      padPan.connect(master);
      padPan.connect(revIn);
    } else {
      padGain.connect(master);
      padGain.connect(revIn);
    }

    // Warm D2 sub + D3 + A3 + E4 + F#4 detuned stereo oscillators
    const padSpecs = [
      { f: 73.42,  type: 'sine',     g: 0.26, detune: 0 },
      { f: 146.83, type: 'triangle', g: 0.24, detune: -5 },
      { f: 146.83, type: 'triangle', g: 0.24, detune: 6 },
      { f: 220.00, type: 'sine',     g: 0.18, detune: -4 },
      { f: 293.66, type: 'triangle', g: 0.14, detune: 5 },
      { f: 369.99, type: 'sine',     g: 0.11, detune: -3 },
    ];
    const padOscs = padSpecs.map((s) => {
      const o = ctx.createOscillator();
      o.type = s.type;
      o.frequency.value = s.f;
      o.detune.value = s.detune;
      const g = ctx.createGain();
      g.gain.value = s.g;
      o.connect(g);
      g.connect(padFilter);
      o.start();
      return { osc: o, baseFreq: s.f };
    });

    // --- 2. Reciprocal Attention Formant Choir ("Being Noticed Back") ---
    const choirIn = ctx.createGain();
    const formant1 = ctx.createBiquadFilter();
    formant1.type = 'bandpass';
    formant1.frequency.value = 680;
    formant1.Q.value = 3.2;

    const formant2 = ctx.createBiquadFilter();
    formant2.type = 'bandpass';
    formant2.frequency.value = 1280;
    formant2.Q.value = 3.6;

    const choirGain = ctx.createGain();
    choirGain.gain.value = 0.02;

    const choirPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

    choirIn.connect(formant1);
    choirIn.connect(formant2);
    formant1.connect(choirGain);
    formant2.connect(choirGain);
    if (choirPan) {
      choirGain.connect(choirPan);
      choirPan.connect(master);
      choirPan.connect(revIn);
    } else {
      choirGain.connect(master);
      choirGain.connect(revIn);
    }

    const choirNotes = [220.0, 293.66, 369.99, 440.0, 554.37];
    const choirOscs = choirNotes.map((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = (i - 2) * 4.5;
      const g = ctx.createGain();
      g.gain.value = 0.14;
      o.connect(g);
      g.connect(choirIn);
      o.start();
      return { osc: o, baseFreq: f };
    });

    // --- 3. Resonant Fold Tension Sweep (Hold -> Pitch & Shimmer Rise) ---
    const holdFilter = ctx.createBiquadFilter();
    holdFilter.type = 'bandpass';
    holdFilter.frequency.value = 480;
    holdFilter.Q.value = 3.5;

    const holdGain = ctx.createGain();
    holdGain.gain.value = 0.0001;

    const holdOsc1 = ctx.createOscillator();
    holdOsc1.type = 'triangle';
    holdOsc1.frequency.value = 220;

    const holdOsc2 = ctx.createOscillator();
    holdOsc2.type = 'sine';
    holdOsc2.frequency.value = 330;

    holdOsc1.connect(holdFilter);
    holdOsc2.connect(holdFilter);
    holdFilter.connect(holdGain);
    holdGain.connect(master);
    holdGain.connect(revIn);

    holdOsc1.start();
    holdOsc2.start();

    this.nodes = {
      revIn,
      padFilter,
      padGain,
      padPan,
      padOscs,
      formant1,
      formant2,
      choirGain,
      choirPan,
      choirOscs,
      holdFilter,
      holdGain,
      holdOsc1,
      holdOsc2,
    };
  }

  _triggerWelcomeChord() {
    if (!this.ctx || !this.nodes) return;
    // Spacious welcoming obsidian sanctuary chord (D3, A3, F#4, C#5)
    const notes = [146.83, 220.0, 369.99, 554.37];
    notes.forEach((f, idx) => {
      const pan = (idx / (notes.length - 1)) * 0.9 - 0.45;
      this._triggerFMBell(f, 0.14 / (1 + idx * 0.2), 2.4, idx * 0.06, pan, 1.5);
    });
  }

  update(u) {
    if (!this._isActive() || !this.ctx || !this.nodes) return;
    const now = this.ctx.currentTime;
    const n = this.nodes;
    const intens = 0.45 + 0.55 * u.intensity;

    // 1. Breathe the Obsidian Pad filter with KIFS fold depth, Relic unfold & attention
    const padCut = 420 + u.ornamentAmt * 420 + u.foldAmt * 480 + u.relicUnfold * 650 + u.attention * 340;
    n.padFilter.frequency.setTargetAtTime(padCut, now, 0.14);
    n.padFilter.Q.setTargetAtTime(1.4 + u.foldAmt * 2.2 + u.holdCharge * 3.0, now, 0.14);
    n.padGain.gain.setTargetAtTime((0.24 + u.chamberAmt * 0.10 + u.echoAmt * 0.06) * intens, now, 0.18);
    if (n.padPan) {
      n.padPan.pan.setTargetAtTime(u.gaze[0] * 0.28, now, 0.2);
    }

    // 2. Reciprocal Attention & Presence Formant Choir swells clearly when Presence emerges or notices you
    const choirLevel = (
      0.04 +
      u.chamberAmt * 0.14 +
      u.presenceAmt * 0.18 +
      u.attention * 0.26 +
      u.dialogueAmt * 0.14
    ) * intens;
    n.choirGain.gain.setTargetAtTime(choirLevel, now, 0.18);
    n.formant1.frequency.setTargetAtTime(620 + u.attention * 260 + u.gaze[1] * 90, now, 0.15);
    n.formant2.frequency.setTargetAtTime(1180 + u.relicUnfold * 520 + u.dialogueAmt * 260, now, 0.15);
    if (n.choirPan) {
      n.choirPan.pan.setTargetAtTime(u.gaze[0] * 0.55, now, 0.16);
    }

    // Gentle pitch-shimmer during Resonant Fold charge
    for (let i = 0; i < n.choirOscs.length; i++) {
      const item = n.choirOscs[i];
      const bend = 1.0 + u.holdCharge * 0.055 * (i % 2 === 0 ? 1 : -0.5);
      item.osc.frequency.setTargetAtTime(item.baseFreq * bend, now, 0.10);
    }

    // 3. Resonant Fold Tension Sweep (clearly audible while holding!)
    const holdLevel = u.holdCharge > 0.01 ? 0.04 + u.holdCharge * 0.34 : 0.0001;
    const baseHoldF = 220 * Math.pow(2, u.holdCharge * 1.0); // sweeps a full octave D/A -> high A
    n.holdGain.gain.setTargetAtTime(holdLevel, now, 0.06);
    n.holdOsc1.frequency.setTargetAtTime(baseHoldF, now, 0.06);
    n.holdOsc2.frequency.setTargetAtTime(baseHoldF * 1.498, now, 0.06);
    n.holdFilter.frequency.setTargetAtTime(420 + u.holdCharge * 1900, now, 0.06);

    // 4. Tactile sound when Relic Unfold changes (scroll / button / pinch)
    const unfoldDelta = Math.abs(u.relicUnfold - this.prevUnfold);
    this.prevUnfold = u.relicUnfold;
    if (unfoldDelta > 0.025 && now - this.lastChimeTime > 0.14) {
      this.lastChimeTime = now;
      const idx = Math.min(LYDIAN_SCALE.length - 1, Math.floor(u.relicUnfold * LYDIAN_SCALE.length));
      this._triggerFMBell(LYDIAN_SCALE[idx], 0.11, 1.3, 0, u.gaze[0] * 0.5, 2.0);
    }

    // 5. Generative Crystalline Geometric Lattice (emerges with recursive folding in Phases II–IV!)
    const latticeActivity = Math.max(u.ornamentAmt * 0.7, u.foldAmt, u.chamberAmt, u.dialogueAmt);
    const stepInterval = u.reducedMotion > 0.5
      ? 1.45
      : Math.max(0.38, 1.05 - latticeActivity * 0.58);

    if (latticeActivity > 0.18 && now - this.lastLatticeTime > stepInterval) {
      this.lastLatticeTime = now;
      // Golden-ratio quasi-periodic melody across the D-Lydian harmonic lattice
      const idx = (this.latticeStep * 3 + Math.floor(u.utteranceCount * 2)) % LYDIAN_SCALE.length;
      this.latticeStep++;
      const freq = LYDIAN_SCALE[idx];
      const pan = Math.sin(this.latticeStep * 1.618) * 0.65;
      const amp = (0.045 + latticeActivity * 0.085) * intens;
      this._triggerFMBell(freq, amp, 1.5, 0, pan, 1.6 + u.dialogueAmt * 1.4);
    }

    // 6. Stillness Layer: floating pearlescent high overtones when hands rest
    if (u.stillness > 0.35 && now - this.lastStillTime > 1.9) {
      this.lastStillTime = now;
      const note = STILLNESS_NOTES[Math.floor(Math.random() * STILLNESS_NOTES.length)];
      const pan = (Math.random() - 0.5) * 1.2;
      this._triggerFMBell(note, 0.085 * u.stillness, 2.8, 0, pan, 0.8);
    }
  }

  triggerFoldRelease(strength = 0.8) {
    if (!this._isActive() || !this.ctx || !this.nodes) return;
    const now = this.ctx.currentTime;

    // Deep obsidian sub-drop synced to the spherical inversion wave
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(146.83, now);
    sub.frequency.exponentialRampToValueAtTime(55.0, now + 0.85);
    const subG = this.ctx.createGain();
    subG.gain.setValueAtTime(0.001, now);
    subG.gain.linearRampToValueAtTime(0.32 * strength, now + 0.025);
    subG.gain.exponentialRampToValueAtTime(0.0005, now + 1.4);
    sub.connect(subG);
    subG.connect(this.masterGain);
    subG.connect(this.nodes.revIn);
    sub.start(now);
    sub.stop(now + 1.5);

    // Wide stereo cascading D-Lydian architectural utterance chord
    const chord = [146.83, 220.0, 329.63, 369.99, 415.30, 554.37, 739.99];
    chord.forEach((f, i) => {
      const pan = ((i % 2 === 0 ? -1 : 1) * (0.2 + i * 0.11));
      this._triggerFMBell(
        f,
        (0.16 / (1 + i * 0.22)) * strength,
        2.5 + i * 0.28,
        i * 0.038,
        Math.max(-0.85, Math.min(0.85, pan)),
        2.4
      );
    });
  }

  triggerRelicChime(velocity = 0.2) {
    if (!this._isActive() || !this.ctx || !this.nodes) return;
    const now = this.ctx.currentTime;
    if (now - this.lastChimeTime < 0.11) return;
    this.lastChimeTime = now;

    const idx = Math.floor(Math.random() * LYDIAN_SCALE.length);
    const freq = LYDIAN_SCALE[idx];
    const amp = Math.min(0.16, 0.055 + velocity * 0.28);
    const pan = (Math.random() - 0.5) * 0.9;
    this._triggerFMBell(freq, amp, 1.15, 0, pan, 2.2);
  }

  // Expressive stereo FM crystalline-metallic bell/glass voice (rich harmonics, zero clicks)
  _triggerFMBell(freq, peakGain, duration, delay = 0, pan = 0, fmIndex = 1.6) {
    const ctx = this.ctx;
    const start = ctx.currentTime + delay;

    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(freq, start);

    // Non-integer metallic/glass harmonic ratio (2.0 or 3.01) creates crystalline shimmer
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(freq * 2.005, start);

    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * fmIndex * 0.45, start);
    modGain.gain.exponentialRampToValueAtTime(0.01, start + duration * 0.65);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(Math.max(peakGain, 0.001), start + 0.022);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(env);

    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), start);
      env.connect(panner);
      panner.connect(this.masterGain);
      panner.connect(this.nodes.revIn);
    } else {
      env.connect(this.masterGain);
      env.connect(this.nodes.revIn);
    }

    mod.start(start);
    carrier.start(start);
    mod.stop(start + duration + 0.06);
    carrier.stop(start + duration + 0.06);
  }
}
