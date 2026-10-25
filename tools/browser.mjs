// browser.mjs: shared Playwright setup for the tests, the preview tool and the image maker.
//   - headless Chromium with SwiftShader WebGL, so the rides render the same on any machine (no GPU needed)
//   - Google Fonts served from the local @fontsource packages when installed, so screenshots work offline
//   - CHROMIUM_PATH=/path/to/chrome uses a specific browser binary instead of Playwright's download
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NM = path.join(ROOT, 'node_modules');

export function playwright() {
  try { return require('playwright'); }
  catch { console.error('Playwright is not installed. Run:\n  npm install\n  npx playwright install chromium'); process.exit(2); }
}

/* USE_GPU=1 renders with the machine's GPU instead of SwiftShader: faster, but screenshots then vary by machine */
export async function launch() {
  const { chromium } = playwright();
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: process.env.USE_GPU ? ['--ignore-gpu-blocklist', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
}

/* Google Fonts css2 request -> @font-face rules pointing at local woff2 files (latin subset) */
function localFontCss(urlStr) {
  let css = '', ok = true;
  for (const fam of new URL(urlStr).searchParams.getAll('family')) {
    const name = fam.split(':')[0].trim(), id = name.toLowerCase().replace(/\s+/g, '-');
    const dir = path.join(NM, '@fontsource', id, 'files');
    if (!fs.existsSync(dir)) { ok = false; continue; }
    const re = new RegExp(`^${id}-latin-(\\d+)-(normal|italic)\\.woff2$`);
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(re);
      if (m) css += `@font-face{font-family:'${name}';font-style:${m[2]};font-weight:${m[1]};font-display:swap;src:url(https://fonts.gstatic.com/__local/${id}/${f}) format('woff2');}\n`;
    }
  }
  return ok ? css : null;
}

/* route a context's requests: our own server passes through, fonts come from disk when possible (else the network),
   anything else external is reported through onExternal and blocked */
export async function routeRequests(ctx, siteUrl, onExternal = () => {}) {
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(siteUrl) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    const u = new URL(url);
    if (u.host === 'fonts.googleapis.com') {
      const css = localFontCss(url);
      return css != null ? route.fulfill({ status: 200, contentType: 'text/css', body: css, headers: { 'access-control-allow-origin': '*' } }) : route.continue();
    }
    if (u.host === 'fonts.gstatic.com') {
      if (u.pathname.startsWith('/__local/')) {
        const [, , id, file] = u.pathname.split('/'), p = path.join(NM, '@fontsource', id, 'files', file);
        if (fs.existsSync(p)) return route.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(p), headers: { 'access-control-allow-origin': '*' } });
        return route.abort();
      }
      return route.continue();
    }
    onExternal(`${route.request().resourceType()} ${url}`);
    return route.abort();
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const RIDES = JSON.parse(fs.readFileSync(path.join(ROOT, 'rides.json'), 'utf8'));
