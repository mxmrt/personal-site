/* Asymptote: one ride engine for the shared maxmartinelli.com shell (see ENGINE_API.md).
   Accelerate toward the speed of light and never reach it. Starlight is aberrated exactly,
   tan(theta'/2) = e^-eta tan(theta/2), and coloured by its Doppler factor D = gamma (1 + beta cos theta), so the sky
   squeezes into a starbow: a dark ultraviolet core, a Doppler-blue ring, white and amber further out, a red rim.
   Five rapidity layers one nine apart (ln 10 / 2) fade in slow and out fast, so the acceleration never stops; data
   dust rides five Shepard speed layers and the forecast ensemble bends into the ring. The runtime owns the clock,
   input, boost dynamics, hint, entrance and fallbacks. */
window.MM_ENGINES['asymptote'] = function (rt) {
'use strict';
/* HERO STORYBOARD (seconds; draw(t) renders every frame from t alone)
   0.0-2.4   Launch. The starbow fades up at 85% of cruise rapidity and tightens: a dark ultraviolet core, a ring of
             Doppler-blue starlight, white and amber further out, red at the rim. Data dust streams out of the ring,
             the ensemble trails glow faintly, the name enters.
   2.4       First nine. The ring contracts sharply and breathes, a pressure wave rolls out, every star streaks, and
             the red and white trails ignite and bend into the ring along aberration curves.
   2.4-9.1   Cruise. Starlight streams inward through the ring, shifting red to white to blue, then fades past the
             visible. Five dust layers rush past faster and faster (Shepard layers); FOV, streaks and vibration creep.
   9.1, 15.7 One more nine each time (ln 10 / 2 of rapidity per cycle): punch, breath, pressure wave; the creeping
             ramps reset under the punch. 15.7-20: third cycle; live mode never stops, and holding warps time to 5x. */

const { D, TAU, clamp, sstep, smoother, mod, mulberry32, hash, PHONE } = rt;
const LN2 = Math.LN2, cv = rt.cv;
const Q = PHONE
  ? { stars: 2500, dust: 42, n: 10, ns: 44, pr: 1.5, zs: 26, post: 900 }
  : { stars: 6000, dust: 80, n: 16, ns: 60, pr: 2, zs: 44, post: 1800 };
const rnd = mulberry32(20261011);
/* ---------- time: rapidity advances one nine (ln 10 / 2) per cycle ----------
   lambda(t) is the layer clock: +1 per cycle, continuous, with a sharp surge (the punch) at the start of each
   cycle and a slow-to-fast ramp after it. Star layers, dust layers and trail flow all run on it. */
const DURATION = 20, TC = 20 / 3, T_P0 = 2.4;
const DETA = Math.log(10) / 2;
const KL = 5, ETA_LO = 1.6;
const PA = 0.22, PW = 0.075, PC = 0.6;
function G(u) { const x = u / PW, e = x < 1 ? 1 - (1 - x) * (1 - x) * (1 - x) : 1; return PA * e + ((1 - PA) * (u + PC * u * u)) / (1 + PC); }
const tau = (t) => (t - T_P0) / TC;
function lam(t) { const s = tau(t), f = Math.floor(s); return f + G(s - f); }
function cyc(t) { const s = tau(t); return s - Math.floor(s); }
const intro = (t) => smoother(t / T_P0);
/* the starfield starts at 85% of cruise rapidity and fades up, so the opening already shows the starbow */
const introS = (t) => 0.85 + 0.15 * smoother(t / T_P0);
const fadeIn = (t) => 0.45 + 0.55 * sstep(0, 1.2, t);
/* per-cycle creep: 1 at the punch, eases to 0 over the breath, climbs back to 1 by the next punch (continuous) */
const creep = (u) => 1 - sstep(0, 0.14, u) + Math.pow(sstep(0.14, 1, u), 1.4);
/* the punch: sharp contraction (0.1 s), then it breathes out */
const punch = (dt) => sstep(0, 0.1, dt) * Math.exp(-Math.max(0, dt - 0.1) / 0.32);
const VTR = 15;
const sCam = (t) => VTR * TC * lam(t);

/* ---------- light: observed temperature T' = D T, as log2 T' (0 = headlight white) ---------- */
const RSTOP = [[-2.2, 0.45, 0.02, 0.02], [-1.3, 1, 0.17, 0.17], [-0.6, 1, 0.65, 0.17], [0, 0.957, 0.945, 0.91], [1, 0.78, 0.86, 1], [2, 0.435, 0.659, 1], [3.2, 0.25, 0.36, 1]];
let CR = 1, CG = 1, CBL = 1;
function ramp(x) {
  let a = RSTOP[0];
  if (x <= a[0]) { CR = a[1]; CG = a[2]; CBL = a[3]; return; }
  for (let i = 1; i < RSTOP.length; i++) {
    const b = RSTOP[i];
    if (x < b[0]) { const u = (x - a[0]) / (b[0] - a[0]); CR = a[1] + (b[1] - a[1]) * u; CG = a[2] + (b[2] - a[2]) * u; CBL = a[3] + (b[3] - a[3]) * u; return; }
    a = b;
  }
  CR = a[1]; CG = a[2]; CBL = a[3];
}
/* visible band: redshifted past ~0.15 T it drops into the infrared, blueshifted past ~20 T into the ultraviolet */
const vis = (x) => sstep(-2.6, -1.2, x) * (1 - sstep(1.8, 3.4, x));
/* beaming, soft-clipped so the forward ring glows without blowing out */
const beam = (D_) => D_ / (1 + 0.2 * D_);

/* ---------- the sky: one seeded full-sphere starfield, reused by every rapidity layer under its own rotation ---------- */
const NST = Q.stars, SD = new Float32Array(NST * 5);
{
  const r = mulberry32(4242);
  for (let i = 0; i < NST; i++) {
    const z = r() * 2 - 1, a = r() * TAU, s = Math.sqrt(1 - z * z), o = i * 5;
    const u1 = Math.max(1e-6, r()), g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(TAU * r());
    SD[o] = s * Math.cos(a); SD[o + 1] = s * Math.sin(a); SD[o + 2] = z;
    SD[o + 3] = clamp(-0.8 + 0.32 * g, -1.6, 0.2);  // log2 rest temperature (mostly cool dwarfs)
    SD[o + 4] = 0.03 + 0.97 * Math.pow(r(), 7);     // brightness: many faint, few bright
  }
}
/* layer j (absolute id) gets a seeded rotation; column-major mat3 for GLSL */
function layerRot(j, o) {
  const u1 = hash(j * 7 + 101), u2 = hash(j * 7 + 102), u3 = hash(j * 7 + 103), a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  const x = a * Math.sin(TAU * u2), y = a * Math.cos(TAU * u2), z = b * Math.sin(TAU * u3), w = b * Math.cos(TAU * u3);
  o[0] = 1 - 2 * (y * y + z * z); o[3] = 2 * (x * y - z * w); o[6] = 2 * (x * z + y * w);
  o[1] = 2 * (x * y + z * w); o[4] = 1 - 2 * (x * x + z * z); o[7] = 2 * (y * z - x * w);
  o[2] = 2 * (x * z - y * w); o[5] = 2 * (y * z + x * w); o[8] = 1 - 2 * (x * x + y * y);
}
const LY = { eta: new Float32Array(KL), etaT: new Float32Array(KL), z: new Float32Array(KL), zT: new Float32Array(KL), w: new Float32Array(KL), rot: [], id: [] };
for (let k = 0; k < KL; k++) { LY.rot.push(new Float32Array(9)); LY.id.push(null); }

/* ---------- the ensemble: forecast worldlines around a seeded, invisible flight path below and right of the camera ---------- */
const CXW = [], CYW = [];
[[240, 1.0], [110, 0.55], [52, 0.22]].forEach(([L, A]) => CXW.push([A * (0.8 + 0.4 * rnd()), TAU / L, rnd() * TAU]));
[[310, 0.45], [95, 0.22]].forEach(([L, A]) => CYW.push([A * (0.8 + 0.4 * rnd()), TAU / L, rnd() * TAU]));
const X0 = 1.0, Y0 = -1.9, R0TR = Math.hypot(X0, Y0);
function cX(s) { let a = X0; for (const h of CXW) a += h[0] * Math.sin(h[1] * s + h[2]); return a; }
function cY(s) { let a = Y0; for (const h of CYW) a += h[0] * Math.sin(h[1] * s + h[2]); return a; }
/* sigma cone: zero spread at the last observation (behind us), growing with the square root of distance */
const DOR = -16, SG0 = 0.9, SGL = 6;
const sigAt = (d) => SG0 * Math.sqrt(Math.max(0, d - DOR) / SGL);
/* members: Rayleigh-quantile radii and slowly turning phases, so the offsets stay N(0,1) across the ensemble */
const MEM = [];
for (let m = 0; m < Q.n; m++) {
  const q = (m + 0.5) / Q.n, r = Math.sqrt(-2 * Math.log(1 - q));
  MEM.push({
    r, a: m * 2.39996 + rnd() * 0.4, w: (TAU / (28 + rnd() * 40)) * (rnd() < 0.5 ? -1 : 1), w2: TAU / (50 + rnd() * 80), b: rnd() * TAU, k: 0.3 + rnd() * 0.35,
    lt: m % 3 === 1 ? 0.25 : m % 5 === 3 ? -0.62 : -1.3, ph: rnd(), bead: m % 3 === 0
  });
}
const phOf = (mm, s) => mm.a + mm.w * s + mm.k * Math.sin(mm.w2 * s + mm.b);

/* ---------- camera: the direction of motion projects to the ring centre; everything is aberrated about it ---------- */
let PXW = 2, PXH = 2, DPX = 1, IX = 1, IY = 1, MN = 1, CXp = 1, CYp = 1, FPX = 1, KR = 1, RC = 1, RS = 0, CHR = 0, MINHW = 0.7, MAXHW = 9;
function camera(t, live) {
  const asp = PXW / PXH, u = cyc(t), cr = creep(u), pk = punch(u * TC), bo = live ? live.boost : 0;
  MN = Math.min(PXW, PXH);
  const fov = (56 + 9 * cr + 22 * bo - (live ? 7 * live.down : 0)) * (Math.PI / 180); // the downshift lurches back, then settles
  FPX = (0.5 * MN * (asp < 1 ? 1.3 : 1)) / Math.tan(fov / 2);
  KR = 1 - 0.2 * pk;
  const sc = sCam(t);
  const swx = 0.012 * Math.sin(0.31 * t + 1.1) + 0.008 * Math.sin(0.83 * t + 0.4), swy = 0.01 * Math.sin(0.37 * t + 2.3) + 0.006 * Math.sin(0.71 * t);
  const cx = (asp >= 1 ? 0.58 : 0.5) + swx + (live ? 0.05 * live.lean : 0), cy = (asp >= 1 ? 0.385 : 0.29) + swy;
  const vib = ((0.3 + 0.7 * cr) * 0.7 + 3 * pk + 2.6 * bo) * DPX;
  const s1 = Math.sin(t * 47.1) * 0.6 + Math.sin(t * 71.3 + 1.3) * 0.4, s2 = Math.sin(t * 59.7 + 0.4) * 0.7 + Math.sin(t * 33.1) * 0.3;
  CXp = cx * PXW + vib * s2; CYp = cy * PXH + vib * s1;
  const roll = clamp(0.05 * (cX(sc + 16) - cX(sc + 3)), -0.14, 0.14) + 0.04 * Math.sin(0.21 * t) + (live ? -0.05 * live.lean : 0) + (0.0016 * vib * s2) / DPX;
  RC = Math.cos(roll); RS = Math.sin(roll);
  CHR = bo;
}
/* aberration of a rest-frame point (camera-relative; z along the motion) at rapidity eta:
   tan(theta'/2) = e^-eta tan(theta/2), which is cos theta' = (cos theta + beta) / (1 + beta cos theta);
   Doppler D = gamma (1 + beta cos theta) = e^-eta + sinh(eta)(1 + cos theta). Sets AX, AY (px), AD, AL, AT. */
let AX = 0, AY = 0, AD = 1, AL = 1, AT = 0;
function ab(x, y, z, eta) {
  const rho = Math.hypot(x, y), L = Math.hypot(rho, z);
  if (L < 1e-6 || L + z < 1e-9) return false;
  const e = Math.exp(-eta), hp = (e * rho) / (L + z);
  if (!(hp < 0.84)) return false;
  const tp = (2 * hp) / (1 - hp * hp), r = tp * FPX * KR;
  const ax = rho > 1e-9 ? x / rho : 1, ay = rho > 1e-9 ? y / rho : 0;
  AX = CXp + (ax * RC - ay * RS) * r; AY = CYp - (ax * RS + ay * RC) * r;
  AD = e + 0.5 * (1 / e - e) * (1 + z / L); AL = L; AT = tp;
  return true;
}
/* apparent half-width (px) of a rest-frame width w: angles shrink by 1/D, gnomonic scale grows off-axis */
const hwOf = (w) => ((0.5 * w) / (AL * AD)) * FPX * KR * Math.sqrt(1 + AT * AT);

/* ---------- emitters: screen-space anti-aliased additive lines and sprites (per-vertex colour) ---------- */
const MAXV = 30000, MAXI = 46000;
const VB = new Float32Array(MAXV * 4), CB = new Uint8ClampedArray(MAXV * 4), IB = new Uint16Array(MAXI);
let nv = 0, ni = 0, REC = null;
function vtx(x, y, u, v, r, g, b, a) {
  const o = nv * 4; VB[o] = x * IX - 1; VB[o + 1] = 1 - y * IY; VB[o + 2] = u; VB[o + 3] = v;
  CB[o] = r * 255; CB[o + 1] = g * 255; CB[o + 2] = b * 255; CB[o + 3] = a * 255; nv++;
}
const TMP = new Float32Array(2048 * 7);
let tn = 0;
function lBegin() { tn = 0; }
function lPush(x, y, hw, a, r, g, b) {
  if (tn >= 2048) return;
  if (hw < MINHW) { a *= hw / MINHW; hw = MINHW; } else if (hw > MAXHW) hw = MAXHW;
  const o = tn * 7; TMP[o] = x; TMP[o + 1] = y; TMP[o + 2] = hw; TMP[o + 3] = a > 1 ? 1 : a; TMP[o + 4] = r; TMP[o + 5] = g; TMP[o + 6] = b; tn++;
}
function lFlush() {
  const n = tn; tn = 0;
  if (n < 2 || nv + n * 2 > MAXV || ni + (n - 1) * 6 > MAXI) return;
  for (let k = 0; k < n; k++) {
    const o = k * 7, p = (k > 0 ? k - 1 : k) * 7, q = (k < n - 1 ? k + 1 : k) * 7;
    let dx = TMP[q] - TMP[p], dy = TMP[q + 1] - TMP[p + 1];
    const L = Math.hypot(dx, dy); if (L > 1e-9) { dx /= L; dy /= L; } else { dx = 1; dy = 0; }
    const hw = TMP[o + 2], ox = -dy * hw, oy = dx * hw, x = TMP[o], y = TMP[o + 1], v0 = nv;
    vtx(x + ox, y + oy, -1, 0, TMP[o + 4], TMP[o + 5], TMP[o + 6], TMP[o + 3]); vtx(x - ox, y - oy, 1, 0, TMP[o + 4], TMP[o + 5], TMP[o + 6], TMP[o + 3]);
    if (k > 0) { IB[ni++] = v0 - 2; IB[ni++] = v0 - 1; IB[ni++] = v0; IB[ni++] = v0 - 1; IB[ni++] = v0 + 1; IB[ni++] = v0; }
  }
  if (REC) { const pts = []; for (let k = 0; k < n; k++) { const o = k * 7; pts.push(TMP[o], TMP[o + 1], TMP[o + 2], TMP[o + 3], TMP[o + 4], TMP[o + 5], TMP[o + 6]); } REC.lines.push(pts); }
}
function sprite(x, y, rad, a, r, g, b) {
  const m = 1.2 * DPX;
  if (rad < m) { a *= (rad / m) * (rad / m); rad = m; }
  if (a < 0.004 || nv + 4 > MAXV || ni + 6 > MAXI) return;
  if (a > 1) a = 1;
  const v0 = nv;
  vtx(x - rad, y - rad, -1, -1, r, g, b, a); vtx(x + rad, y - rad, 1, -1, r, g, b, a); vtx(x - rad, y + rad, -1, 1, r, g, b, a); vtx(x + rad, y + rad, 1, 1, r, g, b, a);
  IB[ni++] = v0; IB[ni++] = v0 + 1; IB[ni++] = v0 + 2; IB[ni++] = v0 + 1; IB[ni++] = v0 + 3; IB[ni++] = v0 + 2;
  if (REC) REC.spr.push([x, y, rad, a, r, g, b]);
}
/* a two-point streak with a soft tail; during the boost it splits into red and blue copies toward the frame edge */
function streak(tx, ty, hx, hy, hw, a, r, g, b) {
  lBegin(); lPush(tx, ty, hw * 0.7, 0, r, g, b); lPush((tx + hx) * 0.5, (ty + hy) * 0.5, hw * 0.9, a * 0.45, r, g, b); lPush(hx, hy, hw, a, r, g, b); lFlush();
  if (CHR > 0.03) {
    const dx = hx - CXp, dy = hy - CYp, rr = Math.hypot(dx, dy) || 1, k = ((CHR * 7 * DPX * rr * rr) / (MN * MN)) / rr, ox = dx * k, oy = dy * k;
    lBegin(); lPush(tx + ox, ty + oy, hw, 0, 1, 0.1, 0.12); lPush(hx + ox, hy + oy, hw, a * 0.5 * CHR, 1, 0.1, 0.12); lFlush();
    lBegin(); lPush(tx - ox, ty - oy, hw, 0, 0.15, 0.35, 1); lPush(hx - ox, hy - oy, hw, a * 0.5 * CHR, 0.15, 0.35, 1); lFlush();
  }
}

/* ---------- the scene ---------- */
const WHT = [0.957, 0.945, 0.91], BLU = [0.435, 0.659, 1], AMB = [1, 0.65, 0.17];
/* star layers (drawn on the GPU): layer j sits at rapidity ETA_LO + (j + lambda) DETA and fades by a bell over its slot,
   so slow layers fade in, fast ones fade out, and one cycle later every layer holds the next one's place */
/* each layer is also magnified by (gamma / gamma_ref)^(KZ/2) so the layers' starbows nearly coincide: one crisp ring
   that still tightens slowly while the stars stream inward through it */
const KZ = 0.88, ETA_REF = ETA_LO + 2.5 * DETA, ETA0 = 3.2;
let SLM = 40;
function starParams(t, live, photo) {
  const L = lam(t), fl = Math.floor(L), fr = L - fl, io = introS(t), u = cyc(t), bo = live ? live.boost : 0, fi = fadeIn(t);
  const ex = 0.35 * (1 + 0.9 * creep(u)) * (photo ? 2.2 : 1) * (1 + 2 * bo);
  const te = t - ex, Le = lam(te), ioe = introS(Math.max(0, te)), be = 0.55 * bo, gref = Math.cosh(io * ETA_REF), zn = Math.sqrt(gref / Math.cosh(io * ETA0));
  SLM = (0.022 + 0.05 * punch(u * TC) + 0.12 * bo + (photo ? 0.02 : 0)) * MN;
  for (let k = 0; k < KL; k++) {
    const x = k + fr, j = k - fl, sn = Math.sin((Math.PI * x) / KL);
    const eb = io * (ETA_LO + x * DETA), ebT = Math.max(eb - 0.4 - bo, ioe * (ETA_LO + (x - (L - Le)) * DETA));
    LY.eta[k] = eb + be; LY.etaT[k] = ebT + be;
    LY.z[k] = zn * Math.pow(Math.cosh(eb) / gref, KZ / 2); LY.zT[k] = zn * Math.pow(Math.cosh(ebT) / gref, KZ / 2);
    LY.w[k] = sn * sn * fi;
    if (LY.id[k] !== j) { LY.id[k] = j; layerRot(j, LY.rot[k]); }
  }
}
/* keep the name and tagline calm: worldlines dim behind the name block. rt.textBox() gives the block's top and left;
   the block is a full-width grid column on desktop, so the right edge comes from the glyphs themselves (name and
   tagline text, nav links). Read once per frame. A text run spanning most of the width (phones) dims the whole band. The band starts 36 px above the block or at half
   height, whichever is higher, as in the prototype on both desktop and phone. */
let TY0 = 0, TY1 = 1, TBR = 0, TBF = true, RNG = null;
function textSafe() {
  let b = null;
  try { b = rt.textBox(); } catch (err) { b = null; }
  if (!(b && b.H > 1 && b.W > 1)) { TY0 = 0.5 * PXH; TY1 = 0.64 * PXH; TBR = 0.43 * PXW; TBF = PXW < PXH; return; }
  let right = b.x + b.w; // if the glyphs cannot be measured, mask the whole block
  try {
    const h0 = rt.hero.getBoundingClientRect().left;
    let r = b.x + 1;
    RNG = RNG || D.createRange();
    for (const el of [rt.nm, rt.tg]) {
      const tw = D.createTreeWalker(el, 4);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) if (n.nodeValue.trim()) { RNG.selectNodeContents(n); r = Math.max(r, RNG.getBoundingClientRect().right - h0); }
    }
    for (const a of rt.idBlock.querySelectorAll('nav a')) r = Math.max(r, a.getBoundingClientRect().right - h0);
    right = r;
  } catch (err) { /* keep the whole block */ }
  TY0 = Math.min((b.y - 36) * DPX, 0.5 * PXH); TY1 = Math.max(TY0 + 10 * DPX, Math.min((b.y + 75) * DPX, 0.64 * PXH)); TBR = right * DPX; TBF = right - b.x > 0.75 * b.W;
}
const textMask = (x, y) => 1 - 0.72 * sstep(TY0, TY1, y) * (TBF ? 1 : 1 - sstep(TBR - 120 * DPX, TBR + 80 * DPX, x));
/* ensemble worldlines, sampled evenly in log tan(theta/2) so they stay smooth from the frame edge into the ring */
const TD = new Float64Array(Q.ns);
let ETR = 1, TV0 = 0, TV1 = 0;
function trailPt(mm, d, sc) {
  const s = sc + d, sg = sigAt(d), ph = phOf(mm, s);
  let y = cY(s) + 0.55 * sg * mm.r * Math.sin(ph);
  y = -0.5 - 0.4 * Math.log(1 + Math.exp((-0.5 - y) / 0.4)); // soft ceiling: the ensemble stays below the line of motion
  return ab(cX(s) + sg * mm.r * Math.cos(ph), y, d, ETR);
}
const dOfV = (v) => R0TR / Math.tan(2 * Math.atan(Math.exp(v)));
function trails(t, live, photo) {
  const io = intro(t), pk = punch(cyc(t) * TC), sc = sCam(t), N = Q.ns;
  const bo = live ? live.boost : 0;
  ETR = 0.45 + 0.7 * io + 0.3 * pk + 0.4 * bo;
  TV0 = ETR + Math.log(0.6); TV1 = ETR + Math.log((1.5 * DPX) / (FPX * KR));
  for (let i = 0; i < N; i++) TD[i] = dOfV(TV0 + ((TV1 - TV0) * i) / (N - 1));
  const f = ((t - T_P0) / 0.75) * 1.15;
  for (const mm of MEM) {
    lBegin();
    for (let i = 0; i < N; i++) {
      if (!trailPt(mm, TD[i], sc)) { lFlush(); continue; }
      ramp(mm.lt + 0.8 * Math.log2(AD));
      const rr = Math.hypot(AX - CXp, AY - CYp) / DPX, u = i / N;
      const a = (0.5 + 0.25 * bo) * (0.22 + 0.78 * sstep(u - 0.15, u, f)) * (0.55 + 0.45 * Math.min(2, Math.pow(AD, 0.7))) * sstep(2, 26, rr) * textMask(AX, AY);
      lPush(AX, AY, hwOf(0.05), a, CR, CG, CBL);
    }
    lFlush();
  }
  /* light pulses racing ahead along a third of the worldlines, sinking into the ring */
  const tl = lam(t) * TC, ign = 0.22 + 0.78 * sstep(T_P0, T_P0 + 0.6, t);
  for (const mm of MEM) {
    if (!mm.bead) continue;
    const per = 2.3 + 1.7 * mm.ph, p = mod(tl / per + mm.ph * 5.1, 1), dp = Math.min(p, (photo ? 0.16 : 0.07) * (1 + 2 * bo));
    const pv = (pp) => TV0 + (TV1 - TV0) * Math.pow(pp, 0.85);
    if (!trailPt(mm, dOfV(pv(p)), sc)) continue;
    const hx = AX, hy = AY, hD = AD;
    let tx = hx, ty = hy;
    if (trailPt(mm, dOfV(pv(p - dp)), sc)) { tx = AX; ty = AY; }
    const rr = Math.hypot(hx - CXp, hy - CYp) / DPX, a = 0.85 * ign * sstep(0, 0.08, p) * (1 - sstep(0.7, 0.97, p)) * sstep(4, 34, rr) * textMask(hx, hy);
    if (a < 0.01) continue;
    ramp(mm.lt + 0.8 * Math.log2(hD) + 0.6);
    streak(tx, ty, hx, hy, 1.5 * DPX, a, CR, CG, CBL);
    sprite(hx, hy, 6 * DPX, a * 0.55, CR, CG, CBL);
  }
}
/* data dust: five Shepard layers. Layer j moves at v = VD 2^(j + lambda), so every layer keeps speeding up while slow
   layers fade in and fast ones fade out; displacement is closed-form, s_j = VD Tc / ln2 * 2^(j + lambda). */
const KD = 5, DZ0 = -7, DLZ = 64, VD = 9;
function dust(t, live, photo) {
  const L = lam(t), fl = Math.floor(L), fr = L - fl, fi = fadeIn(t), cr = creep(cyc(t)), bo = live ? live.boost : 0;
  const ex = (0.06 + 0.06 * cr) * (photo ? 2.4 : 1) * (1 + 2 * bo);
  const te = t - ex, Le = lam(te), C = (VD * TC) / LN2, maxL = (0.05 + 0.04 * cr + 0.22 * bo) * MN;
  for (let k = 0; k < KD; k++) {
    const x = k + fr, j = k - fl, sn = Math.sin((Math.PI * x) / KD), wgt = sn * sn;
    if (wgt < 0.01) continue;
    const sH = C * Math.pow(2, x), sT = C * Math.pow(2, x - (L - Le)), eta = 0.2 + 0.17 * x + 0.5 * bo;
    for (let i = 0; i < Q.dust; i++) {
      const hb = j * 977 + i * 13;
      const rho = 1.5 + 15 * Math.pow(hash(hb + 1), 1.4), psi = TAU * hash(hb + 2), z0 = DLZ * hash(hb + 3), q = hash(hb + 4);
      const zh = mod(z0 - sH, DLZ) + DZ0;
      let zt = mod(z0 - sT, DLZ) + DZ0;
      if (zt < zh || zt - zh > DLZ * 0.5) zt = zh;
      const px = rho * Math.cos(psi), py = rho * Math.sin(psi);
      if (!ab(px, py, zh, eta)) continue;
      const hx = AX, hy = AY, hD = AD, hw = clamp(hwOf(0.09), 0.75 * DPX, 2.4 * DPX);
      let tx = hx, ty = hy;
      if (zt > zh && ab(px, py, zt, eta)) { tx = AX; ty = AY; }
      const dx = hx - tx, dy = hy - ty, len = Math.hypot(dx, dy);
      if (len > maxL) { const s = maxL / len; tx = hx - dx * s; ty = hy - dy * s; }
      const xl = (q < 0.55 ? 0 : q < 0.82 ? -0.62 : 0.95) + 0.8 * Math.log2(hD);
      const a = fi * wgt * (0.42 + 0.58 * hash(hb + 5)) * (0.35 + 0.65 * vis(xl)) * (1 - sstep(34, 55, zh)) * sstep(0.8, 6, Math.hypot(hx - CXp, hy - CYp) / DPX);
      if (a < 0.02) continue;
      ramp(xl);
      if (len > 1.5 * DPX) streak(tx, ty, hx, hy, hw, a * 0.75, CR, CG, CBL);
      sprite(hx, hy, hw * 2.6, a, CR, CG, CBL);
    }
  }
}
/* pressure wave: a thin ring rolling out from the centre, blue leading edge, amber trailing edge */
function wave(age, dur, amp) {
  if (!(age >= 0 && age < dur)) return;
  const u = age / dur, R = 0.16 * MN + (1 - Math.pow(1 - u, 2.4)) * 0.95 * Math.hypot(PXW, PXH), a = amp * sstep(0, 0.12, u) * Math.pow(1 - u, 1.5);
  if (a < 0.005) return;
  const N = PHONE ? 72 : 108, hw = (1 + 1.4 * u) * DPX, sp = (2.5 + 5 * u) * DPX;
  for (let c = 0; c < 3; c++) {
    const col = c === 0 ? BLU : c === 1 ? WHT : AMB, rr = R + (1 - c) * sp, ac = a * (c === 1 ? 0.8 : 0.6);
    lBegin();
    for (let i = 0; i <= N; i++) { const an = (i / N) * TAU; lPush(CXp + Math.cos(an) * rr, CYp + Math.sin(an) * rr, hw, ac, col[0], col[1], col[2]); }
    lFlush();
  }
}
function waves(t, live) {
  wave(cyc(t) * TC, 1.4, 0.3);
  if (live && live.wave >= 0) wave(live.wave, 1.1, 0.28);
}
/* boost: radial zoom-streaks from the centre */
function zoom(t, bo) {
  const R0 = 0.1 * MN, R1 = 0.75 * Math.hypot(PXW, PXH), lr = Math.log(R1 / R0);
  for (let i = 0; i < Q.zs; i++) {
    const an = TAU * hash(i * 5 + 71), sp = 0.8 + 0.9 * hash(i * 5 + 72), p = mod(t * sp * 0.7 + hash(i * 5 + 73), 1);
    const r = R0 * Math.exp(lr * p), len = r * (0.12 + 0.45 * bo), a = 0.5 * bo * Math.sin(Math.PI * p);
    const cx = Math.cos(an), sy = Math.sin(an), c = hash(i * 5 + 74) < 0.7 ? WHT : BLU;
    streak(CXp + cx * (r - len), CYp + sy * (r - len), CXp + cx * r, CYp + sy * r, 0.9 * DPX, a, c[0], c[1], c[2]);
  }
}
/* build(t): the whole frame as data; live adds lean and boost on top; photo lengthens the exposure */
function build(t, live, photo, pw_, ph_) {
  PXW = pw_; PXH = ph_; DPX = PXW / Math.max(1, rt.cssW); IX = 2 / PXW; IY = 2 / PXH;
  MINHW = 0.7 * DPX; MAXHW = 9 * DPX;
  camera(t, live);
  textSafe();
  starParams(t, live, photo);
  nv = 0; ni = 0;
  trails(t, live, photo);
  dust(t, live, photo);
  waves(t, live);
  if (live && live.boost > 0.01) zoom(t, live.boost);
}

/* ---------- WebGL: background glow, GPU star layers, additive lines ---------- */
let gl = null, glOK = false, reveal = false, P_BG, P_ST, P_FX, bTri, bSV, bSI, bV, bC, bI;
const STAR_GAIN = 0.8, BG_GAIN = 0.045;
const HP = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
/* blackbody-like ramp over log2 T': deep red, taillight red, sodium amber, headlight white, cool white, Doppler blue, deep blue */
const GL_RAMP = `vec3 ramp(float x){vec3 c=mix(vec3(.45,.02,.02),vec3(1.,.17,.17),clamp((x+2.2)/.9,0.,1.));
c=mix(c,vec3(1.,.65,.17),clamp((x+1.3)/.7,0.,1.));c=mix(c,vec3(.957,.945,.91),clamp((x+.6)/.6,0.,1.));
c=mix(c,vec3(.78,.86,1.),clamp(x,0.,1.));c=mix(c,vec3(.435,.659,1.),clamp(x-1.,0.,1.));return mix(c,vec3(.25,.36,1.),clamp((x-2.)/1.2,0.,1.));}`;
const VS_BG = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
/* the diffuse sky, beamed: D = 1 / (gamma (1 - beta cos theta')), written without cancellation */
const FS_BG = HP + 'uniform vec2 RES,CEN;uniform float FP,GN;uniform float ETA[5];uniform float WK[5];uniform float ZK[5];' + GL_RAMP + `
float h12(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
void main(){vec2 fc=gl_FragCoord.xy;float r0=length(fc-CEN)/FP;
vec3 c=mix(vec3(.008,.014,.036),vec3(.02,.04,.1),smoothstep(0.,.8,fc.y/RES.y));vec3 g=vec3(0.);
for(int k=0;k<5;k++){float r=r0/ZK[k],s=sqrt(1.+r*r),omc=r*r/(s*(s+1.)),e=min(ETA[k],9.),ex=exp(e),ch=.5*(ex+1./ex),em=exp(-2.*e),omb=2.*em/(1.+em),b=1.-omb;
float Dp=1./(ch*(omb+b*omc)),x=log2(Dp)-2.6;
g+=WK[k]*ramp(x)*smoothstep(-2.4,-.8,x)*(1.-smoothstep(2.2,4.2,x))*Dp/(1.+.12*Dp);}
c+=g*GN;vec2 uv=fc/RES-.5;c*=1.-.45*dot(uv,uv);c+=(h12(fc)-.5)/255.;gl_FragColor=vec4(c,1.);}`;
/* stars: tan(theta'/2) = e^-eta tan(theta/2); D = e^-eta + sinh(eta)(1 + cos theta) = gamma (1 + beta cos theta);
   observed temperature T' = D T; each star is a streak from its place at the start of the exposure to now */
const VS_ST = `attribute vec3 dir;attribute vec2 mag;attribute vec2 crn;
uniform mat3 RL;uniform vec2 EH,ZM,CEN,ROT,RES;uniform float WL,FP,SZ,AG,CH,DPX,LM;
varying vec2 vq;varying vec3 vk;varying vec3 vc;` + GL_RAMP + `
float vis(float x){return smoothstep(-2.6,-1.2,x)*(1.-smoothstep(1.8,3.4,x));}
float beam(float D){return D/(1.+.2*D);}
void main(){vec3 p=RL*dir;float rho=length(p.xy),opz=1.+p.z,h=rho/max(opz,1e-6);
float eh=exp(-EH.x),et=exp(-EH.y),hh=eh*h,ht=min(et*h,.8);
float Dh=eh+.5*(1./eh-eh)*opz,Dt=et+.5*(1./et-et)*opz;
float xh=log2(Dh)+mag.x,xt=log2(Dt)+mag.x,bh=mag.y*vis(xh)*beam(Dh),bt=mag.y*vis(xt)*beam(Dt);
if(hh>.8||max(bh,bt)*WL<.004){gl_Position=vec4(3.,3.,0.,1.);vq=vec2(0.);vk=vec3(1.);vc=vec3(0.);return;}
float rh=2.*hh/(1.-hh*hh)*FP*ZM.x,rt=2.*ht/(1.-ht*ht)*FP*ZM.y;
vec2 az=rho>1e-7?p.xy/rho:vec2(1.,0.);az=vec2(az.x*ROT.x-az.y*ROT.y,az.x*ROT.y+az.y*ROT.x);
vec2 H=CEN+az*rh,T=CEN+az*rt,dv=H-T;float L=length(dv);if(L>LM){T=H-dv*(LM/L);dv=H-T;L=LM;}vec2 u=L>.001?dv/L:-az,n=vec2(-u.y,u.x);
float w=SZ*(.75+.9*sqrt(mag.y))*(1.+.3*clamp(bh*WL,0.,2.));
vq=vec2(mix(-w,L+w,crn.x),w*crn.y);
float rr=length(H-CEN)/length(RES);vk=vec3(L,w,CH*rr*rr*14.*DPX);
vc=ramp(mix(xt,xh,crn.x))*min(mix(bt,bh,crn.x)*WL*AG,1.2)*inversesqrt(1.+L/(3.*w));
vec2 P=mix(T-u*w,H+u*w,crn.x)+n*(w*crn.y);gl_Position=vec4(P/RES*2.-1.,0.,1.);}`;
const FS_ST = HP + `varying vec2 vq;varying vec3 vk;varying vec3 vc;
float cap(float a,float y,float L,float w){float dx=a<0.?-a:max(a-L,0.);return exp(-(dx*dx+y*y)/(w*w)*4.);}
void main(){float L=vk.x,w=vk.y,k=cap(vq.x,vq.y,L,w),hd=length(vec2(vq.x-L,vq.y))/w,hot=exp(-hd*hd*5.)*.7;
vec3 col=vc*(k+hot);
if(vk.z>.05){float kr=cap(vq.x+vk.z,vq.y,L,w),kb=cap(vq.x-vk.z,vq.y,L,w);col=vec3(vc.r*(kr+hot),vc.g*(k+hot),vc.b*(kb+hot));}
gl_FragColor=vec4(col,1.);}`;
const VS_FX = 'attribute vec2 p;attribute vec2 uv;attribute vec4 c;varying vec2 vu;varying vec4 vc;void main(){vu=uv;vc=c;gl_Position=vec4(p,0.,1.);}';
const FS_FX = `precision mediump float;varying vec2 vu;varying vec4 vc;
void main(){float r=length(vu);float f=max(1.-r,0.);f*=f;float k=exp(-r*r*16.);
gl_FragColor=vec4((vc.rgb*(f*.55+k*.85)+vec3(k*k*.28))*vc.a,1.);}`;
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
  for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); p.u[u.name.replace('[0]', '')] = gl.getUniformLocation(p, u.name); }
  return p;
}
function glSetup() {
  try {
    P_BG = mkProg(VS_BG, FS_BG, ['p']);
    P_ST = mkProg(VS_ST, FS_ST, ['dir', 'mag', 'crn']);
    P_FX = mkProg(VS_FX, FS_FX, ['p', 'uv', 'c']);
    bTri = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bTri); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const SV = new Float32Array(NST * 28), SI = new Uint16Array(NST * 6);
    for (let i = 0; i < NST; i++) {
      const s = i * 5, v = i * 4, o6 = i * 6;
      for (let q = 0; q < 4; q++) { const o = (v + q) * 7; SV[o] = SD[s]; SV[o + 1] = SD[s + 1]; SV[o + 2] = SD[s + 2]; SV[o + 3] = SD[s + 3]; SV[o + 4] = SD[s + 4]; SV[o + 5] = q & 1; SV[o + 6] = q & 2 ? 1 : -1; }
      SI[o6] = v; SI[o6 + 1] = v + 1; SI[o6 + 2] = v + 2; SI[o6 + 3] = v + 1; SI[o6 + 4] = v + 3; SI[o6 + 5] = v + 2;
    }
    bSV = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bSV); gl.bufferData(gl.ARRAY_BUFFER, SV, gl.STATIC_DRAW);
    bSI = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bSI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, SI, gl.STATIC_DRAW);
    bV = gl.createBuffer(); bC = gl.createBuffer(); bI = gl.createBuffer();
    return true;
  } catch (e) { console.warn(String((e && e.message) || e)); return false; }
}
function initGL() {
  try { gl = cv.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }); } catch (err) { gl = null; }
  if (!gl) return false;
  // a lost context shows the poster underneath; on restore, rebuild and fade #gl back in after the next good frame
  cv.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); glOK = false; cv.classList.remove('on'); });
  cv.addEventListener('webglcontextrestored', () => { glOK = glSetup(); reveal = glOK; });
  glOK = glSetup();
  return glOK;
}
function drawGL() {
  if (!glOK || gl.isContextLost()) return;
  const w = cv.width, h = cv.height, cy = h - CYp;
  gl.viewport(0, 0, w, h);
  gl.disable(gl.BLEND);
  gl.useProgram(P_BG);
  let U = P_BG.u;
  gl.uniform2f(U.RES, w, h); gl.uniform2f(U.CEN, CXp, cy); gl.uniform1f(U.FP, FPX * KR); gl.uniform1f(U.GN, BG_GAIN);
  gl.uniform1fv(U.ETA, LY.eta); gl.uniform1fv(U.WK, LY.w); gl.uniform1fv(U.ZK, LY.z);
  gl.bindBuffer(gl.ARRAY_BUFFER, bTri); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(P_ST); U = P_ST.u;
  gl.uniform2f(U.CEN, CXp, cy); gl.uniform2f(U.ROT, RC, RS); gl.uniform2f(U.RES, w, h); gl.uniform1f(U.FP, FPX * KR);
  gl.uniform1f(U.SZ, 1.0 * DPX); gl.uniform1f(U.AG, STAR_GAIN); gl.uniform1f(U.CH, CHR); gl.uniform1f(U.DPX, DPX); gl.uniform1f(U.LM, SLM);
  gl.bindBuffer(gl.ARRAY_BUFFER, bSV); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 12); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 28, 20);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bSI);
  for (let k = 0; k < KL; k++) {
    if (LY.w[k] < 0.004) continue;
    gl.uniformMatrix3fv(U.RL, false, LY.rot[k]); gl.uniform2f(U.EH, LY.eta[k], LY.etaT[k]); gl.uniform2f(U.ZM, LY.z[k], LY.zT[k]); gl.uniform1f(U.WL, LY.w[k]);
    gl.drawElements(gl.TRIANGLES, NST * 6, gl.UNSIGNED_SHORT, 0);
  }
  if (ni) {
    gl.useProgram(P_FX);
    gl.bindBuffer(gl.ARRAY_BUFFER, bV); gl.bufferData(gl.ARRAY_BUFFER, VB.subarray(0, nv * 4), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindBuffer(gl.ARRAY_BUFFER, bC); gl.bufferData(gl.ARRAY_BUFFER, CB.subarray(0, nv * 4), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, IB.subarray(0, ni), gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, ni, gl.UNSIGNED_SHORT, 0);
  }
  if (reveal) { reveal = false; requestAnimationFrame(() => cv.classList.add('on')); }
}
/* ---------- poster: the same frame on a cheap 2D canvas (also the no-WebGL fallback) ---------- */
const rgba = (r, g, b, a) => `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},${clamp(a, 0, 1).toFixed(3)})`;
function posterStars(c, n) {
  const st = Math.max(1, Math.round(NST / n));
  c.lineCap = 'round';
  for (let k = 0; k < KL; k++) {
    const wk = LY.w[k]; if (wk < 0.004) continue;
    const R = LY.rot[k], eh = Math.exp(-LY.eta[k]), et = Math.exp(-LY.etaT[k]), shh = 0.5 * (1 / eh - eh), sht = 0.5 * (1 / et - et);
    for (let i = (k * 7) % st; i < NST; i += st) {
      const o = i * 5, dx = SD[o], dy = SD[o + 1], dz = SD[o + 2];
      const px = R[0] * dx + R[3] * dy + R[6] * dz, py = R[1] * dx + R[4] * dy + R[7] * dz, pz = R[2] * dx + R[5] * dy + R[8] * dz;
      const rho = Math.hypot(px, py), opz = 1 + pz, h = rho / Math.max(opz, 1e-9), hh = eh * h;
      if (hh > 0.8) continue;
      const Dh = eh + shh * opz, xh = Math.log2(Dh) + SD[o + 3], b = Math.min(1, SD[o + 4] * vis(xh) * beam(Dh) * wk * STAR_GAIN * 1.6);
      if (b < 0.012) continue;
      const ht = Math.min(0.8, et * h), rh = ((2 * hh) / (1 - hh * hh)) * FPX * KR * LY.z[k];
      let rt = ((2 * ht) / (1 - ht * ht)) * FPX * KR * LY.zT[k]; if (rt - rh > SLM) rt = rh + SLM;
      const ax = rho > 1e-9 ? px / rho : 1, ay = rho > 1e-9 ? py / rho : 0, rx = ax * RC - ay * RS, ry = ax * RS + ay * RC;
      const X = CXp + rx * rh, Y = CYp - ry * rh, Xt = CXp + rx * rt, Yt = CYp - ry * rt;
      ramp(xh);
      const sz = (1 + SD[o + 4]) * DPX;
      if (Math.hypot(X - Xt, Y - Yt) > 1.5 * DPX) { c.strokeStyle = rgba(CR, CG, CBL, b * 0.7); c.lineWidth = sz; c.beginPath(); c.moveTo(Xt, Yt); c.lineTo(X, Y); c.stroke(); }
      c.fillStyle = rgba(CR, CG, CBL, b); c.fillRect(X - sz * 0.6, Y - sz * 0.6, sz * 1.2, sz * 1.2);
    }
  }
}
/* the beamed background glow, same formula as the shader, at low resolution */
function posterGlow(c, w, h) {
  const gw = 128, gh = Math.max(8, Math.round((128 * h) / w)), cvs = D.createElement('canvas');
  cvs.width = gw; cvs.height = gh;
  const g2 = cvs.getContext('2d'); if (!g2) return;
  const img = g2.createImageData(gw, gh), d = img.data, sx = w / gw, sy = h / gh, gn = BG_GAIN * 255;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const r0 = Math.hypot((i + 0.5) * sx - CXp, (j + 0.5) * sy - CYp) / (FPX * KR);
    let R = 0, G = 0, B = 0;
    for (let k = 0; k < KL; k++) {
      if (LY.w[k] < 0.004) continue;
      const r = r0 / LY.z[k], s = Math.sqrt(1 + r * r), omc = (r * r) / (s * (s + 1)), e = Math.min(LY.eta[k], 9), em = Math.exp(-2 * e), omb = (2 * em) / (1 + em);
      const Dp = 1 / (Math.cosh(e) * (omb + (1 - omb) * omc)), x = Math.log2(Dp) - 2.6, v = (LY.w[k] * sstep(-2.4, -0.8, x) * (1 - sstep(2.2, 4.2, x)) * Dp) / (1 + 0.12 * Dp);
      if (v < 1e-4) continue;
      ramp(x); R += CR * v; G += CG * v; B += CBL * v;
    }
    const o = (j * gw + i) * 4; d[o] = R * gn; d[o + 1] = G * gn; d[o + 2] = B * gn; d[o + 3] = 255;
  }
  g2.putImageData(img, 0, 0);
  c.imageSmoothingEnabled = true; c.drawImage(cvs, 0, 0, w, h);
}
function drawPoster(c, w, h, t, photo) {
  REC = { lines: [], spr: [] };
  build(t, null, photo, w, h);
  const rec = REC; REC = null;
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#060b1d'); g.addColorStop(0.6, '#040816'); g.addColorStop(1, '#02040b');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'lighter';
  posterGlow(c, w, h);
  posterStars(c, Q.post);
  c.lineCap = 'butt';
  for (const p of rec.lines) for (let k = 7; k < p.length; k += 7) {
    const a = (p[k + 3] + p[k - 4]) * 0.5; if (a < 0.01) continue;
    const lw = p[k + 2] + p[k - 5];
    c.beginPath(); c.moveTo(p[k - 7], p[k - 6]); c.lineTo(p[k], p[k + 1]);
    c.strokeStyle = rgba(p[k + 4], p[k + 5], p[k + 6], a * 0.22); c.lineWidth = lw; c.stroke();
    c.strokeStyle = rgba(p[k + 4], p[k + 5], p[k + 6], a * 0.7); c.lineWidth = Math.max(1, lw * 0.22); c.stroke();
  }
  for (const [x, y, rad, a, r_, g_, b_] of rec.spr) {
    const gr = c.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, rgba(r_, g_, b_, a)); gr.addColorStop(0.22, rgba(r_, g_, b_, a * 0.45)); gr.addColorStop(1, rgba(r_, g_, b_, 0));
    c.fillStyle = gr; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  c.globalCompositeOperation = 'source-over';
}


/* live fields from the runtime; the prototype leaned 1.2x harder than the raw pointer */
const LV = { lean: 0, boost: 0, wave: 1e9, down: 0 };
/* draws into whatever framebuffer is bound: the screen, or the target Many Worlds binds when it embeds this ride as a
   world; the 4th argument names it and is otherwise unused here */
function draw(t, live, photo) {
  let lv = null;
  if (live) { LV.lean = live.lean * 1.2; LV.boost = live.boost; LV.wave = live.wave; LV.down = live.down; lv = LV; }
  build(t, lv, !!photo, cv.width, cv.height);
  drawGL();
}

return {
  id: 'asymptote', title: 'Asymptote',
  caption: 'Under constant proper acceleration, rapidity \u03b7 grows linearly and \u03b2 = tanh \u03b7, so each extra nine of the speed of light (0.9c, 0.99c, 0.999c) adds nearly the same rapidity, \u00bd\u00a0ln\u00a010 \u2248 1.15, and takes nearly the same proper time, while \u03b2 approaches 1 and never reaches it.',
  DURATION, T_STILL: 12.4, hintAt: 6, Q,
  initGL,
  draw,
  poster(ctx, w, h, t, photo) { drawPoster(ctx, w, h, t, !!photo); }
};
};
