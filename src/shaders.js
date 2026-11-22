/**
 * WebGL2 GLSL ES 3.00 Shaders for THE SPACE THAT NOTICES YOU
 *
 * 5-Dimensional Dodecahedral Polytopes Unfolding into Crystalline Chrysanthemums:
 * - Zero soft circular hoops or painted wall textures; every form is razor-faceted,
 *   beveled polyhedral geometry governed by exact golden-ratio Dodecahedral (H3)
 *   Coxeter mirror groups lifted through 4D/5D (w, v) double-rotations.
 * - Dramatic off-axis sculptural lighting + real raymarched cast shadows + crisp
 *   facet-normal specular reflections give deep 3D architectural relief (never flat).
 * - Strictly calibrated volcanic palette: pure ink Obsidian, 24k forged Molten Gold,
 *   incandescent Cyan Fire, Imperial Malachite Jade, hot Cinnabar-Coral (zero violet/pink),
 *   and mineral Silver-Cyan-Champagne Pearlescence (zero pastel lavender).
 */

export const QUAD_VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const SCENE_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2  uResolution;
uniform float uTime;
uniform float uPhaseProgress;
uniform float uOrnamentAmt;
uniform float uFoldAmt;
uniform float uChamberAmt;
uniform float uPresenceAmt;
uniform float uDialogueAmt;
uniform float uEchoAmt;

uniform vec2  uGaze;
uniform float uAttention;
uniform float uStillness;

uniform mat3  uRelicMat;
uniform float uRelicUnfold;

uniform float uHoldCharge;
uniform vec2  uHoldOrigin;
uniform float uPulseProgress;
uniform float uPulseStrength;
uniform vec2  uPulseOrigin;
uniform float uUtteranceCount;
uniform float uUtteranceSeed;
uniform vec3  uUtteranceVec;

uniform float uIntensity;
uniform float uReducedMotion;
uniform float uStabilizeCamera;
uniform float uShowcaseMode;
uniform float uPortraitFactor;
uniform float uQuality;

uniform sampler2D uOrnamentTex;
uniform sampler2D uMandalaTex;

const float PI  = 3.14159265359;
const float TAU = 6.28318530718;
const float PHI = 1.61803398875;
const float SHOWCASE_W = TAU / 18.0;

// Pure Jewel & Volcanic Palette (STRICTLY ZERO purple, lavender, or pastel pink)
const vec3 COL_OBSIDIAN  = vec3(0.004, 0.007, 0.011);
const vec3 COL_CYAN      = vec3(0.00, 0.92, 1.00);
const vec3 COL_GOLD      = vec3(1.00, 0.56, 0.06);
const vec3 COL_GOLD_HI   = vec3(1.00, 0.85, 0.38);
const vec3 COL_CORAL     = vec3(1.00, 0.20, 0.05); // hot cinnabar-vermilion coral (zero blue -> never pink!)
const vec3 COL_JADE      = vec3(0.02, 0.74, 0.44); // deep imperial malachite jade

// Exact Golden-Ratio Dodecahedral / Icosahedral (H3) Coxeter Symmetry Normals
const vec3 DODEC_N1 = normalize(vec3(0.0, 1.0, PHI));
const vec3 DODEC_N2 = normalize(vec3(1.0, PHI, 0.0));
const vec3 DODEC_N3 = normalize(vec3(PHI, 0.0, 1.0));
const vec3 ICO_N1   = normalize(vec3(-PHI, PHI - 1.0, 1.0));
const vec3 ICO_N2   = normalize(vec3(1.0, -PHI, PHI + 1.0));

float clk(float speed, float showcaseCycles) {
  return mix(uTime * speed, uTime * SHOWCASE_W * showcaseCycles, uShowcaseMode);
}

mat2 rot2(float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / max(k, 0.0001), 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float smax(float a, float b, float k) {
  return -smin(-a, -b, k);
}

vec3 foldPlane(vec3 p, vec3 n) {
  return p - 2.0 * min(0.0, dot(p, n)) * n;
}

// Mineral Pearlescent Nacre Sheen: strictly silver-white -> ice-cyan -> jade -> champagne gold
// (ZERO violet, magenta, or pink!)
vec3 mineralPearl(float cosTheta, float shift) {
  float t = fract((1.0 - clamp(cosTheta, 0.0, 1.0)) * 1.35 + shift * 0.25);
  vec3 c0 = vec3(0.84, 0.96, 1.00); // cold ice-silver
  vec3 c1 = vec3(0.32, 0.94, 0.80); // pale seafoam-jade
  vec3 c2 = vec3(1.00, 0.88, 0.52); // warm champagne gold
  if (t < 0.333) return mix(c0, c1, t * 3.0);
  if (t < 0.666) return mix(c1, c2, (t - 0.333) * 3.0);
  return mix(c2, c0, (t - 0.666) * 3.0);
}

// Exact Regular Pentagonal Dodecahedron SDF (razor-faceted 12-faced Platonic solid!)
float sdDodecahedron(vec3 p, float r) {
  p = abs(p);
  float d = max(dot(p, DODEC_N1), max(dot(p, DODEC_N2), dot(p, DODEC_N3)));
  return d - r;
}

// Exact Sharp-Edged Octagonal/Decagonal Prismatic Ring (ZERO curvy toruses!)
float sdPolygonRing(vec3 p, float r, float thickness, float depth, float sides) {
  float a = atan(p.y, p.x);
  float sec = TAU / sides;
  float fa = mod(a + sec * 0.5, sec) - sec * 0.5;
  // Flat chordal distance to polygon facet
  float polyR = length(p.xy) * cos(fa);
  vec2 q = vec2(abs(polyR - r) - thickness, abs(p.z) - depth);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdFacetBlade(vec3 p, vec3 b) {
  // Sharp chamfered crystal prism blade
  vec3 q = abs(p) - b;
  float box = length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
  float bevel = (abs(p.x) + abs(p.z) * 1.4 - (b.x + b.z * 1.15)) * 0.58;
  return max(box, bevel);
}

// =========================================================================
// GLOBAL GEOMETRIC ORBIT TRAP
// trap.x = sharp dihedral edge proximity -> forged 24k molten gold ridges
// trap.y = pentagonal fold intersection  -> incandescent cyan fire seams
// trap.z = 5D hyper-slice boundary       -> hot cinnabar-coral / imperial jade
// trap.w = facet index / depth
// =========================================================================
vec4 gTrap = vec4(1.0);

vec3 getRelicCenter() {
  float hover = sin(clk(0.75, 1.0)) * 0.025 * (1.0 - uReducedMotion * 0.7);
  float presDrop = -0.34 * uPresenceAmt;
  return vec3(0.0, -0.06 + presDrop + hover, -0.88);
}

vec3 getPresenceCenter() {
  float lean = uAttention * 0.48 + uDialogueAmt * 0.28;
  float hover = sin(clk(0.55, 1.0)) * 0.024 * (1.0 - uReducedMotion * 0.7);
  return vec3(
    uGaze.x * 0.30 * uPresenceAmt,
    0.86 + uGaze.y * 0.16 * uPresenceAmt + hover,
    2.20 - lean
  );
}

// =========================================================================
// 1. THE IMPOSSIBLE RELIC — Hollow 30-Edge Golden Dodecahedron Cage +
//    5D Hyper-Dodecahedron Unfolding into a Razor-Faceted Chrysanthemum
// =========================================================================
vec2 sdImpossibleRelic(vec3 p, out vec4 trap) {
  trap = vec4(1e4, 1e4, 1e4, 0.0);
  vec3 rc = getRelicCenter();
  vec3 q = uRelicMat * (p - rc);

  float bound = length(q) - 1.05;
  if (bound > 0.25) return vec2(bound, 2.0);

  float unfold = uRelicUnfold;
  float breathe = 0.58 * (1.0 + 0.015 * sin(clk(1.1, 2.0)) * (1.0 - uReducedMotion * 0.7)
                  - uHoldCharge * 0.055);
  q /= breathe;

  // Lift 3D coordinates into 5D (x, y, z, w, v)
  float w = 0.22 * sin(clk(0.45, 1.0)) + unfold * 0.62;
  float v = 0.18 * cos(clk(0.35, 1.0)) + uDialogueAmt * 0.45;

  // 5D Clifford double-rotations (z-w and x-v planes)
  float rotZW = unfold * 1.25 + uDialogueAmt * 0.45 + clk(0.24, 1.0) * (1.0 - uReducedMotion * 0.65);
  float rotXV = unfold * 0.90 + uHoldCharge * 0.65;
  vec2 zw = rot2(rotZW) * vec2(q.z, w);
  vec2 xv = rot2(rotXV) * vec2(q.x, v);

  vec3 z = vec3(xv.x, q.y, zw.x);
  float wFold = abs(zw.y);
  float vFold = abs(xv.y);

  // 3 razor-sharp iterations of Dodecahedral (H3) Chrysanthemum Unfolding
  float scale = 1.0;
  float kScale = mix(1.56, 1.72, unfold);
  float petalAngle = 0.14 + unfold * 0.62 + uOrnamentAmt * 0.18;
  vec3 dodecOffset = mix(vec3(0.56, 0.38, 0.26), vec3(0.74, 0.54, 0.42), unfold);

  for (int i = 0; i < 3; i++) {
    z = abs(z);
    z = foldPlane(z, ICO_N1);
    z = foldPlane(z, ICO_N2);
    z = foldPlane(z, ICO_N1);

    z.xy *= rot2(petalAngle + wFold * 0.36);
    z.yz *= rot2(-petalAngle * 0.65 + vFold * 0.28);

    z = z * kScale - dodecOffset * (kScale - 1.0);
    scale *= kScale;

    float dFace = abs(dot(abs(z), DODEC_N1) - 0.48);
    trap.x = min(trap.x, abs(z.x - z.y));
    trap.y = min(trap.y, dFace);
    trap.z = min(trap.z, abs(length(z) - 0.65));
    trap.w += 0.33;
  }

  // Interlocking sharp obsidian/jade/gold chrysanthemum dodecahedral petals
  float dPetal  = sdDodecahedron(z, 0.48);
  float dBlade  = sdFacetBlade(z - vec3(0.22, 0.0, 0.0), vec3(0.46, 0.12, 0.08));
  float dPoly   = min(dPetal, dBlade) / scale;

  // EXACT Hollow 30-Edge Forged-Gold Dodecahedron Wireframe Cage!
  // For a regular dodecahedron of inradius R, face inradius = R / PHI (0.61803 * R).
  // Carving perpendicular distance < R * 0.535 opens ALL 12 pentagonal faces cleanly!
  vec3 qc = q;
  float spin = clk(0.32, 1.0);
  qc.xz *= rot2(spin);
  float cageR = 0.80 + unfold * 0.16;
  vec3 a = abs(qc);
  float p1 = length(a - DODEC_N1 * dot(a, DODEC_N1));
  float p2 = length(a - DODEC_N2 * dot(a, DODEC_N2));
  float p3 = length(a - DODEC_N3 * dot(a, DODEC_N3));
  float minFaceAxis = min(p1, min(p2, p3));
  float shellWall = abs(sdDodecahedron(qc, cageR)) - 0.026;
  float dodecCage = max(shellWall, (cageR * 0.535) - minFaceAxis);

  // Second counter-rotated inner golden dodecahedral edge-frame when unfolding!
  vec3 qc2 = q;
  qc2.yz *= rot2(-spin * 1.3 + unfold * 0.8);
  float cageR2 = 0.54 + unfold * 0.12;
  vec3 a2 = abs(qc2);
  float mfa2 = min(
    length(a2 - DODEC_N1 * dot(a2, DODEC_N1)),
    min(length(a2 - DODEC_N2 * dot(a2, DODEC_N2)), length(a2 - DODEC_N3 * dot(a2, DODEC_N3)))
  );
  float dodecCage2 = max(abs(sdDodecahedron(qc2, cageR2)) - 0.018, (cageR2 * 0.535) - mfa2);
  dodecCage = min(dodecCage, dodecCage2);

  // Carve hollow dodecahedral sanctuary inside the unfolding chrysanthemum
  float cavityR = 0.25 + unfold * 0.24;
  float shell   = max(dPoly, -(sdDodecahedron(q, cavityR)));
  shell         = max(shell, sdDodecahedron(q, 0.72 + unfold * 0.18));

  // Faceted Dodecahedral Portal Crystal inside the core
  float portal = sdDodecahedron(q, 0.22 + unfold * 0.19);

  vec2 res = vec2(shell * breathe * 0.85, 2.0);
  if (dodecCage * breathe * 0.82 < res.x) res = vec2(dodecCage * breathe * 0.82, 3.0);
  if (portal * breathe < res.x) res = vec2(portal * breathe, 4.0);
  return res;
}

// =========================================================================
// 2. EMERGENT PRESENCE — Razor-Faceted Polyhedral Hyper-Seraph (ZERO Curves!)
//    Built strictly from interlocking angular obsidian & forged-gold pentagonal
//    crystal fan-blades & a 10-sided faceted polyhedral gaze-aperture!
// =========================================================================
vec2 sdEmergentPresence(vec3 p, float presVis, out vec4 trap) {
  trap = vec4(1e4, 1e4, 1e4, 0.0);
  if (presVis < 0.01) return vec2(1e4, 5.0);

  vec3 pc = getPresenceCenter();
  vec3 q = p - pc;

  float bound = length(q) - 2.95;
  if (bound > 0.45) return vec2(bound, 5.0);

  // Reciprocal noticing: turns its entire angular polyhedral symmetry toward your gaze!
  float yaw   = clamp(-uGaze.x * 0.44, -0.50, 0.50) * (0.45 + 0.55 * uAttention);
  float pitch = clamp(uGaze.y * 0.30, -0.36, 0.36) * (0.45 + 0.55 * uAttention);
  q.xz *= rot2(yaw);
  q.yz *= rot2(pitch);

  float sc = mix(0.68, 1.06, presVis);
  q /= sc;

  // --- Angular Decagonal / Pentagonal Polyhedral Fan-Wings (3 articulated crystal tiers) ---
  vec3 qw = q;
  qw.x = abs(qw.x);
  float spread = 0.22 * uAttention + 0.05 * sin(clk(0.65, 1.0)) * (1.0 - uReducedMotion * 0.7);

  float dWings = 1e4;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    // Fan sharp angular crystal monoliths radially in exact pentagonal increments (PI/5)
    vec3 wi = qw - vec3(0.56 + fi * 0.28, 0.22 - fi * 0.18, fi * 0.18);
    wi.xy *= rot2(-0.22 - fi * 0.34 + spread * (1.0 + fi * 0.22));
    wi.xz *= rot2(0.28 + fi * 0.10); // dramatic 3D perspective angle toward viewer!
    float blade = sdFacetBlade(wi, vec3(0.68 + fi * 0.14, 0.085 - fi * 0.008, 0.095));
    // Secondary crisp stepped chevron rib interlocked at golden-ratio angle
    vec3 w2 = wi - vec3(0.24, 0.14, -0.06);
    w2.xy *= rot2(0.628318); // 36 deg pentagonal angle
    float rib2 = sdFacetBlade(w2, vec3(0.42, 0.052, 0.065));
    float tier = min(blade, rib2);
    dWings = min(dWings, tier);
    trap.x = min(trap.x, abs(wi.y));
    trap.z = min(trap.z, abs(wi.z));
  }

  // Razor-faceted Decagonal (10-sided) Polyhedral Crown Halo & Inner Pentagonal Bezel
  vec3 qh = q;
  qh.xy *= rot2(clk(0.14, 1.0));
  float decaHalo  = sdPolygonRing(qh, 1.04, 0.055, 0.09, 10.0);
  float pentaRing = sdPolygonRing(q - vec3(0.0, 0.0, -0.08), 0.56, 0.048, 0.10, 10.0);

  // Upper crystalline spire chevrons uniting Presence seamlessly into the faceted cathedral vault
  vec3 qs = qw - vec3(0.32, 0.92, 0.16);
  qs.xy *= rot2(0.52);
  float spire = sdFacetBlade(qs, vec3(0.14, 0.72, 0.11));

  float body = min(min(dWings, spire), min(decaHalo, pentaRing));
  // Carve sharp 10-sided faceted ocular well
  float eyeCut = sdPolygonRing(q, 0.0, 0.49, 0.5, 10.0);
  body = max(body, -eyeCut);

  // Deep 3D Recessed Angular 10-Bladed Crystalline Aperture (NO circular disc!)
  vec3 qi = q;
  float rEye = length(qi.xy);
  float angI = atan(qi.y, qi.x);
  float sec10 = TAU / 10.0;
  float aFold = abs(mod(angI + sec10 * 0.5, sec10) - sec10 * 0.5);
  // Stepped sharp faceted pyramidal iris recess
  float polyR = rEye * cos(aFold);
  float stepZ = 0.02 + (0.50 - polyR) * 0.48 + 0.03 * sign(sin(aFold * 18.0)) * step(0.18, polyR);
  float irisFacet = max(polyR - 0.50, abs(qi.z - stepZ) - 0.032);

  trap.y = min(trap.y, abs(polyR - 0.56));
  trap.w = 0.65;

  vec2 res = vec2(body * sc * 0.85, 5.0);
  if (irisFacet * sc < res.x) {
    res = vec2(irisFacet * sc, 6.0);
  }
  return res;
}

// =========================================================================
// 3. THE CHAMBER — Deep-Perspective 5D Dodecahedral Chrysanthemum Cathedral
//    ZERO circular rings! Monumental angular obsidian & molten-gold faceted
//    pentagonal vaults unfolding in 3D depth into layered geometric chrysanthemums!
// =========================================================================
vec2 sdEmergentChamber(vec3 p, out vec4 trap) {
  trap = vec4(1e4, 1e4, 1e4, 0.0);
  float intensity = uIntensity;
  float orn   = uOrnamentAmt * intensity;
  float fold  = uFoldAmt * intensity;
  float chamb = uChamberAmt * intensity;
  float dial  = uDialogueAmt * intensity;

  // Sharp Mirror-Black Obsidian Floor
  float floorY = -1.48 - chamb * 0.14;
  float dFloor = p.y - floorY;

  // --- Deep Architectural Nave Coordinates ---
  vec3 q = p;
  float zFlow = clk(0.42, 2.0) * (0.14 + chamb * 0.72) * (1.0 - uReducedMotion * 0.65);

  // Gravitational fold pinch while holding Resonant Fold
  if (uHoldCharge > 0.005) {
    vec3 hPt = vec3(uHoldOrigin.x * 1.8, uHoldOrigin.y * 1.2, 0.0);
    vec3 toH = q - hPt;
    float dH = length(toH) + 0.85;
    q -= toH * (uHoldCharge * 0.15 / (dH * dH));
  }

  // Exact 5-fold -> 10-fold Pentagonal/Decagonal Chrysanthemum Symmetry around the nave!
  // (Pentagonal symmetry is the native symmetry of the 5D dodecahedron & chrysanthemum!)
  float ang = atan(q.y - 0.10, q.x);
  float rad = length(vec2(q.x, q.y - 0.10));
  float symOrder = mix(5.0, 10.0, smoothstep(0.08, 0.65, orn * 0.6 + fold * 0.8));
  float sec = TAU / symOrder;
  float fAng = abs(mod(ang + sec * 0.5, sec) - sec * 0.5);

  // Tile cleanly in 3D space around the nave so dodecahedra pack every bay without escaping!
  float zPeriod = 3.6;
  float zTile = mod(q.z - zFlow + zPeriod * 0.5, zPeriod) - zPeriod * 0.5;
  vec3 z = vec3(
    mod(cos(fAng) * rad + 1.8, 3.6) - 1.8,
    mod(sin(fAng) * rad + 1.8, 3.6) - 1.8,
    zTile
  );

  // Coupled 5D torsion from Relic Unfold & Resonant Fold utterances
  float coupling = clamp(dial * 0.55 + max(0.0, uRelicUnfold - 0.45) * 0.65 + uUtteranceCount * 0.09, 0.0, 1.0);
  if (coupling > 0.01) {
    z.xy *= rot2(z.z * 0.12 * coupling);
  }

  // --- 3-ITERATION 5D DODECAHEDRAL -> CHRYSANTHEMUM FOLDING RULE ---
  // Bounded folding keeps razor-faceted 3D dodecahedra & unfolding chrysanthemum petals
  // filling the entire vaulted cathedral nave in crisp, dramatic sculptural relief!
  float w5 = 0.20 * orn + 0.55 * fold + 0.35 * coupling;
  float v5 = 0.18 * chamb + 0.30 * dial + uUtteranceSeed * 0.06 * min(uUtteranceCount, 1.0);

  float scale = 1.0;
  float kScale = 1.82;
  float rotA = 0.04 + orn * 0.28 + fold * 0.38 + coupling * 0.20;
  float rotB = 0.03 + fold * 0.28 + chamb * 0.26;
  vec3 offset = vec3(
    mix(1.18, 1.38, chamb),
    mix(0.92, 1.14, fold),
    mix(1.05, 1.28, orn)
  );

  for (int i = 0; i < 3; i++) {
    // Exact H3 Dodecahedral Coxeter reflection planes + orthogonal fold
    z = abs(z);
    if (z.x < z.y) z.xy = z.yx;
    if (z.x < z.z) z.xz = z.zx;
    z = foldPlane(z, ICO_N1);
    z = foldPlane(z, ICO_N2);

    // 5D Clifford rotation unfolds rigid obsidian dodecahedra into layered 3D chrysanthemum petals!
    if (rotA > 0.001) {
      vec2 zw = rot2(rotA) * vec2(z.z, w5);
      z.z = zw.x;
      w5 = abs(zw.y);
      z.xy *= rot2(rotA * 0.78);
    }
    if (rotB > 0.001) {
      vec2 xv = rot2(rotB) * vec2(z.x, v5);
      z.x = xv.x;
      v5 = abs(xv.y);
      z.yz *= rot2(rotB * 0.68);
    }

    z = z * kScale - offset * (kScale - 1.0);
    scale *= kScale;

    float dFacet = abs(dot(abs(z), DODEC_N1) - 0.72);
    trap.x = min(trap.x, abs(z.x - z.y));          // razor dihedral edge -> forged 24k molten gold
    trap.y = min(trap.y, dFacet);                  // deep pentagonal seam -> incandescent cyan fire
    trap.z = min(trap.z, abs(length(z) - 0.85));   // 5D unfolding crest -> hot cinnabar-coral / jade
    trap.w += 0.33;
  }

  // Exact razor-faceted dodecahedra & sharp chamfered chrysanthemum petal blades!
  float dDodec = sdDodecahedron(z, 0.82);
  float dBlade = sdFacetBlade(z - vec3(0.32, 0.0, 0.0), vec3(0.72, 0.24, 0.20));
  float dCathedral = min(dDodec, dBlade) / scale;

  // Keep a recessed dark outer shell FAR behind (5.6) so it NEVER hides the 3D chrysanthemum geometry!
  float polyRad = rad * cos(fAng);
  float deepBackdrop = (5.65 - polyRad) * 0.85;
  float dArch = min(dCathedral, deepBackdrop);

  // Carve a sharp 10-sided faceted nave corridor right through the unfolding 5D chrysanthemum!
  float naveR = mix(2.02, 2.55, chamb);
  dArch = max(dArch, -(polyRad - naveR));

  // Monumental 10-Sided Faceted Pentagonal-Star Threshold Aperture
  vec3 po = p - vec3(0.0, 0.12, 2.15);
  float apR = 1.76 + chamb * 0.94;
  float apOuter = sdPolygonRing(po, apR, 0.16, 0.28, 10.0);
  vec3 po2 = po - vec3(0.0, 0.0, -0.22);
  po2.xy *= rot2(PI / 10.0);
  float apInner = sdPolygonRing(po2, apR - 0.13, 0.075, 0.14, 10.0);
  dArch = min(dArch, min(apOuter, apInner));

  // Clear immediate camera pocket
  dArch = max(dArch, -(length(p - vec3(0.0, 0.0, -5.05)) - 1.45));

  vec2 res = vec2(dArch * 0.78, 1.0);
  if (dFloor < res.x) {
    res = vec2(dFloor, 7.0);
  }
  return res;
}

// =========================================================================
// UNIFIED SCENE MAP
// =========================================================================
vec2 mapScene(vec3 p) {
  vec4 trapChamb, trapPres, trapRelic;
  vec2 res = sdEmergentChamber(p, trapChamb);
  gTrap = trapChamb;

  float presVis = clamp(uPresenceAmt * uIntensity + uAttention * 0.28, 0.0, 1.0);
  if (presVis > 0.01) {
    vec2 pres = sdEmergentPresence(p, presVis, trapPres);
    if (pres.x < res.x) {
      res = pres;
      gTrap = trapPres;
    }
  }

  vec2 relic = sdImpossibleRelic(p, trapRelic);
  if (relic.x < res.x) {
    res = relic;
    gTrap = trapRelic;
  }

  return res;
}

vec3 calcNormal(vec3 p) {
  // Crisp small epsilon preserves razor-sharp polyhedral facet planes (zero soft mushiness!)
  const float e = 0.0014;
  const vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * mapScene(p + k.xyy * e).x +
    k.yyx * mapScene(p + k.yyx * e).x +
    k.yxy * mapScene(p + k.yxy * e).x +
    k.xxx * mapScene(p + k.xxx * e).x
  );
}

// Multi-scale Ambient Occlusion (carves dramatic sculptural depth into polyhedral crevices!)
float calcAO(vec3 pos, vec3 nor) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.028 + 0.14 * float(i) * float(i) * 0.44;
    float d = mapScene(pos + h * nor).x;
    occ += (h - d) * sca;
    sca *= 0.66;
  }
  return clamp(1.0 - 2.3 * occ, 0.05, 1.0);
}

// Real Raymarched Architectural Shadows (eliminates "flatness" with dramatic angular relief!)
float calcShadow(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.06;
  int steps = (uQuality > 0.68) ? 18 : 12;
  for (int i = 0; i < 18; i++) {
    if (i >= steps) break;
    float h = mapScene(ro + rd * t).x;
    res = min(res, 10.0 * h / t);
    if (res < 0.02 || t > 6.5) break;
    t += clamp(h, 0.04, 0.45);
  }
  return clamp(res, 0.12, 1.0);
}

// =========================================================================
// CONTRADICTORY-SCALE NESTED 5D INTERIOR (Inside the Impossible Relic!)
// =========================================================================
vec3 shadeImpossibleInterior(vec3 pWorld, vec3 rdWorld, vec3 normal) {
  vec3 rc = getRelicCenter();
  vec3 pLoc = uRelicMat * (pWorld - rc);
  vec3 rdLoc = normalize(uRelicMat * rdWorld);
  vec3 innerRd = normalize(mix(rdLoc, -normal, 0.14));
  vec3 innerRo = pLoc * 2.6;

  vec3 accum = vec3(0.0);
  float t = 0.06;
  float rotT = clk(0.32, 1.0);

  for (int i = 0; i < 16; i++) {
    vec3 q = innerRo + innerRd * t;
    q.xy *= rot2(q.z * 0.20 + rotT);
    vec3 rep = mod(q + 1.15, 2.3) - 1.15;
    vec3 f = abs(rep);
    f = foldPlane(f, ICO_N1);
    f = foldPlane(f, ICO_N2);
    float d = abs(sdDodecahedron(f - vec3(0.42, 0.34, 0.24), 0.30)) - 0.016;

    float glow = exp(-abs(d) * 15.0);
    vec3 colStep = mix(COL_CYAN, COL_GOLD_HI, 0.5 + 0.5 * sin(t * 0.9 + rotT));
    colStep = mix(colStep, COL_JADE, 0.38 * max(0.0, cos(q.z * 1.2)));
    colStep = mix(colStep, COL_CORAL, 0.30 * uDialogueAmt);

    accum += colStep * glow * 0.15 * exp(-t * 0.15);
    t += max(abs(d) * 0.65, 0.12);
    if (t > 10.5) break;
  }

  float ndv = max(dot(-rdWorld, normal), 0.0);
  float fres = pow(1.0 - ndv, 3.0);
  accum += mineralPearl(ndv, clk(0.18, 1.0)) * fres * 0.65;
  accum += COL_CYAN * exp(-length(pLoc.xy) * 4.8) * (0.28 + 0.35 * uRelicUnfold);
  return accum;
}

// =========================================================================
// VOLCANIC OBSIDIAN, 24K GOLD, CYAN FIRE, IMPERIAL JADE & CINNABAR SHADING
// Dramatic raking light + hard cast shadows + razor facet specular!
// ZERO purple, ZERO lavender, ZERO millennial pastel pink!
// =========================================================================
vec3 shadeSurface(vec3 p, vec3 n, vec3 rd, float matID, float dist, float pulseBand, vec4 trap) {
  vec3 v = -rd;
  float ndv = max(dot(n, v), 0.0);
  float fres = pow(1.0 - ndv, 4.0);
  float ao = calcAO(p, n);

  // Dramatic off-axis sculptural key light (rakes across polyhedral facets for real 3D volume!)
  vec3 lKey = normalize(vec3(0.68, 0.78, -0.32));
  vec3 lRim = normalize(vec3(-0.72, 0.24, 0.62));
  float shadow = (matID < 3.5 || matID > 4.5) ? calcShadow(p + n * 0.015, lKey) : 1.0;

  vec3 rc = getRelicCenter();
  vec3 lRelic = normalize(rc - p);
  float dRelic = max(length(rc - p), 0.35);
  float attenRelic = 1.0 / (1.0 + 0.30 * dRelic * dRelic);

  float diffKey   = max(dot(n, lKey), 0.0) * shadow;
  float diffRim   = max(dot(n, lRim), 0.0);
  float diffRelic = max(dot(n, lRelic), 0.0) * attenRelic;

  vec3 hKey   = normalize(lKey + v);
  vec3 hRelic = normalize(lRelic + v);
  // Ultra-crisp facet specular highlights (cut obsidian glass & burnished 24k gold)
  float specKey   = pow(max(dot(n, hKey), 0.0), 96.0) * shadow;
  float specBroad = pow(max(dot(n, hKey), 0.0), 22.0) * shadow;
  float specRelic = pow(max(dot(n, hRelic), 0.0), 54.0) * attenRelic;

  // Geometric orbit-trap material separation
  float goldEdge   = smoothstep(0.16, 0.0, trap.x);
  float cyanSeam   = exp(-trap.y * 9.5);
  float coralCrest = exp(-trap.z * 8.0);
  float jadeFacet  = smoothstep(0.42, 0.04, trap.y) * (1.0 - goldEdge);

  vec3 pearl = mineralPearl(ndv, clk(0.14, 1.0) + p.z * 0.12);
  float echoPearl = clamp(uEchoAmt * 0.85 + uStillness * 0.78 + 0.10, 0.0, 1.2);

  vec3 col = COL_OBSIDIAN;

  // --- MAT 1: 5D Dodecahedral Chrysanthemum Obsidian & Gold Cathedral ---
  if (matID < 1.5) {
    vec3 volcanicObs = vec3(0.012, 0.020, 0.028); // deep obsidian slate catching raking facet light
    vec3 forgedGold  = mix(vec3(0.28, 0.12, 0.01), COL_GOLD, 0.30 + 0.70 * diffKey);

    float goldMask = goldEdge * (0.58 + 0.42 * uOrnamentAmt + 0.25 * uStillness);
    vec3 albedo = mix(volcanicObs, forgedGold, clamp(goldMask, 0.0, 0.94));
    albedo = mix(albedo, COL_JADE * 0.42, jadeFacet * (0.18 + 0.65 * uOrnamentAmt + 0.35 * uChamberAmt) * uIntensity);

    // Sculptural raking light + strong cool rim light makes every 3D dodecahedral facet pop!
    col = albedo * (0.14 + 1.15 * diffKey + 0.38 * diffRim) * ao;
    col += albedo * COL_CYAN * diffRelic * 1.15;

    // Razor specular glints on cut obsidian & gold ridges
    vec3 specCol = mix(vec3(0.55, 0.94, 1.0), COL_GOLD_HI, clamp(goldMask * 1.35, 0.0, 1.0));
    col += specCol * specKey * (1.05 + goldMask * 2.4) * ao;
    col += COL_GOLD * specBroad * goldMask * 0.42 * ao;
    col += COL_CYAN * specRelic * 1.45;

    // Incandescent geometric fire strictly inside fold seams
    float wake = (0.22 + 0.78 * uOrnamentAmt + 0.55 * uChamberAmt) * uIntensity;
    col += COL_CYAN * cyanSeam * (0.28 + 0.95 * wake + 0.42 * uAttention);
    col += COL_GOLD * goldEdge * (0.14 + 0.32 * uOrnamentAmt + 0.28 * uDialogueAmt + 0.22 * uStillness);
    // Hot cinnabar-vermilion ember along 5D unfolding chrysanthemum crests (ZERO pink!)
    col += COL_CORAL * coralCrest * (uOrnamentAmt * 0.25 + uPresenceAmt * 0.52 + uDialogueAmt * 0.78 + uUtteranceCount * 0.14) * uIntensity * 0.85;
    col += pearl * fres * (0.20 + 0.48 * echoPearl) * ao;
  }
  // --- MAT 2: Impossible Relic 5D Hyper-Dodecahedron Obsidian & Jade Petals ---
  else if (matID < 2.5) {
    float gEdge = smoothstep(0.14, 0.0, trap.x);
    float cSeam = exp(-trap.y * 7.5);

    vec3 obsR  = vec3(0.008, 0.015, 0.022);
    vec3 goldR = mix(vec3(0.24, 0.10, 0.01), COL_GOLD, 0.25 + 0.75 * diffKey);
    vec3 baseR = mix(obsR, goldR, clamp(0.18 + gEdge * 0.88, 0.0, 0.95));
    baseR = mix(baseR, COL_JADE * 0.38, smoothstep(0.32, 0.05, trap.z) * (1.0 - gEdge) * 0.65);

    col = baseR * (0.12 + 1.05 * diffKey + 0.24 * diffRim) * ao;
    col += COL_GOLD_HI * specKey * (1.4 + gEdge * 2.2);
    col += COL_CYAN * cSeam * (0.50 + 0.80 * uRelicUnfold + 0.75 * uHoldCharge);
    col += COL_CORAL * exp(-trap.z * 7.0) * (0.15 + 0.55 * uDialogueAmt);
    col += mix(COL_CYAN, pearl, 0.35) * fres * (0.72 + 0.50 * uRelicUnfold);
  }
  // --- MAT 3: Impossible Relic 24k Forged-Gold Dodecahedral Wireframe Cage ---
  else if (matID < 3.5) {
    vec3 darkBronze = vec3(0.14, 0.06, 0.005);
    col = mix(darkBronze, COL_GOLD, 0.22 + 0.78 * diffKey) * ao;
    col += COL_GOLD_HI * specKey * 2.8;
    col += COL_GOLD * specBroad * 0.45;
    col += mix(COL_CYAN, COL_GOLD_HI, 0.55) * fres * 0.72;
    col += COL_GOLD * 0.10 * (1.0 + uHoldCharge * 0.85);
  }
  // --- MAT 4: Impossible Relic Nested Non-Euclidean 5D Portal ---
  else if (matID < 4.5) {
    col = shadeImpossibleInterior(p, rd, n);
  }
  // --- MAT 5: Emergent Presence Sculpted Faceted Obsidian & Gold Polyhedral Wings ---
  else if (matID < 5.5) {
    float gRib    = smoothstep(0.048, 0.0, trap.x);
    float corEdge = exp(-trap.z * 16.0);

    vec3 obsP  = vec3(0.009, 0.014, 0.022);
    vec3 goldP = mix(vec3(0.24, 0.10, 0.01), COL_GOLD, 0.25 + 0.75 * diffKey);
    vec3 baseP = mix(obsP, goldP, clamp(0.26 + gRib * 0.74, 0.0, 0.95));

    col = baseP * (0.14 + 1.05 * diffKey + 0.28 * diffRim) * ao;
    col += COL_GOLD_HI * specKey * (1.6 + gRib * 1.8);
    col += COL_JADE * exp(-trap.y * 5.0) * 0.48;
    // Hot cinnabar-gold ember edge answering sustained attention (ZERO pink/purple!)
    col += mix(COL_CORAL, COL_GOLD_HI, 0.40) * corEdge * (0.35 + 0.85 * uAttention);
    col += mix(COL_CYAN, COL_GOLD_HI, 0.45) * fres * (0.65 + 0.55 * uAttention);
  }
  // --- MAT 6: Emergent Presence Deep 3D Faceted 10-Bladed Aperture ---
  else if (matID < 6.5) {
    vec3 pc = getPresenceCenter();
    vec2 localXY = (p.xy - pc.xy) / 0.50;
    vec2 pupilShift = uGaze * 0.15;
    vec2 rel = localXY - pupilShift;
    float r = length(rel);

    float bladeSpec = pow(max(dot(n, hKey), 0.0), 64.0);
    float rings     = smoothstep(0.45, 0.95, 0.5 + 0.5 * cos(r * 26.0 - clk(1.2, 2.0)));
    float pupil     = smoothstep(0.14, 0.25, r);
    float emberRing = exp(-pow((r - 0.35) * 6.8, 2.0));
    float cyanCore  = exp(-pow((r - 0.22) * 8.5, 2.0));

    vec3 darkBlade = vec3(0.008, 0.016, 0.024) * (0.22 + 0.95 * diffKey);
    vec3 goldTrim  = COL_GOLD * rings * (0.30 + 0.70 * diffKey);
    vec3 irisCol   = darkBlade + goldTrim + COL_GOLD_HI * bladeSpec * 1.8;
    irisCol += COL_CYAN * cyanCore * (0.95 + 0.80 * uAttention);
    irisCol += COL_CORAL * emberRing * (0.75 + 1.05 * uAttention);
    irisCol += pearl * fres * 0.42;

    float catchlight = exp(-length(rel - vec2(-0.04, 0.05)) * 30.0);
    col = irisCol * pupil + vec3(0.85, 0.98, 1.0) * catchlight * 1.7;
  }
  // --- MAT 7: Mirror-Black Volcanic Obsidian Floor (ZERO purple/pink reflection!) ---
  else {
    float floorFade = exp(-length(p.xz) * 0.11);
    // Sharp decagonal/pentagonal floor inlay lines matching the 5D dodecahedral symmetry
    vec2 fp = p.xz - vec2(0.0, 0.6);
    float aF = atan(fp.y, fp.x);
    float sec10 = TAU / 10.0;
    float faF = mod(aF + sec10 * 0.5, sec10) - sec10 * 0.5;
    float polyDist = length(fp) * cos(faF);

    float floorGroove = smoothstep(0.95, 0.996, abs(sin(polyDist * 2.4))) * floorFade;
    float radialSeam  = smoothstep(0.975, 0.997, abs(cos(aF * 5.0))) * floorFade;

    col = COL_OBSIDIAN * 0.70;
    col += COL_GOLD * (floorGroove * 0.26 + radialSeam * 0.18) * (0.30 + 0.70 * uOrnamentAmt + 0.45 * uEchoAmt);
    col += COL_CYAN * specRelic * 1.25;
    col += pearl * fres * (0.18 + 0.42 * echoPearl);

    if (uStillness > 0.01 || uEchoAmt > 0.05) {
      vec2 cUv = (p.xz - vec2(0.0, 0.4)) * 0.15;
      cUv *= rot2(clk(0.10, 1.0));
      vec3 caustic = texture(uMandalaTex, clamp(cUv + 0.5, 0.02, 0.98)).rgb;
      float cLum = dot(caustic, vec3(0.3, 0.55, 0.15));
      float veilAmt = clamp(uStillness * 0.85 + uEchoAmt * 0.45, 0.0, 1.0);
      col += pearl * cLum * veilAmt * 0.65 * floorFade;
    }
  }

  // --- Signature Resonant Fold Spherical Inversion Wave ---
  if (pulseBand > 0.005) {
    float dualWire = smoothstep(0.18, 0.02, abs(sin(trap.x * 16.0)) * abs(sin(trap.y * 12.0)));
    vec3 invCol = mix(COL_JADE, COL_GOLD_HI, dualWire) + COL_CYAN * fres * 0.95;
    col = mix(col, invCol * 1.55, clamp(pulseBand * 0.88, 0.0, 0.92));
  }

  // Deep Volcanic Obsidian-Teal Atmospheric Depth Fog (STRICTLY ZERO purple/pink!)
  float fog = 1.0 - exp(-dist * dist * 0.0080);
  vec3 fogCol = mix(
    vec3(0.004, 0.009, 0.014),
    mix(vec3(0.006, 0.028, 0.038), vec3(0.018, 0.016, 0.010), uPresenceAmt * 0.45),
    clamp(uChamberAmt + uEchoAmt * 0.35, 0.0, 1.0)
  );
  col = mix(col, fogCol, clamp(fog, 0.0, 0.96));

  return col;
}

// =========================================================================
// MAIN RAYMARCHER
// =========================================================================
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);
  vec2 ndc = vUv * 2.0 - 1.0;

  // Gravitational optical lensing during Resonant Fold hold
  vec2 lensOffset = vec2(0.0);
  if (uHoldCharge > 0.005) {
    vec2 toHold = ndc - uHoldOrigin;
    float dHold = length(toHold) + 0.14;
    lensOffset = -toHold * (uHoldCharge * 0.055 / (dHold * dHold + 0.22));
  }

  // Dramatic 3D perspective camera (slight heroic low-angle + wider architectural FOV = real depth!)
  float swayScale = (1.0 - uStabilizeCamera) * (1.0 - uReducedMotion * 0.72);
  float camX = sin(clk(0.30, 1.0)) * 0.18 * swayScale + uGaze.x * 0.32 * (1.0 - uStabilizeCamera);
  float camY = -0.10 + cos(clk(0.22, 1.0)) * 0.06 * swayScale + uGaze.y * 0.16 * (1.0 - uStabilizeCamera);
  float camZ = -5.05 - uPortraitFactor * 0.52 + uChamberAmt * 0.38 - uHoldCharge * 0.20;

  vec3 ro = vec3(camX, camY, camZ);
  vec3 ta = vec3(uGaze.x * 0.18 * (1.0 - uStabilizeCamera * 0.6), 0.18 + uGaze.y * 0.12 * (1.0 - uStabilizeCamera * 0.6), 0.55);

  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  // Wider architectural lens (1.24 landscape) accentuates dramatic receding 3D perspective!
  float fov = mix(1.24, 1.14, uPortraitFactor);
  vec3 rd = normalize((uv.x + lensOffset.x) * uu + (uv.y + lensOffset.y) * vv + fov * ww);

  vec3 pulseCenter3D = vec3(uPulseOrigin.x * 1.6, uPulseOrigin.y * 1.1 + 0.04, -0.82);
  float pulseRadius = uPulseProgress * 12.5;

  int maxSteps = int(mix(64.0, 96.0, uQuality));
  float t = 0.0;
  float matID = -1.0;
  vec4 hitTrap = vec4(1.0);
  vec3 volGlow = vec3(0.0);

  for (int i = 0; i < 96; i++) {
    if (i >= maxSteps) break;
    vec3 p = ro + rd * t;
    vec2 h = mapScene(p);

    float dCore = length(p - getRelicCenter());
    float coreGlow = exp(-dCore * 4.8) * (0.013 + 0.017 * uRelicUnfold + 0.022 * uHoldCharge);
    volGlow += mix(COL_CYAN, COL_GOLD, 0.22 + 0.34 * uDialogueAmt) * coreGlow;

    if (uPresenceAmt > 0.05) {
      float dPres = length(p - getPresenceCenter());
      float presGlow = exp(-dPres * 2.4) * 0.008 * uPresenceAmt * uIntensity;
      volGlow += mix(COL_CORAL, COL_GOLD, 0.45 + 0.45 * sin(t * 0.5)) * presGlow;
    }

    if (uPulseStrength > 0.01) {
      float shellD = abs(length(p - pulseCenter3D) - pulseRadius);
      float shellGlow = exp(-shellD * 3.8) * 0.038 * uPulseStrength;
      volGlow += mix(COL_CYAN, COL_GOLD_HI, 0.5) * shellGlow;
    }

    if (h.x < 0.0016 * (1.0 + t * 0.11)) {
      matID = h.y;
      hitTrap = gTrap;
      break;
    }
    t += h.x * 0.74;
    if (t > 24.0) break;
  }

  vec3 col = mix(vec3(0.003, 0.007, 0.012), vec3(0.008, 0.026, 0.036), clamp(0.5 - uv.y * 0.6, 0.0, 1.0));

  if (matID > 0.0) {
    vec3 hitP = ro + rd * t;
    vec3 hitN = calcNormal(hitP);

    float pulseBand = 0.0;
    if (uPulseStrength > 0.01) {
      float dP = abs(length(hitP - pulseCenter3D) - pulseRadius);
      pulseBand = exp(-dP * dP * 2.6) * uPulseStrength;
    }

    col = shadeSurface(hitP, hitN, rd, matID, t, pulseBand, hitTrap);

    // Crisp Single-Bounce Mirror Reflection on Volcanic Obsidian Floor
    if (matID > 6.5 && matID < 7.5) {
      vec3 rN = normalize(hitN + vec3(
        sin(hitP.x * 4.8 + clk(0.45, 1.0)) * 0.007,
        0.0,
        cos(hitP.z * 4.8 - clk(0.45, 1.0)) * 0.007
      ));
      vec3 rRd = reflect(rd, rN);
      vec3 rRo = hitP + hitN * 0.025;
      float rt = 0.025;
      float rMat = -1.0;
      vec4 rTrap = vec4(1.0);
      int reflSteps = int(mix(20.0, 32.0, uQuality));
      vec3 rVol = vec3(0.0);

      for (int j = 0; j < 32; j++) {
        if (j >= reflSteps) break;
        vec3 rp = rRo + rRd * rt;
        vec2 rh = mapScene(rp);
        float dRC = length(rp - getRelicCenter());
        rVol += COL_CYAN * exp(-dRC * 4.0) * 0.022;
        if (rh.x < 0.007 * (1.0 + rt * 0.18)) {
          rMat = rh.y;
          rTrap = gTrap;
          break;
        }
        rt += rh.x * 0.85;
        if (rt > 16.0) break;
      }

      vec3 reflCol = vec3(0.005, 0.012, 0.020) + rVol;
      if (rMat > 0.0) {
        vec3 rHitP = rRo + rRd * rt;
        vec3 rHitN = calcNormal(rHitP);
        reflCol = shadeSurface(rHitP, rHitN, rRd, rMat, rt, 0.0, rTrap) + rVol;
      }
      float fresFloor = 0.30 + 0.58 * pow(1.0 - max(dot(hitN, -rd), 0.0), 3.0);
      col = mix(col, reflCol, fresFloor * 0.82);
    }
  }

  col += volGlow;

  // Diegetic Attention Resonance Ring & Resonant Fold Singularity (faceted 10-point polygon!)
  if (uAttention > 0.02) {
    vec2 gScreen = uGaze * vec2(uResolution.x / min(uResolution.x, uResolution.y), uResolution.y / min(uResolution.x, uResolution.y)) * 0.5;
    vec2 dg = uv - gScreen;
    float aG = atan(dg.y, dg.x);
    float sec10 = TAU / 10.0;
    float rPoly = length(dg) * cos(mod(aG + sec10 * 0.5, sec10) - sec10 * 0.5);
    float ringA = exp(-pow((rPoly - 0.14 + 0.025 * uAttention) * 28.0, 2.0));
    col += mix(COL_CYAN, COL_GOLD_HI, 0.45) * ringA * uAttention * 0.30;
  }

  if (uHoldCharge > 0.01) {
    vec2 hScreen = uHoldOrigin * vec2(uResolution.x / min(uResolution.x, uResolution.y), uResolution.y / min(uResolution.x, uResolution.y)) * 0.5;
    vec2 dh = uv - hScreen;
    float aH = atan(dh.y, dh.x);
    float sec10 = TAU / 10.0;
    float rPolyH = length(dh) * cos(mod(aH + sec10 * 0.5, sec10) - sec10 * 0.5);
    float targetR = mix(0.22, 0.055, uHoldCharge);
    float tautRing = exp(-pow((rPolyH - targetR) * 36.0, 2.0));
    col += mix(COL_CYAN, COL_GOLD_HI, uHoldCharge) * tautRing * uHoldCharge * 0.95;
  }

  // Stillness Layer: Mineral Silver-Cyan-Gold Caustic Interference & Golden Micro-Dust
  if (uStillness > 0.01) {
    vec2 sUv = uv * 0.56;
    sUv *= rot2(clk(0.08, 1.0));
    vec3 veil = texture(uMandalaTex, clamp(sUv + 0.5, 0.02, 0.98)).rgb;
    float vLum = dot(veil, vec3(0.3, 0.55, 0.15));
    float radialMask = smoothstep(0.20, 0.72, length(uv)) * (1.0 - smoothstep(0.76, 1.25, length(uv)));
    vec3 sPearl = mineralPearl(clamp(1.0 - length(uv) * 0.7, 0.0, 1.0), clk(0.14, 1.0));
    col += sPearl * vLum * radialMask * uStillness * 0.48;

    vec2 grid = fract(uv * 11.0 + vec2(0.0, clk(0.05, 1.0))) - 0.5;
    vec2 cell = floor(uv * 11.0 + vec2(0.0, clk(0.05, 1.0)));
    float rnd = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
    vec2 jitter = (vec2(rnd, fract(rnd * 17.3)) - 0.5) * 0.7;
    float star = smoothstep(0.045, 0.007, length(grid - jitter)) * step(0.80, rnd);
    col += mix(COL_GOLD_HI, COL_CYAN, fract(rnd * 5.3)) * star * uStillness * 0.45;
  }

  fragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export const ECHO_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uCurrentTex;
uniform sampler2D uPrevTex;
uniform vec2  uTexelSize;
uniform float uEchoStrength;
uniform float uReducedMotion;

void main() {
  vec3 curr = texture(uCurrentTex, vUv).rgb;

  vec3 b0 = texture(uCurrentTex, vUv + vec2( uTexelSize.x * 2.5, 0.0)).rgb;
  vec3 b1 = texture(uCurrentTex, vUv + vec2(-uTexelSize.x * 2.5, 0.0)).rgb;
  vec3 b2 = texture(uCurrentTex, vUv + vec2(0.0,  uTexelSize.y * 2.5)).rgb;
  vec3 b3 = texture(uCurrentTex, vUv + vec2(0.0, -uTexelSize.y * 2.5)).rgb;
  vec3 blur = (b0 + b1 + b2 + b3) * 0.25;
  vec3 bright = max(blur - vec3(0.58), vec3(0.0));

  vec3 withBloom = curr + bright * 0.35;

  vec2 prevUv = (vUv - 0.5) * 0.9968 + 0.5;
  vec3 prev = texture(uPrevTex, prevUv).rgb;
  float decay = clamp(uEchoStrength * (1.0 - uReducedMotion * 0.65), 0.0, 0.34);

  vec3 outCol = mix(withBloom, max(withBloom, prev * 0.92), decay);
  fragColor = vec4(outCol, 1.0);
}
`;

export const COMPOSITE_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSourceTex;
uniform float uTime;
uniform float uIntensity;
uniform float uReducedMotion;

vec3 aces(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 col = texture(uSourceTex, vUv).rgb;

  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float softKnee = 1.0 / (1.0 + lum * 0.22);
  col *= mix(1.0, softKnee, 0.40);

  float exposure = mix(0.90, 1.24, uIntensity);
  col = aces(col * exposure);

  // Theatrical contrast curve keeping volcanic obsidian ink-black and gold/cyan incandescent
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.18);

  vec2 d = vUv - 0.5;
  float vig = smoothstep(0.95, 0.22, length(d * vec2(1.04, 1.0)));
  col *= mix(0.54, 1.0, vig);

  float grain = fract(sin(dot(gl_FragCoord.xy + vec2(uTime * 17.0, uTime * 31.0), vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * (0.013 * (1.0 - uReducedMotion * 0.5));

  col = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));
  fragColor = vec4(col, 1.0);
}
`;
