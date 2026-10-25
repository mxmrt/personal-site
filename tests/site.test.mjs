// site.test.mjs: behaviour tests in headless Chromium against public/, served the way Cloudflare Pages serves it.
// usage: node tests/site.test.mjs [--ride=ID] [--quick]      (--quick: desktop only, skips the 24-load pick test)
// needs: npm install && npx playwright install chromium      (CHROMIUM_PATH=... to use another Chromium binary)
import path from 'node:path';
import { ROOT, RIDES, launch, routeRequests, sleep } from '../tools/browser.mjs';
import { startSiteServer } from '../tools/serve.mjs';

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const ONLY = opt.ride ? [opt.ride] : RIDES;
const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
].filter((v) => !opt.quick || v.name === 'desktop');

const site = await startSiteServer(path.join(ROOT, 'public'));
const browser = await launch();
const results = [];

/* every page gets: a rAF counter, an audio tripwire, and error/external-request collectors */
async function open(vp, { reducedMotion = 'no-preference', hash = '' } = {}) {
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
const rafOver = async (page, ms) => { await page.evaluate(() => { window.__raf = 0; }); await sleep(ms); return page.evaluate(() => window.__raf); };
/* wait until the loop has delivered n frames. Software WebGL (SwiftShader) can stall for several seconds while it
   compiles a ride's shaders, Floating World most of all, so the window is generous; a real GPU needs milliseconds */
async function framesFlow(page, n = 3, ms = 30000) {
  await page.evaluate(() => { window.__raf = 0; });
  try { await page.waitForFunction((n) => window.__raf >= n, n, { timeout: ms, polling: 100 }); return true; } catch { return false; }
}

async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push([true, name]); console.log(`ok    ${name}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
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
        ride: window.MM_RIDE, attr: document.documentElement.dataset.ride, name: document.getElementById('ride-name').textContent,
        note: document.getElementById('ride-note').textContent, overflow: document.documentElement.scrollWidth > innerWidth,
        sound: !!document.getElementById('sd'), buttons: document.querySelectorAll('.btns button').length,
      }));
      expect(s.ride === id && s.attr === id, `expected ride ${id}, got ${s.ride} / data-ride=${s.attr}`);
      expect(s.name && s.name !== 'the ride' && s.note.length > 20, 'footer should name the ride and carry its caption');
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
      expect((await rafOver(page, 1000)) <= 1, 'animation keeps running while paused');
      await page.click('#pz');
      expect(await page.getAttribute('#pz', 'aria-label') === 'Pause animation', 'Play should restore the Pause label');
      expect(await framesFlow(page), 'animation did not resume after Play');
      // scrolled away, the loop sleeps
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await sleep(500);
      expect((await rafOver(page, 1000)) <= 2, 'animation keeps running with the hero off-screen');
      await page.evaluate(() => window.scrollTo(0, 0));
      const audio = await page.evaluate(() => window.__audio);
      expect(audio.length === 0, 'audio API used: ' + audio.join(', '));
      expect(!bad.length, bad.join('\n'));
    } finally { await ctx.close(); }
  });
}

await test('reduced motion: every ride shows a still, no loop, no controls', async () => {
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

if (!opt.quick && !opt.ride) await test('random pick: 24 visits, never the same ride twice in a row, every ride shows up', async () => {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 }, reducedMotion: 'reduce' });
  await routeRequests(ctx, site.url);
  const page = await ctx.newPage();
  const seen = [];
  for (let i = 0; i < 24; i++) {
    await page.goto(site.url + '/', { waitUntil: 'domcontentloaded' });
    seen.push(await page.evaluate(() => document.documentElement.dataset.ride));
  }
  await ctx.close();
  const repeats = seen.filter((r, i) => i && r === seen[i - 1]).length;
  expect(repeats === 0, 'consecutive repeats in ' + seen.join(' '));
  expect(RIDES.every((r) => seen.includes(r)), 'not every ride appeared: ' + seen.join(' '));
});

await test('"Take another ride" reloads into a different ride and drops the #ride hash', async () => {
  const { ctx, page, bad } = await open(VIEWPORTS[0], { reducedMotion: 'reduce', hash: '#asymptote' });
  try {
    await Promise.all([page.waitForEvent('load'), page.click('#again')]);
    const s = await page.evaluate(() => ({ ride: document.documentElement.dataset.ride, hash: location.hash }));
    expect(s.ride && s.ride !== 'asymptote' && RIDES.includes(s.ride), 'got ' + s.ride);
    expect(s.hash === '', 'hash should be cleared, got ' + s.hash);
    expect(!bad.length, bad.join('\n'));
  } finally { await ctx.close(); }
});

await test('keyboard: skip link first, in-page nav moves focus to the section', async () => {
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

await test('"Back to top" returns focus to the top; the skip link shows for keyboard users only', async () => {
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
