// engine-contract.mjs: load every ride engine in a sandbox (no browser) and check it honours docs/ENGINE_API.md:
// it registers under its own id, returns the required hooks with the right types, and its 2D poster (the no-WebGL
// fallback) draws at several times without throwing. Prints one line per ride; exit 1 on any failure.
// usage: node tools/engine-contract.mjs [id ...]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IDS = process.argv.slice(2).length ? process.argv.slice(2) : JSON.parse(fs.readFileSync(path.join(ROOT, 'rides.json'), 'utf8'));

/* anything-goes stand-in for DOM objects and 2D contexts: every property is callable and chainable */
const any = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'length' ? 0 : any()),
  set: () => true, apply: () => any(), construct: () => any(),
});
function element(tag = 'div') {
  return {
    tagName: tag.toUpperCase(), style: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    width: 300, height: 150, children: [], dataset: {},
    getContext: () => null, getBoundingClientRect: () => ({ left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720, x: 0, y: 0 }),
    getClientRects: () => [], querySelector: () => null, querySelectorAll: () => [], appendChild: (c) => c, removeChild() {},
    insertAdjacentHTML() {}, setAttribute() {}, removeAttribute() {}, getAttribute: () => null, addEventListener() {}, removeEventListener() {},
    closest: () => null, contains: () => false, textContent: '', innerHTML: '',
  };
}
const ctx2d = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' && /^(canvas)$/.test(k) ? element('canvas') : (...a) => (k === 'measureText' ? { width: 10 } : k === 'getImageData' || k === 'createImageData' ? { data: new Uint8ClampedArray(16), width: 2, height: 2 } : any())), set: (t, k, v) => { t[k] = v; return true; } });

const failures = [];
for (const id of IDS) {
  const fail = (m) => { failures.push(`${id}: ${m}`); };
  const file = path.join(ROOT, 'src', 'engines', id + '.js');
  if (!fs.existsSync(file)) { fail('missing ' + path.relative(ROOT, file)); continue; }
  const doc = {
    documentElement: element('html'), body: element('body'), hidden: false, fonts: { ready: Promise.resolve() },
    createElement: (t) => { const e = element(t); if (t === 'canvas') e.getContext = (k) => (k === '2d' ? ctx2d() : null); return e; },
    createRange: () => ({ selectNodeContents() {}, getClientRects: () => [] }), createTreeWalker: () => ({ nextNode: () => null }),
    getElementById: () => element(), querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
  };
  const win = {
    MM_ENGINES: {}, document: doc, devicePixelRatio: 2, innerWidth: 1280, innerHeight: 800, navigator: { userAgent: 'node', hardwareConcurrency: 8 },
    matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout: () => 0, clearTimeout() {}, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    performance: { now: () => 0 }, location: { hash: '' }, console,
  };
  win.window = win;
  const sb = vm.createContext({ window: win, document: doc, navigator: win.navigator, performance: win.performance, console, matchMedia: win.matchMedia, requestAnimationFrame: win.requestAnimationFrame, getComputedStyle: win.getComputedStyle, setTimeout: win.setTimeout, clearTimeout: win.clearTimeout });
  try { vm.runInContext(fs.readFileSync(file, 'utf8'), sb, { filename: file }); }
  catch (e) { fail('script threw while loading: ' + e.message); continue; }
  const keys = Object.keys(win.MM_ENGINES);
  if (keys.length !== 1 || keys[0] !== id) { fail(`registers ${JSON.stringify(keys)}, expected ["${id}"]`); continue; }
  if (typeof win.MM_ENGINES[id] !== 'function') { fail('window.MM_ENGINES[id] is not a function'); continue; }

  const TAU = Math.PI * 2, sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const rt = {
    W: win, D: doc, TAU, clamp: (x, a, b) => (x < a ? a : x > b ? b : x), sat,
    sstep: (a, b, x) => { const u = sat((x - a) / (b - a)); return u * u * (3 - 2 * u); },
    smoother: (u) => { u = sat(u); return u * u * u * (u * (u * 6 - 15) + 10); }, mod: (a, m) => ((a % m) + m) % m,
    mulberry32: (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; },
    hash: (n) => { n = Math.imul((n | 0) ^ 0x9E3779B9, 0x85EBCA6B); n ^= n >>> 13; n = Math.imul(n, 0xC2B2AE35); n ^= n >>> 16; return (n >>> 0) / 4294967296; },
    REDUCED: false, COARSE: false, PHONE: false,
    hero: element('header'), cv: element('canvas'), pc: element('canvas'), deco: element('div'), nm: element('h1'), tg: element('p'), idBlock: element('div'),
    cssW: 1280, cssH: 720, textBox: () => ({ x: 80, y: 360, w: 640, h: 300, W: 1280, H: 720 }), heroInk() {},
  };
  let E;
  try { E = win.MM_ENGINES[id](rt); } catch (e) { fail('factory threw: ' + e.message); continue; }
  if (!E || typeof E !== 'object') { fail('factory did not return an object'); continue; }
  const need = { id: 'string', title: 'string', caption: 'string', DURATION: 'number', T_STILL: 'number', initGL: 'function', draw: 'function', poster: 'function' };
  for (const [k, t] of Object.entries(need)) if (typeof E[k] !== t) fail(`${k} should be a ${t}, got ${typeof E[k]}`);
  const optional = { hintAt: 'number', Q: 'object', resize: 'function', warpCap: 'function', entrance: 'function', css: 'string' };
  for (const [k, t] of Object.entries(optional)) if (E[k] !== undefined && typeof E[k] !== t) fail(`${k} should be a ${t} when present, got ${typeof E[k]}`);
  for (const k of ['accent', 'lam']) if (k in E) fail(`${k}() is a retired sound hook; the site is silent`);
  if (E.id !== id) fail(`id is "${E.id}", expected "${id}"`);
  if (!(E.title || '').trim() || !(E.caption || '').trim()) fail('title and caption must be non-empty (the footer shows them)');
  if (/<[a-z]/i.test(E.caption || '')) fail('caption must be plain text');
  if (!(E.DURATION > 0)) fail('DURATION must be > 0');
  if (!(E.T_STILL >= 0)) fail('T_STILL must be >= 0');
  if (E.Q && E.Q.pr !== undefined && !(E.Q.pr > 0 && E.Q.pr <= 3)) fail('Q.pr should be a pixel-ratio cap in (0, 3]');
  if (E.warpCap) for (const t of [0, 5.9, 6, 6.2, 12, 30]) { const c = E.warpCap(t); if (!(c >= 1)) fail(`warpCap(${t}) = ${c}; must be >= 1`); }
  for (const t of [0, E.T_STILL, E.DURATION * 0.5, E.DURATION, E.DURATION * 3.7]) {
    try { E.poster(ctx2d(), 1280, 720, t, true); E.poster(ctx2d(), 390, 640, t, false); }
    catch (e) { fail(`poster(t=${t}) threw: ${e.message}`); break; }
  }
  if (!failures.some((f) => f.startsWith(id + ':'))) console.log(`ok  ${id.padEnd(16)} "${E.title}"  DURATION ${E.DURATION}s  still ${E.T_STILL}s${E.warpCap ? '  warpCap' : ''}${E.entrance ? '  entrance' : ''}${E.css ? '  css' : ''}`);
}
for (const f of failures) console.log('FAIL ' + f);
process.exit(failures.length ? 1 : 0);
