/* Scale Invariant: one ride engine for the shared maxmartinelli.com shell (see ENGINE_API.md).
   You dive through a Menger sponge grown around a fixed point, so the walls are made of smaller copies of themselves.
   Speeding up is the same as shrinking: each acceleration cycle carries you exactly LPC levels deeper (three times
   smaller per level) and the world is identical, so the acceleration never has to stop. Taillight trails thread the
   channel into the vanishing point. The runtime owns the clock, input, boost dynamics, hint, entrance and fallbacks. */
window.MM_ENGINES['scale-invariant'] = function (rt) {
'use strict';
/* HERO STORYBOARD (seconds; draw(t) renders every frame from t alone)
   0.0-1.4   IGNITION. Already diving through a blue-hour Menger nave toward its fixed point. A white launch ring races
             down the channel, the taillight trails ignite behind it and the light at the vanishing point swells.
   1.4-5.6   CYCLE 1. Acceleration builds: Shepard streak layers climb the octaves, the view widens, vibration rises,
             racers trade places and the walls close in toward the gate (the channel's narrowest point).
   5.6       GATE 1, the gear change. The view squeezes and releases, streaks burst, and the ride is exactly two levels
             deeper: everything is nine times smaller and identical, because the sponge is.
   5.6-12.0  CYCLE 2 with a corkscrew (a full roll) through the open nave; gate 2 at 12.0.
   12.0-20   CYCLE 3, gate 3 at 18.4, into cycle 4. Live mode never stops: a gate every 6.4 s, a corkscrew every second
             cycle, two levels deeper each time, forever. */

const { TAU, clamp, sat, sstep, smoother, mulberry32, hash, PHONE } = rt;

/* quality: members, tail points, raymarch steps, fractal levels, LOD (px per smallest hole), pixel ratio cap,
   streaks per Shepard layer, trail samples, post blur taps. (The prototype also started phones at render scale 0.6;
   the runtime now owns the start scale.) */
const Q = PHONE
  ? { n: 10, nst: 10, steps: 46, kmax: 7, lodk: 2.6, pr: 1.5, np: 22, ns: 34, nb: 5, scale0: 0.6 }
  : { n: 16, nst: 14, steps: 84, kmax: 9, lodk: 2.0, pr: 2, np: 40, ns: 48, nb: 8 };
const rnd = mulberry32(20261011);

/* ---------- depth z(t), in levels of self-similarity: closed form, exactly LPC levels per cycle ----------
   Within a cycle the speed z'(t) ramps up (convex), punches briefly after each gate and is continuous across it. */
const DURATION = 20, TC = 6.4, T_OFF = 0.8;
const LPC = 2; // levels per cycle; any whole number stays seamless (the caption says two)
const SA = 0.51, SB = 1.02, SC = 2.25, SD = SC - SB, ST1 = 0.025, ST2 = 0.08;
const g0 = (p) => SA * p + (SB * p * p * p) / 3 + SC * ST2 * (1 - Math.exp(-p / ST2)) - SD * ST1 * (1 - Math.exp(-p / ST1));
const g1 = (p) => SA + SB * p * p + SC * Math.exp(-p / ST2) - SD * Math.exp(-p / ST1);
const GN = g0(1);
const tau = (t) => (t + T_OFF) / TC;
function zAt(t) { const u = tau(t), n = Math.floor(u); return LPC * (n + g0(u - n) / GN); }
function zVel(t) { const u = tau(t); return (LPC * g1(u - Math.floor(u))) / GN / TC; }
/* per-cycle ramps, continuous across the gate (the ramp falls in the last 0.2 s: that is the squeeze) */
const CY = { n: 0, p: 0, s: 0, ramp: 0, sq: 0, burst: 0 };
function cyc(t) {
  const u = tau(t), n = Math.floor(u), p = u - n, s = (p < 0.5 ? p : p - 1) * TC;
  CY.n = n; CY.p = p; CY.s = s;
  CY.ramp = p * p * (1.6 - 0.6 * p) * (1 - sstep(0.965, 1, p));
  CY.sq = sstep(-0.22, 0, s) * (1 - sstep(0.04, 0.85, s));
  CY.burst = sstep(-0.12, 0, s) * (1 - sstep(0.02, 0.8, s));
  return CY;
}
/* a full-roll corkscrew in the open nave of every second cycle, alternating direction */
function cork(t) {
  const u = tau(t), n = Math.floor(u), p = u - n;
  if (!(n & 1) || p < 0.24 || p > 0.66) return 0;
  return ((n >> 1) & 1 ? -1 : 1) * TAU * smoother((p - 0.24) / 0.42);
}
/* ignition: a front racing from the camera into the depths, 0.35-1.5 s */
const IG0 = 0.35, IGV = 2.3;
const ig = (dl, t) => (t > 2.2 ? 1 : 0.2 + 0.8 * sstep(-0.35, 0, (t - IG0) * IGV - dl));
const keyLight = (t) => 0.45 + 0.55 * sstep(0.2, 1.6, t);

/* ---------- the world: a Menger sponge grown around a fixed point ----------
   Unit-cube coordinates, origin at x* = (1/2, 1/4, 1/4), the fixed point of g(x) = M(x)/3 with M a half-turn about
   d = (0,-1,1)/sqrt2. The sponge grown from g is exactly invariant under g, and the ray from x* along d stays at least
   0.177 of its distance from every wall. The camera rides that ray; each level it is three times closer. Rendering
   happens at unit scale: render space = world * 3^z / RHO0, mirrored by M on odd levels, so floats never run out. */
const RHO0 = 0.15719; // distance of the narrowest gate from x*: gates land exactly on cycle wraps
const SQ2 = Math.SQRT1_2, DY = -SQ2, DZ = SQ2;
let NPAR = 0, KS = RHO0;
const V3 = [0, 0, 0];
/* point at distance s from x* on the ray at polar angle a from d and azimuth th (world frame), into render space */
function rpt(s, a, th) {
  const ca = Math.cos(a), sa = Math.sin(a), c = Math.cos(th), sn = Math.sin(th);
  const x = s * sa * c, y = s * SQ2 * (sa * sn - ca), z = s * SQ2 * (sa * sn + ca);
  if (NPAR) { V3[0] = -x; V3[1] = -z; V3[2] = -y; } else { V3[0] = x; V3[1] = y; V3[2] = z; }
}
function par(x, y, z) { if (NPAR) { V3[0] = -x; V3[1] = -z; V3[2] = -y; } else { V3[0] = x; V3[1] = y; V3[2] = z; } }

/* ensemble members: light trails converging on x*, inside the free cone (polar angle < 0.15 rad) */
const MEM = [];
for (let m = 0; m < Q.n; m++) {
  const q = (m + 0.5) / Q.n, r = Math.sqrt(-2 * Math.log(1 - q)), close = m % 4 === 3;
  MEM.push({
    a0: 0.03 + 0.105 * Math.min(1, r / 2.4), az: m * 2.39996 + rnd() * 0.4, w: (TAU / (3 + rnd() * 6)) * (rnd() < 0.5 ? -1 : 1),
    w2: TAU / (1.1 + rnd() * 1.5), b: rnd() * TAU, b2: rnd() * TAU, k: 0.12 + rnd() * 0.16,
    off: close ? 0.1 : 0.2 + rnd() * 0.85, amp: close ? 0.06 : 0.05 + rnd() * 0.22, rw: TAU / (6 + rnd() * 8), rp: rnd() * TAU,
    hot: m % 5 === 2, amb: m % 7 === 4
  });
}
let MA = 0, MT = 0;
function memDir(mm, zeta) { MT = mm.az + mm.w * zeta + mm.k * Math.sin(mm.w2 * zeta + mm.b); MA = Math.min(0.15, mm.a0 * (1 + 0.22 * Math.sin(mm.w2 * 0.61 * zeta + mm.b2))); }
const racerD = (mm, t) => mm.off + mm.amp * Math.sin(mm.rw * t + mm.rp);

/* ---------- camera + projection (render space, double precision on the CPU) ---------- */
const NEAR = 0.004, FAR = 40, PA = (FAR + NEAR) / (FAR - NEAR), PB = (-2 * FAR * NEAR) / (FAR - NEAR);
let EX = 0, EY = 0, EZ = 0, RX = 1, RY = 0, RZ = 0, UX = 0, UY = 1, UZ = 0, FX = 0, FY = 0, FZ = 1;
let SHIFT = 0, TXF = 1, TYF = 1, PXW = 2, PXH = 2, FPX = 1, MINHW = 0.8, MAXHW = 40, MAXR = 60, FOG0 = 2.6, FOG1 = 5.5, PXA = 0.002;
const YW = [], PW = [];
[[7.3, 0.05], [3.1, 0.018]].forEach(([P, A]) => YW.push([A * (0.8 + 0.4 * rnd()), TAU / P, rnd() * TAU]));
[[9.7, 0.03], [4.3, 0.012]].forEach(([P, A]) => PW.push([A * (0.8 + 0.4 * rnd()), TAU / P, rnd() * TAU]));
const BANK = 5.5;
function camera(t, z, v, cy, live) {
  const n = Math.floor(z), f = z - n;
  NPAR = n & 1; KS = RHO0 * Math.pow(3, -f);
  const lean = live ? live.lean : 0, ke = live ? live.kick : 0;
  let yaw = lean * 0.07, yr = 0, pit = 0;
  for (const h of YW) { yaw += h[0] * Math.sin(h[1] * t + h[2]); yr += h[0] * h[1] * Math.cos(h[1] * t + h[2]); }
  for (const h of PW) pit += h[0] * Math.sin(h[1] * t + h[2]);
  const psi = -yr * BANK + 0.32 * Math.sin((TAU * t) / 23 + 0.7) + cork(t) - lean * 0.3;
  const cp = Math.cos(psi), sp = Math.sin(psi);
  const r1x = cp, r1y = sp * SQ2, r1z = sp * SQ2, u1x = -sp, u1y = cp * SQ2, u1z = cp * SQ2;
  const ty = Math.tan(yaw), tp = Math.tan(pit);
  let fx = r1x * ty + u1x * tp, fy = -DY + r1y * ty + u1y * tp, fz = -DZ + r1z * ty + u1z * tp, l = Math.hypot(fx, fy, fz);
  fx /= l; fy /= l; fz /= l;
  let rx = fy * u1z - fz * u1y, ry = fz * u1x - fx * u1z, rz = fx * u1y - fy * u1x; l = Math.hypot(rx, ry, rz); rx /= l; ry /= l; rz /= l;
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  // wander (a fraction of the distance to x*, well inside the 0.177 clearance) and engine vibration
  const w1 = 0.034 * Math.sin((TAU * t) / 8.3 + 1.1), w2 = 0.028 * Math.sin((TAU * t) / 11.7 + 2.3);
  const sh = 0.0011 + 0.0026 * cy.ramp + 0.004 * cy.sq + 0.0045 * ke;
  const s1 = Math.sin(t * 47.1) * 0.6 + Math.sin(t * 71.3 + 1.3) * 0.4, s2 = Math.sin(t * 59.7 + 0.4);
  // camera position: d + w1 A1 + w2 A2 + shake (world frame), then into render space
  const kx = ux * sh * s1 + rx * sh * 0.6 * s2, ky = uy * sh * s1 + ry * sh * 0.6 * s2, kz = uz * sh * s1 + rz * sh * 0.6 * s2;
  par(w1 + kx, DY + w2 * SQ2 + ky, DZ + w2 * SQ2 + kz);
  EX = V3[0]; EY = V3[1]; EZ = V3[2];
  par(rx, ry, rz); RX = V3[0]; RY = V3[1]; RZ = V3[2];
  par(ux, uy, uz); UX = V3[0]; UY = V3[1]; UZ = V3[2];
  par(fx, fy, fz); FX = V3[0]; FY = V3[1]; FZ = V3[2];
  const fov = (58 + 12 * cy.ramp - 6 * cy.sq + 22 * ke + 3 * sat((v - 0.12) / 0.2)) * (Math.PI / 180), asp = PXW / PXH;
  if (asp >= 1) { TYF = Math.tan(fov / 2); TXF = TYF * asp; } else { TYF = Math.min(1.5, Math.tan(fov / 2 + 0.05) / asp); TXF = TYF * asp; }
  FPX = (PXW * 0.5) / TXF; SHIFT = asp < 1 ? 0.3 : 0.1; PXA = (2 * TYF) / PXH;
  MINHW = 0.75 * Math.max(1, PXH / 760); MAXHW = 0.04 * PXH; MAXR = 0.07 * PXH;
}

/* ---------- geometry emitters: CPU-projected additive lines and sprites ---------- */
const MAXV = 16000, MAXI = 30000;
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

/* ---------- the scene's light ---------- */
const RED = [1, 0.17, 0.12], HOT = [1, 0.4, 0.16], AMB = [1, 0.62, 0.17], WHT = [0.96, 0.95, 0.91], STRK = [0.72, 0.8, 1];
const P3 = (x) => Math.pow(3, -x);
/* the ensemble: long thin taillight paths threading the channel into the vanishing point */
function paths(t, z) {
  for (const mm of MEM) {
    const c = mm.hot ? HOT : mm.amb ? AMB : RED;
    lBegin(c[0], c[1], c[2]);
    for (let i = 0; i <= Q.ns; i++) {
      const u = i / Q.ns, dl = -0.05 + 2.55 * Math.pow(u, 1.7), s = P3(dl);
      memDir(mm, z + dl); rpt(s, MA, MT);
      lPt(0.0028 * s, 0.3 * ig(dl, t) * sstep(-0.03, 0.07, dl) * (1 - sstep(1.6, 2.5, dl)));
    }
    lFlush();
  }
}
/* racers: taillight heads ahead of the camera with long-exposure tails (the last E seconds of their motion) */
function racers(t, z, photo, ke) {
  const E = (photo ? 2.2 : 0.55) * (1 + 2 * ke), tb = t - E, zb = zAt(tb);
  for (const mm of MEM) {
    const dh = racerD(mm, t), zh = z + dh, zt = zb + racerD(mm, tb), c = mm.hot ? HOT : mm.amb ? AMB : RED;
    const a0 = ig(dh, t) * sstep(0.02, 0.09, dh) * (1 - sstep(1.35, 1.9, dh));
    if (a0 < 0.01) continue;
    lBegin(c[0], c[1], c[2]);
    for (let j = 0; j <= Q.nst; j++) {
      const u = j / Q.nst, zeta = zt + (zh - zt) * u, s = P3(zeta - z);
      memDir(mm, zeta); rpt(s, MA, MT);
      lPt(0.011 * s, a0 * Math.pow(u, 1.5) * 0.95);
    }
    lFlush();
    const s = P3(dh); memDir(mm, zh); rpt(s, MA, MT);
    spr(0.05 * s, a0 * 0.85, c); spr(0.013 * s, a0, [1, 0.78, 0.62]);
  }
}
/* Shepard layers: streaks flying out of the vanishing point, octave-spaced speeds v_k = VMIN 2^(k+phase).
   A layer's identity persists across the wrap (seed k - cycle), so the hand-over is exact. */
const KL = 5, VMIN = 0.17, LAMC = 2.15, LAMW = 1.1, SP_P = 2.45;
function shepard(t, photo, cy, ke) {
  const nC = cy.n, p = cy.p, expo = (photo ? 0.12 : 0.065) * (1 + 1.4 * cy.ramp + 3 * cy.burst) * (1 + 2 * ke);
  for (let k = 0; k < KL; k++) {
    const lam = k + p, bell = Math.exp(-(((lam - LAMC) / LAMW) ** 2));
    if (bell < 0.02) continue;
    const v = VMIN * Math.pow(2, lam), U = (TC / Math.LN2) * v, len = Math.min(0.7, v * expo), lid = k - nC;
    for (let j = 0; j < Q.np; j++) {
      const hs = lid * 977 + j * 131, h1 = hash(hs), h2 = hash(hs + 1), h3 = hash(hs + 2), h4 = hash(hs + 3);
      const dl = 2.35 - ((h3 * SP_P + U) % SP_P);
      const a = 0.9 * bell * (1 - sstep(1.5, 2.3, dl)) * sstep(-0.04, 0.05, dl) * (0.55 + 0.45 * h4) * (1 + 0.7 * cy.burst);
      if (a < 0.01) continue;
      const pa_ = 0.02 + 0.125 * Math.sqrt(h1), th = TAU * h2, c = h4 > 0.84 ? AMB : STRK;
      lBegin(c[0], c[1], c[2]);
      rpt(P3(dl), pa_, th); lPt(0.003 * P3(dl), a);
      rpt(P3(dl + len), pa_, th); lPt(0.003 * P3(dl + len), 0);
      lFlush();
    }
  }
}
/* rings: the launch ring at ignition (racing away) and the live pressure wave on boost (racing at you) */
function ring(dl, a, col) {
  if (a < 0.01) return;
  const s = P3(dl);
  lBegin(col[0], col[1], col[2]);
  for (let k = 0; k <= 56; k++) { rpt(s, 0.155, (TAU * k) / 56); lPt(0.0045 * s, a); }
  lFlush();
}
/* build(t): the whole frame as data. live adds lean and boost on top; photo lengthens the exposure */
let FR = { t: 0, z: 0, v: 0, ke: 0 };
function build(t, live, photo, pw_, ph_) {
  PXW = pw_; PXH = ph_;
  const z = zAt(t), v = zVel(t), cy = cyc(t), ke = live ? live.kick : 0;
  camera(t, z, v, cy, live);
  nv = 0; ni = 0;
  paths(t, z);
  racers(t, z, photo, ke);
  shepard(t, photo, cy, ke);
  if (t > IG0 && t < IG0 + 1.3) ring((t - IG0) * IGV, 0.85 * (1 - sstep(0.6, 1.3, t - IG0)), [1, 0.92, 0.8]);
  if (live && live.ring >= 0 && live.ring < 0.8) ring(1.25 - live.ring * 3.2, 0.6 * sstep(0, 0.05, live.ring) * (1 - sstep(0.2, 0.8, live.ring)), [1, 0.86, 0.66]);
  FR.t = t; FR.z = z; FR.v = v; FR.ke = ke;
  return FR;
}

/* ---------- WebGL ---------- */
const cv = rt.cv;
let gl = null, glOK = false, P_FR, P_FX, P_PO, bTri, bV, bC, bI, FB = null, reveal = false;
const HP = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
const VS_TRI = 'attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}';
/* the fractal: one raymarch of the grown sponge, with LOD by pixel footprint */
const FS_FR = () => HP + `#define STEPS ${Q.steps}
#define KMAX ${Q.kmax}
uniform vec3 R,U,F,E;uniform vec2 T;uniform float SH,KS,PX;uniform vec4 LT;varying vec2 v;
const vec3 C0=vec3(0.,-.25,-.25);const vec3 AXD=vec3(0.,-.70710678,.70710678);
float lv,wl;vec3 ck;
float deq(vec3 q,float lod){
float n=max(abs(q.x),max(abs(q.y),abs(q.z)));
float l=log2(max(n,1e-9)*12.)*.63092975;float L=ceil(l);float w=L-l;
float sc=exp2(L*1.5849625);vec3 c=q/sc;
if(fract(L*.5)>.25)c=vec3(-c.x,-c.z,-c.y);
c+=C0;vec3 c0=c;bool od=fract(L*.5)>.25;vec3 b=abs(c)-.5;
float d=min(max(b.x,max(b.y,b.z)),0.)+length(max(b,0.));
float H=.5,lu=lod/sc;lv=-9.;wl=w;ck=vec3(0.);
for(int i=0;i<KMAX;i++){
float ho=H/3.;float hw=clamp(2.*ho/lu-1.,0.,1.);
if(i==KMAX-1)hw=min(hw,w);
if(hw<=0.)break;
vec3 e=abs(c);float m=min(max(e.y,e.z),min(max(e.x,e.z),max(e.x,e.y)));
float cc=ho*hw-m;if(cc>d){d=cc;lv=w-float(i);ck=(c0-c-C0)/(2.*H);if(od)ck=vec3(-ck.x,-ck.z,-ck.y);}
H/=3.;c-=clamp(floor(c/(2.*H)+.5),-1.,1.)*2.*H;}
return d*sc;}
float de(vec3 p,float lod){return deq(p*KS,lod*KS)/KS;}
void main(){
vec3 rd=normalize(F+R*v.x*T.x+U*(v.y-SH)*T.y);
float t=.02,d=1.,st=0.;bool hit=false;
for(int i=0;i<STEPS;i++){float pe=t*PX;d=de(E+rd*t,pe*${Q.lodk.toFixed(2)});if(d<pe*.55){hit=true;break;}t+=d*.96;st+=1.;if(t>6.)break;}
if(!hit&&t<6.)hit=true;
vec3 fog=vec3(.020,.039,.102);
float h=max(length(cross(E,rd)),.015),t0=-dot(E,rd),te=hit?t:6.;
float glow=(atan((te-t0)/h)-atan(-t0/h))/h;
vec3 col=fog;
if(hit){
vec3 p=E+rd*t;float pe=t*PX,e=pe*1.3,lo=pe*${Q.lodk.toFixed(2)};
de(p,lo);float lvh=lv;vec3 cell=floor(ck+.5);
vec2 k=vec2(1.,-1.);
float d1=de(p+k.xyy*e,lo),d2=de(p+k.yyx*e,lo),d3=de(p+k.yxy*e,lo),d4=de(p+k.xxx*e,lo);
vec3 n=normalize(k.xyy*d1+k.yyx*d2+k.yxy*d3+k.xxx*d4);
float cv=(d1+d2+d3+d4-4.*d)/(4.*e);
float oc=clamp(de(p+n*t*.07,lo)/(t*.07),0.,1.);
float ao=exp(-st*.028)*(.3+.7*oc);
float r2=dot(p,p),rr=sqrt(r2);vec3 L=-p/rr;
float fall=1./(1.+30.*r2);
vec3 kc=mix(vec3(1.,.8,.56),vec3(.6,.73,1.),smoothstep(.1,.5,rr));
float key=LT.x*max(dot(n,L),0.)*(.2+.8*oc)*fall*2.6;
float bounce=LT.x*fall*.12*oc;
float hd=max(dot(n,-rd),0.)/(1.+2.2*t*t);
float ap=dot(p,AXD);vec3 ax=p-AXD*ap;float ra=length(ax);
float amb=LT.y*max(dot(n,-ax/max(ra,1e-4)),0.)*exp(-ra*3.2)*smoothstep(-.05,.12,ap)*(1.-smoothstep(.85,1.3,ap));
vec3 steel=mix(vec3(.03,.055,.12),vec3(.11,.18,.33),clamp(1.+lvh*.25,0.,1.));
col=steel*(.13+1.1*hd)*ao+kc*(key+bounce)*ao+vec3(1.,.38,.1)*amb*ao*.55;
float hh=fract(sin(dot(vec3(abs(cell.x),cell.y-cell.z,abs(cell.y+cell.z)),vec3(12.9898,78.233,37.719)))*43758.5453);
float win=smoothstep(.972,.985,hh)*smoothstep(-5.8,-4.8,lvh)*(1.-smoothstep(-4.,-3.4,lvh))*(1.-oc)*(1.-oc);
col+=mix(vec3(1.,.55,.16),vec3(1.,.16,.1),step(.992,hh))*win*1.;
float rg=clamp(cv*.8,0.,1.)*smoothstep(-3.9,-2.1,lvh);
col+=vec3(.92,.95,1.)*rg*(.05+.75*hd+1.6*key+.8*amb)*(.35+.65*oc);
col=mix(col,fog,1.-exp(-t*.42));}
col+=vec3(1.,.76,.5)*glow*.011*LT.x;
vec2 vg=v*vec2(.85,1.);col*=1.-.22*dot(vg,vg);
gl_FragColor=vec4(1.-exp(-col*1.3),1.);}`;
const VS_FX = `attribute vec3 p;attribute vec2 uv;attribute vec4 c;uniform vec2 Z;varying vec2 vu;varying vec4 vc;
void main(){vu=uv;vc=c;gl_Position=vec4(p.x,p.y,Z.x*p.z+Z.y,p.z);}`;
const FS_FX = `precision mediump float;varying vec2 vu;varying vec4 vc;
void main(){float r=length(vu);float f=max(1.-r,0.);f*=f;float k=exp(-r*r*16.);
gl_FragColor=vec4((vc.rgb*(f*.55+k*.85)+vec3(k*k*.28))*vc.a,1.);}`;
/* post: radial zoom streaks toward the vanishing point and a chromatic split at the edges (boost and gates) */
const FS_PO = () => `precision mediump float;uniform sampler2D S;uniform vec2 C;uniform vec4 B;varying vec2 v;
void main(){vec2 uv=v*.5+.5;vec2 dv=uv-C;vec2 da=dv*vec2(B.w,1.);
vec2 ch=dv*B.y*dot(da,da)*3.;vec3 col=vec3(0.);float ws=0.;
for(int i=0;i<${Q.nb};i++){float k=float(i)/${Q.nb.toFixed(1)};vec2 o=uv-dv*B.x*k;float w=1.-k*.6;
col+=vec3(texture2D(S,o+ch).r,texture2D(S,o).g,texture2D(S,o-ch).b)*w;ws+=w;}
gl_FragColor=vec4(col/ws,1.);}`;
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
    P_FR = mkProg(VS_TRI, FS_FR(), ['p']);
    P_FX = mkProg(VS_FX, FS_FX, ['p', 'uv', 'c']);
    try { P_PO = mkProg(VS_TRI, FS_PO(), ['p']); } catch (e) { P_PO = null; }
    bTri = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bTri); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    bV = gl.createBuffer(); bC = gl.createBuffer(); bI = gl.createBuffer(); FB = null;
    return true;
  } catch (e) { console.warn(String((e && e.message) || e)); return false; }
}
function initGL() {
  try { gl = cv.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
  if (!gl) return false;
  // a lost context shows the poster underneath; on restore, rebuild and fade #gl back in after the next good frame
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); glOK = false; FB = null; cv.classList.remove('on'); });
  cv.addEventListener('webglcontextrestored', () => { glOK = glSetup(); reveal = glOK; });
  glOK = glSetup();
  return glOK;
}
function fbo(w, h) {
  if (!P_PO) return false;
  if (FB && FB.w === w && FB.h === h) return FB.ok;
  if (!FB) FB = { tex: gl.createTexture(), fb: gl.createFramebuffer(), w: 0, h: 0, ok: false };
  gl.bindTexture(gl.TEXTURE_2D, FB.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, FB.fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, FB.tex, 0);
  FB.ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  FB.w = w; FB.h = h;
  return FB.ok;
}
const POST = { blur: 0, chroma: 0 };
function drawGL() {
  if (!glOK || gl.isContextLost()) return;
  const w = cv.width, h = cv.height, post = POST.blur + POST.chroma > 0.0005 && fbo(w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, post ? FB.fb : null);
  gl.viewport(0, 0, w, h);
  gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
  gl.useProgram(P_FR);
  gl.uniform3f(P_FR.u.R, RX, RY, RZ); gl.uniform3f(P_FR.u.U, UX, UY, UZ); gl.uniform3f(P_FR.u.F, FX, FY, FZ); gl.uniform3f(P_FR.u.E, EX, EY, EZ);
  gl.uniform2f(P_FR.u.T, TXF, TYF); gl.uniform1f(P_FR.u.SH, SHIFT); gl.uniform1f(P_FR.u.KS, KS); gl.uniform1f(P_FR.u.PX, PXA);
  gl.uniform4f(P_FR.u.LT, LIGHT[0], LIGHT[1], 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, bTri); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  if (ni) {
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(P_FX); gl.uniform2f(P_FX.u.Z, PA, PB);
    gl.bindBuffer(gl.ARRAY_BUFFER, bV); gl.bufferData(gl.ARRAY_BUFFER, VB.subarray(0, nv * 5), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindBuffer(gl.ARRAY_BUFFER, bC); gl.bufferData(gl.ARRAY_BUFFER, CB.subarray(0, nv * 4), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, IB.subarray(0, ni), gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, ni, gl.UNSIGNED_SHORT, 0);
    gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
  }
  if (post) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    gl.useProgram(P_PO);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, FB.tex); gl.uniform1i(P_PO.u.S, 0);
    gl.uniform2f(P_PO.u.C, 0.5, 0.5 + SHIFT * 0.5); gl.uniform4f(P_PO.u.B, POST.blur, POST.chroma, 0, w / h);
    gl.bindBuffer(gl.ARRAY_BUFFER, bTri); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  if (reveal) { reveal = false; requestAnimationFrame(() => { if (glOK) cv.classList.add('on'); }); }
}
const LIGHT = [1, 0.5];
function setLight(t, ke) {
  LIGHT[0] = keyLight(t);
  LIGHT[1] = (0.35 + 0.3 * CY.ramp + 0.35 * ke) * (t > 2.2 ? 1 : sstep(IG0, IG0 + 1, t));
  POST.blur = 0.022 * CY.burst + 0.075 * ke;
  POST.chroma = 0.004 * CY.burst + 0.014 * ke;
}

/* ---------- poster: nested gates and the trails on a cheap 2D canvas (also the no-WebGL fallback) ---------- */
function proj(x, y, z) {
  const dx = x - EX, dy = y - EY, dz = z - EZ, vz = dx * FX + dy * FY + dz * FZ;
  if (vz < NEAR) return null;
  return [((dx * RX + dy * RY + dz * RZ) / (vz * TXF) * 0.5 + 0.5) * PXW, (0.5 - ((dx * UX + dy * UY + dz * UZ) / (vz * TYF) + SHIFT) * 0.5) * PXH, vz];
}
function drawPoster(c, w, h, t, photo) {
  const pr = w / Math.max(1, rt.cssW);
  REC = { lines: [], spr: [] };
  build(t, null, photo, w, h);
  const rec = REC; REC = null;
  c.fillStyle = '#050A1A'; c.fillRect(0, 0, w, h);
  // a square tunnel converging on x*: per level four wall faces, each a carpet of holes, nested by thirds
  const fz = FR.z - Math.floor(FR.z), HW = 0.27;
  const wp = (s, a, b) => { par(s * a, s * (DY + b * SQ2), s * (DZ + b * SQ2)); return proj(V3[0], V3[1], V3[2]); };
  // point on face f (0..3) at depth fraction u (geometric, s = sn 3^-u) and across-fraction v in [0,1]
  const fp = (f, sn, u, v) => { const s = sn * Math.pow(3, -u), x = HW * (2 * v - 1); return f === 0 ? wp(s, HW, x) : f === 1 ? wp(s, -HW, -x) : f === 2 ? wp(s, -x, HW) : wp(s, x, -HW); };
  const quad = (f, sn, u0, u1, v0, v1) => { const q = [fp(f, sn, u0, v0), fp(f, sn, u0, v1), fp(f, sn, u1, v1), fp(f, sn, u1, v0)]; if (q.some((x) => !x)) return false; c.beginPath(); c.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) c.lineTo(q[i][0], q[i][1]); c.closePath(); return true; };
  for (let k = 7; k >= 0; k--) {
    const dl = k + 1 - fz, sn = P3(dl - 1), u0 = sn > 0.94 ? Math.log(sn / 0.94) / Math.log(3) : 0;
    if (u0 >= 0.98) continue;
    const lum = Math.exp(-dl * 0.32), fogA = 0.5 + 0.38 * lum;
    for (let f = 0; f < 4; f++) {
      const sh = f < 2 ? 1 : 0.8;
      if (!quad(f, sn, u0, 1, 0, 1)) continue;
      c.fillStyle = `rgba(${Math.round(30 * sh * fogA)},${Math.round(47 * sh * fogA)},${Math.round(82 * sh * fogA)},1)`; c.fill();
      c.fillStyle = 'rgba(5,10,26,.84)';
      if (u0 < 1 / 3 && quad(f, sn, 1 / 3, 2 / 3, 1 / 3, 2 / 3)) c.fill();
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        if ((i === 1 && j === 1) || (i + 1 / 3) / 3 < u0) continue;
        if (quad(f, sn, (i + 1 / 3) / 3, (i + 2 / 3) / 3, (j + 1 / 3) / 3, (j + 2 / 3) / 3)) c.fill();
      }
      c.strokeStyle = `rgba(226,234,255,${(0.35 * lum).toFixed(3)})`; c.lineWidth = Math.max(1, pr * 1.2 * lum);
      if (u0 < 1 / 3 && quad(f, sn, 1 / 3, 2 / 3, 1 / 3, 2 / 3)) c.stroke();
    }
  }
  const vp = proj(0, 0, 0) || [w / 2, h / 2];
  const g = c.createRadialGradient(vp[0], vp[1], 0, vp[0], vp[1], Math.max(w, h) * 0.32);
  g.addColorStop(0, 'rgba(255,214,160,.6)'); g.addColorStop(0.12, 'rgba(255,170,90,.2)'); g.addColorStop(1, 'rgba(255,150,80,0)');
  c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.lineCap = 'round';
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

/* ---------- the runtime's live state, mapped onto this ride's fields ---------- */
const LV = { lean: 0, kick: 0, ring: -1 };
function liveOf(live) {
  if (!live) return null;
  LV.lean = live.lean * 1.3; LV.kick = live.boost; LV.ring = live.wave;
  return LV;
}
function draw(t, live, photo) {
  const lv = liveOf(live);
  build(t, lv, !!photo, cv.width, cv.height);
  setLight(t, lv ? lv.kick : 0);
  drawGL();
}

/* the prototype's name entrance: both ghost trails taillight red, independent of --acc2 (which also tints controls) */
let entered = false;
function entrance(tw, nm, tg) {
  const e = sstep(0.05, 1.15, tw), e2 = sstep(0.4, 1.5, tw);
  if (e >= 1 && e2 >= 1) { if (!entered) { entered = true; nm.style.cssText = ''; tg.style.cssText = ''; } return; }
  entered = false;
  const k = 1 - e;
  nm.style.opacity = (0.3 + 0.7 * e).toFixed(3);
  nm.style.transform = 'translate3d(' + (-0.45 * k).toFixed(3) + 'em,0,0)';
  nm.style.textShadow = (-0.22 * k).toFixed(3) + 'em 0 ' + (10 * k).toFixed(1) + 'px rgba(255,43,43,' + (0.55 * k).toFixed(3) + '),' + (-0.6 * k).toFixed(3) + 'em 0 ' + (22 * k).toFixed(1) + 'px rgba(255,43,43,' + (0.3 * k).toFixed(3) + '),0 2px 28px rgba(var(--hs),.8)';
  tg.style.opacity = (0.3 + 0.7 * e2).toFixed(3);
  tg.style.transform = 'translate3d(0,' + ((1 - e2) * 10).toFixed(1) + 'px,0)';
}

const T_STILL = 4.3;
return {
  id: 'scale-invariant', title: 'Scale Invariant',
  caption: 'The ride dives two levels of self-similarity per acceleration cycle: a Menger sponge is 20 copies of itself at one third the scale, so its fractal dimension is log 20 / log 3 ≈ 2.727.',
  DURATION, T_STILL, hintAt: 6.5, Q,
  initGL,
  draw,
  poster(ctx, w, h, t, photo) { drawPoster(ctx, w, h, t, !!photo); },
  entrance
};
};
