/* Many Worlds: the ride engine for the shared maxmartinelli.com shell (see ENGINE_API.md), and the site's only ride.
   Every path in the forecast ensemble is a world. You ride one light trail, accelerating without end; at the peak of
   each 6 s cycle the frame tears along a seeded fracture and you punch through into the next world. Five worlds are
   drawn here (blue hour, contour, ink, crystal, molten). Three are the site's other rides, embedded whole: their own
   engines draw them into this frame (Scale Invariant's Menger sponge, Floating World's woodblock sea, Asymptote's
   starbow), and the tears stitch all eight into one 48 s loop. The runtime owns the clock, input, hint and fallbacks. */
window.MM_ENGINES['many-worlds'] = function (rt) {
'use strict';
/* HERO STORYBOARD (seconds; draw(t) renders every frame from t alone; one world per 6 s acceleration cycle)
   0.0-5.88  BLUE HOUR. Red and white ensemble trails fan out over a dark plain under a sodium-lit horizon;
             the ride doubles its speed across the cycle while octave-spaced streak layers keep accelerating.
   5.88-6.42 RIFT 1. Hit-stop, a seeded fracture glows across the frame, the halves tear apart with slit-scan streaks
             and the ride punches into SCALE INVARIANT: a dive through a Menger sponge, two levels deeper per cycle.
   12.0      RIFT 2 into CONTOUR: glowing level lines above and below.
   18.0      RIFT 3 into FLOATING WORLD: a woodblock-print sea, bursting out of one barrel and riding into the next.
   24.0      RIFT 4 into INK: paper, wet brushstrokes, a sumi-e ridge (the one light world).
   30.0      RIFT 5 into ASYMPTOTE: the starbow, crossing one more nine of the speed of light.
   36.0      RIFT 6 into CRYSTAL: prisms split the white trails into spectra that recombine at the next prism.
   42-48     MOLTEN heat haze and embers, then RIFT 8 back into BLUE HOUR; the 48 s loop repeats forever.
   An embedded world plays 6 s of its own ride's timeline, from 6 s in, and is drawn by that ride's engine. DURATION,
   the span the tools preview and scan, is the whole loop. */

const { W, D, TAU, clamp, sat, sstep, mulberry32, hash, REDUCED, PHONE } = rt;
const LN2 = Math.LN2;
/* quality: members, track sample spacing, look-ahead, pixel-ratio cap, streaks per layer (np), zoom-blur taps (nt), terrain octaves */
const Q = PHONE
  ? { n: 10, ds: 5, ic: 6, ahead: 600, near2: 150, pr: 1.5, nst: 10, np: 16, nt: 4, oct: 2, lamps: 0.7 }
  : { n: 16, ds: 4, ic: 8, ahead: 720, near2: 220, pr: 2, nst: 14, np: 30, nt: 6, oct: 3, lamps: 1 };
const rnd = mulberry32(20261011);

/* ---------- endless acceleration: cycle phase, speed v(t) and its closed-form integral s(t) ----------
   Inside each 6 s cycle the ride speeds up by one octave (v = V0 * 2^phase). The wrap is hidden by the rift,
   which also adds a forward punch. Distance stays continuous across every wrap. */
const TC = 6, HS_T = 0.12, OPEN_T = 0.42;
const cyc = (t) => Math.floor(t / TC);
const V0 = 70, DC = (V0 * TC) / LN2, VP = 62, TP = 0.17, PF = VP * Math.E * TP;
const punch = (u) => (u > 0 ? (u / TP) * Math.exp(1 - u / TP) : 0);
const punchInt = (u) => (u > 0 ? PF * (1 - (1 + u / TP) * Math.exp(-u / TP)) : 0);
function speed(t) { const c = cyc(t), u = t - c * TC; return V0 * Math.pow(2, u / TC) + (c > 0 ? VP * punch(u) : 0); }
function sAt(t) { const c = cyc(t), u = t - c * TC; return c * DC + DC * (Math.pow(2, u / TC) - 1) + (c > 1 ? (c - 1) * PF : 0) + (c > 0 ? punchInt(u) : 0); }
/* rift k sits on the wrap at k*TC: a hit-stop before it, the tear after it */
function riftK(t) { const k = Math.round(t / TC); if (k < 1) return 0; const u = t - k * TC; return u >= -HS_T && u < OPEN_T ? k : 0; }

/* ---------- worlds: one style record each ----------
   mode: backdrop shader; lit: light world (hero text flips to ink); md: trail blend 0 additive light, 1 wet ink */
const WD = {
  night:    { mode: 0, lit: 0, md: 0, mem: [1, 0.17, 0.12], hot: [1, 0.4, 0.16], head: [0.96, 0.95, 0.91], wtr: [0.9, 0.92, 1], strk: [0.72, 0.8, 1], alt: [1, 0.62, 0.17], glow: [1, 0.72, 0.42], wM: 0.2, aM: 0.42 },
  contour:  { mode: 1, lit: 0, md: 0, mem: [1, 0.2, 0.15], hot: [1, 0.5, 0.2], head: [0.86, 1, 0.94], wtr: [0.82, 1, 0.92], strk: [0.4, 1, 0.76], alt: [1, 0.66, 0.25], glow: [0.45, 1, 0.78], wM: 0.2, aM: 0.46 },
  ink:      { mode: 4, lit: 1, md: 1, mem: [0.08, 0.08, 0.09], hot: [0.76, 0.13, 0.09], head: [0.05, 0.05, 0.06], wtr: [0.44, 0.43, 0.42], strk: [0.36, 0.35, 0.34], alt: [0.55, 0.2, 0.1], glow: [0.1, 0.09, 0.09], wM: 0.55, aM: 0.78 },
  crystal:  { mode: 2, lit: 0, md: 0, mem: [0.72, 0.78, 1], wtr: [1, 1, 1], hot: [1, 0.2, 0.3], head: [0.95, 0.95, 1], strk: [0.8, 0.84, 1], alt: [0.8, 0.7, 1], glow: [0.82, 0.78, 1], wM: 0.15, aM: 0.42 },
  molten:   { mode: 3, lit: 0, md: 0, mem: [1, 0.4, 0.07], hot: [1, 0.16, 0.05], head: [1, 0.88, 0.6], wtr: [1, 0.86, 0.55], strk: [1, 0.5, 0.12], alt: [1, 0.72, 0.28], glow: [1, 0.6, 0.22], wM: 0.22, aM: 0.45 },
};
/* the three embedded worlds: another ride's engine draws each one (see "embedded worlds" below). Each plays the 6 s
   window of its own timeline that starts at `from` and keeps its ride's hold-to-accelerate cap; fb is the native world
   that stands in if its engine is missing or fails; glow: the fracture's glow-in colour as you tear into it */
const XW = {
  'scale-invariant': { ext: 1, from: 6, lit: 0, md: 0, glow: [1, 0.55, 0.26], fb: 'crystal' },
  'floating-world': { ext: 1, from: 6, lit: 0, md: 0, glow: [0.96, 0.9, 0.76], fb: 'night' },
  asymptote: { ext: 1, from: 6, lit: 0, md: 0, glow: [0.58, 0.76, 1], fb: 'contour' },
};
Object.assign(WD, XW);
/* hero colours per world (the runtime's heroInk keys; none = the site theme). Ink flips the name to ink on paper; the
   embedded worlds keep the accents and scrims their rides wore as standalone rides */
WD.ink.ui = { hf: 'rgb(14,18,30)', hs: '242,238,228', hb: 'rgba(14,18,30,0.36)', ha: '#9C4508', hfoc: '#9C4508', hh: '#9C4508' };
WD['scale-invariant'].ui = { hh: '#FFD39A', st: '0.5' };
WD['floating-world'].ui = { hf: '#F2EBDD', hs: '11,29,53', hb: 'rgba(242,235,221,0.3)', ha: '#E3CFA8', hfoc: '#E3CFA8', hh: '#E3CFA8', st: '0' };
WD.asymptote.ui = { ha: '#6FA8FF', hh: '#CFE0FF', st: '0', sb: '0.7' };
const ORDER = ['night', 'scale-invariant', 'contour', 'floating-world', 'ink', 'asymptote', 'crystal', 'molten'], NW = ORDER.length;
ORDER.forEach((k) => { WD[k].id = k; });
const DURATION = NW * TC; // the whole loop
const SHOTS = ORDER.map((_, i) => i * TC + 3); // mid-world times the tools photograph
/* the loop as the tools see it: each world's id, when its slot starts, and (embedded worlds) the ride time it starts at */
const WORLDS = ORDER.map((id, i) => ({ id, at: i * TC, from: WD[id].ext ? WD[id].from : null }));
const worldOf = (c) => WD[ORDER[((c % NW) + NW) % NW]];
/* a world named in the URL (#asymptote, #ink, ...) starts the ride just past the tear into it */
const START = (() => { let h = ''; try { h = decodeURIComponent((W.location.hash || '').slice(1)); } catch (e) { /* malformed hash */ } const i = ORDER.indexOf(h); return i > 0 ? i * TC + OPEN_T + 0.2 : 0; })();

/* ---------- the flight path: a seeded closed-form curve P(s) = (X(s), Y(s), s) that nothing draws ---------- */
const TXc = [], TYc = [];
[[1500, 0.42], [640, 0.17], [300, 0.05]].forEach(([L, B]) => { const w = TAU / L; TXc.push([(B * (0.85 + 0.3 * rnd())) / w, w, rnd() * TAU]); });
[[900, 1.1], [380, 0.6], [170, 0.18]].forEach(([L, A]) => TYc.push([A * (0.8 + 0.4 * rnd()), TAU / L, rnd() * TAU]));
const Xs = (s) => { let a = 0; for (const h of TXc) a += h[0] * Math.sin(h[1] * s + h[2]); return a; };
const X1 = (s) => { let a = 0; for (const h of TXc) a += h[0] * h[1] * Math.cos(h[1] * s + h[2]); return a; };
const X2 = (s) => { let a = 0; for (const h of TXc) a -= h[0] * h[1] * h[1] * Math.sin(h[1] * s + h[2]); return a; };
const Ys = (s) => { let a = 0; for (const h of TYc) a += h[0] * Math.sin(h[1] * s + h[2]); return a; };
const Y1 = (s) => { let a = 0; for (const h of TYc) a += h[0] * h[1] * Math.cos(h[1] * s + h[2]); return a; };
const BANK = 95, GYW = -3.6, CYW = 15; // world heights of the ground plane and the contour world's ceiling

/* uncertainty: sigma grows with the square root of distance ahead of an anchor that trails the camera */
const SIG_IN = 2.4, SIG_L = 60, SIG_D = 40, SGK = 1.3;
let sAnchor = 0;
function sigAt(s) { const u = s - sAnchor; return SIG_IN * SGK * Math.sqrt(1 + (u > 0 ? u : 0) / SIG_L); }

/* ensemble members: z(s) = r cos(phase(s)) with Rayleigh-quantile radii, so z is N(0,1) across members */
const MEM = [];
for (let m = 0; m < Q.n; m++) {
  const q = (m + 0.5) / Q.n, r = Math.sqrt(-2 * Math.log(1 - q));
  const close = m % 4 === 3 && r > 0.9;
  MEM.push({
    r, a: m * 2.39996 + rnd() * 0.4, w: (TAU / (900 + rnd() * 1400)) * (rnd() < 0.5 ? -1 : 1), w2: TAU / (230 + rnd() * 260), b: rnd() * TAU, k: 0.3 + rnd() * 0.35,
    off: close ? 26 : 60 + rnd() * 230, amp: close ? 42 : 18 + rnd() * 50, rw: TAU / (8 + rnd() * 9), rp: rnd() * TAU, hot: m % 5 === 2, wht: m % 3 === 1 && m % 5 !== 2
  });
}
const zOf = (mm, s) => mm.r * Math.cos(mm.a + mm.w * s + mm.k * Math.sin(mm.w2 * s + mm.b));
const racerOff = (mm, t) => mm.off + mm.amp * Math.sin(mm.rw * t + mm.rp);

/* ---------- per-frame samples of the path (positions relative to the path point under the camera) ---------- */
const IC = Q.ic, NS = Math.round(Q.ahead / Q.ds) + IC + 1, BACK = IC * Q.ds;
const SS = new Float64Array(NS), SP = new Float64Array(NS * 3), SR = new Float64Array(NS * 3), SU = new Float64Array(NS * 3);
const SRF = new Float64Array(NS * 2), SG = new Float64Array(NS);
let S0 = 0, Y0 = 0;
function sampleTrack(sc) {
  S0 = sc - BACK; const x0 = Xs(sc); Y0 = Ys(sc);
  for (let i = 0; i < NS; i++) {
    const s = S0 + i * Q.ds, o = i * 3; SS[i] = s;
    const dx = X1(s), dy = Y1(s), il = 1 / Math.sqrt(dx * dx + dy * dy + 1), tx = dx * il, ty = dy * il, tz = il;
    let rx = -tz, rz = tx; const rl = 1 / Math.hypot(rx, rz); rx *= rl; rz *= rl;
    SRF[i * 2] = rx; SRF[i * 2 + 1] = rz;
    const ux = -rz * ty, uy = rz * tx - rx * tz, uz = rx * ty;
    const rol = clamp(X2(s) * Math.pow(1 + dx * dx, -1.5) * BANK, -0.55, 0.55), c = Math.cos(rol), sn = Math.sin(rol);
    SR[o] = rx * c + ux * sn; SR[o + 1] = uy * sn; SR[o + 2] = rz * c + uz * sn;
    SU[o] = ux * c - rx * sn; SU[o + 1] = uy * c; SU[o + 2] = uz * c - rz * sn;
    SP[o] = Xs(s) - x0; SP[o + 1] = Ys(s) - Y0; SP[o + 2] = s - sc;
    SG[i] = sigAt(s);
  }
}
const V3 = [0, 0, 0], VR = [0, 0, 0], VU = [0, 0, 0];
const inWin = (s) => s >= S0 && s <= S0 + (NS - 1.01) * Q.ds;
/* point at distance s with lateral offset x and height h in the banked frame (also leaves R and U in VR, VU) */
function trackPt(s, x, h) {
  let f = (s - S0) / Q.ds; if (f < 0) f = 0; if (f > NS - 1.001) f = NS - 1.001;
  const i = f | 0, u = f - i, v = 1 - u, a = i * 3, b = a + 3;
  for (let k = 0; k < 3; k++) {
    VR[k] = SR[a + k] * v + SR[b + k] * u; VU[k] = SU[a + k] * v + SU[b + k] * u;
    V3[k] = SP[a + k] * v + SP[b + k] * u + VR[k] * x + VU[k] * h;
  }
}
function samplePt(i, x, h) { const o = i * 3; V3[0] = SP[o] + SR[o] * x + SU[o] * h; V3[1] = SP[o + 1] + SR[o + 1] * x + SU[o + 1] * h; V3[2] = SP[o + 2] + SR[o + 2] * x + SU[o + 2] * h; }
/* point on a level world plane (height yW) beside the path: unbanked */
function groundPt(s, x, yW) {
  let f = (s - S0) / Q.ds; if (f < 0) f = 0; if (f > NS - 1.001) f = NS - 1.001;
  const i = f | 0, u = f - i, v = 1 - u, a = i * 3, b = a + 3, a2 = i * 2, b2 = a2 + 2;
  const rx = SRF[a2] * v + SRF[b2] * u, rz = SRF[a2 + 1] * v + SRF[b2 + 1] * u;
  V3[0] = SP[a] * v + SP[b] * u + rx * x; V3[1] = yW - Y0; V3[2] = SP[a + 2] * v + SP[b + 2] * u + rz * x;
}

/* ---------- camera + projection (camera-relative, double precision on the CPU) ---------- */
const NEAR = 0.3, CAM_H = 1.25;
let EX = 0, EY = 0, EZ = 0, RX = 1, RY = 0, RZ = 0, UX = 0, UY = 1, UZ = 0, FX = 0, FY = 0, FZ = 1;
let SHIFT = 0, TXF = 1, TYF = 1, PXW = 2, PXH = 2, FPX = 1, MINHW = 0.8, MAXHW = 40, MAXR = 60, FOG0 = 400, FOG1 = 700;
function camera(t, sc, v, ph, pk, live) {
  const lean = live ? live.lean : 0, bl = live ? live.b : 0;
  trackPt(sc, lean, CAM_H); const ex = V3[0], ey = V3[1], ez = V3[2];
  trackPt(sc + 26 + v * 0.1, lean * 0.45, CAM_H * 0.5); const qx = V3[0], qy = V3[1], qz = V3[2];
  trackPt(sc + 7, 0, 0); const upx = VU[0], upy = VU[1], upz = VU[2];
  let fx = qx - ex, fy = qy - ey, fz = qz - ez, l = Math.hypot(fx, fy, fz); fx /= l; fy /= l; fz /= l;
  let rx = fy * upz - fz * upy, ry = fz * upx - fx * upz, rz = fx * upy - fy * upx; l = Math.hypot(rx, ry, rz); rx /= l; ry /= l; rz /= l;
  let ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  const roll = live ? -lean * 0.035 : 0;
  if (roll) { const c = Math.cos(roll), s = Math.sin(roll), a = rx, b = ry, d = rz; rx = a * c + ux * s; ry = b * c + uy * s; rz = d * c + uz * s; ux = ux * c - a * s; uy = uy * c - b * s; uz = uz * c - d * s; }
  // vibration rises through each cycle, jolts on the punch and under boost
  const sh = (0.003 + 0.022 * ph * ph) * (1 + 2.5 * pk) + 0.032 * bl, s1 = Math.sin(t * 47.1) * 0.6 + Math.sin(t * 71.3 + 1.3) * 0.4, s2 = Math.sin(t * 59.7 + 0.4);
  EX = ex + ux * sh * s1 + rx * sh * 0.6 * s2; EY = ey + uy * sh * s1 + ry * sh * 0.6 * s2; EZ = ez + uz * sh * s1 + rz * sh * 0.6 * s2;
  RX = rx; RY = ry; RZ = rz; UX = ux; UY = uy; UZ = uz; FX = fx; FY = fy; FZ = fz;
  // FOV creeps wider through the cycle (+12 deg), kicks on the punch, and punches +23 deg under boost
  const fov = (54 + 12 * Math.pow(ph, 1.4) + 8 * pk + (live ? 23 * bl - 5 * live.ds : 0)) * (Math.PI / 180), asp = PXW / PXH;
  if (asp >= 1) { TYF = Math.tan(fov / 2); TXF = TYF * asp; } else { TYF = Math.min(2.1, Math.tan(fov / 2 + 0.05) / asp); TXF = TYF * asp; }
  FPX = (PXW * 0.5) / TXF; SHIFT = asp < 1 ? 0.3 : 0.07;
  MINHW = 0.75 * Math.max(1, PXH / 760); MAXHW = 0.04 * PXH; MAXR = 0.07 * PXH;
  FOG0 = Q.ahead * 0.6; FOG1 = Q.ahead * 0.97;
}

/* ---------- geometry emitters: CPU-projected anti-aliased lines and sprites ---------- */
const MAXV = 32000, MAXI = 64000;
const VB = new Float32Array(MAXV * 5), CB = new Uint8ClampedArray(MAXV * 4), IB = new Uint16Array(MAXI);
let nv = 0, ni = 0, LR = 1, LG = 1, LB = 1, REC = null;
function vtx(cx, cy, w, u, v, a) {
  const o = nv * 5; VB[o] = cx; VB[o + 1] = cy; VB[o + 2] = w; VB[o + 3] = u; VB[o + 4] = v;
  const c = nv * 4; CB[c] = LR * 255; CB[c + 1] = LG * 255; CB[c + 2] = LB * 255; CB[c + 3] = a * 255; nv++;
}
const TMP = new Float32Array(4096 * 5);
let tn = 0, hp = false, pin = false, pvx = 0, pvy = 0, pvz = 0, pw = 0, pa = 0;
function lBegin(r, g, b) { tn = 0; hp = false; LR = r; LG = g; LB = b; }
function lPush(vx, vy, vz, w, a) {
  if (tn >= 4096) return;
  let hw = (0.5 * w * FPX) / vz;
  a *= 1 - sstep(FOG0, FOG1, vz);
  if (hw < MINHW) { a *= hw / MINHW; hw = MINHW; } else if (hw > MAXHW) hw = MAXHW;
  const o = tn * 5; TMP[o] = vx / (vz * TXF); TMP[o + 1] = vy / (vz * TYF) + SHIFT; TMP[o + 2] = vz; TMP[o + 3] = hw; TMP[o + 4] = a; tn++;
}
function lPoint(x, y, z, w, a) {
  const dx = x - EX, dy = y - EY, dz = z - EZ;
  const vx = dx * RX + dy * RY + dz * RZ, vy = dx * UX + dy * UY + dz * UZ, vz = dx * FX + dy * FY + dz * FZ, inn = vz > NEAR;
  if (hp && inn !== pin) {
    const k = (NEAR * 1.001 - pvz) / (vz - pvz);
    lPush(pvx + (vx - pvx) * k, pvy + (vy - pvy) * k, NEAR * 1.001, pw + (w - pw) * k, pa + (a - pa) * k);
    if (!inn) lFlush();
  }
  if (inn) lPush(vx, vy, vz, w, a);
  hp = true; pin = inn; pvx = vx; pvy = vy; pvz = vz; pw = w; pa = a;
}
const lPt = (w, a) => lPoint(V3[0], V3[1], V3[2], w, a);
function lFlush() {
  const n = tn; tn = 0;
  if (n < 2 || nv + n * 2 > MAXV || ni + (n - 1) * 6 > MAXI) return;
  const hx = PXW * 0.5, hy = PXH * 0.5;
  for (let k = 0; k < n; k++) {
    const o = k * 5, p = (k > 0 ? k - 1 : k) * 5, q = (k < n - 1 ? k + 1 : k) * 5;
    let dx = (TMP[q] - TMP[p]) * hx, dy = (TMP[q + 1] - TMP[p + 1]) * hy;
    const L = Math.hypot(dx, dy); if (L > 1e-9) { dx /= L; dy /= L; } else { dx = 1; dy = 0; }
    const hw = TMP[o + 3], ox = (-dy * hw) / hx, oy = (dx * hw) / hy, w = TMP[o + 2], x = TMP[o], y = TMP[o + 1], a = TMP[o + 4], v0 = nv;
    vtx((x + ox) * w, (y + oy) * w, w, -1, 0, a); vtx((x - ox) * w, (y - oy) * w, w, 1, 0, a);
    if (k > 0) { IB[ni++] = v0 - 2; IB[ni++] = v0 - 1; IB[ni++] = v0; IB[ni++] = v0 - 1; IB[ni++] = v0 + 1; IB[ni++] = v0; }
  }
  if (REC) { const pts = []; for (let k = 0; k < n; k++) { const o = k * 5; pts.push((TMP[o] * 0.5 + 0.5) * PXW, (0.5 - TMP[o + 1] * 0.5) * PXH, TMP[o + 3], TMP[o + 4]); } REC.lines.push([LR, LG, LB, pts]); }
}
function sprite(x, y, z, size, a, r, g, b) {
  const dx = x - EX, dy = y - EY, dz = z - EZ, vz = dx * FX + dy * FY + dz * FZ;
  if (vz < NEAR * 3) return;
  const vx = dx * RX + dy * RY + dz * RZ, vy = dx * UX + dy * UY + dz * UZ;
  let rad = (0.5 * size * FPX) / vz; a *= 1 - sstep(FOG0, FOG1, vz);
  if (rad < 1.3) { a *= (rad / 1.3) * (rad / 1.3); rad = 1.3; } else if (rad > MAXR) rad = MAXR;
  if (a < 0.004 || nv + 4 > MAXV || ni + 6 > MAXI) return;
  LR = r; LG = g; LB = b;
  const nx = vx / (vz * TXF), ny = vy / (vz * TYF) + SHIFT, ox = rad / (PXW * 0.5), oy = rad / (PXH * 0.5), v0 = nv;
  vtx((nx - ox) * vz, (ny - oy) * vz, vz, -1, -1, a); vtx((nx + ox) * vz, (ny - oy) * vz, vz, 1, -1, a);
  vtx((nx - ox) * vz, (ny + oy) * vz, vz, -1, 1, a); vtx((nx + ox) * vz, (ny + oy) * vz, vz, 1, 1, a);
  IB[ni++] = v0; IB[ni++] = v0 + 1; IB[ni++] = v0 + 2; IB[ni++] = v0 + 1; IB[ni++] = v0 + 3; IB[ni++] = v0 + 2;
  if (REC) REC.spr.push([(nx * 0.5 + 0.5) * PXW, (0.5 - ny * 0.5) * PXH, rad, a, r, g, b]);
}
const spr = (size, a, c) => sprite(V3[0], V3[1], V3[2], size, a, c[0], c[1], c[2]);

/* ---------- the scene: the same ensemble in every world, restyled ---------- */
const SPEC3 = [[1, 0.16, 0.24], [0.32, 1, 0.45], [0.34, 0.46, 1]];
const PP = 120; // prism spacing in the crystal world (m)
const disp = (s) => 1.15 * Math.sin(Math.PI * (s / PP - Math.floor(s / PP))); // white light splits after a prism, recombines at the next
const far = (i) => i > IC + Q.near2 / Q.ds && (i & 1);
function paths(t, sc, Wd) {
  const cry = Wd === WD.crystal, mol = Wd === WD.molten, ink = Wd.md === 1;
  for (const mm of MEM) {
    const split = cry && !mm.hot ? 3 : 1, col = mm.hot ? Wd.hot : mm.wht ? Wd.wtr : Wd.mem;
    for (let cp = 0; cp < split; cp++) {
      const cc = split === 3 ? SPEC3[cp] : col, sg = cp - 1;
      lBegin(cc[0], cc[1], cc[2]);
      for (let i = IC + 1; i < NS; i++) {
        if (far(i)) continue;
        const s = SS[i], d = s - sc;
        let x = SG[i] * zOf(mm, s);
        if (split === 3) x += sg * disp(s);
        else if (mol) x += 0.16 * Math.sin(s * 0.23 + t * 7.3 + mm.b) * sat(d / 60); // heat haze
        samplePt(i, x, 0.36);
        lPt(Wd.wM * (ink ? 0.3 + 0.7 * sstep(2, 46, d) : 1), Wd.aM * sstep(2, 16, d) * (split === 3 ? 0.85 : 1));
      }
      lFlush();
    }
  }
}
/* racers: each member's light runs ahead and falls back; its trail covers the last E seconds of its path */
function racers(t, sc, Wd, photo, bl) {
  const ink = Wd.md === 1, E = (photo ? 2.2 : 0.6) * (1 + 2 * bl), tb = t - E, sb = sAt(tb);
  for (const mm of MEM) {
    const sh = sc + racerOff(mm, t), st = sb + racerOff(mm, tb);
    if (!inWin(sh)) continue;
    const a0 = sstep(1, 8, sh - sc), c = mm.hot ? Wd.hot : mm.wht ? Wd.wtr : Wd.mem;
    lBegin(c[0], c[1], c[2]);
    for (let j = 0; j <= Q.nst; j++) {
      const u = j / Q.nst, s = st + (sh - st) * u;
      if (!inWin(s)) continue;
      trackPt(s, sigAt(s) * zOf(mm, s), 0.55);
      lPt(ink ? 0.36 : 0.5, a0 * Math.pow(u, 1.5) * 0.95 * (Wd.md ? sstep(0, 7, s - sc) : 1));
    }
    lFlush();
    trackPt(sh, sigAt(sh) * zOf(mm, sh), 0.55);
    spr(ink ? 0.9 : 1.6, a0 * 0.85, c); spr(0.42, a0, Wd.head);
  }
}
/* crystal world: upright glass prisms standing on the floor every PP metres */
const PRV = [[-10.5, GYW + 0.2], [10.5, GYW + 0.2], [0, GYW + 16.5]];
function prisms(sc) {
  for (let k = Math.ceil((sc + 4) / PP); k * PP < sc + 560; k++) {
    const s = k * PP; if (!inWin(s + 4)) break;
    const d = s - sc, a = 0.62 * sstep(4, 34, d) * (1 - sstep(380, 540, d));
    if (a < 0.01) continue;
    for (let g = 0; g < 4; g++) {
      const ss = s + (g === 3 ? 3.6 : 0), c = g === 3 ? [0.62, 0.58, 1] : SPEC3[g], ox = g === 3 ? 0 : (g - 1) * 0.32;
      lBegin(c[0], c[1], c[2]);
      for (let e = 0; e < 3; e++) {
        const A0 = PRV[e], B0 = PRV[(e + 1) % 3];
        for (let q = 0; q < (e === 2 ? 9 : 8); q++) { const u = q / 8; groundPt(ss, A0[0] + (B0[0] - A0[0]) * u + ox, A0[1] + (B0[1] - A0[1]) * u + Math.abs(ox) * 0.5); lPt(0.14, a * (g === 3 ? 0.4 : 0.75)); }
      }
      lFlush();
    }
    for (let e = 0; e < 3; e++) { groundPt(s, PRV[e][0], PRV[e][1]); spr(1.5, a * 0.55, SPEC3[e]); }
  }
}

/* ---------- Shepard-Risset speed layers ----------
   Layer j accelerates forever: v_j = VMIN * 2^(t/TC - j). Its opacity is a bell (sin^2) over log2 speed, so slow layers
   fade in while fast ones fade out and the sum never changes, yet every visible streak is speeding up. */
const KL = 5, VMIN = 11, SPAN = 170;
function shep(t, sc, Wd, bl) {
  const x = t / TC, j1 = Math.floor(x), ph = x - j1, id = Wd.id;
  const E = 0.045 * (1 + 1.3 * ph) * (1 + 2 * bl); // exposure: streaks lengthen through the cycle and x3 under boost
  for (let j = j1 - KL + 1; j <= j1; j++) {
    const l = x - j, wg = Math.pow(Math.sin((Math.PI * l) / KL), 2);
    if (wg < 0.02) continue;
    const p2 = Math.pow(2, l), vj = VMIN * p2, off = ((VMIN * TC) / LN2) * p2, L = Math.min(170, vj * E);
    for (let i = 0; i < Q.np; i++) {
      const hh = (j * 97 + i) * 8, h1 = hash(hh), h2 = hash(hh + 1), h3 = hash(hh + 2), h4 = hash(hh + 3);
      let d = (h1 * SPAN - off) % SPAN; if (d < 0) d += SPAN; d += 2.5;
      const a = wg * sstep(SPAN + 2.5, SPAN * 0.62, d) * sstep(2.5, 10, d);
      if (a < 0.01) continue;
      const s = sc + d, sd = h2 < 0.5 ? -1 : 1;
      if (id === 'contour' || id === 'ink') {
        // contour: survey ticks on the floor and the ceiling; ink: dry-brush flecks on the paper floor
        const yW = id === 'ink' || h4 < 0.6 ? GYW + 0.03 : CYW - 0.03, lat = sd * (1.2 + h3 * 17), LL = L * (id === 'ink' ? 0.35 : 0.6);
        const c = id === 'contour' && h4 > 0.9 ? Wd.alt : Wd.strk;
        lBegin(c[0], c[1], c[2]);
        groundPt(s, lat, yW); lPt(id === 'ink' ? 0.16 + 0.22 * h4 : 0.09, a * (id === 'ink' ? 0.55 : 0.85));
        groundPt(s + LL, lat, yW); lPt(id === 'ink' ? 0.1 : 0.06, 0); lFlush();
      } else if (id === 'molten') {
        // embers drift upward as they rush past
        const lat = sd * (1 + h3 * 13), hg = -2.4 + h4 * 5 + (SPAN - d) * 0.022, c = h4 > 0.7 ? Wd.alt : Wd.strk;
        lBegin(c[0], c[1], c[2]);
        trackPt(s, lat, hg); lPt(0.08, a * 0.9); trackPt(s + L, lat, hg - L * 0.05); lPt(0.05, 0); lFlush();
      } else {
        // night and crystal: streaks in a loose tube around the path
        const lat = sd * (2.6 + h3 * 13), hg = -0.9 + h4 * 6.8;
        const c = id === 'crystal' ? SPEC3[(hash(hh + 5) * 3) | 0] : h4 > 0.86 ? Wd.alt : Wd.strk;
        lBegin(c[0], c[1], c[2]);
        trackPt(s, lat, hg); lPt(0.06, a * 0.85); trackPt(s + L, lat, hg); lPt(0.04, 0); lFlush();
      }
    }
  }
}
/* night: sodium lamps scattered across the plain on a seeded lattice in path coordinates */
function lamps(sc) {
  const LS = 26, LX = 22;
  for (let k = Math.ceil((sc + 6) / LS); k * LS < sc + 600; k++) for (let j = -10; j <= 10; j++) {
    const hh = k * 31 + j * 7919, h0 = hash(hh);
    if (h0 > 0.3 * Q.lamps || j === 0) continue;
    const s = (k + 0.2 + 0.6 * hash(hh + 1)) * LS, x = (j + (hash(hh + 2) - 0.5) * 0.7) * LX;
    if (!inWin(s) || Math.abs(x) < 9) continue;
    const a = sstep(4, 30, s - sc) * (0.55 + 0.45 * hash(hh + 3));
    groundPt(s, x, GYW + 0.4);
    spr(9, a * 0.09, [1, 0.55, 0.15]); spr(1.5, a * 0.8, [1, 0.7, 0.32]);
  }
}
/* live boost only: radial zoom streaks around the view axis */
function boostLines(tl, bl, Wd) {
  if (bl < 0.02) return;
  const n = PHONE ? 16 : 26, L = 8 + 44 * bl, c = Wd.md ? Wd.strk : Wd.head;
  for (let i = 0; i < n; i++) {
    const h1 = hash(i * 5 + 901), h2 = hash(i * 5 + 902), h3 = hash(i * 5 + 903);
    const an = h1 * TAU, rad = 1.4 + h2 * 5.5, ox = Math.cos(an) * rad, oy = Math.sin(an) * rad * 0.75;
    let d = (h3 * 70 - tl * 240) % 70; if (d < 0) d += 70; d += 2;
    const a = 0.5 * bl * sstep(2, 8, d), bx = EX + RX * ox + UX * oy, by = EY + RY * ox + UY * oy, bz = EZ + RZ * ox + UZ * oy;
    lBegin(c[0], c[1], c[2]);
    lPoint(bx + FX * d, by + FY * d, bz + FZ * d, 0.025, a);
    lPoint(bx + FX * (d + L), by + FY * (d + L), bz + FZ * (d + L), 0.025, 0);
    lFlush();
  }
}
/* build(t): the whole frame as data for the world of t's cycle. live adds lean/boost; photo lengthens the exposure */
let CUR = WD.night, SC = 0, SSTART = 0, CC = 0;
function build(t, live, photo, pw_, ph_) {
  PXW = pw_; PXH = ph_;
  const c = cyc(t), u = t - c * TC, ph = u / TC, pk = c > 0 ? punch(u) : 0, bl = live ? live.b : 0;
  let Wd = worldAt(c); if (Wd.ext) Wd = WD[Wd.fb]; // embedded worlds draw themselves (xDraw); never built here
  const sc = sAt(t), v = speed(t);
  sAnchor = sc - SIG_D;
  sampleTrack(sc);
  camera(t, sc, v, ph, pk, live);
  CUR = Wd; SC = sc; CC = c; SSTART = sAt(c * TC);
  nv = 0; ni = 0;
  if (Wd === WD.crystal) prisms(sc);
  if (Wd === WD.night) lamps(sc);
  shep(t, sc, Wd, bl);
  paths(t, sc, Wd);
  racers(t, sc, Wd, photo, bl);
  if (live) boostLines(t, bl, Wd);
  return Wd;
}

/* ---------- WebGL ---------- */
const cv = rt.cv;
let gl = null, glOK = false, restored = false, P_SKY, P_FX, P_PO, bTri, bV, bC, bI, DERIV = false, firstGL = false, FBA = null, FBB = null, BKEY = '';

/* ---------- embedded worlds: the other rides' engines, built against this engine's canvas and WebGL context ----------
   Each engine sees a stand-in canvas: getContext returns this context, its size is the frame it is drawing (VW x VH
   while drawing offscreen), and its context-loss listeners and canvas fade are no-ops, because this engine owns all of
   that. heroInk is a no-op too: here the hero's colours follow the world on screen (uiInk). An engine draws into
   whatever framebuffer is bound and is told its target as draw()'s 4th argument (Scale Invariant rebinds it after its
   own post pass); xDraw gives it a clean GL state and takes a clean one back. */
let VW = 0, VH = 0, WARM = null, XLV = null;
const XCV = {
  get width() { return VW || cv.width; }, get height() { return VH || cv.height; },
  getContext: () => gl, addEventListener() {}, removeEventListener() {},
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
};
const xrt = Object.create(rt, { cv: { value: XCV }, heroInk: { value() {} } });
/* Floating World's print marks (registration corners and the "MM" seal) show only while you are in its world */
let XCSS = '.fw-ken,.fw-seal{opacity:0;transition:opacity .5s ease}' +
  '.hero:not(.still)[data-world="floating-world"] .fw-ken,.hero:not(.still)[data-world="floating-world"] .fw-seal{opacity:1}' +
  '@media (prefers-reduced-motion:reduce){.fw-ken,.fw-seal{transition:none}}';
for (const id of Object.keys(XW)) {
  const w = XW[id], make = W.MM_ENGINES && W.MM_ENGINES[id];
  w.eng = null; w.ready = false; w.dead = true;
  if (typeof make !== 'function') continue; // not shipped: the stand-in world plays instead
  try { w.eng = make(xrt); } catch (e) { console.error('Many Worlds: could not build the ' + id + ' world', e); w.eng = null; }
  if (!w.eng || typeof w.eng.draw !== 'function' || typeof w.eng.initGL !== 'function') { w.eng = null; continue; }
  w.dead = false;
  if (typeof w.eng.css === 'string') XCSS += w.eng.css;
}
const tIn = (Wd, t) => Wd.from + (t - cyc(t) * TC); // an embedded world's own time
const FAR = 1600, PA = (FAR + NEAR) / (FAR - NEAR), PB = (-2 * FAR * NEAR) / (FAR - NEAR);
const HP = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
const VS_SKY = 'attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}';
/* one fullscreen pass per world, drawn before the emitters with the same camera basis */
const FS_SKY = () => (DERIV ? '#extension GL_OES_standard_derivatives : enable\n#define DERIV 1\n' : '') + '#define OCT ' + Q.oct + '\n' + HP + `
#ifdef DERIV
#define FWA(x,a) fwidth(x)
#else
#define FWA(x,a) (a)
#endif
uniform vec3 R,U,F,CW;uniform vec2 T,SD;uniform float SH,GY,CY,MO,TM;varying vec2 v;
float h2(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float h3(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1.,0.)),f.x),mix(h2(i+vec2(0.,1.)),h2(i+vec2(1.,1.)),f.x),f.y);}
vec3 spec(float x){return clamp(abs(fract(x+vec3(0.,.6667,.3333))*6.-3.)-1.,0.,1.);}
vec3 night(vec3 d){float e=d.y;
vec3 c=mix(vec3(.07,.14,.29),vec3(.0196,.039,.102),pow(smoothstep(-.02,.7,e),.7));
c=mix(c,vec3(.008,.014,.035),smoothstep(0.,-.3,e));
c+=vec3(1.,.5,.12)*exp(-abs(e-.004)*42.)*.085;
float az=atan(d.x,d.z)*90.;float hb=h3(vec3(floor(az),7.,3.));
c+=vec3(1.,.62,.24)*step(.82,hb)*smoothstep(.5,0.,abs(fract(az)-.5))*exp(-abs(e-.002)*900.)*.5;
if(e>.03){vec3 q=d*140.;vec3 id=floor(q);float h=h3(id);if(h>.986){vec3 f=fract(q)-.5;
c+=vec3(.75,.82,1.)*smoothstep(.3,0.,length(f))*(.25+.75*fract(h*91.7))*smoothstep(.03,.25,e)*.7;}}
if(e<-.002){float tg=GY/e;vec2 p=CW.xz+d.xz*tg+SD;vec2 g=p*vec2(.8,.4);float h=h2(floor(g));vec2 f=fract(g)-.5;
c+=vec3(.7,.78,1.)*step(.955,h)*smoothstep(.15,0.,length(f*vec2(1.,2.)))*(1.-smoothstep(12.,40.,tg))*.55;
c+=vec3(1.,.5,.15)*.045*exp(e*24.);}
return c;}
float hfield(vec2 p){float a=vn(p*.011)*.62+vn(p*.027+7.3)*.28;
#if OCT>2
a+=vn(p*.07+3.1)*.1;
#else
a+=.05;
#endif
return a;}
vec3 contour(vec3 d){float e=d.y,ae=abs(e);
vec3 c=mix(vec3(.03,.13,.105),vec3(.004,.02,.018),smoothstep(0.,.35,ae));
c+=vec3(.35,1.,.78)*exp(-ae*30.)*.06;
float up=step(0.,e);float pl=(e<0.?GY:CY)/(e<0.?min(e,-1e-4):max(e,1e-4));
vec2 p=CW.xz+d.xz*pl+SD+up*vec2(517.,211.);
float H=hfield(p)*16.;float fw=FWA(H,pl*.003);
float q=abs(fract(H+.5)-.5),ix=step(mod(floor(H+.5),5.),.5);
float ln=1.-smoothstep(fw*.6,fw*1.6+.012,q),lw=1.-smoothstep(fw,fw*2.4+.03,q),vis=1.-smoothstep(.3,.8,fw);
vec3 g=mix(vec3(.004,.024,.02),vec3(.018,.075,.06),H/16.);
g+=(vec3(.36,1.,.78)*ln*(1.-ix)*.5+vec3(1.,.68,.28)*lw*ix*.8)*vis;
g*=1.-.45*up;
return mix(c,g,exp(-pl*.0042));}
vec3 crystal(vec3 d){float e=d.y,az=atan(d.x,d.z);
vec3 c=mix(vec3(.06,.04,.14),vec3(.012,.008,.035),pow(smoothstep(-.02,.6,e),.6));
c+=spec(.05-e*7.)*exp(-abs(e-.012)*60.)*.15;
float bf=fract((e*2.6+sin(az*1.7+SD.x)*.22+az*.15)*1.3);
c+=spec(bf*.9+.1)*smoothstep(0.,.03,bf)*smoothstep(.1,.03,bf)*smoothstep(.06,.4,e)*.045;
float ee=min(e,-1e-3),tg=GY/ee;vec2 p=(CW.xz+d.xz*tg+SD)/12.;
vec2 sk=vec2(p.x+p.y*.57735,p.y*1.1547);vec2 i=floor(sk),f=fract(sk);
float tu=step(f.y,f.x),hid=h2(i*1.37+vec2(tu*.71,tu*.29));
float ed=tu>.5?min(min(f.y,1.-f.x),f.x-f.y):min(min(f.x,1.-f.y),f.y-f.x);
float fw=FWA(ed,tg*.0009/max(-ee,.02)),rf=pow(fract(hid*7.13),4.);
vec3 g=vec3(.028,.018,.07)*(.35+hid)+spec(hid*3.1+az*.8+tg*.0025)*rf*.22+vec3(.5,.45,1.)*smoothstep(.75,1.,fract(hid*3.7))*.03;
g+=mix(vec3(.72,.68,1.),spec(hid+az*.5+.2),.5)*(1.-smoothstep(fw*.5,fw*1.5+.004,ed))*.16*(1.-smoothstep(.05,.13,fw));
g=mix(vec3(.05,.035,.12),g,exp(-tg*.0065));
return mix(c,g,smoothstep(0.,-.004,e));}
vec3 molten(vec3 d){float e=d.y,az=atan(d.x,d.z);
e+=.003*sin(az*36.+TM*5.3)*exp(-abs(e)*22.);
vec3 c=mix(vec3(.3,.075,.025),vec3(.05,.01,.008),pow(smoothstep(-.02,.55,e),.55));
c+=vec3(1.,.42,.08)*exp(-abs(e-.004)*30.)*.2+vec3(1.,.78,.36)*exp(-abs(e-.0015)*170.)*.16;
float ee=min(e,-1e-3),tg=GY/ee;vec2 p=CW.xz+d.xz*tg+SD;
p.x+=sin(p.y*.31+TM*4.1)*.3*smoothstep(8.,70.,tg);
float n2=vn(p*.33+5.2),n1=vn(p*.12+vec2(n2*1.4));
float cr=abs(n1-.5),fw=FWA(cr,tg*.0009/max(-ee,.02));
float gl=1.-smoothstep(0.,.022+fw*1.2,cr),pool=smoothstep(.64,.82,vn(p*.022+3.));
vec3 g=vec3(.04,.014,.009)*(.7+.6*n2)+vec3(1.,.36,.06)*gl*.75*(.5+.5*n2)*(1.-smoothstep(.04,.12,fw))+vec3(1.,.27,.05)*pool*.14;
g=mix(vec3(.34,.09,.03),g,exp(-tg*.0075));
return mix(c,g,smoothstep(0.,-.004,e));}
vec3 ink(vec3 d){float e=d.y,az=atan(d.x,d.z);vec2 fc=gl_FragCoord.xy;
vec3 c=vec3(.945,.925,.878)-h2(fc)*.03-vn(fc*vec2(.015,.4))*.03;
float m1=.03+.055*vn(vec2(az*3.2+SD.x,1.))+.018*vn(vec2(az*9.,2.));
c=mix(c,vec3(.6,.59,.58),smoothstep(m1+.0025,m1-.0015,e)*smoothstep(-.02,m1,e)*.5);
float m2=.008+.035*vn(vec2(az*5.+SD.y,5.))+.012*vn(vec2(az*15.,6.));
c=mix(c,vec3(.3,.3,.31),smoothstep(m2+.002,m2-.0015,e)*smoothstep(-.012,m2,e)*.62);
float ee=min(e,-1e-3),tg=GY/ee;vec2 p=CW.xz+d.xz*tg+SD;
float yy=fract(p.y/12.),hr=h2(vec2(floor(p.y/12.),3.7));
float st=smoothstep(0.,.03,yy)*smoothstep(.12+hr*.1,.05,yy)*smoothstep(1.,.55,abs((p.x-(hr-.5)*36.)/(5.+hr*16.)))*(.55+.45*vn(vec2(p.x*.9,yy*30.)))*step(.42,hr);
return mix(c,vec3(.22,.21,.21),st*exp(-tg*.012)*smoothstep(0.,-.01,e)*.5);}
void main(){vec3 d=normalize(F+R*v.x*T.x+U*(v.y-SH)*T.y);vec3 c;
if(MO<.5)c=night(d);else if(MO<1.5)c=contour(d);else if(MO<2.5)c=crystal(d);else if(MO<3.5)c=molten(d);else c=ink(d);
gl_FragColor=vec4(c,1.);}`;
const VS_FX = `attribute vec3 p;attribute vec2 uv;attribute vec4 c;uniform vec2 Z;varying vec2 vu;varying vec4 vc;
void main(){vu=uv;vc=c;gl_Position=vec4(p.x,p.y,Z.x*p.z+Z.y,p.z);}`;
/* MD 0: additive light; 1: wet ink (flat core, bristles, bleed) */
const FS_FX = `precision mediump float;varying vec2 vu;varying vec4 vc;uniform float MD;
void main(){float r=length(vu);
if(MD<.5){float f=max(1.-r,0.);f*=f;float k=exp(-r*r*16.);gl_FragColor=vec4((vc.rgb*(f*.55+k*.85)+vec3(k*k*.28))*vc.a,1.);}
else{float core=1.-smoothstep(.62,1.,r),br=.8+.2*sin(vu.x*23.+vu.y*9.),bl=exp(-r*r*2.2)*.22;gl_FragColor=vec4((1.-vc.rgb)*min(1.,core*br+bl)*vc.a,1.);}}`;
/* post pass (live boost, and every rift): zoom blur, edge chroma and the pressure ring on the current world;
   during a rift, the frozen outgoing frame torn along a seeded fracture, with glowing edges and slit-scan streaks */
const FS_PO = () => '#define NT ' + Q.nt + '\n' + HP + `uniform sampler2D A,B;uniform vec2 RS,ZC;uniform float AS,RM,HSP,GI,GP,SHR,DIR,LT,TT,ZB,CB,SM,EN;
uniform vec4 CA,CF,CP;uniform vec3 CC,GC,RG;
float tri(float x){return abs(fract(x)-.5)*4.-1.;}
float crk(float y){return CA.x*tri(CF.x*y+CP.x)+CA.y*tri(CF.y*y+CP.y)+CA.z*tri(CF.z*y+CP.z)+CA.w*tri(CF.w*y+CP.w);}
vec2 toUV(vec2 q){float c=cos(CC.z),s=sin(CC.z);return (vec2(c*q.x-s*q.y,s*q.x+c*q.y)+CC.xy)/vec2(AS,1.)+.5;}
vec3 cur(vec2 uv){vec2 d=uv-ZC;float r=length(d*vec2(AS,1.));
float rr=r-RG.x,rw=exp(-rr*rr/(RG.z*RG.z))*RG.y;
uv-=d/(r+1e-4)*rw*.01;d=uv-ZC;
float ca=CB*r;
vec3 col=vec3(texture2D(A,ZC+d*(1.+ca)).r,texture2D(A,uv).g,texture2D(A,ZC+d*(1.-ca)).b);
if(ZB>.001){vec3 acc=col;float ws=1.;
for(int i=1;i<=NT;i++){float k=float(i)/float(NT),w=1.-k*.55;acc+=texture2D(A,ZC+d*(1.-ZB*k*min(r,1.2))).rgb*w;ws+=w;}
col=acc/ws;}
return mix(col+GC*rw*.07,col*(1.-rw*.12),LT);}
void main(){vec2 uv=gl_FragCoord.xy/RS;
if(RM<.5){gl_FragColor=vec4(cur(uv),1.);return;}
float cz=cos(CC.z),sz=sin(CC.z);vec2 p=(uv-.5)*vec2(AS,1.)-CC.xy;vec2 q=vec2(cz*p.x+sz*p.y,-sz*p.x+cz*p.y);
float px=1./RS.y;vec3 col;
if(HSP>.5){col=texture2D(B,uv).rgb;float dd=abs(q.x-crk(q.y));
float on=1.-smoothstep(-.03,.03,DIR*q.y-mix(-1.1,1.1,GI));
float g=(exp(-dd/(1.3*px))*.85+exp(-dd/(9.*px))*.3)*on;
gl_FragColor=vec4(mix(col+GC*g,col*(1.-g*.8),LT),1.);return;}
vec2 o=vec2(GP*.5,-SHR*GP),sl=q+o,sr=q-o;
float fl=crk(sl.y),fr=crk(sr.y),dl=sl.x-fl,dr=sr.x-fr;
if(dl<0.)col=texture2D(B,toUV(sl)).rgb;
else if(dr>0.)col=texture2D(B,toUV(sr)).rgb;
else{col=cur(uv);
float sw=.04+.16*GP,rs=.35+.65*fract(sin(floor(q.y*140.)*91.7)*4373.1);
vec3 el=texture2D(B,toUV(vec2(fl-2.*px,sl.y))).rgb,er=texture2D(B,toUV(vec2(fr+2.*px,sr.y))).rgb;
col=mix(col,el,pow(max(0.,1.-dl/sw),2.)*.5*rs*SM);col=mix(col,er,pow(max(0.,1.+dr/sw),2.)*.5*rs*SM);
float ac=dl/max(dl-dr,1e-4),xq=(q.x+4.)*70.,n=floor(xq),hs=fract(sin(n*78.233+CC.z*13.)*43758.5);
float run=fract(q.y*(.8+hs*1.6)-TT*(2.5+hs*4.)+hs*7.);
float sk=step(.8,hs)*(1.-smoothstep(.12,.3,abs(fract(xq)-.5)*2.))*smoothstep(0.,.06,run)*(1.-smoothstep(.25,.6,run))*(1.-abs(ac*2.-1.)*.5)*SM;
col=mix(col+GC*sk*.5,col*(1.-sk*.45),LT);}
float gap=step(0.,dl)*step(dr,0.);
float rim=((exp(-abs(dl)/(1.4*px))+exp(-abs(dr)/(1.4*px)))*.8+(exp(-max(dl,0.)/(12.*px))+exp(-max(-dr,0.)/(12.*px)))*.28*gap)*EN;
gl_FragColor=vec4(mix(col+GC*rim,col*(1.-rim*.7),LT),1.);}`;
function mkProg(vs, fs, attrs) {
  const p = gl.createProgram();
  [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(([ty, src]) => {
    const s = gl.createShader(ty); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('shader: ' + gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  });
  attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('link: ' + gl.getProgramInfoLog(p));
  p.u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
  for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); p.u[u.name] = gl.getUniformLocation(p, u.name); }
  return p;
}
function glSetup() {
  try {
    DERIV = !!gl.getExtension('OES_standard_derivatives');
    P_SKY = mkProg(VS_SKY, FS_SKY(), ['p']);
    P_FX = mkProg(VS_FX, FS_FX, ['p', 'uv', 'c']);
    P_PO = mkProg(VS_SKY, FS_PO(), ['p']);
    bTri = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bTri); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    bV = gl.createBuffer(); bC = gl.createBuffer(); bI = gl.createBuffer();
    FBA = FBB = WARM = null; BKEY = '';
    return true;
  } catch (e) { console.warn(String((e && e.message) || e)); return false; }
}
function initGL() {
  // one context for all eight worlds: Floating World's sea is depth-tested, so the frame has a depth buffer
  try { gl = cv.getContext('webgl', { antialias: !PHONE, alpha: false, depth: true, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
  if (!gl) return false;
  // a lost context shows the poster; once restored, the next frame warms up again (embedded worlds recompile as they
  // come up) and the canvas returns
  cv.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); glOK = false; firstGL = false; cv.classList.remove('on');
    uiW = null; rt.heroInk(null); rt.hero.removeAttribute('data-world'); // the poster is dark: default ink
    for (const id of Object.keys(XW)) XW[id].ready = false;
  });
  cv.addEventListener('webglcontextrestored', () => { glOK = glSetup(); restored = glOK; });
  glOK = glSetup();
  return glOK;
}
/* render targets: A holds the current world when the post pass runs, B the frozen outgoing world of a rift */
function fbFor(o, w, h) {
  if (o && o.w === w && o.h === h) return o;
  if (o) { gl.deleteTexture(o.t); gl.deleteRenderbuffer(o.d); gl.deleteFramebuffer(o.f); }
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const d = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, d); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, d);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { t, d, f, w, h };
}
function fullTri() { gl.bindBuffer(gl.ARRAY_BUFFER, bTri); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2); gl.drawArrays(gl.TRIANGLES, 0, 3); }
/* GL state as a fresh context has it (the parts any of the four engines touch), bound to fb at w x h */
function cleanGL(fb, w, h) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb || null); gl.viewport(0, 0, w, h);
  gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.depthMask(true); gl.colorMask(true, true, true, true); gl.depthFunc(gl.LESS); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ZERO);
  for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
  gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
  gl.useProgram(null);
}
/* an embedded world's frame at ride time t, drawn by its own engine into fb (null: the screen) at w x h. A throw
   retires the world: from the next frame on, its native stand-in plays its slot */
function xDraw(Wd, t, photo, fb, w, h) {
  cleanGL(fb, w, h);
  VW = w; VH = h;
  try { Wd.eng.draw(tIn(Wd, t), XLV, !!photo, fb || null); }
  catch (e) { console.error('Many Worlds: the ' + Wd.id + ' world failed; ' + Wd.fb + ' plays instead', e); Wd.dead = true; }
  VW = VH = 0;
  cleanGL(null, cv.width, cv.height);
}
/* compile an embedded world on this context and draw it once offscreen, so its first frame on screen never stalls.
   warm() does this behind the poster for the worlds the ride starts in; each rift's hit-stop does it for the world
   after next while the frame is frozen anyway; anything else (seek, a lost context) does it the moment it is needed */
function prep(Wd) {
  let ok = false;
  try { ok = !!Wd.eng.initGL(); } catch (e) { console.error('Many Worlds: the ' + Wd.id + ' world could not start', e); }
  cleanGL(null, cv.width, cv.height);
  if (!ok) { Wd.dead = true; return; }
  Wd.ready = true;
  WARM = fbFor(WARM, 64, 64);
  xDraw(Wd, 0.5, false, WARM.f, 64, 64);
}
/* the world that plays cycle c: an embedded world compiles the first time it is asked for (with a live context), and
   its native stand-in plays if its engine is missing, failed, or cannot be compiled yet */
function worldAt(c) {
  const w = worldOf(c);
  if (!w.ext) return w;
  if (!w.ready && !w.dead && gl && glOK && !gl.isContextLost()) prep(w);
  return w.ready && !w.dead ? w : WD[w.fb];
}
/* one world into render target F, or (no F) only make it current for the post pass */
function renderTo(Wd, t, live, photo, F) {
  if (Wd.ext) { CUR = Wd; SHIFT = 0; if (F) xDraw(Wd, t, photo, F.f, F.w, F.h); return; }
  build(t, live, photo, cv.width, cv.height);
  if (F) drawWorld(F.f, t);
}
/* draws the world built last (CUR) into fb, or to the screen */
function drawWorld(fb, tm) {
  const Wd = CUR;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb || null);
  gl.viewport(0, 0, cv.width, cv.height);
  gl.disable(gl.BLEND);
  gl.useProgram(P_SKY); const u = P_SKY.u, cy = Y0 + EY;
  gl.uniform3f(u.R, RX, RY, RZ); gl.uniform3f(u.U, UX, UY, UZ); gl.uniform3f(u.F, FX, FY, FZ); gl.uniform2f(u.T, TXF, TYF); gl.uniform1f(u.SH, SHIFT);
  gl.uniform3f(u.CW, Xs(SC) + EX, cy, SC - SSTART + EZ);
  gl.uniform2f(u.SD, 40 + hash(CC * 3 + 1) * 400, 40 + hash(CC * 3 + 2) * 400);
  gl.uniform1f(u.GY, GYW - cy); gl.uniform1f(u.CY, CYW - cy); gl.uniform1f(u.MO, Wd.mode); gl.uniform1f(u.TM, tm % 600);
  fullTri();
  if (ni) {
    gl.enable(gl.BLEND);
    if (Wd.md) gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR); else gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(P_FX); gl.uniform2f(P_FX.u.Z, PA, PB); gl.uniform1f(P_FX.u.MD, Wd.md);
    gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);
    gl.bindBuffer(gl.ARRAY_BUFFER, bV); gl.bufferData(gl.ARRAY_BUFFER, VB.subarray(0, nv * 5), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindBuffer(gl.ARRAY_BUFFER, bC); gl.bufferData(gl.ARRAY_BUFFER, CB.subarray(0, nv * 4), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, IB.subarray(0, ni), gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, ni, gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.BLEND);
  }
}
/* rift k: seeded fracture (rotation, centre, four triangle-wave terms), glow-in direction and shear */
let RPk = -1, RP = null;
function riftP(k) {
  if (RPk === k) return RP;
  const h = (i) => hash(k * 7919 + i * 131 + 17);
  RPk = k; nameBox();
  RP = { ang: (h(1) * 2 - 1) * 0.55, cx: (h(2) - 0.5) * 0.35, cy: (h(3) - 0.5) * 0.2,
    A: [0.085 + 0.04 * h(4), 0.045 + 0.02 * h(5), 0.02 + 0.01 * h(6), 0.007],
    F: [0.9 + 0.7 * h(7), 2.3 + 1.2 * h(8), 6.1 + 2 * h(9), 19 + 6 * h(10)],
    P: [h(11) * 4, h(12) * 4, h(13) * 4, h(14) * 4], dir: h(15) < 0.5 ? -1 : 1, shear: (h(16) - 0.5) * 0.3 };
  return RP;
}
function post(rp, t, live, o) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, cv.width, cv.height);
  gl.disable(gl.BLEND);
  gl.useProgram(P_PO); const u = P_PO.u;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, (FBA || FBB).t);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, (o && o.hs ? FBB : FBB || FBA).t);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(u.A, 0); gl.uniform1i(u.B, 1);
  gl.uniform2f(u.RS, cv.width, cv.height); gl.uniform1f(u.AS, cv.width / cv.height); gl.uniform2f(u.ZC, 0.5, 0.5 + SHIFT * 0.5);
  const b = live ? live.b : 0, rg = live ? live.ring : 0;
  gl.uniform1f(u.ZB, 0.075 * b); gl.uniform1f(u.CB, 0.016 * b);
  gl.uniform3f(u.RG, rg > 0 ? 0.04 + 1.15 * rg : -9, rg > 0 ? Math.pow(1 - rg, 1.5) * sstep(0, 0.08, rg) : 0, 0.025 + 0.05 * rg);
  gl.uniform1f(u.TT, t % 600);
  if (!rp) { gl.uniform1f(u.RM, 0); gl.uniform1f(u.LT, CUR.lit); gl.uniform3f(u.GC, CUR.glow[0], CUR.glow[1], CUR.glow[2]); }
  else {
    gl.uniform1f(u.RM, 1); gl.uniform1f(u.HSP, o.hs); gl.uniform1f(u.GI, o.gi || 0); gl.uniform1f(u.GP, o.gap || 0);
    gl.uniform1f(u.SHR, rp.shear); gl.uniform1f(u.DIR, rp.dir);
    gl.uniform4f(u.CA, rp.A[0], rp.A[1], rp.A[2], rp.A[3]); gl.uniform4f(u.CF, rp.F[0], rp.F[1], rp.F[2], rp.F[3]); gl.uniform4f(u.CP, rp.P[0], rp.P[1], rp.P[2], rp.P[3]);
    gl.uniform3f(u.CC, rp.cx, rp.cy, rp.ang); gl.uniform1f(u.SM, o.sm || 0); gl.uniform1f(u.EN, o.en || 0);
    gl.uniform1f(u.LT, o.lt); gl.uniform3f(u.GC, o.gc[0], o.gc[1], o.gc[2]);
  }
  fullTri();
}
/* the rift: hit-stop on the frozen outgoing frame while the fracture glows in, then the tear opens onto the next world.
   Either side can be an embedded world. Returns the world whose hero colours show: the outgoing one until the tear
   has uncovered half of the name */
function drawRift(t, k, live, photo) {
  const tw = k * TC, rp = riftP(k), Win = worldAt(k), Wout = worldAt(k - 1);
  const key = (live ? 'L' : 'S') + k + (photo ? 'p' : '') + ':' + cv.width + 'x' + cv.height;
  if (BKEY !== key) {
    FBB = fbFor(FBB, cv.width, cv.height);
    const tb = live ? Math.min(t, tw - 0.002) : tw - HS_T;
    renderTo(Wout, tb, live, photo, FBB);
    if (live) worldAt(k + 1); // the frame is frozen: if the world after next is embedded, compile it now
    BKEY = key;
  }
  if (t < tw) {
    if (CUR !== Wout) renderTo(Wout, tw - HS_T, live, photo, null);
    post(rp, t, live, { hs: 1, gi: sat((t - (tw - HS_T)) / (HS_T * 0.85)), lt: Wout.lit, gc: Win.glow });
    return Wout;
  }
  const u = sat((t - tw) / OPEN_T), gmax = 2.2 * (cv.width / cv.height + 1), gap = gmax * (0.012 + 0.988 * Math.pow(u, 2.8));
  FBA = fbFor(FBA, cv.width, cv.height);
  renderTo(Win, t, live, photo, FBA);
  post(rp, t, live, { hs: 0, gap, sm: (1 - u) * sstep(0, 0.12, u), en: 1 - u * u * u, lt: Win.lit, gc: Win.glow });
  return nameCover(rp, gap) >= 0.5 ? Win : Wout;
}
/* share of the name block already showing the incoming world (the shader's crack test, on a 4x3 grid of points) */
const tri = (x) => Math.abs(x - Math.floor(x) - 0.5) * 4 - 1;
const crkJS = (rp, y) => rp.A[0] * tri(rp.F[0] * y + rp.P[0]) + rp.A[1] * tri(rp.F[1] * y + rp.P[1]) + rp.A[2] * tri(rp.F[2] * y + rp.P[2]) + rp.A[3] * tri(rp.F[3] * y + rp.P[3]);
let NB = [0.05, 0.12, 0.45, 0.4];
/* the name and tagline in uv (y up), read once per rift */
function nameBox() {
  const h = rt.hero.getBoundingClientRect(), a = rt.nm.getBoundingClientRect(), b = rt.tg.getBoundingClientRect();
  if (a.width && h.width) NB = [(a.left - h.left) / h.width, 1 - (b.bottom - h.top) / h.height, (Math.max(a.right, b.right) - h.left) / h.width, 1 - (a.top - h.top) / h.height];
}
function nameCover(rp, gap) {
  const as = cv.width / cv.height, c = Math.cos(rp.ang), s = Math.sin(rp.ang), ox = gap * 0.5, oy = -rp.shear * gap;
  let n = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const ux = NB[0] + (NB[2] - NB[0]) * (i + 0.5) / 4, uy = NB[1] + (NB[3] - NB[1]) * (j + 0.5) / 3;
    const x = (ux - 0.5) * as - rp.cx, y = uy - 0.5 - rp.cy, qx = c * x + s * y, qy = -s * x + c * y;
    if (qx + ox - crkJS(rp, qy + oy) >= 0 && qx - ox - crkJS(rp, qy - oy) <= 0) n++;
  }
  return n / 12;
}
/* one frame at time t; returns the world whose hero colours show (null: no frame) */
function frameAt(t, live, photo) {
  if (!glOK || gl.isContextLost()) return null;
  if (!firstGL) warm(t);
  const k = riftK(t);
  let Wui;
  if (k) Wui = drawRift(t, k, live, photo);
  else {
    const Wd = worldAt(cyc(t));
    if (Wd.ext) { CUR = Wd; SHIFT = 0; xDraw(Wd, t, photo, null, cv.width, cv.height); } // an embedded world brings its own boost look
    else {
      build(t, live, photo, cv.width, cv.height);
      if (live && (live.b > 0.004 || live.ring > 0)) { FBA = fbFor(FBA, cv.width, cv.height); drawWorld(FBA.f, t); post(null, t, live, null); }
      else drawWorld(null, t);
    }
    Wui = CUR;
  }
  if (!firstGL) { gl.finish(); firstGL = true; if (restored) { restored = false; requestAnimationFrame(() => cv.classList.add('on')); } } // the runtime fades #gl in after the first draw
  return Wui;
}
/* first frame only: run every pipeline once (world to screen and to a target, both trail blends, the post pass),
   so the first rift or boost never stalls, and compile the embedded worlds the ride is about to show; the poster
   stays up until a finished frame exists */
function warm(t) {
  const c = cyc(t);
  worldAt(c); worldAt(c + 1);
  if (worldOf(c).ext) t = 0.5; // the native pipelines warm up on blue hour
  build(t, null, false, cv.width, cv.height);
  const keep = CUR;
  FBA = fbFor(FBA, cv.width, cv.height);
  CUR = WD.ink; drawWorld(null, t); drawWorld(FBA.f, t);
  CUR = keep; drawWorld(FBA.f, t); post(null, t, null, null);
}

/* ---------- poster: the night world stroked on a cheap 2D canvas (also the no-WebGL fallback) ---------- */
const T_STILL = 6.13, T_POST = 4.6;
function drawPoster(c, w, h, t, photo) {
  if (worldOf(cyc(t)) !== WD.night || riftK(t)) t = T_POST; // the 2D poster only paints the night world
  REC = { lines: [], spr: [] };
  build(t, null, photo, w, h);
  const rec = REC; REC = null;
  const hl = Math.hypot(FX, FZ) || 1, hx = (FX / hl) * 1000, hz = (FZ / hl) * 1000, vz = hx * FX + hz * FZ;
  const yH = clamp(vz > 1 ? 0.5 - ((hx * UX + hz * UZ) / (vz * TYF) + SHIFT) * 0.5 : 0.5, 0.05, 0.95);
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#050A1A'); g.addColorStop(yH, '#122752'); g.addColorStop(Math.min(1, yH + 0.03), '#070d1f'); g.addColorStop(1, '#02040b');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  const col = (r_, g_, b_, a) => `rgba(${(r_ * 255) | 0},${(g_ * 255) | 0},${(b_ * 255) | 0},${clamp(a, 0, 1).toFixed(3)})`;
  for (const [r_, g_, b_, p] of rec.lines) for (let k = 4; k < p.length; k += 4) {
    const a = (p[k + 3] + p[k - 1]) * 0.5; if (a < 0.01) continue;
    const lw = p[k + 2] + p[k - 2];
    c.beginPath(); c.moveTo(p[k - 4], p[k - 3]); c.lineTo(p[k], p[k + 1]);
    c.strokeStyle = col(r_, g_, b_, a * 0.35); c.lineWidth = lw; c.stroke();
    c.strokeStyle = col(r_, g_, b_, a * 0.9); c.lineWidth = Math.max(1, lw * 0.22); c.stroke();
  }
  for (const [x, y, rad, a, r_, g_, b_] of rec.spr) {
    const gr = c.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, col(r_, g_, b_, a)); gr.addColorStop(0.22, col(r_, g_, b_, a * 0.45)); gr.addColorStop(1, col(r_, g_, b_, 0));
    c.fillStyle = gr; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  c.globalCompositeOperation = 'source-over';
}

/* ---------- hero colours: each world's set (its `ui`, else the site theme), set from draw(t). The switch snaps when
   the tear has uncovered half the name: a cross-fade would pass through a grey where text and scrim match (about
   1.1:1). The hero also carries the world's id (data-world), which shows Floating World's print marks in its world */
let uiW = null;
function uiInk(Wd) {
  if (!Wd || Wd === uiW) return; uiW = Wd;
  rt.heroInk(null); if (Wd.ui) rt.heroInk(Wd.ui);
  rt.hero.setAttribute('data-world', Wd.id);
}

/* ---------- the runtime's live state, mapped onto this ride's fields ----------
   A rift caps the warp (warpCap) so it always plays near real time, but not the look: the visual boost holds its
   pre-rift level through a rift and never swings faster than full scale in 0.25 s, so nothing snaps. The runtime caps
   each frame's warp with the previous frame's time, so the first frame after a rift still reports the cap: skip it too. */
const LV = { lean: 0, b: 0, ds: 0, ring: 0 };
let bVis = 0, bHeld = 0, lastWall = 0, lastLT = -1;
const capped = (t) => riftK(t) > 0 || riftK(t + 0.06) > 0;
function liveOf(t, live) {
  if (!live) return null;
  const now = performance.now() / 1000, dt = lastWall ? clamp(now - lastWall, 0, 0.25) : 0.016; lastWall = now;
  if (!capped(t) && !(lastLT >= 0 && capped(lastLT))) bHeld = live.boost;
  lastLT = t;
  bVis += clamp(bHeld - bVis, -dt * 4, dt * 4);
  LV.lean = live.lean * 1.3; LV.b = bVis; LV.ds = live.down; LV.ring = live.wave >= 0 && live.wave < 0.75 ? live.wave / 0.75 : 0;
  return LV;
}
/* the runtime's live fields as the embedded engines expect them, with the boost held through each rift as above */
const XL = { lean: 0, warp: 1, boost: 0, intent: 0, wave: 1e9, down: 0, holding: false };
function xLive(live) {
  if (!live) return null;
  XL.lean = live.lean; XL.warp = live.warp; XL.boost = Math.max(live.boost, bVis); XL.intent = live.intent; XL.wave = live.wave; XL.down = live.down; XL.holding = live.holding;
  return XL;
}

return {
  id: 'many-worlds', title: 'Many Worlds',
  caption: 'Each world is one member of a forecast ensemble, the Everett many-worlds idea (every possible outcome is realized in its own branch) applied to a forecast; the endless acceleration is a Shepard\u2013Risset illusion, speed layers spaced an octave apart, each fading in while slow and out while fast.',
  DURATION, T_STILL, hintAt: 5.6, Q, SHOTS, WORLDS, start: START, css: XCSS,
  initGL,
  draw(t, live, photo) { const lv = liveOf(t, live); XLV = xLive(live); uiInk(frameAt(t, lv, !!photo)); },
  poster(ctx, w, h, t, photo) { drawPoster(ctx, w, h, t, !!photo); },
  /* every rift plays at near real time; an embedded world keeps its own ride's cap (Floating World: 2x) */
  warpCap(t) {
    if (capped(t)) return 1.25;
    const w = worldOf(cyc(t));
    return w.ext && w.eng && w.eng.warpCap ? Math.max(1, Math.min(5, +w.eng.warpCap(tIn(w, t)) || 5)) : 5;
  },
  /* adaptive resolution per world (runtime.js): the key switches at the hit-stop, so the frozen frame and the tear
     render at the incoming world's scale; an embedded world starts at its own ride's scale0 */
  qualityKey: (t) => worldOf(cyc(t + HS_T)).id,
  scale0For(key) { const w = XW[key]; return w && w.eng && w.eng.Q && w.eng.Q.scale0 ? +w.eng.Q.scale0 : 0; }
};
};
