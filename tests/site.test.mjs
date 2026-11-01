// site.test.mjs: behaviour tests in headless Chromium against public/, served the way Cloudflare Pages serves it.
// usage: node tests/site.test.mjs [--ride=ID] [--quick] [--lab] [--worlds]
//   --ride=ID: one ride only   --quick: desktop only, skips the long live loop   --lab: only the Lab map tests
//   --worlds: only the Many Worlds tests (its eight worlds, the tears, the embedded engines, deep links, the live loop)
// needs: npm install && npx playwright install chromium      (CHROMIUM_PATH=... to use another Chromium binary)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ROOT, RIDES, launch, routeRequests, sleep } from '../tools/browser.mjs';
import { startSiteServer } from '../tools/serve.mjs';

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const ONLY = opt.lab || opt.worlds ? [] : opt.ride ? [opt.ride] : RIDES;
const OTHER = !opt.lab && !opt.worlds;   // the page-wide tests (keyboard, Back to top)
const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
].filter((v) => !opt.quick || v.name === 'desktop');

const site = await startSiteServer(path.join(ROOT, 'public'));
const browser = await launch();
const results = [];

/* every page gets: a rAF counter, an audio tripwire, and error/external-request collectors */
async function open(vp, { reducedMotion = 'no-preference', hash = '', initScript = null } = {}) {
  const ctx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.deviceScaleFactor || 1, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, reducedMotion });
  ctx.setDefaultTimeout(60000);
  const bad = [];
  await routeRequests(ctx, site.url, (r) => bad.push('external request ' + r));
  await ctx.addInitScript(() => {
    window.__raf = 0; window.__audio = [];
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((ts) => { window.__raf++; cb(ts); });
    for (const k of ['AudioContext', 'webkitAudioContext', 'OfflineAudioContext', 'Audio']) {
      const O = window[k]; if (O) window[k] = new Proxy(O, { construct(T, a) { window.__audio.push(k); return Reflect.construct(T, a); } });
    }
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.__audio.push('media.play'); return play.call(this); };
  });
  if (initScript) await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => bad.push('page error: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const where = (m.location() && m.location().url) || '';
    if (/fonts\.(googleapis|gstatic)\.com/.test(where)) return;   // offline font fetches are not page bugs
    bad.push('console.error: ' + m.text().slice(0, 200));
  });
  await page.goto(site.url + '/' + hash, { waitUntil: 'load' });
  return { ctx, page, bad };
}
/* rafOver counts every animation frame the page asks for (the hero and the Lab map); heroFramesOver counts the
   hero's live frames only (window.MM_FRAMES, counted by the runtime) */
const rafOver = async (page, ms) => { await page.evaluate(() => { window.__raf = 0; }); await sleep(ms); return page.evaluate(() => window.__raf); };
const heroFramesOver = async (page, ms) => { await page.evaluate(() => { window.MM_FRAMES = 0; }); await sleep(ms); return page.evaluate(() => window.MM_FRAMES); };
/* wait until the hero's loop has delivered n frames. Software WebGL (SwiftShader) can stall for several seconds while
   it compiles a ride's shaders, Floating World most of all, so the window is generous; a real GPU needs milliseconds */
async function framesFlow(page, n = 3, ms = 30000) {
  await page.evaluate(() => { window.MM_FRAMES = 0; });
  try { await page.waitForFunction((n) => window.MM_FRAMES >= n, n, { timeout: ms, polling: 100 }); return true; } catch { return false; }
}

async function test(name, fn) {
  const t0 = Date.now();
  try {   // a test may return a one-line note (a measurement) to print under its name
    const note = await fn(); results.push([true, name]); console.log(`ok    ${name}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (typeof note === 'string') console.log('      ' + note);
  }
  catch (e) { results.push([false, name, e.message]); console.log(`FAIL  ${name}\n      ${e.message.split('\n').join('\n      ')}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

await test('serves the page, 404 page, icons, headers and redirects like Cloudflare Pages', async () => {
  const get = (p) => fetch(site.url + p);
  const home = await get('/');
  expect(home.status === 200 && /text\/html/.test(home.headers.get('content-type')), '/ should be 200 text/html');
  expect(home.headers.get('x-content-type-options') === 'nosniff', '_headers rules should apply to /');
  const nf = await get('/no-such-page');
  expect(nf.status === 404 && /Out of sample/.test(await nf.text()), 'unknown paths should return 404.html with status 404');
  for (const p of ['/articles/learning', '/articles/learning.html', '/articles/learning/']) {   // the retired essay
    const r = await fetch(site.url + p, { redirect: 'manual' });
    expect(r.status === 301 && r.headers.get('location') === '/', `${p} should 301 to /, got ${r.status} ${r.headers.get('location')}`);
  }
  expect((await get('/_redirects')).status === 404, '_redirects must not be served');
  expect((await get('/_headers')).status === 404, '_headers must not be served');
  for (const [p, type] of [['/og.png', 'image/png'], ['/favicon.svg', 'image/svg+xml'], ['/favicon.ico', 'image/x-icon'], ['/apple-touch-icon.png', 'image/png']]) {
    const r = await get(p); expect(r.status === 200 && r.headers.get('content-type') === type, `${p} should be 200 ${type}`);
  }
});

for (const vp of VIEWPORTS) for (const id of ONLY) {
  await test(`${id} on ${vp.name}: renders, accelerates, pauses, sleeps off-screen, stays silent`, async () => {
    const { ctx, page, bad } = await open(vp, { hash: '#' + id });
    try {
      await page.waitForSelector('#gl.on', { timeout: 30000 }).catch(() => { throw new Error('WebGL canvas never faded in (the ride fell back to its poster)'); });
      const s = await page.evaluate(() => ({
        ride: window.MM_RIDE, attr: document.documentElement.dataset.ride, overflow: document.documentElement.scrollWidth > innerWidth,
        sound: !!document.getElementById('sd'), buttons: document.querySelectorAll('.btns button').length,
      }));
      expect(s.ride === id && s.attr === id, `expected ride ${id}, got ${s.ride} / data-ride=${s.attr}`);
      expect(!s.overflow, 'page scrolls horizontally');
      expect(!s.sound && s.buttons === 1, 'hero controls should be exactly one Pause button');
      expect(await framesFlow(page), 'animation loop is not running');
      // hold to accelerate (mouse on desktop, a press-and-hold on phone), then Space on desktop
      const box = await page.locator('header.hero').boundingBox();
      await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.3);
      await page.mouse.down(); await sleep(1300); await page.mouse.up();
      expect(await page.evaluate(() => document.getElementById('hn').classList.contains('gone')), 'the "Hold to accelerate" hint should hide after a press');
      if (!vp.hasTouch) { await page.keyboard.down('Space'); await sleep(600); await page.keyboard.up('Space'); }
      // pause stops the loop, play resumes it
      await page.click('#pz');
      expect(await page.getAttribute('#pz', 'aria-pressed') === 'true', 'Pause should set aria-pressed=true');
      expect((await heroFramesOver(page, 1000)) <= 1, 'animation keeps running while paused');
      await page.click('#pz');
      expect(await page.getAttribute('#pz', 'aria-label') === 'Pause animation', 'Play should restore the Pause label');
      expect(await framesFlow(page), 'animation did not resume after Play');
      // scrolled away, the loop sleeps
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await sleep(500);
      expect((await heroFramesOver(page, 1000)) <= 2, 'animation keeps running with the hero off-screen');
      await page.evaluate(() => window.scrollTo(0, 0));
      const audio = await page.evaluate(() => window.__audio);
      expect(audio.length === 0, 'audio API used: ' + audio.join(', '));
      expect(!bad.length, bad.join('\n'));
    } finally { await ctx.close(); }
  });
}

if (ONLY.length) await test('reduced motion: the hero shows a still, no loop, no controls', async () => {
  for (const id of ONLY) {
    const { ctx, page, bad } = await open(VIEWPORTS[0], { reducedMotion: 'reduce', hash: '#' + id });
    try {
      await sleep(1200);
      const s = await page.evaluate(() => ({ still: document.querySelector('.hero').classList.contains('still'), ctl: getComputedStyle(document.querySelector('.ctl')).display }));
      expect(s.still && s.ctl === 'none', `${id}: hero should be a still with its controls hidden`);
      expect((await rafOver(page, 1000)) <= 1, `${id}: animation loop runs under prefers-reduced-motion`);
      expect(!bad.length, `${id}: ` + bad.join('\n'));
    } finally { await ctx.close(); }
  }
});

/* the Lab's live Sweet Spots map (src/lab/sweet-spots-map.js): its own loop, tour and Pause tour button */
const labState = (page) => page.evaluate(() => {
  const box = document.getElementById('ssBox'), card = document.querySelector('.ss .tour'), btn = document.getElementById('ssTour');
  const b = box.getBoundingClientRect(), c = card && !card.hidden ? card.getBoundingClientRect() : null;
  return {
    state: box.dataset.state, on: !!(card && card.classList.contains('on')), btn: btn.hidden ? null : btn.textContent,
    hint: document.getElementById('ssHint').textContent, legend: document.querySelectorAll('#ssLegend .fam').length,
    fallback: !!box.querySelector('.ss-map'), inside: !c || (c.left >= b.left - 1 && c.right <= b.right + 1 && c.top >= b.top - 1 && c.bottom <= b.bottom + 1),
  };
});
const toLab = (page) => page.evaluate(() => document.getElementById('ssBox').scrollIntoView({ block: 'center', behavior: 'instant' }));
const tourShows = (page, ms, why) => page.waitForFunction(() => document.querySelector('.ss .tour.on'), null, { timeout: ms, polling: 100 }).catch(() => { throw new Error(why); });

if (!opt.ride && !opt.worlds) for (const vp of VIEWPORTS) await test(`Lab map on ${vp.name}: flies in when seen, tours the new candies, pauses, sleeps off-screen`, async () => {
  const { ctx, page, bad } = await open(vp, { hash: '#asymptote' });
  try {
    await page.click('#pz'); await page.mouse.move(1, 1);   // pause the hero, so every frame counted below is the map's
    let s = await labState(page);
    expect(s.state === 'waiting' && s.legend === 8 && !s.fallback && s.btn === 'Pause tour', 'before it is seen, the map should wait with its legend and a Pause tour button: ' + JSON.stringify(s));
    await toLab(page);
    await tourShows(page, 30000, 'the tour never showed a new candy');
    await page.waitForFunction(() => { const i = document.querySelector('.ss .tour.on img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 10000 })
      .catch(() => { throw new Error('the tour card picture did not load'); });
    s = await labState(page);
    expect(s.inside, 'the tour card should sit inside the map');
    expect(/^Touring/.test(s.hint), 'the hint should say the map is touring, got: ' + s.hint);
    // Pause tour stops the tour, and once the dots have landed the map stops drawing
    await page.click('#ssTour');
    s = await labState(page);
    expect(s.btn === 'Play tour' && s.state !== 'tour', 'Pause tour should stop the tour: ' + JSON.stringify(s));
    await page.waitForFunction(() => document.getElementById('ssBox').dataset.state === 'play', null, { timeout: 30000 });
    await sleep(900);   // the view eases back out
    expect(!(await labState(page)).on, 'the tour card should go away when paused');
    expect((await rafOver(page, 1000)) <= 1, 'the map keeps drawing with its tour paused');
    await page.click('#ssTour');
    expect((await labState(page)).btn === 'Pause tour', 'Play tour should restore the Pause tour label');
    await tourShows(page, 15000, 'Play tour did not restart the tour');
    // off-screen the tour stops and the map sleeps; back on screen the tour picks up again
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(1000);
    s = await labState(page);
    expect(!s.on && s.state !== 'tour', 'the tour should stop when the map leaves the screen');
    expect((await rafOver(page, 1000)) <= 1, 'the map keeps drawing off-screen');
    await toLab(page);
    await tourShows(page, 15000, 'the tour did not resume when the map came back into view');
    expect(!bad.length, bad.join('\n'));
  } finally { await ctx.close(); }
});

if (!opt.ride && !opt.worlds) await test('Lab map: under reduced motion it is drawn in place with no tour and no loop; without JavaScript the static map shows', async () => {
  const { ctx, page, bad } = await open(VIEWPORTS[0], { reducedMotion: 'reduce', hash: '#asymptote' });
  try {
    await toLab(page); await sleep(1500);
    const s = await labState(page);
    expect(s.btn === null && !s.on && s.state === 'play', 'reduced motion should give no tour and no Pause tour button: ' + JSON.stringify(s));
    const inked = await page.evaluate(() => { const c = document.getElementById('ssCanvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
    expect(inked > 5000, 'the map should be drawn, got ' + inked + ' inked pixels');
    expect((await rafOver(page, 1000)) <= 1, 'the map animates under prefers-reduced-motion');
    expect(!bad.length, bad.join('\n'));
  } finally { await ctx.close(); }
  const ctx2 = await browser.newContext({ viewport: VIEWPORTS[0].viewport, javaScriptEnabled: false });
  try {
    await routeRequests(ctx2, site.url);
    const page2 = await ctx2.newPage();
    await page2.goto(site.url + '/', { waitUntil: 'load' });
    const box = await page2.locator('#ssBox .ss-map').boundingBox();
    expect(box && box.width > 300 && box.height > 150, 'without JavaScript the Lab should show the static map');
  } finally { await ctx2.close(); }
});

/* ---------- Many Worlds: eight worlds in one loop, three of them drawn by the other rides' engines ---------- */
const WORLD_IDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'worlds.json'), 'utf8'));
const MW = !opt.ride && !opt.lab && RIDES.includes('many-worlds');
const glError = (page) => page.evaluate(() => { const g = document.getElementById('gl').getContext('webgl'); return g ? g.getError() : -1; });
const seekTo = (page, t) => page.evaluate(async (t) => { window.scrollTo(0, 0); await window.seek(t); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, t);
const heroState = (page) => page.evaluate(async () => {
  const h = document.getElementById('top'), seal = h.querySelector('.fw-seal');
  if (seal) await Promise.all(seal.getAnimations().map((a) => a.finished.catch(() => {})));   // the seal fades over 0.5 s
  return { world: h.getAttribute('data-world'), name: getComputedStyle(document.getElementById('nm')).color, seal: seal ? +getComputedStyle(seal).opacity : -1 };
});
/* the name's colour where a world re-inks the hero (many-worlds.js, the `ui` entries); every other world wears the theme */
const NAME_INK = { ink: 'rgb(14, 18, 30)', 'floating-world': 'rgb(242, 235, 221)' };
/* the hero canvas as pixels; spread = how far from one flat colour the frame is */
const require = createRequire(import.meta.url);
const canvasPNG = async (page) => require('pngjs').PNG.sync.read(await page.locator('#gl').screenshot());
function spread(png) { let lo = 255, hi = 0; for (let i = 0; i < png.data.length; i += 4 * 97) { const v = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3; lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; }
function diff(a, b) { let sum = 0, big = 0; const n = a.width * a.height; for (let i = 0; i < n * 4; i += 4) { const e = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])); sum += e; if (e > 24) big++; } return { mean: sum / n, big: big / n }; }

for (const vp of MW ? VIEWPORTS : []) await test(`Many Worlds on ${vp.name}: all eight worlds draw, in order, each with its hero colours; the tear into each one works`, async () => {
  const { ctx, page, bad } = await open(vp, { hash: '#many-worlds' });
  try {
    await page.waitForSelector('#gl.on', { timeout: 60000 });
    const worlds = await page.evaluate(() => window.MM_WORLDS), shots = await page.evaluate(() => window.MM_SHOTS);
    expect(Array.isArray(worlds) && worlds.length === 8 && shots.length === 8, 'MM_WORLDS and MM_SHOTS should list eight worlds');
    expect(WORLD_IDS.every((id) => worlds.some((w) => w.id === id && w.from != null)), 'every engine in worlds.json should be an embedded world');
    let themeName = null;
    for (let i = 0; i < worlds.length; i++) {
      await seekTo(page, shots[i]);
      const s = await heroState(page), px = await canvasPNG(page);
      expect(s.world === worlds[i].id, `t=${shots[i]}: expected the ${worlds[i].id} world, the hero says ${s.world}`);
      expect(spread(px) > 40, `${worlds[i].id}: the frame is nearly flat (the world did not draw)`);
      expect((s.seal === 1) === (s.world === 'floating-world'), `${s.world}: Floating World's seal should show only in its world (opacity ${s.seal})`);
      if (i === 0) themeName = s.name;   // blue hour wears the site theme
      const want = NAME_INK[s.world] || themeName;
      expect(s.name === want, `${s.world}: the name should be ${want}, got ${s.name}`);
    }
    for (let k = 1; k <= worlds.length; k++) {   // each rift: the frozen frame, then the tear half open
      for (const t of [k * 6 - 0.05, k * 6 + 0.25]) { await seekTo(page, t); expect(spread(await canvasPNG(page)) > 30, `the rift at t=${t} drew a flat frame`); }
    }
    expect((await glError(page)) === 0, 'WebGL reported an error');
    expect(!bad.length, bad.join('\n'));
  } finally { await ctx.close(); }
});

if (MW) await test('Many Worlds: context restore redraws paused and reduced-motion frames without restarting, and every world draws again', async () => {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const { ctx, page, bad } = await open(VIEWPORTS[0], { reducedMotion, hash: '#many-worlds' });
    try {
      await page.waitForSelector('#gl.on', { timeout: 60000 });
      const worlds = await page.evaluate(() => window.MM_WORLDS), shots = await page.evaluate(() => window.MM_SHOTS);
      if (reducedMotion === 'no-preference') {
        for (const t of shots) await seekTo(page, t);   // compile every embedded world on the first context
        await page.evaluate(() => window.play());
        await page.click('#pz');   // restore must redraw without unpausing
      }
      const before = await heroState(page);
      const off = await page.evaluate(async () => {
        const cv = document.getElementById('gl'), ext = cv.getContext('webgl').getExtension('WEBGL_lose_context');
        if (!ext) return 'no WEBGL_lose_context';
        ext.loseContext(); await new Promise((r) => setTimeout(r, 300));
        const state = cv.classList.contains('on') ? '#gl still showing' : document.getElementById('top').hasAttribute('data-world') ? 'hero kept a world' : 'ok';
        ext.restoreContext();
        return state;
      });
      expect(off === 'ok', 'while the context is lost the poster should show in the theme colours: ' + off);
      // Do not seek or resize here: either would hide a missing automatic restoration redraw.
      await page.waitForSelector('#gl.on', { timeout: 60000 });
      expect((await heroState(page)).world === before.world, `${reducedMotion}: context restore should redraw the same world`);
      expect(spread(await canvasPNG(page)) > 40, `${reducedMotion}: restored frame is flat`);
      expect((await heroFramesOver(page, 700)) === 0, `${reducedMotion}: context restore restarted the animation`);
      if (reducedMotion === 'no-preference') {
        expect(await page.getAttribute('#pz', 'aria-pressed') === 'true', 'context restore should preserve Pause');
        for (let i = 0; i < worlds.length; i++) {
          await seekTo(page, shots[i]);
          const s = await heroState(page);
          expect(s.world === worlds[i].id, `after the restore, t=${shots[i]} should be the ${worlds[i].id} world, the hero says ${s.world}`);
          expect(spread(await canvasPNG(page)) > 40, `after the restore, the ${worlds[i].id} world drew a flat frame`);
        }
      }
      expect((await glError(page)) === 0, 'WebGL reported an error');
      expect(!bad.length, bad.join('\n'));
    } finally { await ctx.close(); }
  }
});

if (MW) await test('Many Worlds: an incomplete depth target releases its resources and falls back to the poster', async () => {
  const { ctx, page, bad } = await open(VIEWPORTS[0], { initScript: () => {
    const p = WebGLRenderingContext.prototype, storage = p.renderbufferStorage;
    window.__targetResources = {};
    for (const type of ['Texture', 'Renderbuffer', 'Framebuffer']) {
      const count = window.__targetResources[type] = { created: 0, deleted: 0 };
      const create = p['create' + type], remove = p['delete' + type];
      p['create' + type] = function (...args) { const obj = create.apply(this, args); if (obj) count.created++; return obj; };
      p['delete' + type] = function (obj) { if (obj) count.deleted++; return remove.call(this, obj); };
    }
    // Simulate unavailable depth storage: the attachment is valid but has no backing allocation.
    p.renderbufferStorage = function (...args) { if (args[1] !== this.DEPTH_COMPONENT16) return storage.apply(this, args); };
  } });
  try {
    await page.waitForSelector('header.hero.still', { timeout: 30000 });
    expect(!(await page.locator('#gl').evaluate((cv) => cv.classList.contains('on'))), 'an incomplete target must not show a broken WebGL frame');
    const poster = require('pngjs').PNG.sync.read(await page.locator('#pc').screenshot());
    expect(spread(poster) > 40, 'allocation failure should leave the visible poster');
    expect((await heroFramesOver(page, 700)) === 0, 'allocation failure should stop the hero loop');
    const resources = await page.evaluate(() => window.__targetResources);
    for (const [type, count] of Object.entries(resources)) expect(count.created > 0 && count.deleted === count.created, `${type}: incomplete target leaked resources: ${JSON.stringify(count)}`);
    expect(bad.some((m) => m.includes('incomplete framebuffer')), 'allocation failure should report its cause');
    expect(bad.every((m) => m.includes('incomplete framebuffer')), bad.join('\n'));
  } finally { await ctx.close(); }
});

if (MW) await test('Many Worlds: each embedded world draws exactly what its own engine draws standalone', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-worlds-'));
  for (const id of WORLD_IDS) execFileSync('python3', [path.join(ROOT, 'build.py'), '--only', id, '--out', path.join(tmp, id + '.html')]);
  for (const f of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'lab']) fs.cpSync(path.join(ROOT, 'public', f), path.join(tmp, f), { recursive: true });   // what the page links to
  const dev = await startSiteServer(tmp);
  const { ctx, page, bad } = await open(VIEWPORTS[0], { hash: '#many-worlds' });
  const sctx = await browser.newContext({ viewport: VIEWPORTS[0].viewport, deviceScaleFactor: 1 });
  try {
    await routeRequests(sctx, dev.url);
    await page.waitForSelector('#gl.on', { timeout: 60000 });
    const worlds = await page.evaluate(() => window.MM_WORLDS);
    const canvasOnly = '.scrim,.ov,.deco{visibility:hidden!important}';   // compare the engines' pixels, not the hero's text and scrim
    let worst = 0, worstBig = 0;
    await page.addStyleTag({ content: canvasOnly });
    for (const id of WORLD_IDS) {
      const w = worlds.find((x) => x.id === id), solo = await sctx.newPage();
      const serr = []; solo.on('pageerror', (e) => serr.push(e.message)); solo.on('console', (m) => { if (m.type() === 'error') serr.push(m.text()); });
      await solo.goto(`${dev.url}/${id}.html`, { waitUntil: 'load' });
      await solo.waitForSelector('#gl.on', { timeout: 90000 });
      await solo.addStyleTag({ content: canvasOnly });
      for (const u of [1.5, 4.5]) {
        await seekTo(page, w.at + u); await seekTo(solo, w.from + u);
        const d = diff(await canvasPNG(page), await canvasPNG(solo));
        expect(d.mean < 1 && d.big < 0.005, `${id} at +${u}s differs from its standalone engine: mean ${d.mean.toFixed(2)}/255, ${(100 * d.big).toFixed(2)}% of pixels off by more than 24`);
        worst = Math.max(worst, d.mean); worstBig = Math.max(worstBig, d.big);
      }
      expect(!serr.length, `${id} standalone: ` + serr.join(' | '));
      await solo.close();
    }
    expect(!bad.length, bad.join('\n'));
    return `largest difference: mean ${worst.toFixed(2)}/255, ${(100 * worstBig).toFixed(2)}% of pixels off by more than 24`;
  } finally { await ctx.close(); await sctx.close(); await dev.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

if (MW) await test('Many Worlds: a world named in the URL starts the ride there; there is one ride and nothing is stored', async () => {
  for (const id of ['asymptote', 'ink']) {
    const { ctx, page, bad } = await open(VIEWPORTS[0], { hash: '#' + id });
    try {
      await page.waitForSelector('#gl.on', { timeout: 60000 });
      await page.waitForFunction((id) => document.getElementById('top').getAttribute('data-world') === id, id, { timeout: 30000 })
        .catch(() => { throw new Error(`#${id} should start the ride in the ${id} world`); });
      const s = await page.evaluate(() => ({ ride: document.documentElement.dataset.ride, stored: localStorage.length + sessionStorage.length }));
      expect(s.ride === 'many-worlds' && s.stored === 0, `expected ride many-worlds and no storage, got ${JSON.stringify(s)}`);
      expect(!bad.length, bad.join('\n'));
    } finally { await ctx.close(); }
  }
});

if (MW && !opt.quick) await test('Many Worlds live: holding rides through the worlds, embedded ones included, with no errors', async () => {
  const { ctx, page, bad } = await open(VIEWPORTS[0], { hash: '#ink' });
  try {
    await page.waitForSelector('#gl.on', { timeout: 60000 });
    const box = await page.locator('header.hero').boundingBox();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.3); await page.mouse.down();
    const seen = new Set(), t0 = Date.now();
    while (Date.now() - t0 < 30000 && !(seen.has('scale-invariant') && seen.has('asymptote'))) { seen.add(await page.evaluate(() => document.getElementById('top').getAttribute('data-world'))); await sleep(150); }
    await page.mouse.up();
    expect(seen.has('asymptote') && seen.has('night') && seen.has('scale-invariant'), 'holding from ink should reach asymptote, night and scale-invariant; saw ' + [...seen].join(', '));
    expect((await glError(page)) === 0, 'WebGL reported an error');
    expect(!bad.length, bad.join('\n'));
  } finally { await ctx.close(); }
});

if (OTHER) await test('keyboard: skip link first, in-page nav moves focus to the section', async () => {
  const { ctx, page, bad } = await open(VIEWPORTS[0], { reducedMotion: 'reduce', hash: '#floating-world' });
  try {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement.textContent.trim()) === 'Skip to content', 'first Tab should land on the skip link');
    await page.keyboard.press('Enter'); await sleep(300);
    expect(await page.evaluate(() => !!document.activeElement.closest('#main')), 'skip link should move focus into <main>');
    await page.click('nav[aria-label="Sections"] a[href="#contact"]'); await sleep(500);
    expect(await page.evaluate(() => document.activeElement.id === 'h-contact'), 'Contact link should focus the Contact heading');
    expect(!bad.length, bad.join('\n'));
  } finally { await ctx.close(); }
});

if (OTHER) await test('"Back to top" returns focus to the top; the skip link shows for keyboard users only', async () => {
  for (const how of ['mouse', 'keyboard']) {
    const { ctx, page, bad } = await open(VIEWPORTS[0], { reducedMotion: 'reduce', hash: '#scale-invariant' });
    try {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const back = page.locator('footer a[href="#top"]');
      if (how === 'mouse') await back.click(); else { await back.focus(); await page.keyboard.press('Enter'); }
      await sleep(400);
      const s = await page.evaluate(() => ({ cls: document.activeElement.className, top: getComputedStyle(document.querySelector('.skip')).top }));
      expect(s.cls === 'skip', `${how}: focus should move to the skip link, got "${s.cls}"`);
      expect(s.top === (how === 'mouse' ? '-80px' : '12px'), `${how}: skip link top is ${s.top}`);
      expect(!bad.length, bad.join('\n'));
    } finally { await ctx.close(); }
  }
});

await browser.close();
await site.close();
const failed = results.filter((r) => !r[0]);
console.log(`\n${failed.length ? 'FAILED' : 'PASSED'}: ${results.length - failed.length}/${results.length} tests`);
process.exit(failed.length ? 1 : 0);
