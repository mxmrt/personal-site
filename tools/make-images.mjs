// make-images.mjs: regenerate the raster files in static/ from the live page and static/favicon.svg.
//   static/og.png               1200x630 social preview: one ride's hero with the name, no controls
//   static/apple-touch-icon.png 180x180 home-screen icon (full-bleed square)
//   static/favicon.ico          32x32 PNG inside an .ico container
// usage: python3 build.py && node tools/make-images.mjs [--ride=asymptote] [--t=12.4]
// then run python3 build.py again so public/ picks up the new files.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launch, routeRequests, sleep } from './browser.mjs';
import { startSiteServer } from './serve.mjs';

const opt = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const RIDE = opt.ride || 'asymptote';
const T = opt.t != null ? Number(opt.t) : null;   // default: the ride's own still frame (T_STILL)
const STATIC = path.join(ROOT, 'static');

const site = await startSiteServer(path.join(ROOT, 'public'));
const browser = await launch();
try {
  // ---- og.png ----
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await routeRequests(ctx, site.url);
  const page = await ctx.newPage();
  await page.goto(`${site.url}/#${RIDE}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await sleep(2500);
  await page.addStyleTag({ content: '.ctl,.id nav,.skip{display:none!important}.hero{height:100vh!important;min-height:0!important}' });
  await sleep(300);
  const t = await page.evaluate(async (t) => {
    const tt = t != null ? t : window.MM_STILL;
    await window.seek(tt);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return tt;
  }, T);
  await page.screenshot({ path: path.join(STATIC, 'og.png') });
  console.log(`og.png: ${RIDE} at t=${t}`);
  await ctx.close();

  // ---- icons from favicon.svg ----
  const svg = fs.readFileSync(path.join(STATIC, 'favicon.svg'), 'utf8');
  const shoot = async (size, fullBleed) => {
    const c = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const p = await c.newPage();
    await p.setContent(`<style>html,body{margin:0;background:${fullBleed ? '#050A1A' : 'transparent'}}svg{display:block;width:${size}px;height:${size}px}</style>${fullBleed ? svg.replace(/rx="[\d.]+"/, '') : svg}`);
    const buf = await p.screenshot({ omitBackground: !fullBleed });
    await c.close();
    return buf;
  };
  fs.writeFileSync(path.join(STATIC, 'apple-touch-icon.png'), await shoot(180, true));
  const png32 = await shoot(32, false);
  const ico = Buffer.alloc(22);
  ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);           // ICONDIR: reserved, type 1 (icon), 1 image
  ico.writeUInt8(32, 6); ico.writeUInt8(32, 7); ico.writeUInt8(0, 8); ico.writeUInt8(0, 9); // 32x32, no palette
  ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);                                    // planes, bits per pixel
  ico.writeUInt32LE(png32.length, 14); ico.writeUInt32LE(22, 18);                         // size and offset of the PNG
  fs.writeFileSync(path.join(STATIC, 'favicon.ico'), Buffer.concat([ico, png32]));
  console.log('apple-touch-icon.png, favicon.ico: from favicon.svg');
} finally {
  await browser.close();
  await site.close();
}
console.log('now run: python3 build.py');
