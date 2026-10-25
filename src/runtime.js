/* MaxMartinelli.com ride runtime.
   The shell picked a ride before first paint (html[data-ride]). This runtime builds that ride's engine and owns
   everything the four rides share: canvas sizing and adaptive resolution, the clock, seek/play, pause, off-screen and
   hidden-tab pausing, hold-to-accelerate input, the "Hold to accelerate" hint, the name entrance, and the
   poster / no-WebGL / reduced-motion fallbacks. The site is silent: there is no audio anywhere.
   See ENGINE_API.md for the engine contract. */
(function () {
'use strict';
const W = window, D = document, root = D.documentElement;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const u = sat((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const smoother = (u) => { u = sat(u); return u * u * u * (u * (u * 6 - 15) + 10); };
const mod = (a, m) => ((a % m) + m) % m;
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (n) => { n = Math.imul((n | 0) ^ 0x9E3779B9, 0x85EBCA6B); n ^= n >>> 13; n = Math.imul(n, 0xC2B2AE35); n ^= n >>> 16; return (n >>> 0) / 4294967296; };
const REDUCED = W.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = W.matchMedia('(pointer: coarse)').matches;
const PHONE = COARSE || W.innerWidth < 700;

const $ = (id) => D.getElementById(id);
const hero = $('top'), cv = $('gl'), pc = $('pc'), deco = $('deco'), nm = $('nm'), tg = $('tg'), pz = $('pz'), hn = $('hn');
const idb = hero.querySelector('.id');
const ENG = W.MM_ENGINES || {};

/* ---------- the ride ---------- */
let cssW = 1, cssH = 1;
const rt = {
  W, D, TAU, clamp, sat, sstep, smoother, mod, mulberry32, hash, REDUCED, COARSE, PHONE,
  hero, cv, pc, deco, nm, tg, idBlock: idb,
  get cssW() { return cssW; }, get cssH() { return cssH; },
  /* the name/tagline/nav block in CSS px relative to the hero (for text-safe masks); tight = union of the glyphs */
  textBox(tight) {
    const h = hero.getBoundingClientRect();
    let L = 1e9, T = 1e9, R = -1e9, B = -1e9;
    const add = (r) => { if (r.width > 0 && r.height > 0) { L = Math.min(L, r.left); T = Math.min(T, r.top); R = Math.max(R, r.right); B = Math.max(B, r.bottom); } };
    if (tight) {
      const rg = D.createRange();
      [nm, tg].forEach((el) => { const w = D.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (!n.nodeValue.trim()) continue; rg.selectNodeContents(n); for (const r of rg.getClientRects()) add(r); } });
      idb.querySelectorAll('nav a').forEach((a) => add(a.getBoundingClientRect()));
    }
    if (R < L) add(idb.getBoundingClientRect());
    return { x: L - h.left, y: T - h.top, w: R - L, h: B - T, W: h.width, H: h.height };
  },
  /* re-ink the hero from render(t): any of hf (CSS colour), hs ("r,g,b"), hb (CSS colour); null restores the theme */
  /* keys: hf text, hs scrim "r,g,b", hb control borders, ha control accent, hfoc focus ring, hh nav hover text */
  heroInk(v) { const s = hero.style, K = ['hf', 'hs', 'hb', 'ha', 'hfoc', 'hh']; if (!v) { K.forEach((k) => s.removeProperty('--' + k)); return; } K.forEach((k) => { if (v[k]) s.setProperty('--' + k, v[k]); }); }
};
let RIDE = root.getAttribute('data-ride'), E = null;
const order = [RIDE].concat(Object.keys(ENG).filter((k) => k !== RIDE));
for (const id of order) {
  if (typeof ENG[id] !== 'function') continue;
  try { E = ENG[id](rt); RIDE = id; break; } catch (err) { console.error('ride ' + id + ' failed to build', err); E = null; }
}
if (!E) { hero.classList.add('still'); return; }
root.setAttribute('data-ride', RIDE);
if (E.css) { const st = D.createElement('style'); st.textContent = E.css; D.body.appendChild(st); }
const rn = $('ride-name'), rnote = $('ride-note');
if (rn) rn.textContent = E.title || RIDE;
if (rnote) rnote.textContent = E.caption || '';
const DURATION = E.DURATION || 20, T_STILL = E.T_STILL != null ? E.T_STILL : 6, HINT_AT = E.hintAt != null ? E.hintAt : 6;
const PR = (E.Q && E.Q.pr) || (PHONE ? 1.5 : 2);

/* ---------- canvases ---------- */
let glOK = false, glShown = false;
function sizeCanvas(s) {
  const r = hero.getBoundingClientRect(); cssW = Math.max(1, r.width); cssH = Math.max(1, r.height);
  const pr = Math.min(W.devicePixelRatio || 1, PR), w = Math.max(2, Math.round(cssW * pr * s)), h = Math.max(2, Math.round(cssH * pr * s));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; if (E.resize) E.resize(w, h); }
}
function drawPoster(t, photo) {
  const r = hero.getBoundingClientRect(), pr = Math.min(W.devicePixelRatio || 1, 2);
  const w = Math.max(2, Math.round(r.width * pr)), h = Math.max(2, Math.round(r.height * pr));
  if (pc.width !== w || pc.height !== h) { pc.width = w; pc.height = h; }
  const ctx = pc.getContext('2d');
  if (ctx && E.poster) { try { E.poster(ctx, w, h, t, !!photo); } catch (err) { console.error(err); } }
}
function fail(err) {
  if (err) console.error(err);
  glOK = false; cv.classList.remove('on'); hero.classList.add('still');
  drawPoster(T_STILL, true); entrance(99);
}
function drawGL(t, live, photo) {
  try { E.draw(t, live, !!photo); } catch (err) { fail(err); return; }
  if (!glShown) { glShown = true; requestAnimationFrame(() => cv.classList.add('on')); }
}

/* ---------- name entrance and hint ---------- */
function rgbOf(v, fb) {
  v = (v || '').trim(); let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255); }
  m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) return m[1].split('').map((c) => parseInt(c + c, 16)).join(',');
  return fb;
}
const CS = getComputedStyle(root);
const GH1 = rgbOf(CS.getPropertyValue('--hot'), '255,43,43'), GH2 = rgbOf(CS.getPropertyValue('--acc2'), '111,168,255');
let entered = false, hintGone = false;
function entrance(tw) {
  if (E.entrance) { E.entrance(tw, nm, tg); return; }
  const e = sstep(0.05, 1.15, tw), e2 = sstep(0.4, 1.5, tw);
  if (e >= 1 && e2 >= 1) { if (!entered) { entered = true; nm.style.cssText = ''; tg.style.cssText = ''; } return; }
  entered = false;
  const k = 1 - e;
  nm.style.opacity = (0.3 + 0.7 * e).toFixed(3);
  nm.style.transform = 'translate3d(' + (-0.45 * k).toFixed(3) + 'em,0,0)';
  nm.style.textShadow = (-0.22 * k).toFixed(3) + 'em 0 ' + (10 * k).toFixed(1) + 'px rgba(' + GH1 + ',' + (0.55 * k).toFixed(3) + '),' + (-0.6 * k).toFixed(3) + 'em 0 ' + (22 * k).toFixed(1) + 'px rgba(' + GH2 + ',' + (0.3 * k).toFixed(3) + '),0 2px 28px rgba(var(--hs),.8)';
  tg.style.opacity = (0.3 + 0.7 * e2).toFixed(3);
  tg.style.transform = 'translate3d(0,' + ((1 - e2) * 10).toFixed(1) + 'px,0)';
}
function hideHint() { if (!hintGone) { hintGone = true; hn.classList.add('gone'); } }

/* ---------- clock, render(t), seek/play ---------- */
let mode = 'live', paused = false, inView = true, tLive = 0, tSeek = 0, lastNow = 0, rafId = 0;
const t0wall = performance.now();
let lean = 0, leanT = 0, holding = false, held = 0, burst = 0, warp = 1, drag = false, dragX = 0, pressAt = -1e9, relAt = -1e9, relLvl = 0;
const LIVE = { lean: 0, warp: 1, boost: 0, wave: 1e9, down: 0, holding: false };
let scale = (E.Q && +E.Q.scale0) || (PHONE ? 0.85 : 1), ema = 16.7, goodMs = 0, lastStep = 0;
/* render(t): a pure function of t (no lean, no boost) */
function render(t, photo) {
  if (glOK) drawGL(t, null, !!photo); else drawPoster(t, !!photo);
  entrance(t);
}
const running = () => mode === 'live' && !paused && inView && !D.hidden && glOK && !REDUCED;
function frame(now) {
  rafId = 0;
  if (!running()) return;
  const dms = lastNow ? now - lastNow : 16.7, dt = Math.min(0.25, dms / 1000); lastNow = now;
  adapt(dms, now); // resize before drawing: a resize after the draw would present a cleared (black) frame
  lean += (leanT - lean) * (1 - Math.exp(-dt / 0.18));
  /* boost: time warp eases in from 1x to 4x over 1.2 s and creeps toward 5x while held; a tap gives a 0.6 s burst;
     on release everything eases back over about a second */
  if (holding || burst > 0) {
    held += dt; if (!holding) burst = Math.max(0, burst - dt);
    const e = Math.min(1, held / 1.2);
    warp = Math.max(warp, Math.min(5, 1 + 3 * Math.pow(e, 1.5) + 0.5 * Math.max(0, held - 1.2)));
  } else warp = 1 + (warp - 1) * Math.exp(-dt / 0.3);
  if (E.warpCap) { const c = E.warpCap(tLive); if (warp > c) warp = Math.max(1, c); }
  tLive += dt * warp;
  LIVE.lean = lean; LIVE.warp = warp; LIVE.boost = sat((warp - 1) / 3); LIVE.wave = (now - pressAt) / 1000; LIVE.holding = holding;
  const rel = (now - relAt) / 1000; LIVE.down = rel < 2 ? relLvl * Math.sin(Math.PI * Math.min(1, rel / 0.7)) * Math.exp(-rel / 0.6) : 0;
  drawGL(tLive, LIVE, false);
  if (!glOK) return;
  entrance((now - t0wall) / 1000);
  if (!hintGone && tLive > HINT_AT) hideHint();
  rafId = requestAnimationFrame(frame);
}
function kickLoop() {
  if (!running()) {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0; lastNow = 0;
    return;
  }
  if (!rafId) { lastNow = 0; rafId = requestAnimationFrame(frame); }
}
function adapt(dms, now) {
  ema += (dms - ema) * 0.1;
  if (ema > 20 && scale > 0.5 && now - lastStep > 500) { scale = Math.max(0.5, Math.round((scale - 0.1) * 10) / 10); lastStep = now; goodMs = 0; sizeCanvas(scale); }
  else if (ema < 12) { goodMs += dms; if (goodMs > 2000 && scale < 1) { scale = Math.min(1, Math.round((scale + 0.1) * 10) / 10); goodMs = 0; lastStep = now; sizeCanvas(scale); } }
  else goodMs = 0;
}
function still() { if (!glOK) { drawPoster(T_STILL, true); entrance(99); return; } sizeCanvas(1); drawGL(T_STILL, null, true); entrance(99); }
function redraw() {
  if (REDUCED || !glOK) { still(); return; }
  if (mode === 'manual') { sizeCanvas(1); render(tSeek); return; }
  sizeCanvas(scale); drawGL(tLive, LIVE, false); entrance(99);
}
window.DURATION = DURATION;
window.seek = function (t) {
  mode = 'manual'; if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  tSeek = clamp(+t || 0, 0, 1e7);
  if (glOK) sizeCanvas(1);
  render(tSeek);
  return new Promise((res) => { let done = false; const fin = () => { if (!done) { done = true; res(); } }; requestAnimationFrame(fin); setTimeout(fin, 150); });
};
window.play = function () { if (mode === 'manual') { tLive = tSeek; mode = 'live'; if (glOK) sizeCanvas(scale); } kickLoop(); };
window.render = (t) => render(+t || 0);
window.MM_RIDE = RIDE; window.MM_STILL = T_STILL; // which ride loaded, and its still frame (tools/make-images.mjs)

/* ---------- pause, visibility, resize ---------- */
pz.addEventListener('click', () => {
  paused = !paused; pz.setAttribute('aria-pressed', String(paused));
  pz.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
  if (!paused) { if (mode === 'manual') { tLive = tSeek; mode = 'live'; if (glOK) sizeCanvas(scale); } kickLoop(); } else release();
});
if ('IntersectionObserver' in W) new IntersectionObserver((es) => { inView = es[es.length - 1].isIntersecting; if (!inView) release(); kickLoop(); }, { threshold: 0 }).observe(hero);
D.addEventListener('visibilitychange', () => { release(); kickLoop(); });
let rzT = 0;
W.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(redraw, 90); }); // same seed; a resize only redraws

/* ---------- live-only input: lean and hold-to-accelerate ---------- */
const isUI = (e) => e.target && e.target.closest && e.target.closest('a,button');
function press() {
  if (holding || !running()) return;
  holding = true; burst = 0;
  held = warp > 1.01 ? 1.2 * Math.pow(Math.min(1, (warp - 1) / 3), 1 / 1.5) : 0;
  pressAt = performance.now(); hideHint();
}
function release() {
  if (!holding) return;
  holding = false;
  if (held < 0.6) burst = 0.6 - held; else { relAt = performance.now(); relLvl = LIVE.boost; }
}
hero.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') { const r = hero.getBoundingClientRect(); leanT = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1); }
  else if (drag) leanT = clamp((e.clientX - dragX) / 110, -1, 1);
}, { passive: true });
hero.addEventListener('pointerdown', (e) => {
  if (isUI(e) || (e.pointerType === 'mouse' && e.button !== 0)) return;
  press();
  if (e.pointerType !== 'mouse') { drag = true; dragX = e.clientX - leanT * 110; }
});
const endP = (e) => { release(); if (e.pointerType !== 'mouse') { drag = false; leanT = 0; } };
hero.addEventListener('pointerup', endP); hero.addEventListener('pointercancel', endP);
hero.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { leanT = 0; release(); } });
hero.addEventListener('contextmenu', (e) => { if (!isUI(e)) e.preventDefault(); });
const spaceOK = () => running() && (D.activeElement === D.body || !D.activeElement) && hero.getBoundingClientRect().bottom > W.innerHeight * 0.5;
W.addEventListener('keydown', (e) => { if (e.code === 'Space' && spaceOK()) { e.preventDefault(); press(); } });
W.addEventListener('keyup', (e) => { if (e.code === 'Space') release(); });
W.addEventListener('blur', release);
D.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const id = a.getAttribute('href').slice(1), el = id && D.getElementById(id);
  if (!el) return;
  e.preventDefault();
  el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  try { history.replaceState(null, '', '#' + id); } catch (err) { /* sandboxed frame */ }
  const f = id === 'top' ? D.querySelector('.skip') : el.querySelector('h2') || el;
  if (f && id !== 'top') { f.setAttribute('tabindex', '-1'); f.focus({ preventScroll: true }); }
}));
/* take another ride: a different ride on the next load */
const again = $('again');
if (again) again.addEventListener('click', () => {
  const ids = Object.keys(ENG).filter((k) => k !== RIDE);
  if (!ids.length) return;
  const next = ids[Math.floor(Math.random() * ids.length)];
  try { W.sessionStorage.setItem('mm-next', next); } catch (err) { /* storage blocked: the reload still avoids repeating this ride */ }
  if (ENG[(location.hash || '').slice(1)]) { try { history.replaceState(null, '', location.pathname + location.search); } catch (err) { /* sandboxed frame */ } }
  W.scrollTo(0, 0);
  W.location.reload();
});

/* ---------- start: poster first, then WebGL ---------- */
sizeCanvas(REDUCED ? 1 : scale);
if (REDUCED) hero.classList.add('still');
drawPoster(REDUCED ? T_STILL : 0, REDUCED);
entrance(REDUCED ? 99 : 0);
try { glOK = !!E.initGL(); } catch (err) { console.error(err); glOK = false; }
if (!glOK) fail();
else if (REDUCED) still();
else kickLoop();
})();
