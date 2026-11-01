// preview.mjs: screenshots and visual checks of each ride (today one, Many Worlds), served from public/ like Cloudflare Pages.
//
// usage: node tools/preview.mjs [--ride=ID] [--out=preview] [--flash] [--hold] [--scans-only] [--quick] [--frames=6] [--wait=2600]
//   --ride   one ride (default: all in rides.json)  --flash  scan the hero's whole DURATION (Many Worlds: the 48 s loop) at
//                                                           normal speed for flashing (slow); --secs=N scans the first N s
//   --quick  skip the stitched full-page images    --hold   scan 20 s of holding to accelerate for flashing (slow): the
//   --wait   ms of playback before "rest" shots             runtime's ramp to 5x, each ride's warpCap, live boost/intent
//   --scans-only  skip the screenshots and run only --flash / --hold
//
// Writes <out>/<ride>/:
//   desktop-rest.png, phone-rest.png         what a visitor sees a few seconds after load
//   desktop-frames.png, phone-frames.png     contact sheet of hero frames via window.seek(t), same t as docs/reference/:
//                                            the ride's MM_SHOTS (Many Worlds: mid-world, one per world), else --frames spread
//   desktop-page.png, phone-page.png         the whole page, stitched (not with --quick), with the Lab map's dots
//                                            landed and its tour paused, so the shots repeat
//   desktop-reduced.png, phone-reduced.png   prefers-reduced-motion still
//   report.json                              problems (must fix), warnings, measurements
// and <out>/summary.json. Exit 1 if any ride has problems.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, RIDES, launch, routeRequests, sleep } from './browser.mjs';
import { startSiteServer } from './serve.mjs';

const require = createRequire(import.meta.url);
const opts = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const IDS = opts.ride ? [opts.ride] : RIDES;
const OUT = path.resolve(opts.out || path.join(ROOT, 'preview'));
const FRAMES = Math.max(2, Number(opts.frames || 6));
const WAIT = Number(opts.wait || 2600);
const VPS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];

const site = await startSiteServer(path.join(ROOT, 'public'));
const browser = await launch();
const summary = {};

async function composeGrid(images, cols, cellW, outPath, labels) {
  const page = await browser.newPage({ viewport: { width: cols * cellW + (cols + 1) * 8, height: 400 } });
  const cells = images.map((b, i) => `<figure><img src="data:image/png;base64,${b.toString('base64')}"><figcaption>${labels[i] || ''}</figcaption></figure>`).join('');
  await page.setContent(`<style>body{margin:0;background:#222;font:12px monospace;color:#ddd}main{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:8px;padding:8px}figure{margin:0}img{width:${cellW}px;display:block}figcaption{padding:2px 0}</style><main>${cells}</main>`);
  await page.waitForLoadState('load');
  await page.screenshot({ path: outPath, fullPage: true });
  await page.close();
}
/* full page from viewport-sized shots, each placed at the scroll offset it was taken at (a real fullPage capture would
   resize the viewport and re-lay-out the vh-sized hero) */
async function stitch(shots, cssW, docH, width, outPath) {
  const k = width / cssW, page = await browser.newPage({ viewport: { width, height: 400 } });
  const imgs = shots.map((s) => `<img style="position:absolute;left:0;top:${Math.round(s.y * k)}px;width:${width}px" src="data:image/png;base64,${s.buf.toString('base64')}">`).join('');
  await page.setContent(`<style>body{margin:0;background:#222}main{position:relative;height:${Math.round(docH * k)}px;overflow:hidden}</style><main>${imgs}</main>`);
  await page.waitForLoadState('load');
  await page.screenshot({ path: outPath, fullPage: true });
  await page.close();
}
/* mean linear luminance of each cell of a 3x3 grid */
function cellLuminance(pngBuf, n = 3) {
  const { PNG } = require('pngjs');
  const { width, height, data } = PNG.sync.read(pngBuf);
  const sums = new Array(n * n).fill(0), counts = new Array(n * n).fill(0);
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  for (let y = 0; y < height; y += 4) for (let x = 0; x < width; x += 4) {
    const i = (y * width + x) * 4, cell = Math.min(n - 1, Math.floor((y / height) * n)) * n + Math.min(n - 1, Math.floor((x / width) * n));
    sums[cell] += 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]); counts[cell]++;
  }
  return sums.map((s, i) => s / counts[i]);
}

/* WCAG 2.3.1 general flash: a flash is a pair of opposing changes of >= 0.1 relative luminance where the darker state is
   below 0.8. Counted per cell of a 3x3 grid (mean linear luminance); worst count of flashes in any 1 s window. The area
   criterion is not modelled, so this errs on the strict side. */
function worstFlashes(series, fps) {
  let worst = { flashes: 0, cell: -1, at: 0 };
  for (let c = 0; c < 9; c++) {
    const L = series.map((s) => s[c]), trans = [];
    let ext = L[0], d0 = 0;
    for (let k = 1; k < L.length; k++) {
      const d = L[k] - ext;
      if (d0 >= 0 && L[k] > ext) { ext = L[k]; d0 = 1; continue; }
      if (d0 <= 0 && L[k] < ext) { ext = L[k]; d0 = -1; continue; }
      if (Math.abs(d) >= 0.1 && Math.min(L[k], ext) < 0.8) { trans.push(k / fps); ext = L[k]; d0 = d > 0 ? 1 : -1; }
    }
    for (const t0 of trans) { const fl = Math.floor(trans.filter((x) => x >= t0 && x < t0 + 1).length / 2); if (fl > worst.flashes) worst = { flashes: fl, cell: c, at: +t0.toFixed(3) }; }
  }
  return worst;
}

for (const id of IDS) {
  const dir = path.join(OUT, id);
  fs.mkdirSync(dir, { recursive: true });
  const report = { ride: id, problems: [], warnings: [], info: {} };
  const problem = (m) => { if (!report.problems.includes(m)) report.problems.push(m); };
  const warn = (m) => { if (!report.warnings.includes(m)) report.warnings.push(m); };
  const newCtx = async (vp, reducedMotion = 'no-preference') => {
    const ctx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.deviceScaleFactor, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, reducedMotion });
    ctx.setDefaultTimeout(180000);
    await ctx.addInitScript(() => { window.__raf = 0; const o = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => o((ts) => { window.__raf++; cb(ts); }); });
    await routeRequests(ctx, site.url, (r) => problem('external request outside Google Fonts: ' + r));
    return ctx;
  };
  const logs = (page, tag) => {
    page.on('pageerror', (e) => problem(`[${tag}] JS error: ${String(e.message || e).slice(0, 300)}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test((m.location() || {}).url || '')) problem(`[${tag}] console.error: ${m.text().slice(0, 300)}`); });
  };
  const url = `${site.url}/#${id}`;

  for (const vp of opts['scans-only'] ? [] : VPS) {
    const ctx = await newCtx(vp), page = await ctx.newPage();
    logs(page, vp.name);
    await page.goto(url, { waitUntil: 'load' });
    await sleep(WAIT);
    await page.screenshot({ path: path.join(dir, `${vp.name}-rest.png`) });
    const f = await page.evaluate(() => {
      const de = document.documentElement, hidden = [];
      for (const el of document.querySelectorAll('h1,h2,h3,p,li,a,button')) {
        const txt = (el.innerText || '').trim();
        if (txt.length < 3 || !el.getClientRects().length || el.closest('[aria-hidden="true"]')) continue;
        let op = 1, n = el; while (n && n.nodeType === 1) { op *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
        if (op < 0.2 || getComputedStyle(el).visibility === 'hidden') hidden.push(`${el.tagName.toLowerCase()} "${txt.slice(0, 40)}"`);
      }
      return { ride: window.MM_RIDE, sw: de.scrollWidth, cw: de.clientWidth, h: de.scrollHeight, seek: typeof window.seek === 'function', dur: window.DURATION, hidden: hidden.slice(0, 8), fonts: [...new Set([...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family))] };
    });
    report.info[vp.name] = { docHeight: f.h, fontsLoaded: f.fonts };
    if (f.ride !== id) problem(`[${vp.name}] loaded ride ${f.ride}, expected ${id}`);
    if (f.sw > f.cw + 1) problem(`[${vp.name}] horizontal overflow: ${f.sw}px wide in a ${f.cw}px viewport`);
    if (f.hidden.length) warn(`[${vp.name}] text not visible at rest: ${f.hidden.join(' | ')}`);
    if (!f.seek || typeof f.dur !== 'number') problem(`[${vp.name}] window.seek(t) / window.DURATION missing`);
    await page.evaluate(() => { window.MM_FRAMES = 0; }); await sleep(2000);   // MM_FRAMES: the hero's live frames
    report.info[vp.name].framesPerSecondAtTop = Math.round((await page.evaluate(() => window.MM_FRAMES)) / 2);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(600);
    await page.evaluate(() => { window.MM_FRAMES = 0; }); await sleep(1000);
    const off = await page.evaluate(() => window.MM_FRAMES);
    report.info[vp.name].framesPerSecondOffScreen = off;
    if (off > 8) problem(`[${vp.name}] animation keeps running with the hero off-screen (${off} frames/s)`);
    if (!opts.quick) {
      // the Lab's Sweet Spots map: let its dots land and pause its tour, so the page shots come out the same every run
      await page.evaluate(() => { const b = document.getElementById('ssBox'); if (b) b.scrollIntoView({ block: 'center', behavior: 'instant' }); });
      const landed = await page.waitForFunction(() => { const b = document.getElementById('ssBox'); return !b || ['play', 'tour'].includes(b.dataset.state); }, null, { timeout: 60000 }).then(() => true, () => false);
      if (!landed) warn(`[${vp.name}] the Lab map's fly-in did not finish`);
      await page.evaluate(() => { const t = document.getElementById('ssTour'); if (t && !t.hidden && t.dataset.on === '1') t.click(); });
      await sleep(900);
      const shots = [], vh = vp.viewport.height, n = Math.min(10, Math.ceil(f.h / vh));
      for (let i = 0; i < n; i++) {
        const y = await page.evaluate((y) => { window.scrollTo({ top: y, behavior: 'instant' }); return window.scrollY; }, i * vh);
        await sleep(350); shots.push({ y, buf: await page.screenshot() });
      }
      await stitch(shots, vp.viewport.width, f.h, vp.name === 'phone' ? 390 : 720, path.join(dir, `${vp.name}-page.png`));
    }
    if (f.seek && f.dur) {
      const listed = await page.evaluate(() => window.MM_SHOTS), shots = [];
      const ts = Array.isArray(listed) && listed.length ? listed : Array.from({ length: FRAMES }, (_, i) => +(f.dur * (0.04 + 0.92 * i / (FRAMES - 1))).toFixed(2));
      for (const t of ts) {
        await page.evaluate(async (t) => { window.scrollTo({ top: 0, behavior: 'instant' }); await window.seek(t); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, t);
        shots.push(await page.screenshot());
      }
      await composeGrid(shots, vp.name === 'phone' ? ts.length : ts.length > 6 ? 4 : 3, vp.name === 'phone' ? 195 : 480, path.join(dir, `${vp.name}-frames.png`), ts.map((t) => `t=${t}s`));
    }
    await ctx.close();

    const rctx = await newCtx(vp, 'reduce'), rpage = await rctx.newPage();
    logs(rpage, vp.name + '/reduced');
    await rpage.goto(url, { waitUntil: 'load' }); await sleep(1500);
    await rpage.screenshot({ path: path.join(dir, `${vp.name}-reduced.png`) });
    await rpage.evaluate(() => { window.__raf = 0; }); await sleep(1000);
    const rr = await rpage.evaluate(() => window.__raf);
    report.info[vp.name].framesPerSecondReducedMotion = rr;
    if (rr > 8) problem(`[${vp.name}] animation runs under prefers-reduced-motion (${rr} frames/s)`);
    await rctx.close();
  }

  if (opts.flash) {   // WCAG 2.3.1: no more than 3 flashes in any 1 s window, per cell of a 3x3 grid, over 20 s at 20 fps
    const ctx = await newCtx({ viewport: { width: 720, height: 450 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
    logs(page, 'flash');
    await page.goto(url, { waitUntil: 'load' }); await sleep(WAIT);
    const dur = Math.min(await page.evaluate(() => window.DURATION), +opts.secs || 1e9), fps = 20, series = [];
    for (let k = 0; k <= dur * fps; k++) {
      await page.evaluate(async (t) => { window.scrollTo({ top: 0, behavior: 'instant' }); await window.seek(t); await new Promise((r) => requestAnimationFrame(r)); }, k / fps);
      series.push(cellLuminance(await page.screenshot({ type: 'png' })));
    }
    const worst = worstFlashes(series, fps);
    report.info.flashScan = { seconds: dur, fps, viewport: '720x450', worstFlashesPerSecond: worst.flashes, cell: worst.cell, at: worst.at };
    if (worst.flashes > 3) problem(`flash hazard: ${worst.flashes} flashes in 1 s (cell ${worst.cell}, t=${worst.at}s); keep it at 3 or fewer`);
    await ctx.close();
  }

  if (opts.hold) {   // a visitor holding the hero for 20 s: same counting, live frames at 30 fps of wall time
    const ctx = await newCtx({ viewport: { width: 720, height: 450 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => {   // keep a handle on the engine object and let the scan set the wall clock
      let eng;
      Object.defineProperty(window, 'MM_ENGINES', { configurable: true, get: () => eng, set: (v) => { eng = new Proxy(v, { set: (o, k, f) => { o[k] = typeof f === 'function' ? function (rt) { const E = f(rt); window.__E = E; return E; } : f; return true; } }); } });
      const now = performance.now.bind(performance); performance.now = () => (window.__now != null ? window.__now : now());
    });
    const page = await ctx.newPage();
    logs(page, 'hold');
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('#gl').classList.contains('on'), null, { timeout: 180000 });
    await page.evaluate(async () => { await window.seek(99); });   // stop the live loop; the scan draws every frame itself
    const fps = 30, secs = 20, series = [], base = await page.evaluate(() => performance.now());
    let t = 0, held = 0, want = 1, maxWarp = 1;
    for (let k = 0; k <= secs * fps; k++) {
      if (k) { held += 1 / fps; const e = Math.min(1, held / 1.2); want = Math.max(want, Math.min(5, 1 + 3 * Math.pow(e, 1.5) + 0.5 * Math.max(0, held - 1.2))); }   // runtime.js frame()
      const w = await page.evaluate(({ t, k, fps, base, want }) => {
        const E = window.__E, sat = (x) => Math.max(0, Math.min(1, x)), w = Math.max(1, Math.min(want, E.warpCap ? E.warpCap(t) : 5));
        window.__now = base + (k / fps) * 1000;
        window.scrollTo({ top: 0, behavior: 'instant' });
        E.draw(t, { lean: 0, warp: w, boost: sat((w - 1) / 3), intent: sat((want - 1) / 3), wave: k / fps, down: 0, holding: true }, false);
        return w;
      }, { t, k, fps, base, want });
      series.push(cellLuminance(await page.screenshot({ type: 'png' })));
      maxWarp = Math.max(maxWarp, w);
      if (k) t += w / fps;
    }
    const worst = worstFlashes(series, fps);
    report.info.holdFlashScan = { wallSeconds: secs, fps, rideSeconds: +t.toFixed(1), maxWarp: +maxWarp.toFixed(2), viewport: '720x450', worstFlashesPerSecond: worst.flashes, cell: worst.cell, atWallSecond: worst.at };
    if (worst.flashes > 3) problem(`flash hazard while held: ${worst.flashes} flashes in 1 s (cell ${worst.cell}, ${worst.at}s into the hold); cap the ride's speed with warpCap`);
    await ctx.close();
  }

  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
  summary[id] = { problems: report.problems, warnings: report.warnings, flash: report.info.flashScan ? report.info.flashScan.worstFlashesPerSecond : 'not run', hold: report.info.holdFlashScan ? report.info.holdFlashScan.worstFlashesPerSecond : 'not run' };
  console.log(`${report.problems.length ? 'FAIL' : 'ok  '} ${id}: ${report.problems.length} problems, ${report.warnings.length} warnings${report.info.flashScan ? `, worst ${report.info.flashScan.worstFlashesPerSecond} flashes/s` : ''}${report.info.holdFlashScan ? `, held ${report.info.holdFlashScan.worstFlashesPerSecond} flashes/s (max ${report.info.holdFlashScan.maxWarp}x)` : ''}  -> ${path.relative(process.cwd(), dir)}`);
  for (const p of report.problems) console.log('     problem: ' + p);
  for (const w of report.warnings) console.log('     warning: ' + w);
}

await browser.close();
await site.close();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
process.exit(Object.values(summary).some((s) => s.problems.length) ? 1 : 0);
