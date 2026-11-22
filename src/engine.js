/**
 * Multi-Pass WebGL2 Renderer + Adaptive Quality Governor + Canvas 2D Fallback
 * + Clean PNG Snapshot & 18-Second Showcase WebM Recorder
 */

import { QUAD_VERT, SCENE_FRAG, ECHO_FRAG, COMPOSITE_FRAG } from './shaders.js';

function createProceduralOrnamentCanvas() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0e16';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle geometric gold/jade/cyan fallback pattern while authored PNG/JPG loads
  ctx.save();
  ctx.translate(256, 256);
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    ctx.strokeStyle = 'rgba(245, 184, 65, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 128, 128, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(22, 199, 154, 0.45)';
    ctx.beginPath();
    ctx.moveTo(0, 24);
    ctx.lineTo(0, 248);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.65)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 180, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  return c;
}

function createProceduralMandalaCanvas() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#020306';
  ctx.fillRect(0, 0, 512, 512);

  ctx.save();
  ctx.translate(256, 256);
  for (let i = 0; i < 24; i++) {
    ctx.rotate(Math.PI / 12);
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(0, 229, 255, 0.5)' : 'rgba(255, 190, 100, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 110, 38, 108, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#020306';
  ctx.beginPath();
  ctx.arc(0, 0, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return c;
}

export class RenderEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.mode = 'none'; // 'webgl2' | 'canvas2d'
    this.fallbackCtx = null;
    this.fallbackImages = { poster: null, mandala: null };

    // Adaptive quality state
    this.quality = 0.85;       // 0.45..1.0 shader march quality
    this.renderScale = 0.85;   // internal FBO scale factor
    this.fpsEma = 60;
    this.lastFrameTime = performance.now();
    this.adaptCooldown = 0;
    this.width = 1;
    this.height = 1;
    this.fboWidth = 1;
    this.fboHeight = 1;

    // WebGL2 objects
    this.vao = null;
    this.progs = {};
    this.locs = {};
    this.textures = {};
    this.fbos = {};
    this.echoIndex = 0;
    this.texturesLoaded = { ornament: false, mandala: false };
    this.contextLost = false;
    this.onContextLost = null;
    this.onContextRestored = null;

    this._bindContextEvents();
    this._init();
  }

  _bindContextEvents() {
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      if (this.onContextLost) this.onContextLost();
    });

    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.fbos = {};
      this.fboWidth = 1;
      this.fboHeight = 1;
      if (this.gl) {
        try {
          this._initWebGL2(this.gl);
          this.mode = 'webgl2';
          const maxDim = Math.max(this.width, this.height);
          const capScale = maxDim > 1360 ? 1360 / maxDim : 1.0;
          this._rebuildFBOs(this.gl, this.width * capScale * this.renderScale, this.height * capScale * this.renderScale);
        } catch (err) {
          console.warn('[RenderEngine] WebGL2 restore failed, switching to Canvas 2D fallback:', err);
          this._initCanvas2DFallback();
        }
      }
      if (this.onContextRestored) this.onContextRestored(this.mode);
    });
  }

  _init() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true, // ensures instant clean PNG snapshots
      powerPreference: 'high-performance',
    });

    if (gl) {
      try {
        this._initWebGL2(gl);
        this.gl = gl;
        this.mode = 'webgl2';
        return;
      } catch (err) {
        console.warn('[RenderEngine] WebGL2 init failed, switching to Canvas 2D fallback:', err);
      }
    }

    this._initCanvas2DFallback();
  }

  _compileShader(gl, type, source) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(`Shader compile error: ${log}`);
    }
    return sh;
  }

  _createProgram(gl, vertSrc, fragSrc) {
    const vs = this._compileShader(gl, gl.VERTEX_SHADER, vertSrc);
    const fs = this._compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(`Program link error: ${log}`);
    }
    return prog;
  }

  _createTexture(gl, sourceCanvas, wrapMode) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);
    return tex;
  }

  _loadAuthoredTexture(gl, tex, url, key) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        this.texturesLoaded[key] = true;
      } catch (e) {
        console.warn(`[RenderEngine] Texture upload fallback kept for ${url}:`, e);
      }
    };
    img.onerror = () => {
      console.warn(`[RenderEngine] Could not load authored texture ${url}; using procedural fallback.`);
    };
    img.src = url;
  }

  _initWebGL2(gl) {
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.progs.scene = this._createProgram(gl, QUAD_VERT, SCENE_FRAG);
    this.progs.echo = this._createProgram(gl, QUAD_VERT, ECHO_FRAG);
    this.progs.composite = this._createProgram(gl, QUAD_VERT, COMPOSITE_FRAG);

    // Cache uniform locations
    const sceneNames = [
      'uResolution', 'uTime', 'uPhaseProgress', 'uOrnamentAmt', 'uFoldAmt',
      'uChamberAmt', 'uPresenceAmt', 'uDialogueAmt', 'uEchoAmt',
      'uGaze', 'uAttention', 'uStillness',
      'uRelicMat', 'uRelicUnfold',
      'uHoldCharge', 'uHoldOrigin', 'uPulseProgress', 'uPulseStrength', 'uPulseOrigin',
      'uUtteranceCount', 'uUtteranceSeed', 'uUtteranceVec',
      'uIntensity', 'uReducedMotion', 'uStabilizeCamera', 'uShowcaseMode',
      'uPortraitFactor', 'uQuality', 'uOrnamentTex', 'uMandalaTex',
    ];
    this.locs.scene = {};
    for (const name of sceneNames) {
      this.locs.scene[name] = gl.getUniformLocation(this.progs.scene, name);
    }

    this.locs.echo = {
      uCurrentTex: gl.getUniformLocation(this.progs.echo, 'uCurrentTex'),
      uPrevTex: gl.getUniformLocation(this.progs.echo, 'uPrevTex'),
      uTexelSize: gl.getUniformLocation(this.progs.echo, 'uTexelSize'),
      uEchoStrength: gl.getUniformLocation(this.progs.echo, 'uEchoStrength'),
      uReducedMotion: gl.getUniformLocation(this.progs.echo, 'uReducedMotion'),
    };

    this.locs.composite = {
      uSourceTex: gl.getUniformLocation(this.progs.composite, 'uSourceTex'),
      uTime: gl.getUniformLocation(this.progs.composite, 'uTime'),
      uIntensity: gl.getUniformLocation(this.progs.composite, 'uIntensity'),
      uReducedMotion: gl.getUniformLocation(this.progs.composite, 'uReducedMotion'),
    };

    // Upload instant procedural textures, then seamlessly upgrade to authored textures
    this.textures.ornament = this._createTexture(gl, createProceduralOrnamentCanvas(), gl.REPEAT);
    this.textures.mandala = this._createTexture(gl, createProceduralMandalaCanvas(), gl.CLAMP_TO_EDGE);

    this._loadAuthoredTexture(gl, this.textures.ornament, './assets/ornament_atlas.jpg', 'ornament');
    this._loadAuthoredTexture(gl, this.textures.mandala, './assets/iridescent_mandala.jpg', 'mandala');

    // Float render target check
    this.supportsFloatFBO = Boolean(gl.getExtension('EXT_color_buffer_float'));
    this._rebuildFBOs(gl, 640, 360);
  }

  _createRenderTarget(gl, w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const internalFmt = this.supportsFloatFBO ? gl.RGBA16F : gl.RGBA8;
    const type = this.supportsFloatFBO ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex };
  }

  _deleteRenderTarget(gl, rt) {
    if (!rt) return;
    gl.deleteFramebuffer(rt.fbo);
    gl.deleteTexture(rt.tex);
  }

  _rebuildFBOs(gl, w, h) {
    const safeW = Math.max(2, Math.floor(w));
    const safeH = Math.max(2, Math.floor(h));
    if (safeW === this.fboWidth && safeH === this.fboHeight && this.fbos.scene) return;

    this._deleteRenderTarget(gl, this.fbos.scene);
    this._deleteRenderTarget(gl, this.fbos.echo0);
    this._deleteRenderTarget(gl, this.fbos.echo1);

    this.fbos.scene = this._createRenderTarget(gl, safeW, safeH);
    this.fbos.echo0 = this._createRenderTarget(gl, safeW, safeH);
    this.fbos.echo1 = this._createRenderTarget(gl, safeW, safeH);
    this.fboWidth = safeW;
    this.fboHeight = safeH;

    // Clear feedback buffers to obsidian black
    for (const rt of [this.fbos.echo0, this.fbos.echo1]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
      gl.clearColor(0.01, 0.015, 0.025, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  resize(cssWidth, cssHeight) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    const w = Math.max(2, Math.floor(cssWidth * dpr));
    const h = Math.max(2, Math.floor(cssHeight * dpr));
    if (w === this.width && h === this.height) return;

    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;

    if (this.mode === 'webgl2' && this.gl) {
      // Cap internal raymarch buffer around ~1280px max dimension for silky 60fps
      const maxDim = Math.max(w, h);
      const capScale = maxDim > 1360 ? 1360 / maxDim : 1.0;
      const effScale = capScale * this.renderScale;
      this._rebuildFBOs(this.gl, w * effScale, h * effScale);
    }
  }

  _adaptQuality(dtMs) {
    if (dtMs <= 0 || dtMs > 250) return;
    const fps = 1000 / dtMs;
    this.fpsEma = this.fpsEma * 0.92 + fps * 0.08;
    this.adaptCooldown -= dtMs;
    if (this.adaptCooldown > 0) return;

    let changed = false;
    if (this.fpsEma < 36 && (this.quality > 0.45 || this.renderScale > 0.60)) {
      this.quality = Math.max(0.45, this.quality - 0.12);
      this.renderScale = Math.max(0.60, this.renderScale - 0.10);
      changed = true;
    } else if (this.fpsEma > 54 && (this.quality < 0.98 || this.renderScale < 0.95)) {
      this.quality = Math.min(0.98, this.quality + 0.06);
      this.renderScale = Math.min(0.95, this.renderScale + 0.05);
      changed = true;
    }

    if (changed) {
      this.adaptCooldown = 1400;
      if (this.mode === 'webgl2' && this.gl) {
        const maxDim = Math.max(this.width, this.height);
        const capScale = maxDim > 1360 ? 1360 / maxDim : 1.0;
        const effScale = capScale * this.renderScale;
        this._rebuildFBOs(this.gl, this.width * effScale, this.height * effScale);
      }
    }
  }

  render(u, dtMs) {
    if (this.contextLost) return;
    this._adaptQuality(dtMs);

    if (this.mode === 'webgl2') {
      this._renderWebGL2(u);
    } else {
      this._renderCanvas2D(u);
    }
  }

  _renderWebGL2(u) {
    const gl = this.gl;
    const portraitFactor = Math.max(0, Math.min(1, (1.15 - this.width / Math.max(1, this.height)) / 0.6));

    gl.bindVertexArray(this.vao);

    // --- PASS 1: Main Raymarched Initiation Scene ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.scene.fbo);
    gl.viewport(0, 0, this.fboWidth, this.fboHeight);
    gl.useProgram(this.progs.scene);

    const ls = this.locs.scene;
    gl.uniform2f(ls.uResolution, this.fboWidth, this.fboHeight);
    gl.uniform1f(ls.uTime, u.time);
    gl.uniform1f(ls.uPhaseProgress, u.phaseProgress);
    gl.uniform1f(ls.uOrnamentAmt, u.ornamentAmt);
    gl.uniform1f(ls.uFoldAmt, u.foldAmt);
    gl.uniform1f(ls.uChamberAmt, u.chamberAmt);
    gl.uniform1f(ls.uPresenceAmt, u.presenceAmt);
    gl.uniform1f(ls.uDialogueAmt, u.dialogueAmt);
    gl.uniform1f(ls.uEchoAmt, u.echoAmt);

    gl.uniform2f(ls.uGaze, u.gaze[0], u.gaze[1]);
    gl.uniform1f(ls.uAttention, u.attention);
    gl.uniform1f(ls.uStillness, u.stillness);

    gl.uniformMatrix3fv(ls.uRelicMat, false, u.relicMat);
    gl.uniform1f(ls.uRelicUnfold, u.relicUnfold);

    gl.uniform1f(ls.uHoldCharge, u.holdCharge);
    gl.uniform2f(ls.uHoldOrigin, u.holdOrigin[0], u.holdOrigin[1]);
    gl.uniform1f(ls.uPulseProgress, u.pulseProgress);
    gl.uniform1f(ls.uPulseStrength, u.pulseStrength);
    gl.uniform2f(ls.uPulseOrigin, u.pulseOrigin[0], u.pulseOrigin[1]);
    gl.uniform1f(ls.uUtteranceCount, u.utteranceCount);
    gl.uniform1f(ls.uUtteranceSeed, u.utteranceSeed);
    gl.uniform3f(ls.uUtteranceVec, u.utteranceVec[0], u.utteranceVec[1], u.utteranceVec[2]);

    gl.uniform1f(ls.uIntensity, u.intensity);
    gl.uniform1f(ls.uReducedMotion, u.reducedMotion);
    gl.uniform1f(ls.uStabilizeCamera, u.stabilizeCamera);
    gl.uniform1f(ls.uShowcaseMode, u.showcaseMode);
    gl.uniform1f(ls.uPortraitFactor, portraitFactor);
    gl.uniform1f(ls.uQuality, this.quality);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.ornament);
    gl.uniform1i(ls.uOrnamentTex, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.mandala);
    gl.uniform1i(ls.uMandalaTex, 1);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // --- PASS 2: Soft Bloom & Temporal Echo Ping-Pong ---
    const readEcho = this.echoIndex === 0 ? this.fbos.echo0 : this.fbos.echo1;
    const writeEcho = this.echoIndex === 0 ? this.fbos.echo1 : this.fbos.echo0;

    gl.bindFramebuffer(gl.FRAMEBUFFER, writeEcho.fbo);
    gl.viewport(0, 0, this.fboWidth, this.fboHeight);
    gl.useProgram(this.progs.echo);

    const le = this.locs.echo;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos.scene.tex);
    gl.uniform1i(le.uCurrentTex, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readEcho.tex);
    gl.uniform1i(le.uPrevTex, 1);

    gl.uniform2f(le.uTexelSize, 1.0 / this.fboWidth, 1.0 / this.fboHeight);
    const echoStrength = 0.14 + u.dialogueAmt * 0.20 + u.echoAmt * 0.16 + u.pulseStrength * 0.22;
    gl.uniform1f(le.uEchoStrength, echoStrength);
    gl.uniform1f(le.uReducedMotion, u.reducedMotion);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // --- PASS 3: Composite, Filmic Tonemapping & Luminance Governor ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.progs.composite);

    const lc = this.locs.composite;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, writeEcho.tex);
    gl.uniform1i(lc.uSourceTex, 0);
    gl.uniform1f(lc.uTime, u.time);
    gl.uniform1f(lc.uIntensity, u.intensity);
    gl.uniform1f(lc.uReducedMotion, u.reducedMotion);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.echoIndex = 1 - this.echoIndex;
  }

  // =========================================================================
  // CANVAS 2D INTERACTIVE FALLBACK (when WebGL2 is unavailable)
  // =========================================================================
  _initCanvas2DFallback() {
    this.mode = 'canvas2d';
    this.fallbackCtx = this.canvas.getContext('2d');

    const poster = new Image();
    poster.onload = () => { this.fallbackImages.poster = poster; };
    poster.src = './assets/poster_still.jpg';

    const mandala = new Image();
    mandala.onload = () => { this.fallbackImages.mandala = mandala; };
    mandala.src = './assets/iridescent_mandala.jpg';
  }

  _renderCanvas2D(u) {
    const ctx = this.fallbackCtx;
    if (!ctx) return;
    const w = this.width;
    const h = this.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const minDim = Math.min(w, h);

    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, w, h);

    // Authored architectural backdrop with gentle breathing scale
    if (this.fallbackImages.poster) {
      const img = this.fallbackImages.poster;
      const scale = Math.max(w / img.width, h / img.height) * (1.0 + u.chamberAmt * 0.08);
      const iw = img.width * scale;
      const ih = img.height * scale;
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.drawImage(img, cx - iw * 0.5 - u.gaze[0] * 18, cy - ih * 0.5 + u.gaze[1] * 12, iw, ih);
      ctx.restore();
    }

    // Rotating pearlescent mandala presence/stillness veil
    if (this.fallbackImages.mandala) {
      const m = this.fallbackImages.mandala;
      const mSize = minDim * (0.62 + u.chamberAmt * 0.25 + u.relicUnfold * 0.14);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.25 + u.ornamentAmt * 0.35 + u.stillness * 0.35 + u.attention * 0.2;
      ctx.translate(cx + u.gaze[0] * 28, cy - u.gaze[1] * 20);
      ctx.rotate(u.time * 0.18);
      ctx.drawImage(m, -mSize * 0.5, -mSize * 0.5, mSize, mSize);
      ctx.restore();
    }

    // Interactive Impossible Relic nested polyhedral projection
    const r = minDim * (0.14 + u.relicUnfold * 0.06);
    ctx.save();
    ctx.translate(cx, cy);
    for (let ring = 0; ring < 3; ring++) {
      ctx.save();
      ctx.rotate(u.time * (0.35 - ring * 0.18) + u.relicMat[0] * 1.4);
      const sides = 6 + ring * 2;
      const rad = r * (1.0 - ring * 0.22 + u.relicUnfold * ring * 0.12);
      ctx.strokeStyle = ring === 0 ? '#f5b841' : ring === 1 ? '#00e5ff' : '#ff5e62';
      ctx.lineWidth = 2.2 - ring * 0.4;
      ctx.beginPath();
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const x = Math.cos(a) * rad;
        const y = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // Resonant Fold expanding pulse ring
    if (u.pulseStrength > 0.01) {
      ctx.save();
      ctx.strokeStyle = `rgba(22, 224, 184, ${u.pulseStrength * 0.85})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx + u.pulseOrigin[0] * w * 0.5, cy - u.pulseOrigin[1] * h * 0.5, u.pulseProgress * minDim * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // =========================================================================
  // SHARING & CAPTURE HELPERS
  // =========================================================================
  capturePNG(filename = 'the-space-that-notices-you.png') {
    const dataUrl = this.canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }

  supportsVideoCapture() {
    return typeof this.canvas.captureStream === 'function' && typeof MediaRecorder !== 'undefined';
  }

  startVideoCapture(durationMs, onDone, onError) {
    if (!this.supportsVideoCapture()) {
      if (onError) onError('Video recording is not supported in this browser.');
      return null;
    }

    let settled = false;
    let stopTimer = null;
    let stream = null;
    let recorder = null;

    const cleanupStream = () => {
      if (stopTimer !== null) {
        clearTimeout(stopTimer);
        stopTimer = null;
      }
      if (stream) {
        try {
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          // Ignore track cleanup errors on already-ended streams
        }
        stream = null;
      }
    };

    const failOnce = (msg) => {
      if (settled) return;
      settled = true;
      cleanupStream();
      if (onError) onError(msg);
    };

    try {
      const mimeCandidates = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ];
      const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
      stream = this.canvas.captureStream(60);
      recorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined,
        videoBitsPerSecond: 8_000_000,
      });
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        if (settled) return;
        settled = true;
        cleanupStream();
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'the-space-that-notices-you-18s-loop.webm';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
        }
        if (onDone) onDone();
      };
      recorder.onerror = (err) => {
        failOnce(err?.error?.message || err?.message || 'Recording error');
      };
      recorder.start(250);
      stopTimer = setTimeout(() => {
        if (recorder && recorder.state === 'recording') {
          try {
            recorder.stop();
          } catch (err) {
            failOnce(err?.message || 'Failed to stop recording');
          }
        }
      }, durationMs);
    } catch (err) {
      failOnce(err?.message || 'Could not start video recording');
      return null;
    }

    return () => {
      if (stopTimer !== null) {
        clearTimeout(stopTimer);
        stopTimer = null;
      }
      if (recorder && recorder.state === 'recording') {
        try {
          recorder.stop();
        } catch (err) {
          failOnce(err?.message || 'Failed to stop recording');
        }
      } else if (!settled) {
        failOnce('Recording stopped before media capture became active.');
      }
    };
  }
}
