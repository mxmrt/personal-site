/* Floating World: a woodblock-print ocean ridden at endless speed (ride engine; port of protos3/floating-world).
   The sea is eight summed Gerstner waves on a camera-relative polar grid, shaded in flat print plates with a sumi
   keyblock, foam claws and washi paper; each acceleration cycle ends in a barrel whose tube hides the reset. */
window.MM_ENGINES['floating-world'] = function (rt) {
'use strict';
/* HERO STORYBOARD (seconds; render(t) draws every frame from t alone; acceleration cycle Tc = 6.4 s, wraps at 5.6, 12.0, 18.4)
   0.0-2.0   OPEN SEA. Skimming 2 m over Prussian-blue swells drawn as a woodblock print; spray streaks fan out ahead,
             lantern-red lights race alongside, and the name prints in as its colour plates come into register.
   2.0-4.3   BIGGER AND FASTER. The swell grows, the field of view creeps wider and five spray layers keep accelerating.
   2.7-5.6   BARREL 1. From 2.7 s a wall rises on the left and its lip pitches over the path; at 4.45 s we ride into
             the tube, which darkens slowly, and bank up the face while the water spirals past. The cycle wraps at 5.6 s.
   5.95-7    BURST OUT through the eye into the next swell: a gear-change punch and a spray burst hide the reset.
   7-20      Two more cycles: barrel 2 on the right (tube 10.85-12.35 s) with a full corkscrew, barrel 3 (17.25-18.75 s).
             Live mode never ends, and holding the pointer or Space boosts time up to 5x. */

const { TAU, clamp, sat, sstep, smoother, mulberry32, hash, PHONE } = rt;
const Q = PHONE
  ? { n: 10, nst: 10, ga: 96, gr: 190, kd: 8, claws: 30, cl: 5, cb: 10, lay: 20, tubeA: 20, pr: 1.5, ahead: 330, ds: 7, scale0: 0.7 }
  : { n: 16, nst: 14, ga: 168, gr: 300, kd: 9, claws: 64, cl: 4, cb: 8, lay: 34, tubeA: 30, pr: 2, ahead: 440, ds: 5.5, scale0: 0.9 };
const rnd = mulberry32(20261011);
const I3 = (x) => x * x * x - 0.5 * x * x * x * x; // integral of smoothstep on [0,x]

/* ---------- endless acceleration: one cycle, Tc, repeats forever ---------- */
const TC = 6.4, PH0 = 0.125, DURATION = 20;
const cyc = (t) => t / TC + PH0;                  // continuous cycle coordinate; its fraction is the phase
const wrapTime = (n) => (n - PH0) * TC;            // the n-th wrap (n >= 1) lands inside barrel n
/* camera speed within a cycle: exponential rise V0 -> V1 over the first 84%, then an eased fall back to V0
   while the camera is inside the barrel. Closed-form integral sCyc(u). */
const V0 = 62, LAM = 0.8 * Math.LN2, PR = 0.84, V1 = V0 * Math.exp(LAM);
const RISE = PR * TC, FALL = (1 - PR) * TC;
function vCyc(u) { const tu = u * TC; if (tu <= RISE) return V0 * Math.exp((LAM * tu) / RISE); const x = (tu - RISE) / FALL; return V1 - (V1 - V0) * x * x * (3 - 2 * x); }
function sCyc(u) {
  const tu = u * TC;
  if (tu <= RISE) return ((V0 * RISE) / LAM) * (Math.exp((LAM * tu) / RISE) - 1);
  const x = (tu - RISE) / FALL;
  return ((V0 * RISE) / LAM) * (Math.exp(LAM) - 1) + V1 * (tu - RISE) - (V1 - V0) * FALL * I3(x);
}
const S_CYC = sCyc(1), S_OFF = sCyc(PH0);
/* per-cycle ramp 0 -> 1 -> 0 (same shape as the speed): FOV, swell height, streak length, vibration */
function ramp(t) { const c = cyc(t), u = c - Math.floor(c); if (u < PR) return u / PR; const x = (u - PR) / (1 - PR); return 1 - x * x * (3 - 2 * x); }
/* exit punch after each barrel */
const T_IN = 1.15, T_OUT = 0.35, P_TA = 0.22, P_TR = 2.4, PUNCH = 9;
function pulse(u) {
  if (u <= 0) return 0;
  if (u < P_TA) { const x = u / P_TA; return x * x * (3 - 2 * x); }
  if (u < P_TA + P_TR) { const x = (u - P_TA) / P_TR; return 1 - x * x * (3 - 2 * x); }
  return 0;
}
function pulseInt(u) {
  if (u <= 0) return 0;
  if (u < P_TA) return P_TA * I3(u / P_TA);
  if (u < P_TA + P_TR) return P_TA * 0.5 + (u - P_TA) - P_TR * I3((u - P_TA) / P_TR);
  return 0.5 * (P_TA + P_TR);
}
function speed(t) {
  const c = cyc(t), n = Math.floor(c);
  let v = vCyc(c - n);
  if (n >= 1) v += PUNCH * pulse(t - wrapTime(n) - T_OUT);
  return v;
}
function sAt(t) {
  const c = cyc(t), n = Math.floor(c);
  let s = n * S_CYC + sCyc(c - n) - S_OFF;
  if (n >= 1) s += PUNCH * ((n - 1) * 0.5 * (P_TA + P_TR) + pulseInt(t - wrapTime(n) - T_OUT));
  return s;
}

/* ---------- Shepard-Risset motion layers: layer g has level l = cyc(t) - g, speed VL0 * 2^l ---------- */
const K_L = 5, VL0 = 11, ZP = 170;
const layerDist = (l) => VL0 * (TC / Math.LN2) * (Math.pow(2, l) - 1); // distance flown since the layer was born
const layerW = (l) => { const x = (l - K_L / 2) / (K_L / 4.4); return Math.exp(-x * x); };

/* ---------- the barrel: one per cycle wrap ---------- */
const B_PRE = 2.9, B_POST = 2.3, TUBE_R = 13.5, TUBE_C = 8;
const BR = { on: false, n: 0, tw: 0, side: 1, sIn: 0, sEye: 0, rise: 0, curl: 0, inside: 0, fl: 0, roll: 0, lat: 0, lift: 0, burst: -1, tin: 0, tout: 0 };
function tubeFlow(t, tin, vin) {
  const DT = T_IN + T_OUT, u = (t - tin) / DT;
  if (u <= 1) return vin * ((t - tin) + 0.9 * DT * I3(u));
  return vin * (DT + 0.45 * DT + 1.9 * (t - tin - DT));
}
function barrelState(t) {
  BR.on = false; BR.inside = 0; BR.roll = 0; BR.lat = 0; BR.lift = 0; BR.burst = -1;
  const n = Math.round(cyc(t));
  if (n < 1) return BR;
  const tw = wrapTime(n);
  if (t < tw - B_PRE || t > tw + B_POST) return BR;
  const tin = tw - T_IN, tout = tw + T_OUT;
  BR.on = true; BR.n = n; BR.tw = tw; BR.tin = tin; BR.tout = tout; BR.side = n % 2 ? -1 : 1;
  BR.sIn = sAt(tin); BR.sEye = sAt(tout);
  BR.rise = sstep(tw - 2.9, tw - 1.75, t);
  BR.curl = sstep(tw - 2.4, tw - 1.3, t);
  BR.inside = sstep(tin - 0.35, tin + 0.4, t) * (1 - sstep(tout - 0.25, tout + 0.45, t));
  BR.fl = t <= tin ? sAt(t) - BR.sIn : tubeFlow(t, tin, speed(tin));
  const ur = sat((t - (tin - 0.2)) / (T_IN + T_OUT + 0.25));
  if (n % 3 === 2) BR.roll = BR.side * TAU * smoother(ur);           // corkscrew
  else { const w = Math.sin(Math.PI * ur); BR.roll = BR.side * 0.5 * w * w; } // ride up the face
  BR.lat = BR.side * 2.2 * BR.inside;
  BR.lift = BR.inside;
  BR.burst = t - tout;
  return BR;
}

/* ---------- the flight path: an invisible seeded curve, x = X(s), z = s ---------- */
const PX = [];
[[2600, 120], [1100, 30], [430, 5]].forEach(([L, A]) => PX.push([A * (0.85 + 0.3 * rnd()), TAU / L, rnd() * TAU]));
function pX(s) { let x = 0; for (const p of PX) x += p[0] * Math.sin(p[1] * s + p[2]); return x; }
function pD(s) { let x = 0; for (const p of PX) x += p[0] * p[1] * Math.cos(p[1] * s + p[2]); return x; }
function pDD(s) { let x = 0; for (const p of PX) x -= p[0] * p[1] * p[1] * Math.sin(p[1] * s + p[2]); return x; }
let SC = 0, X0 = 0;
const V3 = [0, 0, 0], VR = [0, 0];
/* point on the path at distance s, lateral offset lat (+ = screen right), height h; relative to the path point under the camera */
function trackPt(s, lat, h) {
  const dx = pD(s), nn = 1 / Math.sqrt(1 + dx * dx);
  VR[0] = -nn; VR[1] = dx * nn;
  V3[0] = pX(s) - X0 + VR[0] * lat; V3[1] = h; V3[2] = s - SC + VR[1] * lat;
}

/* ---------- the sea: eight Gerstner waves (deep-water dispersion w^2 = g k) ---------- */
const WAVES = [[110, 5.2, 72, 0.78], [72, 2.9, 122, 0.62], [46, 1.45, 40, 0.5], [29, 0.75, 95, 0.45], [18.5, 0.38, 150, 0.4], [12, 0.2, 20, 0.36], [7.6, 0.1, 80, 0.32], [4.8, 0.05, 165, 0.28]];
const NW = 8, WK = [], WDX = [], WDZ = [], WA0 = [], WQ0 = [], WOM = [], WP0 = [], WF0 = [], WF1 = [], WAm = new Float64Array(NW), WQA = new Float64Array(NW), WPH = new Float64Array(NW);
let ATOT = 0;
WAVES.forEach(([L, A, deg, q], i) => {
  const a = ((deg + (rnd() - 0.5) * 14) * Math.PI) / 180, k = TAU / L;
  WK.push(k); WDX.push(-Math.sin(a)); WDZ.push(Math.cos(a)); WA0.push(A); WQ0.push(q * A); WOM.push(Math.sqrt(9.81 * k)); WP0.push(rnd() * TAU);
  WF1.push(L * Q.kd); WF0.push(L * Q.kd * 0.5); ATOT += A;
});
const VEX = 1.6; // vertical exaggeration: print waves stand taller than real ones
let GAMP = 1, CALM = 0; // CALM flattens the water around the camera while it is inside a tube
/* per-frame wave state: amplitude ramp and phases measured from the path point under the camera (double precision) */
function setWaves(t, sc) {
  GAMP = 1 + 0.25 * ramp(t);
  const ox = pX(sc), oz = sc;
  for (let i = 0; i < NW; i++) {
    WAm[i] = WA0[i] * GAMP * VEX; WQA[i] = WQ0[i] * GAMP;
    const ph = WK[i] * (WDX[i] * ox + WDZ[i] * oz) - WOM[i] * t + WP0[i];
    WPH[i] = ph - TAU * Math.floor(ph / TAU);
  }
}
/* displaced surface point for Lagrangian (x, z) at horizontal range r from the camera */
let GX = 0, GY = 0, GZ = 0, GJ = 1;
function gerst(x, z, r) {
  let px = x, py = 0, pz = z, j = 1;
  const cf = CALM > 0 ? 1 - CALM * 0.75 * Math.exp(-(r * r) / 4900) : 1;
  for (let i = 0; i < NW; i++) {
    if (r > WF1[i]) continue;
    const f = (r < WF0[i] ? 1 : 1 - sstep(WF0[i], WF1[i], r)) * cf;
    const th = WK[i] * (WDX[i] * x + WDZ[i] * z) + WPH[i], s = Math.sin(th), c = Math.cos(th), qa = WQA[i] * f;
    px -= qa * WDX[i] * s; pz -= qa * WDZ[i] * s; py += WAm[i] * f * c; j -= qa * WK[i] * c;
  }
  GX = px; GY = py; GZ = pz; GJ = j;
}
/* surface height at a horizontal (Eulerian) position: one fixed-point step back to the Lagrangian point */
function heightAt(x, z) { const r = Math.hypot(x, z); gerst(x, z, r); gerst(2 * x - GX, 2 * z - GZ, r); return GY; }

/* ---------- ensemble: the spray fan. sigma grows with the square root of distance ahead ---------- */
const SIG_IN = 3.2, SIG_L = 45;
const sigAt = (d) => SIG_IN * Math.sqrt(1 + (d > 0 ? d : 0) / SIG_L);
const MEM = [];
for (let m = 0; m < Q.n; m++) {
  const q = (m + 0.5) / Q.n, r = Math.sqrt(-2 * Math.log(1 - q));
  const close = m % 4 === 3 && r > 0.9;
  MEM.push({
    r, a: m * 2.39996 + rnd() * 0.4, w: (TAU / (900 + rnd() * 1400)) * (rnd() < 0.5 ? -1 : 1), w2: TAU / (230 + rnd() * 260), b: rnd() * TAU, k: 0.3 + rnd() * 0.35,
    off: close ? 24 : 50 + rnd() * 200, amp: close ? 34 : 16 + rnd() * 44, rw: TAU / (8 + rnd() * 9), rp: rnd() * TAU, hot: m % 5 === 2
  });
}
const zOf = (mm, s) => mm.r * Math.cos(mm.a + mm.w * s + mm.k * Math.sin(mm.w2 * s + mm.b));
const racerOff = (mm, t) => mm.off + mm.amp * Math.sin(mm.rw * t + mm.rp);

/* ---------- camera + projection (camera-relative, double precision on the CPU) ---------- */
const NEAR = 0.4, FAR = 5000, PA = (FAR + NEAR) / (FAR - NEAR), PB = (-2 * FAR * NEAR) / (FAR - NEAR);
const CAM_H = 2.0, BANK = 150;
let EX = 0, EY = 0, EZ = 0, RX = -1, RY = 0, RZ = 0, UX = 0, UY = 1, UZ = 0, FX = 0, FY = 0, FZ = 1;
let SHIFT = 0, TXF = 1, TYF = 1, PXW = 2, PXH = 2, FPX = 1, MINHW = 0.8, MAXHW = 40, MAXR = 60, FOG0 = 300, FOG1 = 440, PUNCHE = 0, KICK = 0;
function camera(t, sc, v, live) {
  const lean = live ? live.lean : 0, kick = live ? live.kick : 0, rp = ramp(t), b = BR, ins = b.on ? b.inside : 0;
  KICK = kick;
  const lat = lean * 3.4 + b.lat;
  // ride low: follow the swell only partly, but rise early enough to clear every crest just ahead (smooth max)
  let hs = 0, se = 0;
  for (let i = 0; i < 7; i++) {
    const d = -8 + i * 5.5; trackPt(sc + d, lat, 0);
    const h = heightAt(V3[0], V3[2]); hs += h; se += Math.exp(h - 0.05 * Math.abs(d));
  }
  hs /= 7; trackPt(sc, lat, 0);
  const ex = V3[0], ez = V3[2];
  const ba = CAM_H + 0.45 * hs, bb = Math.log(se / 7) + 1.5, eo = 0.5 * (ba + bb + Math.sqrt((ba - bb) * (ba - bb) + 1.4));
  // The averaged look-ahead can miss a narrow crest directly under the camera.
  // Preserve the path wherever the existing 1.5-unit crest margin is already met.
  const clear = Math.max(eo, heightAt(ex, ez) + 1.5);
  const ey = clear * (1 - ins) + TUBE_C * b.rise * 0.6 * ins;
  const la = 30 + 0.14 * v;
  trackPt(sc + la, lat * 0.6, 0);
  let hx = V3[0] - ex, hz = V3[2] - ez; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
  const asp = PXW / PXH;
  const fov = (56 + 11 * rp + 22 * kick + 7 * PUNCHE) * (Math.PI / 180);
  if (asp >= 1) { TYF = Math.tan(fov / 2); TXF = TYF * asp; } else { TYF = Math.min(1.45, Math.tan(fov / 2 + 0.05) / asp); TXF = TYF * asp; }
  FPX = (PXW * 0.5) / TXF;
  SHIFT = asp < 1 ? 0.2 : 0.1;
  const pit = Math.atan(((asp < 1 ? 0.34 : 0.2) - SHIFT) * TYF);
  let fx = hx * Math.cos(pit), fy = -Math.sin(pit), fz = hz * Math.cos(pit);
  // engine vibration: tiny angular jitter that rises with the cycle and the boost
  const aj = 0.0005 + 0.0012 * rp + 0.004 * kick, j1 = Math.sin(t * 53.1) * 0.6 + Math.sin(t * 81.7 + 1.1) * 0.4, j2 = Math.sin(t * 67.3 + 0.5);
  let rx = -fz, ry = 0, rz = fx; let l = Math.hypot(rx, rz) || 1; rx /= l; rz /= l;
  fx += rx * aj * j2; fz += rz * aj * j2; fy += aj * j1;
  l = Math.hypot(fx, fy, fz); fx /= l; fy /= l; fz /= l;
  rx = -fz; ry = 0; rz = fx; l = Math.hypot(rx, rz) || 1; rx /= l; rz /= l;
  let ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  const roll = clamp(pDD(sc + 25) * BANK, -0.36, 0.36) * (1 - ins) + b.roll + (live ? -lean * 0.06 : 0);
  if (roll) { const c = Math.cos(roll), s = Math.sin(roll), a0 = rx, a1 = ry, a2 = rz; rx = a0 * c + ux * s; ry = a1 * c + uy * s; rz = a2 * c + uz * s; ux = ux * c - a0 * s; uy = uy * c - a1 * s; uz = uz * c - a2 * s; }
  const sh = (0.008 + 0.02 * rp + 0.06 * kick) * sat(v / 50), s1 = Math.sin(t * 47.1) * 0.6 + Math.sin(t * 71.3 + 1.3) * 0.4, s2 = Math.sin(t * 59.7 + 0.4);
  EX = ex + ux * sh * s1 + rx * sh * 0.6 * s2; EY = ey + uy * sh * s1 + ry * sh * 0.6 * s2; EZ = ez + uz * sh * s1 + rz * sh * 0.6 * s2;
  RX = rx; RY = ry; RZ = rz; UX = ux; UY = uy; UZ = uz; FX = fx; FY = fy; FZ = fz;
  MINHW = 0.7 * Math.max(1, PXH / 760); MAXHW = 0.05 * PXH; MAXR = 0.08 * PXH;
  FOG0 = Q.ahead * 0.55; FOG1 = Q.ahead * 0.98;
}

/* ---------- geometry emitters: CPU-projected strokes and dots in two batches
   BA: additive light (lanterns); BI: ink (paper-white strokes with a sumi outline, normal blending) ---------- */
function mkBatch(mv, mi) { return { VB: new Float32Array(mv * 6), CB: new Uint8ClampedArray(mv * 4), IB: new Uint16Array(mi), nv: 0, ni: 0, mv, mi }; }
const BA = mkBatch(10000, 20000), BI = mkBatch(36000, 72000);
let CUR = BA, VB = BA.VB, CB = BA.CB, IB = BA.IB, nv = 0, ni = 0, MAXV = BA.mv, MAXI = BA.mi;
let LR = 1, LG = 1, LB = 1, LK = 0, REC = null;
function useB(b) { CUR.nv = nv; CUR.ni = ni; CUR = b; VB = b.VB; CB = b.CB; IB = b.IB; nv = b.nv; ni = b.ni; MAXV = b.mv; MAXI = b.mi; }
function vtx(cx, cy, w, u, v, a, k) {
  const o = nv * 6; VB[o] = cx; VB[o + 1] = cy; VB[o + 2] = w; VB[o + 3] = u; VB[o + 4] = v; VB[o + 5] = k;
  const c = nv * 4; CB[c] = LR * 255; CB[c + 1] = LG * 255; CB[c + 2] = LB * 255; CB[c + 3] = a * 255; nv++;
}
const TMP = new Float32Array(4096 * 5);
let tn = 0, hp = false, pin = false, pvx = 0, pvy = 0, pvz = 0, pw = 0, pa = 0;
function lBegin(c, k) { tn = 0; hp = false; LR = c[0]; LG = c[1]; LB = c[2]; LK = k || 0; }
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
    const kk = LK * sat((hw - 1.1) / 1.8);
    vtx((x + ox) * w, (y + oy) * w, w, -1, 0, a, kk); vtx((x - ox) * w, (y - oy) * w, w, 1, 0, a, kk);
    if (k > 0) { IB[ni++] = v0 - 2; IB[ni++] = v0 - 1; IB[ni++] = v0; IB[ni++] = v0 - 1; IB[ni++] = v0 + 1; IB[ni++] = v0; }
  }
  if (REC) { const pts = []; for (let k = 0; k < n; k++) { const o = k * 5; pts.push((TMP[o] * 0.5 + 0.5) * PXW, (0.5 - TMP[o + 1] * 0.5) * PXH, TMP[o + 3], TMP[o + 4]); } REC.lines.push([LR, LG, LB, LK, CUR === BA, pts]); }
}
/* a round dot (glow in BA, inked droplet in BI) */
function dot(x, y, z, size, a, c, k) {
  const dx = x - EX, dy = y - EY, dz = z - EZ, vz = dx * FX + dy * FY + dz * FZ;
  if (vz < NEAR * 3) return;
  const vx = dx * RX + dy * RY + dz * RZ, vy = dx * UX + dy * UY + dz * UZ;
  let rad = (0.5 * size * FPX) / vz; a *= 1 - sstep(FOG0, FOG1, vz);
  if (rad < 1.3) { a *= (rad / 1.3) * (rad / 1.3); rad = 1.3; } else if (rad > MAXR) rad = MAXR;
  if (a < 0.004 || nv + 4 > MAXV || ni + 6 > MAXI) return;
  LR = c[0]; LG = c[1]; LB = c[2];
  const kk = (k || 0) * sat((rad - 1.6) / 2), nx = vx / (vz * TXF), ny = vy / (vz * TYF) + SHIFT, ox = rad / (PXW * 0.5), oy = rad / (PXH * 0.5), v0 = nv;
  vtx((nx - ox) * vz, (ny - oy) * vz, vz, -1, -1, a, kk); vtx((nx + ox) * vz, (ny - oy) * vz, vz, 1, -1, a, kk);
  vtx((nx - ox) * vz, (ny + oy) * vz, vz, -1, 1, a, kk); vtx((nx + ox) * vz, (ny + oy) * vz, vz, 1, 1, a, kk);
  IB[ni++] = v0; IB[ni++] = v0 + 1; IB[ni++] = v0 + 2; IB[ni++] = v0 + 1; IB[ni++] = v0 + 3; IB[ni++] = v0 + 2;
  if (REC) REC.spr.push([(nx * 0.5 + 0.5) * PXW, (0.5 - ny * 0.5) * PXH, rad, a, c[0], c[1], c[2], CUR === BA, k || 0]);
}
const dt3 = (size, a, c, k) => dot(V3[0], V3[1], V3[2], size, a, c, k);
/* a stroke in screen space (NDC centre, pixel radius), used for the boost pressure ring */
function ringNDC(cx, cy, rpx, hw, a) {
  tn = 0;
  for (let i = 0; i <= 72; i++) {
    const an = (i / 72) * TAU, o = tn * 5;
    TMP[o] = cx + (Math.cos(an) * rpx) / (PXW * 0.5); TMP[o + 1] = cy + (Math.sin(an) * rpx) / (PXH * 0.5); TMP[o + 2] = 1; TMP[o + 3] = hw; TMP[o + 4] = a; tn++;
  }
  lFlush();
}

/* ---------- the scene ---------- */
const PAPER = [0.949, 0.922, 0.867], PALEC = [0.80, 0.86, 0.88], LANT = [1, 0.26, 0.12], LANTC = [1, 0.74, 0.48];
/* the barrel: a spiral cross-section swept along the path (CPU mesh, shaded as a print on the GPU) */
const TH0 = -0.5, THF = 1.25, TH1 = 1.5 * Math.PI + 0.08, TNA = Q.tubeA, TMAXR = 160;
const TV = new Float32Array(TMAXR * TNA * 7);
let tRings = 0, tRim = -1, SINK = 0; // SINK lowers the wave into the sea where it rises and subsides
function tubeShape(s) {
  const b = BR, env = sstep(b.sIn - 150, b.sIn - 25, s) * (1 - sstep(b.sEye + 30, b.sEye + 170, s)), size = Math.max(0.01, b.rise * env);
  SINK = 6 * (1 - env) + 4 * (1 - b.rise);
  const thE = s <= b.sEye ? THF + (TH1 - THF) * b.curl * sstep(b.sIn - 80, b.sIn + 6, s) : THF * (1 - 0.5 * sstep(b.sEye + 40, b.sEye + 170, s));
  return [size, thE];
}
/* point on a cross-section: size, angle; leaves the path's right vector in VR */
function tubePt(s, size, th, dr) {
  const r = TUBE_R * size * (1 - 0.2 * sstep(2.7, TH1, th)) + (dr || 0);
  trackPt(s, BR.side * (1.6 * size + 0.86 * r * Math.sin(th)), TUBE_C * size - 1.12 * r * Math.cos(th) - SINK);
}
function ringAt(s) {
  const [size, thE] = tubeShape(s), o = tRings * TNA * 7;
  for (let a = 0; a < TNA; a++) {
    const th = TH0 + (a / (TNA - 1)) * (thE - TH0);
    tubePt(s, size, th);
    const p = o + a * 7;
    TV[p] = V3[0]; TV[p + 1] = V3[1]; TV[p + 2] = V3[2];
    TV[p + 3] = (th - TH0) / (TH1 - TH0); TV[p + 4] = s - SC; TV[p + 5] = thE - th; TV[p + 6] = BR.sEye - s;
  }
  tRings++;
}
function finger(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz, L, w0, a, curl) {
  // a: initial direction, b: curl direction, c: spread; tapered stroke of 6 points
  lBegin(PAPER, 1);
  for (let j = 0; j <= 5; j++) {
    const u = j / 5, f = L * u, g = L * curl * u * u, h = L * 0.3 * u;
    lPoint(px + ax * f + bx * g + cx * h, py + ay * f + by * g + cy * h, pz + az * f + bz * g + cz * h, w0 * Math.pow(1 - u, 0.8) + 0.02, a);
  }
  lFlush();
}
function buildTube(t, photo) {
  tRings = 0; tRim = -1;
  const b = BR;
  if (!b.on || b.rise < 0.002) return;
  const sE = b.sEye, sZ = sE + 170, s0 = Math.max(b.sIn - 120, SC - 14);
  if (s0 < sE) {
    for (let s = s0; s < sE - 0.5 && tRings < TMAXR - 60; ) { ringAt(s); const d = s - SC; s += d < 60 ? 2.6 : d < 170 ? 3.6 : 6; }
    ringAt(sE); tRim = tRings - 1;
  }
  for (let s = Math.max(sE + 0.03, SC - 14); s <= sZ && tRings < TMAXR; ) { ringAt(s); const d = s - SC; s += d < 60 ? 3 : d < 170 ? 4.5 : 8; }
  useB(BI);
  // claws hanging from the lip, carried by the water flowing through the tube
  const LIPD = 3.4, sg0 = Math.max(s0, SC + 1.5) - SC, sg1 = sE - SC;
  for (let m = Math.ceil((sg0 + b.fl) / LIPD); m * LIPD - b.fl <= sg1; m++) {
    const s = SC + m * LIPD - b.fl, [size, thE] = tubeShape(s), psi = (thE - THF) / (TH1 - THF);
    if (psi < 0.3) continue;
    const h1 = hash(m * 31 + b.n * 977), h2 = hash(m * 31 + b.n * 977 + 1), h3 = hash(m * 31 + b.n * 977 + 2), h4 = hash(m * 31 + b.n * 977 + 3);
    if (h4 < 0.2) continue;
    tubePt(s, size, thE); const px = V3[0], py = V3[1], pz = V3[2], lx = VR[0] * b.side, lz = VR[1] * b.side, tx = VR[1], tz = -VR[0];
    const ct = Math.cos(thE), st = Math.sin(thE);
    // tangent of the spiral (continuing the curl) and its inward normal
    const ax = lx * ct, ay = st, az = lz * ct, bx = -lx * st, by = ct, bz = -lz * st;
    const a = sat((psi - 0.3) / 0.3) * sstep(1, 6, s - SC) * 0.95;
    const L = (1.2 + 2.6 * h1 * h1) * size, nf = 1 + (h2 > 0.35 ? 1 : 0) + (h2 > 0.8 ? 1 : 0), cu = 0.9 + 0.7 * h3;
    for (let f = 0; f < nf; f++) {
      const hf = hash(m * 57 + f * 11 + b.n), sp = (f - (nf - 1) / 2) * (0.7 + hf), off = (f - (nf - 1) / 2) * 1.1 * size, Lf = L * (0.6 + 0.4 * hf);
      finger(px + tx * off, py, pz + tz * off, ax, ay, az, bx, by, bz, tx * sp, 0, tz * sp, Lf, (0.34 + 0.2 * hf) * size, a, cu);
      // sub-claws branching off each finger
      const u = 0.45 + 0.2 * hf, ox = px + tx * off + ax * Lf * u + bx * Lf * cu * u * u, oy = py + ay * Lf * u + by * Lf * cu * u * u, oz = pz + tz * off + az * Lf * u + bz * Lf * cu * u * u;
      for (let g = -1; g <= 1; g += 2) if (hash(m * 91 + f * 7 + g + b.n) > 0.3) finger(ox, oy, oz, ax * 0.5 + bx * 0.6, ay * 0.5 + by * 0.6, az * 0.5 + bz * 0.6, bx, by, bz, tx * g * 1.8, 0, tz * g * 1.8, Lf * (0.3 + 0.2 * hf), 0.16 * size, a, 1.5);
    }
    // spray hanging under the lip
    for (let q = 0; q < 3; q++) {
      const hq = hash(m * 131 + q * 7 + b.n * 3), d = 1 + hq * 3.5 * size;
      V3[0] = px + bx * d + tx * (hq - 0.5) * 4; V3[1] = py + by * d - hq * 2; V3[2] = pz + bz * d + tz * (hq - 0.5) * 4;
      dt3(0.16 + 0.12 * hq, a * 0.9, PAPER, 1);
    }
  }
  // the eye: a ragged rim of claws pointing forward
  if (tRim >= 0 && sE - SC > 1.5) {
    const [size, thE] = tubeShape(sE);
    for (let i = 0; i < 11; i++) {
      const th = THF + 0.25 + (i / 10) * (thE - THF - 0.25), hi = hash(b.n * 53 + i);
      tubePt(sE, size, th); const px = V3[0], py = V3[1], pz = V3[2], tx = VR[1], tz = -VR[0], lx = VR[0] * b.side, lz = VR[1] * b.side;
      const ox = lx * Math.sin(th), oy = -Math.cos(th), oz = lz * Math.sin(th);
      finger(px, py, pz, tx * 0.8 + ox * 0.5, oy * 0.5, tz * 0.8 + oz * 0.5, -ox, -oy, -oz, 0, 0, 0, (2 + 2.4 * hi) * size, 0.42 * size, 0.85 * sstep(2, 10, sE - SC), 0.5);
    }
  }
  // burst: spray thrown forward out of the eye as we leave the tube
  if (b.burst > -0.15 && b.burst < 1.25) {
    const tb = Math.max(0, b.burst), vf = speed(b.tout), [size] = tubeShape(sE);
    for (let i = 0; i < (PHONE ? 44 : 80); i++) {
      const h1 = hash(b.n * 7001 + i * 3), h2 = hash(b.n * 7001 + i * 3 + 1), h3 = hash(b.n * 7001 + i * 3 + 2);
      const th = TH0 + 0.6 + h1 * (TH1 - TH0 - 0.6), s = sE + 4 + vf * (1.02 + 0.32 * h2) * tb;
      tubePt(s, size, th, (5 + 13 * h3) * tb);
      V3[1] -= 4.9 * tb * tb;
      const a = sstep(-0.15, 0.05, b.burst) * (1 - sstep(0.5, 1.25, tb)) * 0.95;
      dt3(0.22 + 0.34 * h3, a, PAPER, 1);
      if (h2 > 0.5) { const x0 = V3[0], y0 = V3[1], z0 = V3[2]; lBegin(PAPER, 1); lPoint(x0, y0, z0, 0.12 + 0.1 * h3, a); tubePt(s + 3 + 6 * h1, size, th, (5 + 13 * h3) * tb * 0.8); V3[1] -= 4.9 * tb * tb; lPt(0.01, 0); lFlush(); }
    }
  }
  useB(BA);
}

/* foam claws on the open sea: crests found on a world-anchored lattice aligned with the main swell */
const CLA = [];
function seaClaws(t) {
  if (CALM > 0.97) return;
  const d0x = WDX[0], d0z = WDZ[0], bx = -d0z, bz = d0x, Aw = d0x * X0 + d0z * SC, Bw = bx * X0 + bz * SC;
  const RM = PHONE ? 150 : 200, DA = Q.cl, DB = Q.cb, amax = ATOT * GAMP * VEX * 0.62;
  const fl = Math.hypot(FX, FZ) || 1, fxh = FX / fl, fzh = FZ / fl, cosLim = Math.cos(Math.min(1.45, Math.atan(Math.hypot(TXF, TYF)) + 0.12));
  const ka0 = Math.ceil((Aw - RM) / DA), ka1 = Math.floor((Aw + RM) / DA), kb0 = Math.ceil((Bw - RM) / DB), kb1 = Math.floor((Bw + RM) / DB);
  CLA.length = 0;
  for (let kb = kb0; kb <= kb1; kb++) {
    const brel = kb * DB - Bw;
    let h2 = NaN, h1 = NaN;
    for (let ka = ka0; ka <= ka1; ka++) {
      const arel = ka * DA - Aw, x = arel * d0x + brel * bx, z = arel * d0z + brel * bz, r = Math.hypot(x, z);
      let h = NaN;
      if (r < RM && r > 5) { const dx = x - EX, dz = z - EZ; if (dx * fxh + dz * fzh > cosLim * Math.hypot(dx, dz)) { gerst(x, z, r); h = GY; } }
      if (h1 > h2 && h1 >= h && h1 > 0.25 * amax) CLA.push([arel - DA, brel, h2, h1, h, kb, r]);
      h2 = h1; h1 = h;
    }
  }
  CLA.sort((p, q) => p[6] - q[6]);
  useB(BI);
  let drawn = 0;
  for (let i = 0; i < CLA.length && drawn < Q.claws; i++) {
    const [ar, br, ha, hb, hc, kb, r0] = CLA[i];
    const den = ha - 2 * hb + hc, dl = den < -1e-6 ? clamp((0.5 * (ha - hc)) / den, -0.5, 0.5) : 0, a1 = ar + dl * DA;
    const x = a1 * d0x + br * bx, z = a1 * d0z + br * bz;
    gerst(x, z, r0);
    const hn = GY / amax, st = sstep(0.62, 0.95, 0.5 * hn + 1.1 * (1 - GJ)) * (1 - sstep(RM * 0.62, RM, r0));
    if (st < 0.04) continue;
    const crest = Math.round((WK[0] * (a1 + Aw) - WOM[0] * t + WP0[0]) / TAU), id = Math.imul(kb, 7919) + Math.imul(crest, 104729);
    const px = GX, py = GY, pz = GZ;
    { const dx = px - EX, dy = py - EY, dz = pz - EZ, vz = dx * FX + dy * FY + dz * FZ; if (vz < 2) continue; const sx = (dx * RX + dy * RY + dz * RZ) / (vz * TXF), sy = (dx * UX + dy * UY + dz * UZ) / (vz * TYF) + SHIFT; if (sx < -1.15 || sx > 1.15 || sy < -1.2 || sy > 1.3) continue; }
    drawn++;
    const hh = hash(id), L = (3.2 + 4 * hh) * (0.5 + 0.6 * hn) * Math.sqrt(st), w0 = 0.8 * (0.7 + 0.6 * hh) * Math.pow(st, 0.3), a = st * 0.95;
    const nf = 3 + (hh > 0.4 ? 1 : 0) + (hh > 0.75 ? 1 : 0);
    for (let f = 0; f < nf; f++) {
      const hf = hash(id + f * 29), off = (f - (nf - 1) / 2) * 1.9 * (0.8 + 0.4 * hf), sp = (f - (nf - 1) / 2) * 0.55, qx = px + bx * off, qz = pz + bz * off, Lf = L * (0.65 + 0.45 * hf);
      // forward along the swell, rising then curling down
      finger(qx, py + 0.1, qz, d0x * 0.95, 0.42, d0z * 0.95, d0x * 0.1, -1.05, d0z * 0.1, bx * sp, 0, bz * sp, Lf, w0, a, 0.75 + 0.3 * hf);
      const u = 0.45 + 0.15 * hf, mx = qx + d0x * 0.95 * Lf * u + bx * sp * Lf * 0.3 * u, my = py + 0.1 + 0.42 * Lf * u - 1.05 * Lf * 0.75 * u * u, mz = qz + d0z * 0.95 * Lf * u + bz * sp * Lf * 0.3 * u;
      for (let g = -1; g <= 1; g += 2) if (hash(id + f * 7 + g * 3) > 0.25) finger(mx, my, mz, d0x * 0.7, 0.1, d0z * 0.7, 0, -1, 0, bx * g * 1.4, 0, bz * g * 1.4, Lf * (0.32 + 0.18 * hf), w0 * 0.42, a, 1.3);
    }
    for (let q = 0; q < 2; q++) { const hq = hash(id + q * 17 + 5); V3[0] = px + d0x * L * (0.9 + hq) + bx * (hq - 0.5) * 3; V3[1] = py + L * 0.25 * hq; V3[2] = pz + d0z * L * (0.9 + hq) + bz * (hq - 0.5) * 3; dt3(0.12 + 0.12 * hq, a * 0.85, PAPER, 1); }
  }
  useB(BA);
}

/* endless acceleration: five spray layers, each faster than the last, each fading in slow and out fast */
function sprayLayers(t, photo) {
  useB(BI);
  const cc = cyc(t), g1 = Math.floor(cc), mul = (photo ? 2.2 : 1) * (1 + 0.6 * ramp(t) + 2 * KICK);
  for (let g = g1 - K_L + 1; g <= g1; g++) {
    const l = cc - g; if (l <= 0 || l >= K_L) continue;
    const wl = layerW(l); if (wl < 0.02) continue;
    const vl = VL0 * Math.pow(2, l), off = layerDist(l), len = Math.min(70, vl * 0.04 * mul);
    for (let j = 0; j < Q.lay; j++) {
      const h1 = hash(g * 977 + j * 5 + 1), h2 = hash(g * 977 + j * 5 + 2), h3 = hash(g * 977 + j * 5 + 3), h4 = hash(g * 977 + j * 5 + 4);
      let d = (h1 * ZP - off) % ZP; if (d < 0) d += ZP; d += 3;
      const lat = (h2 < 0.5 ? -1 : 1) * (1.5 + h3 * 18) + BR.lat;
      const a = wl * sstep(3, 9, d) * (1 - sstep(ZP * 0.5, ZP, d)) * 0.95;
      if (a < 0.02) continue;
      trackPt(SC + d, lat, 0); gerst(V3[0], V3[2], d);
      const hh = GY + 0.4 + h4 * 2.6 + (BR.on ? BR.inside * 2.5 : 0), w = 0.12 + 0.1 * h3;
      lBegin(PAPER, 1);
      trackPt(SC + d, lat, hh); lPt(w, a);
      trackPt(SC + d + len * 0.35, lat, hh + 0.04 * len); lPt(w * 0.55, a * 0.7);
      trackPt(SC + d + len, lat, hh + 0.1 * len); lPt(0.01, 0);
      lFlush();
    }
  }
  useB(BA);
}

/* the ensemble: spray paths fanning out ahead, spray jets and lantern-red lights racing alongside */
function ensemble(t, photo) {
  const amp = ATOT * GAMP, inn = BR.on ? BR.inside : 0;
  useB(BI);
  // each member's path ahead is a fan of hanging spray droplets, world-anchored so they rush past
  for (const mm of MEM) {
    const k0 = Math.ceil((SC + 6) / 7), k1 = Math.floor((SC + Q.ahead * 0.8) / 7);
    for (let k = k0; k <= k1; k++) {
      const hk = hash(k * 131 + ((mm.a * 1000) | 0));
      if (hk > 0.55) continue;
      const s = k * 7 + hk * 5, d = s - SC, x = sigAt(d) * zOf(mm, s) + BR.lat;
      trackPt(s, x, 0); gerst(V3[0], V3[2], d);
      dot(GX, GY + 0.3 + hk * 1.4, GZ, 0.16 + 0.1 * hk, 0.75 * sstep(6, 20, d) * (1 - 0.6 * inn), PAPER, 1);
    }
  }
  const E = (photo ? 2.2 : 0.6) * (1 + 2 * KICK), tb = t - E, sb = sAt(tb);
  for (const mm of MEM) {
    const sh = SC + racerOff(mm, t), st = sb + racerOff(mm, tb), a0 = sstep(1, 8, sh - SC) * (1 - sstep(Q.ahead * 0.7, Q.ahead * 0.95, sh - SC));
    if (a0 < 0.01) continue;
    const hot = mm.hot;
    if (hot) useB(BA);
    lBegin(hot ? LANT : PAPER, hot ? 0 : 1);
    for (let j = 0; j <= Q.nst; j++) {
      const u = j / Q.nst, s = st + (sh - st) * u, d = s - SC;
      trackPt(s, sigAt(d) * zOf(mm, s) + BR.lat, 0); gerst(V3[0], V3[2], Math.abs(d));
      lPoint(GX, GY + (hot ? 0.7 : 0.45), GZ, hot ? 0.45 : 0.04 + 0.14 * u * u, a0 * Math.pow(u, 1.5) * (hot ? 0.9 : 0.7));
    }
    lFlush();
    const d = sh - SC; trackPt(sh, sigAt(d) * zOf(mm, sh) + BR.lat, 0); gerst(V3[0], V3[2], d);
    if (hot) { dot(GX, GY + 0.7, GZ, 2.2, a0 * 0.8, LANT); dot(GX, GY + 0.7, GZ, 0.5, a0, LANTC); useB(BI); }
    else dot(GX, GY + 0.45, GZ, 0.34, a0 * 0.95, PAPER, 1);
  }
  useB(BA);
}

/* live boost: radial zoom-streaks and a pressure ring */
let RING = -1;
function boostFX(t) {
  useB(BI);
  if (KICK > 0.02) {
    const n = PHONE ? 22 : 34, cc = cyc(t), off = layerDist(K_L - 0.5 + (cc - Math.floor(cc))) * 1.6;
    for (let i = 0; i < n; i++) {
      const h1 = hash(i * 13 + 7), h2 = hash(i * 13 + 8), h3 = hash(i * 13 + 9);
      let d = (h1 * 120 - off) % 120; if (d < 0) d += 120; d += 6;
      const an = h2 * TAU, rr = 2.5 + h3 * 8, len = 8 + 34 * KICK, a = 0.55 * KICK * sstep(6, 14, d) * (1 - sstep(80, 126, d));
      const ox = (RX * Math.cos(an) + UX * Math.sin(an)) * rr, oy = (RY * Math.cos(an) + UY * Math.sin(an)) * rr, oz = (RZ * Math.cos(an) + UZ * Math.sin(an)) * rr;
      lBegin(PAPER, 1);
      lPoint(EX + FX * d + ox, EY + FY * d + oy, EZ + FZ * d + oz, 0.05, a);
      lPoint(EX + FX * (d + len) + ox, EY + FY * (d + len) + oy, EZ + FZ * (d + len) + oz, 0.01, 0);
      lFlush();
    }
  }
  if (RING >= 0 && RING < 0.8) {
    const u = RING / 0.8, e = 1 - (1 - u) * (1 - u), rmax = Math.hypot(PXW, PXH) * 0.55;
    lBegin(PAPER, 1); ringNDC(0, SHIFT, rmax * (0.06 + 0.94 * e), (PXH / 760) * (3.2 - 2 * u), 0.6 * (1 - u) * sstep(0, 0.08, RING));
  }
  useB(BA);
}

/* build(t): the whole frame as data. live adds lean and boost on top; photo lengthens the exposure */
function build(t, live, photo, pw_, ph_) {
  PXW = pw_; PXH = ph_;
  const sc = sAt(t), v = speed(t);
  SC = sc; X0 = pX(sc);
  barrelState(t);
  // calm water around the camera while it is in a tube, released slowly afterwards (continuous in t)
  CALM = 0;
  for (let k = Math.round(cyc(t)) - 1, k1 = k + 2; k <= k1; k++) if (k >= 1) { const tw = wrapTime(k); CALM = Math.max(CALM, sstep(tw - T_IN - 0.9, tw - T_IN - 0.2, t) * (1 - sstep(tw + T_OUT + 0.1, tw + T_OUT + 2.8, t))); }
  const n = Math.floor(cyc(t)); PUNCHE = n >= 1 ? pulse(t - wrapTime(n) - T_OUT) : 0;
  setWaves(t, sc);
  camera(t, sc, v, live);
  BA.nv = BA.ni = BI.nv = BI.ni = 0; CUR = BA; VB = BA.VB; CB = BA.CB; IB = BA.IB; nv = 0; ni = 0; MAXV = BA.mv; MAXI = BA.mi;
  buildTube(t, photo);
  seaClaws(t);
  ensemble(t, photo);
  sprayLayers(t, photo);
  if (live) boostFX(t);
  useB(BA);
  return { t, sc, v };
}

/* ---------- WebGL ---------- */
const cv = rt.cv;
let gl = null, glOK = false, P_SKY, P_SEA, P_TUBE, P_FX, P_INK, P_PAP, bTri, bGrid, bGridI, nGridI = 0, bTube, bTubeI, bV, bC, bI, DERIV = false, relost = false;
const HP = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
const EXT = () => (DERIV ? '#extension GL_OES_standard_derivatives : enable\n#define DERIV 1\n' : '');
const PAL = `const vec3 IND=vec3(.055,.141,.251),PRU=vec3(.122,.227,.373),PALE=vec3(.616,.725,.788),PAP=vec3(.949,.922,.867),SAND=vec3(.89,.812,.659),SUMI=vec3(.063,.09,.133);
const vec3 TRO=vec3(.231,.337,.464),LINE=vec3(.394,.501,.601),FARC=vec3(.181,.287,.427),HZN=vec3(.088,.184,.312);
float hs(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hs(i),hs(i+vec2(1.,0.)),f.x),mix(hs(i+vec2(0.,1.)),hs(i+vec2(1.,1.)),f.x),f.y);}
`;
/* plate helper: AA mask of field f over threshold t, with the colour plate shifted by mo pixels (misregistration) */
const PLATE = `#ifdef DERIV
#define FW(f) max(fwidth(f),1e-4)
#define SHIFTED(f) (f+dFdx(f)*mo.x+dFdy(f)*mo.y)
#else
#define FW(f) .03
#define SHIFTED(f) (f)
#endif
`;
const VS_SKY = 'attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}';
const FS_SKY = () => EXT() + HP + PAL + PLATE + `uniform vec3 R,U,F;uniform vec2 T,RS;uniform float SH,PXS,CF;uniform vec4 MR;varying vec2 v;
void main(){vec3 d=normalize(F+R*v.x*T.x+U*(v.y-SH)*T.y);float e=d.y;
vec2 mo=MR.xy+MR.z*(gl_FragCoord.xy/RS*2.-1.);
vec3 c=mix(PAP,SAND,smoothstep(.004,.07,e));
c=mix(c,PALE,smoothstep(.1,.27,e));
c=mix(c,PRU,smoothstep(.25,.48,e));
float az=atan(d.x,d.z);
float cn=vn(vec2(az*1.7,e*36.))*.62+vn(vec2(az*4.3,e*84.)+4.)*.38;
float env=smoothstep(.07,.11,e)*(1.-smoothstep(.22,.32,e))*CF;
float fc=cn*env;
float m=clamp((SHIFTED(fc)-.5)/FW(fc)+.5,0.,1.);
c=mix(c,mix(PAP,SAND,.25),m*.85);
float o=abs(fc-.5)/FW(fc);c=mix(c,LINE,(1.-smoothstep(.5*PXS,.5*PXS+1.,o))*.5*env);
if(e<0.)c=mix(HZN,IND,smoothstep(0.,-.25,e));
gl_FragColor=vec4(c,1.);}`;
const VS_SEA = `attribute vec2 g;uniform mat4 M;uniform vec3 E;uniform vec4 WA[8];uniform vec4 WB[8];uniform vec4 GR;uniform vec2 HD;uniform float CA;
varying vec3 vD;varying vec2 vX;varying vec4 vG;varying float vR;
void main(){float an=GR.x+g.x*GR.y,r=GR.z*(exp(GR.w*g.y)-1.);float sa=sin(an),ca=cos(an);
vec2 p0=E.xz+vec2(HD.x*ca-HD.y*sa,HD.x*sa+HD.y*ca)*r;
float cf=1.-CA*.75*exp(-dot(p0,p0)/4900.);
vec3 P=vec3(p0.x,0.,p0.y);vec2 gr=vec2(0.);float jac=1.;
for(int i=0;i<8;i++){vec4 a=WA[i],b=WB[i];float f=(1.-smoothstep(b.z,b.w,r))*cf;float th=a.z*dot(a.xy,p0)+b.y,s=sin(th),c=cos(th);
P.xz-=b.x*f*s*a.xy;P.y+=a.w*f*c;gr-=a.w*a.z*f*s*a.xy;jac-=b.x*a.z*f*c;}
vD=P-E;vX=p0;vG=vec4(P.y,gr,jac);vR=r;gl_Position=M*vec4(P,1.);}`;
const FS_SEA = () => EXT() + HP + PAL + PLATE + `uniform vec2 SW,RS;uniform float AT,TD,PXS;uniform vec4 MR;varying vec3 vD;varying vec2 vX;varying vec4 vG;varying float vR;
void main(){float dist=length(vD);float hn=vG.x/AT;vec2 vd=vD.xz/max(length(vD.xz),1e-3);float face=dot(vG.yz,vd);float jac=vG.w;
vec2 mo=MR.xy+MR.z*(gl_FragCoord.xy/RS*2.-1.);
vec2 cq=vec2(dot(vX,vec2(-SW.y,SW.x))*.3,dot(vX,SW)*.07);float cl=vn(cq)*.65+vn(cq*2.7+5.3)*.35;
float fF=.5*hn+1.1*(1.-jac)+.4*cl*cl;
float fP=hn+.35*face+.12*cl+.3*(1.-jac);
float fK=face*1.3+.45*hn;
float fL=vG.x*.6;
float wF=FW(fF),wP=FW(fP),wK=FW(fK),wL=FW(fL);
float mK=clamp((SHIFTED(fK)-.7)/wK+.5,0.,1.);
float near=(1.-smoothstep(80.,190.,dist))*smoothstep(4.,16.,dist);
float mP=clamp((SHIFTED(fP)-.6)/wP+.5,0.,1.)*near;
float mF=clamp((SHIFTED(fF)-.85)/wF+.5,0.,1.)*near;
vec3 col=mix(PRU,IND,smoothstep(.55,1.15,fK)*.75*(1.-smoothstep(120.,320.,dist)));
col=mix(col,TRO,smoothstep(-.2,-.7,hn)*(1.-mK));
col=mix(col,PALE,mP);
float lf=abs(fract(fL)-.5)/wL;
float carve=(1.-smoothstep(.55*PXS,.55*PXS+1.,lf))*(1.-smoothstep(.2,.45,wL))*smoothstep(.1,.26,abs(face));
col=mix(col,mix(LINE,PRU,mP),carve*.7);
col=mix(col,PAP,mF);
float lw=.75*PXS,oF=abs(fF-.85)/wF,oP=abs(fP-.6)/wP;
float key=max((1.-smoothstep(lw,lw+1.,oF))*(1.-smoothstep(.3,.7,wF)),.8*(1.-smoothstep(lw*.8,lw*.8+1.,oP))*(1.-smoothstep(.3,.7,wP)))*near;
col=mix(col,SUMI,key*(1.-smoothstep(600.,1600.,dist)));
col=mix(col,FARC,smoothstep(350.,2600.,dist));
col=mix(col,HZN,smoothstep(2300.,4100.,dist));
col*=1.-.32*TD;
gl_FragColor=vec4(col,1.);}`;
const VS_TUBE = `attribute vec3 p;attribute vec4 a;uniform mat4 M;uniform vec3 E;varying vec4 va;varying vec3 vD;
void main(){va=a;vD=p-E;gl_Position=M*vec4(p,1.);}`;
const FS_TUBE = () => EXT() + HP + PAL + PLATE + `uniform float FL,TD,PXS;uniform vec4 MR;uniform vec2 RS;varying vec4 va;varying vec3 vD;
void main(){float v=va.x,lip=va.z,rim=va.w,u=va.y+FL;
vec2 mo=MR.xy+MR.z*(gl_FragCoord.xy/RS*2.-1.);
float n1=vn(vec2(u*.08,v*9.));
float fC=v+.06*n1;
float fP=.2-lip+.08*n1;
float fF=.1-lip+.14*vn(vec2(u*.5,2.));
float li=v*22.+u*.1;
float wC=FW(fC),wP=FW(fP),wF=FW(fF),wL=FW(li);
float mC=clamp((SHIFTED(fC)-.5)/wC+.5,0.,1.);
float mP=clamp(SHIFTED(fP)/wP+.5,0.,1.);
float mF=clamp(SHIFTED(fF)/wF+.5,0.,1.);
vec3 col=mix(IND,PRU,mC);
col=mix(col,PALE,mP);
float da=fract(u*.018+hs(vec2(floor(li),3.)));
float dash=smoothstep(.34,.4,da)*(1.-smoothstep(.94,1.,da));
float lf=abs(fract(li)-.5)/wL;
float carve=(1.-smoothstep(.5*PXS,.5*PXS+1.,lf))*(1.-smoothstep(.2,.45,wL))*dash;
col=mix(col,mix(LINE,PRU,mP),carve*.75);
col=mix(col,PAP,mF);
float lw=.75*PXS;
float key=max(1.-smoothstep(lw,lw+1.,abs(fF)/wF),.8*(1.-smoothstep(lw*.8,lw*.8+1.,abs(fP)/wP)));
key=max(key,.45*(1.-smoothstep(lw*.7,lw*.7+1.,abs(fC-.5)/wC)));
col=mix(col,SUMI,key);
float eye=exp(-max(rim,0.)/26.);
col*=1.-.4*TD*(1.-.7*eye)*(1.-.85*max(mP,mF));
col=mix(col,FARC,smoothstep(500.,1400.,length(vD)));
gl_FragColor=vec4(col,1.);}`;
const VS_FX = `attribute vec3 p;attribute vec2 uv;attribute vec4 c;attribute float k;uniform vec2 Z;varying vec2 vu;varying vec4 vc;varying float vk;
void main(){vu=uv;vc=c;vk=k;gl_Position=vec4(p.x,p.y,Z.x*p.z+Z.y-.00003*p.z,p.z);}`;
const FS_FX = `precision mediump float;varying vec2 vu;varying vec4 vc;varying float vk;
void main(){float r=length(vu);float f=max(1.-r,0.);f*=f;float g=exp(-r*r*16.);
gl_FragColor=vec4((vc.rgb*(f*.55+g*.85)+vec3(g*g*.28))*vc.a,1.);}`;
const FS_INK = () => EXT() + 'precision mediump float;' + `const vec3 SUMI=vec3(.063,.09,.133);varying vec2 vu;varying vec4 vc;varying float vk;
void main(){float r=length(vu);
#ifdef DERIV
float aa=clamp(fwidth(r)*1.2,.02,1.5);
#else
float aa=.3;
#endif
float a=1.-smoothstep(1.-aa,1.,r);float o=smoothstep(.5-aa*.5,.5+aa*.5,r)*vk;
float al=a*vc.a;gl_FragColor=vec4(mix(vc.rgb,SUMI,o)*al,al);}`;
const FS_PAP = HP + PAL + `uniform float PXS;
float seg(vec2 q,float S,float sd){vec2 c=floor(q/S),f=q-c*S;float h1=hs(c+sd),h2=hs(c+sd+17.3),h3=hs(c+sd+41.1),h4=hs(c+sd+73.7);
if(h4>.6)return 0.;vec2 p=f-vec2(.25+.5*h1,.25+.5*h2)*S;float an=h3*6.2832;vec2 d=vec2(cos(an),sin(an));
float L=S*(.12+.3*h2);float t=clamp(dot(p,d),-L,L);vec2 n=vec2(-d.y,d.x);float bend=(t*t/(L*L)-1.)*S*.05*(h1-.5);
return 1.-smoothstep(.2,.85,length(p-d*t-n*bend));}
void main(){vec2 q=gl_FragCoord.xy/PXS;
float g=hs(floor(q))-.5;
float fib=max(seg(q,44.,0.),seg(q+vec2(21.,13.),36.,9.));
float blot=vn(q*.009)-.5;
float af=fib*.085,ag=clamp(max(g,0.)*.06+max(blot,0.)*.05,0.,.2);
gl_FragColor=vec4(PAP*af,af+ag);}`;
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
  for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); const nm = u.name.replace(/\[0\]$/, ''); p.u[nm] = gl.getUniformLocation(p, nm); }
  return p;
}
function glSetup() {
  try {
    DERIV = !!gl.getExtension('OES_standard_derivatives');
    P_SKY = mkProg(VS_SKY, FS_SKY(), ['p']);
    P_SEA = mkProg(VS_SEA, FS_SEA(), ['g']);
    P_TUBE = mkProg(VS_TUBE, FS_TUBE(), ['p', 'a']);
    P_FX = mkProg(VS_FX, FS_FX, ['p', 'uv', 'c', 'k']);
    P_INK = mkProg(VS_FX, FS_INK(), ['p', 'uv', 'c', 'k']);
    P_PAP = mkProg(VS_SKY, FS_PAP, ['p']);
    bTri = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bTri); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    // the sea: a polar grid around the camera (angle x range), displaced on the GPU
    const NA = Q.ga, NR = Q.gr, gv = new Float32Array(NA * NR * 2), gi = new Uint16Array((NA - 1) * (NR - 1) * 6);
    for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) { const o = (j * NA + i) * 2; gv[o] = i / (NA - 1); gv[o + 1] = j / (NR - 1); }
    let k = 0;
    for (let j = 0; j < NR - 1; j++) for (let i = 0; i < NA - 1; i++) { const a = j * NA + i, b = a + 1, c = a + NA, d = c + 1; gi[k++] = a; gi[k++] = c; gi[k++] = b; gi[k++] = b; gi[k++] = c; gi[k++] = d; }
    nGridI = k;
    bGrid = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bGrid); gl.bufferData(gl.ARRAY_BUFFER, gv, gl.STATIC_DRAW);
    bGridI = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bGridI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, gi, gl.STATIC_DRAW);
    const ti = new Uint16Array((TMAXR - 1) * (TNA - 1) * 6); k = 0;
    for (let j = 0; j < TMAXR - 1; j++) for (let i = 0; i < TNA - 1; i++) { const a = j * TNA + i, b = a + 1, c = a + TNA, d = c + 1; ti[k++] = a; ti[k++] = c; ti[k++] = b; ti[k++] = b; ti[k++] = c; ti[k++] = d; }
    bTube = gl.createBuffer(); bTubeI = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bTubeI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ti, gl.STATIC_DRAW);
    bV = gl.createBuffer(); bC = gl.createBuffer(); bI = gl.createBuffer();
    return true;
  } catch (e) { console.warn(String((e && e.message) || e)); return false; }
}
function initGL() {
  try { gl = cv.getContext('webgl', { antialias: !PHONE, alpha: false, depth: true, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
  if (!gl) return false;
  // a lost context hides #gl (the poster shows) until the restored context draws again; draw() never throws
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); glOK = false; relost = true; cv.classList.remove('on'); });
  cv.addEventListener('webglcontextrestored', () => { glOK = glSetup(); });
  glOK = glSetup();
  return glOK;
}
const MAT = new Float32Array(16), WAU = new Float32Array(32), WBU = new Float32Array(32);
function attribs(n) { for (let i = 0; i < 4; i++) { if (i < n) gl.enableVertexAttribArray(i); else gl.disableVertexAttribArray(i); } }
function drawBatch(b, prog) {
  if (!b.ni) return;
  gl.useProgram(prog); gl.uniform2f(prog.u.Z, PA, PB);
  attribs(4);
  gl.bindBuffer(gl.ARRAY_BUFFER, bV); gl.bufferData(gl.ARRAY_BUFFER, b.VB.subarray(0, b.nv * 6), gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 12); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 24, 20);
  gl.bindBuffer(gl.ARRAY_BUFFER, bC); gl.bufferData(gl.ARRAY_BUFFER, b.CB.subarray(0, b.nv * 4), gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, b.IB.subarray(0, b.ni), gl.DYNAMIC_DRAW);
  gl.drawElements(gl.TRIANGLES, b.ni, gl.UNSIGNED_SHORT, 0);
}
function drawGL() {
  if (!glOK || gl.isContextLost()) return;
  const W_ = cv.width, H_ = cv.height, pxs = Math.max(0.5, W_ / Math.max(1, rt.cssW));
  // misregistration: the colour plates sit ~1.2 css px off the keyblock; a boost splits them at the frame edges
  const m0 = 1.2 * pxs, m2 = 7 * pxs * KICK;
  gl.viewport(0, 0, W_, H_);
  gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.useProgram(P_SKY);
  gl.uniform3f(P_SKY.u.R, RX, RY, RZ); gl.uniform3f(P_SKY.u.U, UX, UY, UZ); gl.uniform3f(P_SKY.u.F, FX, FY, FZ); gl.uniform2f(P_SKY.u.T, TXF, TYF); gl.uniform1f(P_SKY.u.SH, SHIFT);
  gl.uniform2f(P_SKY.u.RS, W_, H_); gl.uniform1f(P_SKY.u.PXS, pxs); gl.uniform1f(P_SKY.u.CF, 1 - 0.9 * (BR.on ? BR.inside : 0)); gl.uniform4f(P_SKY.u.MR, m0, -m0 * 0.6, m2, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, bTri); attribs(1); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const re = RX * EX + RY * EY + RZ * EZ, ue = UX * EX + UY * EY + UZ * EZ, fe = FX * EX + FY * EY + FZ * EZ;
  MAT[0] = RX / TXF; MAT[4] = RY / TXF; MAT[8] = RZ / TXF; MAT[12] = -re / TXF;
  MAT[1] = UX / TYF + SHIFT * FX; MAT[5] = UY / TYF + SHIFT * FY; MAT[9] = UZ / TYF + SHIFT * FZ; MAT[13] = -ue / TYF - SHIFT * fe;
  MAT[2] = PA * FX; MAT[6] = PA * FY; MAT[10] = PA * FZ; MAT[14] = -PA * fe + PB;
  MAT[3] = FX; MAT[7] = FY; MAT[11] = FZ; MAT[15] = -fe;
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  // the sea
  for (let i = 0; i < NW; i++) { const o = i * 4; WAU[o] = WDX[i]; WAU[o + 1] = WDZ[i]; WAU[o + 2] = WK[i]; WAU[o + 3] = WAm[i]; WBU[o] = WQA[i]; WBU[o + 1] = WPH[i]; WBU[o + 2] = WF0[i]; WBU[o + 3] = WF1[i]; }
  const hl = Math.hypot(FX, FZ) || 1, span = Math.min(5.6, 2 * Math.atan(Math.hypot(TXF, TYF) * 1.15) + 0.4), r0 = PHONE ? 7 : 6;
  gl.useProgram(P_SEA);
  gl.uniformMatrix4fv(P_SEA.u.M, false, MAT); gl.uniform3f(P_SEA.u.E, EX, EY, EZ);
  gl.uniform4fv(P_SEA.u.WA, WAU); gl.uniform4fv(P_SEA.u.WB, WBU);
  gl.uniform4f(P_SEA.u.GR, -span / 2, span, r0, Math.log(1 + 4200 / r0)); gl.uniform2f(P_SEA.u.HD, FX / hl, FZ / hl); gl.uniform1f(P_SEA.u.CA, CALM);
  gl.uniform2f(P_SEA.u.SW, WDX[0], WDZ[0]); gl.uniform2f(P_SEA.u.RS, W_, H_); gl.uniform1f(P_SEA.u.AT, ATOT * GAMP * VEX * 0.62); gl.uniform1f(P_SEA.u.TD, BR.on ? BR.inside : 0); gl.uniform1f(P_SEA.u.PXS, pxs);
  gl.uniform4f(P_SEA.u.MR, m0, -m0 * 0.6, m2, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, bGrid); attribs(1); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bGridI); gl.drawElements(gl.TRIANGLES, nGridI, gl.UNSIGNED_SHORT, 0);
  // the barrel
  if (tRings > 1) {
    gl.useProgram(P_TUBE);
    gl.uniformMatrix4fv(P_TUBE.u.M, false, MAT); gl.uniform3f(P_TUBE.u.E, EX, EY, EZ);
    gl.uniform1f(P_TUBE.u.FL, BR.fl % 4000); gl.uniform1f(P_TUBE.u.TD, BR.inside); gl.uniform1f(P_TUBE.u.PXS, pxs); gl.uniform2f(P_TUBE.u.RS, W_, H_); gl.uniform4f(P_TUBE.u.MR, m0, -m0 * 0.6, m2, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bTube); gl.bufferData(gl.ARRAY_BUFFER, TV.subarray(0, tRings * TNA * 7), gl.DYNAMIC_DRAW);
    attribs(2); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bTubeI);
    const q = (TNA - 1) * 6, split = tRim >= 0 ? tRim : -1;
    if (split > 0) gl.drawElements(gl.TRIANGLES, split * q, gl.UNSIGNED_SHORT, 0);
    const first = split >= 0 ? split + 1 : 0, cnt = tRings - 1 - first;
    if (cnt > 0) gl.drawElements(gl.TRIANGLES, cnt * q, gl.UNSIGNED_SHORT, first * q * 2);
  }
  // light and ink
  gl.depthMask(false); gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE); drawBatch(BA, P_FX);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); drawBatch(BI, P_INK);
  // washi: fibres and grain over everything
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(P_PAP); gl.uniform1f(P_PAP.u.PXS, pxs);
  gl.bindBuffer(gl.ARRAY_BUFFER, bTri); attribs(1); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.depthMask(true);
  if (relost) { relost = false; cv.classList.add('on'); }
}

/* ---------- poster: the same print on a cheap 2D canvas, painted far to near (also the no-WebGL fallback) ---------- */
const HEX = { ind: '#0E2440', pru: '#1F3A5F', pale: '#9DB9C9', pap: '#F2EBDD', sand: '#E3CFA8', sumi: '#101722', tro: '#3B5676', far: '#2E496D' };
const T_POSTER = 3.2;
function poster(c, w, h, t, photo) {
  const pr = clamp(w / Math.max(1, rt.cssW), 1, 2);
  // the 2D poster cannot draw the barrel, so a still asked for inside a barrel shows the open sea instead
  barrelState(t); if (BR.on && BR.rise > 0.05) t = T_POSTER;
  REC = { lines: [], spr: [] };
  build(t, null, photo, w, h);
  const rec = REC; REC = null;
  const hl = Math.hypot(FX, FZ) || 1, hx = FX / hl, hz = FZ / hl;
  const proj = (x, y, z) => { const dx = x - EX, dy = y - EY, dz = z - EZ, vz = dx * FX + dy * FY + dz * FZ; if (vz < 0.5) return null; return [(((dx * RX + dy * RY + dz * RZ) / (vz * TXF)) * 0.5 + 0.5) * w, (0.5 - ((dx * UX + dy * UY + dz * UZ) / (vz * TYF) + SHIFT) * 0.5) * h]; };
  const hp_ = proj(EX + hx * 1e5, EY, EZ + hz * 1e5), yH = hp_ ? clamp(hp_[1] / h, 0.05, 0.95) : 0.4;
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, HEX.pru); g.addColorStop(yH * 0.45, HEX.pale); g.addColorStop(yH * 0.82, HEX.sand); g.addColorStop(yH, HEX.pap); g.addColorStop(Math.min(1, yH + 0.002), HEX.pru); g.addColorStop(1, HEX.ind);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const NR = 96, NC = PHONE ? 90 : 150, span = 2 * Math.atan(Math.hypot(TXF, TYF)) + 0.3, amax = ATOT * GAMP * VEX * 0.62, rows = [];
  for (let j = 0; j < NR; j++) {
    const rr = 6 * (Math.exp(Math.log(1 + 2600 / 6) * (1 - j / (NR - 1))) - 1) + 1.5, row = [];
    for (let i = 0; i < NC; i++) {
      const an = -span / 2 + (i / (NC - 1)) * span, ca = Math.cos(an), sa = Math.sin(an);
      gerst(EX + (hx * ca - hz * sa) * rr, EZ + (hx * sa + hz * ca) * rr, rr);
      const p = proj(GX, GY, GZ); row.push(p ? [p[0], p[1], GY / amax + 0.6 * (1 - GJ), GY / amax, rr] : null);
    }
    rows.push(row);
  }
  c.lineJoin = 'round';
  // far to near: flat silhouettes in two tones; pale and paper strokes only along crest edges
  for (const row of rows) for (let i = 0; i < NC - 1; i++) {
    const p = row[i], q = row[i + 1]; if (!p || !q) continue;
    const far = p[4] > 900, fo = (p[2] + q[2]) * 0.5, hn = (p[3] + q[3]) * 0.5;
    c.fillStyle = far ? HEX.far : HEX.pru;
    c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(q[0] + 0.5, q[1]); c.lineTo(q[0] + 0.5, h); c.lineTo(p[0], h); c.closePath(); c.fill();
    if (far || hn < 0.45) continue;
    c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]);
    const wv = Math.max(1, pr * Math.min(6, 900 / p[4]));
    c.strokeStyle = fo > 1 ? HEX.pap : HEX.pale; c.lineWidth = wv * (fo > 1 ? 1.6 : 1); c.stroke();
    c.strokeStyle = HEX.sumi; c.lineWidth = Math.max(1, pr); c.stroke();
  }
  const col = (r_, g_, b_, a) => `rgba(${(r_ * 255) | 0},${(g_ * 255) | 0},${(b_ * 255) | 0},${clamp(a, 0, 1).toFixed(3)})`;
  c.lineCap = 'round';
  for (const [r_, g_, b_, k, add, p] of rec.lines) {
    c.globalCompositeOperation = add ? 'lighter' : 'source-over';
    for (let i = 4; i < p.length; i += 4) {
      const a = (p[i + 3] + p[i - 1]) * 0.5; if (a < 0.02) continue;
      const lw = p[i + 2] + p[i - 2];
      c.beginPath(); c.moveTo(p[i - 4], p[i - 3]); c.lineTo(p[i], p[i + 1]);
      if (k && lw > 3) { c.strokeStyle = col(0.063, 0.09, 0.133, a); c.lineWidth = lw; c.stroke(); c.strokeStyle = col(r_, g_, b_, a); c.lineWidth = lw * 0.5; c.stroke(); }
      else { c.strokeStyle = col(r_, g_, b_, a * (add ? 0.55 : 0.85)); c.lineWidth = Math.max(1, lw * (add ? 0.3 : 0.8)); c.stroke(); }
    }
  }
  for (const [x, y, rad, a, r_, g_, b_, add] of rec.spr) {
    c.globalCompositeOperation = add ? 'lighter' : 'source-over';
    c.fillStyle = col(r_, g_, b_, a * (add ? 0.45 : 0.95)); c.beginPath(); c.arc(x, y, Math.max(1, rad * (add ? 0.6 : 0.9)), 0, TAU); c.fill();
  }
  c.globalCompositeOperation = 'source-over';
}


/* ---------- live frames: map the runtime's live fields onto the prototype's ---------- */
const LV = { lean: 0, kick: 0 };
function draw(t, live, photo) {
  if (live) { LV.lean = live.lean; LV.kick = live.boost; RING = live.wave < 0.85 ? live.wave : -1; } else RING = -1;
  build(t, live ? LV : null, !!photo, cv.width, cv.height);
  drawGL();
}

/* ---------- the name prints in: its colour plates slide into register ---------- */
let entered = false;
function entrance(tw, nm, tg) {
  const e = sstep(0.05, 1.3, tw), e2 = sstep(0.4, 1.6, tw);
  if (e >= 1 && e2 >= 1) { if (!entered) { entered = true; nm.style.cssText = ''; tg.style.cssText = ''; } return; }
  entered = false;
  const k = 1 - e;
  nm.style.opacity = (0.35 + 0.65 * e).toFixed(3);
  nm.style.textShadow = (-0.07 * k).toFixed(3) + 'em ' + (0.035 * k).toFixed(3) + 'em 0 rgba(200,64,47,' + (0.85 * k).toFixed(3) + '),' + (0.05 * k).toFixed(3) + 'em ' + (-0.03 * k).toFixed(3) + 'em 0 rgba(157,185,201,' + (0.7 * k).toFixed(3) + '),0 2px 28px rgba(var(--hs),.8)';
  tg.style.opacity = (0.3 + 0.7 * e2).toFixed(3);
  tg.style.transform = 'translate3d(0,' + ((1 - e2) * 10).toFixed(1) + 'px,0)';
}

/* ---------- ride-only decoration: kento registration marks and a vermilion "MM" seal ---------- */
if (rt.deco && !rt.deco.querySelector('.fw-seal')) rt.deco.insertAdjacentHTML('beforeend',
  '<svg class="fw-ken" viewBox="0 0 92 30"><path d="M1 29V1h22"/><path d="M58 1h33"/></svg>' +
  '<svg class="fw-seal" viewBox="0 0 48 48"><path d="M3.2 2.6 45.1 3.4 44.6 45.3 2.7 44.8Z" fill="#C8402F"/><path d="M7.4 7.1 40.8 7.6 40.5 40.9 7.1 40.5Z" fill="none" stroke="#F2EBDD" stroke-width="1.6"/><text x="24" y="32.5" text-anchor="middle" fill="#F2EBDD" font-family="\'Big Shoulders Display\',\'Arial Narrow\',sans-serif" font-weight="800" font-size="21" letter-spacing=".5">MM</text></svg>');
const CSS = '.fw-ken{position:absolute;left:var(--gut);top:18px;width:92px;height:30px;overflow:visible}' +
  '.fw-ken path{fill:none;stroke:rgba(242,235,221,.6);stroke-width:2;stroke-linecap:square}' +
  '.fw-seal{position:absolute;right:var(--gut);top:18px;width:46px;height:46px;transform:rotate(-2.5deg)}' +
  '@media (max-width:700px){.fw-ken{left:16px;top:16px;width:70px;height:24px}.fw-seal{right:auto;left:100px;top:12px;width:40px;height:40px}}';

return {
  id: 'floating-world', title: 'Floating World',
  caption: 'The waves are eight summed Gerstner waves drawn as a woodblock print; Prussian blue arrived in Japanese prints in the late 1820s.',
  DURATION, T_STILL: 10.6, hintAt: 6, Q,
  initGL, draw, poster, entrance, css: CSS
};
};
