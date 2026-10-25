# Instructions for Codex

## What this is

This is maxmartinelli.com, Max Martinelli's personal site, rebuilt as one static page.

- **The hero:** one of four WebGL "rides", picked at random on each visit.
- **The rest of the page:** shared across all rides.
- **Who built it:** Claude, working with Max. Codex reviewed it (`REVIEW.md`); the launch blockers it found are fixed (see the end of `REVIEW.md`). It goes live once Max approves the Cloudflare preview.
- **Where to read more:**
  - `README.md` explains the architecture and the commands;
  - `docs/ENGINE_API.md` is the contract between the runtime and the rides.

## Your job

1. **Review.** Look for anything that would break for visitors or embarrass Max: bugs, crashes, broken links, accessibility failures, poor performance on phones, cross-browser problems (Safari and iOS especially), weak metadata, or deploy problems.
2. **Write `REVIEW.md`.** Use the format below.
3. **Fix only clear, low-risk problems**, following the rules below. List every change in `REVIEW.md`.
4. **Do not deploy** unless Max explicitly asks in this session. See "Deploy" below.

## Setup and commands

```bash
npm install && npx playwright install chromium   # once
python3 build.py              # rebuild public/ from src/ + static/ (deterministic, stdlib only)
npm run check                 # static checks (~5 s): build freshness, script syntax, engine contract, silence, HTML/meta, deploy files
npm test                      # browser tests (~4 min): every ride on desktop + phone, pause, off-screen, reduced motion,
                              #   random pick, "Take another ride", keyboard; one ride: node tests/site.test.mjs --ride=asymptote
node tools/preview.mjs        # screenshots into preview/<ride>/ (add --flash for the flash-safety scan, ~3 min per ride)
node tools/preview.mjs --ride=<id> --scans-only --flash --hold   # flash scans at normal speed and while held
npm run serve                 # http://127.0.0.1:8788, served like Cloudflare Pages; add #many-worlds etc. to pick a ride
```

`npm run verify` must pass before you finish.

The tests and screenshots use software WebGL (SwiftShader), so expect them to be slow.

- **Check SwiftShader before calling a performance problem real.** Example: Floating World can sit on its first frame for several seconds after first paint while SwiftShader compiles its shaders. The tests wait for it.
- **If tests fail with "WebGL canvas never faded in"**, headless Chromium could not start software WebGL on this machine. Rerun with `USE_GPU=1` to use the real GPU before treating it as a site bug.

## Layout

```
src/shell.html       all markup, copy and CSS; per-ride colour tokens; head script that picks the ride before first paint
src/runtime.js       shared host: canvases + adaptive resolution, clock, seek/play, hold-to-accelerate, pause, fallbacks
src/engines/*.js     many-worlds, scale-invariant, floating-world, asymptote (test.js: dev-only smoke test, never shipped)
static/              404.html, icons, og.png, _headers (copied into public/ by build.py)
public/              GENERATED: what Cloudflare serves. Never edit by hand
tools/, tests/       checks, contract test, Pages-like server, screenshot/flash tool, browser tests
docs/reference/      expected screenshots: <ride>-desktop-frames.png and <ride>-phone-frames.png use the same t values as
                     preview.mjs; layout-desktop-page.png and layout-phone-page.png show the whole page
```

## Review checklist

### Correctness and robustness

- **`runtime.js` loop lifecycle:**
  - pause and play;
  - the hero leaving and re-entering the viewport;
  - the tab being hidden;
  - resize and orientation change;
  - `seek()` followed by `play()`.
- **Input:** pointer, touch and Space. Space must not hijack page scrolling when focus is on a control or the hero is out of view.
- **Fallbacks:** each must leave a decent still.
  - no WebGL;
  - `initGL()` returns false;
  - `draw()` throws.
- **WebGL context loss and restore:** is it handled per engine?
- **Long sessions:** precision as t grows over hours, especially `mediump` on mobile GPUs, and NaN or Infinity paths.
- **Allocations:** per-frame allocations that cause garbage-collection stutter.
- **Ride picking:** with storage blocked (Safari private mode, storage exceptions), with the `#ride` hash, and with "Take another ride".

### Accessibility (WCAG 2.2 AA)

- **Pause control:** it works and is labelled correctly (`aria-pressed`, `aria-label`).
- **Reduced motion:** visitors get a still and no animation loop.
- **Flashing:** no more than 3 flashes per second (`preview.mjs --flash`).
- **Keyboard:**
  - focus order and visible focus;
  - the skip link;
  - landmarks and headings;
  - accessible names.
- **Contrast:** the hero text over every ride and every Many Worlds world, including the light "ink" world, where the hero re-inks itself dark.
- **Touch targets:** at least 44 px.

### Performance

- **Load:** time to the poster frame and main-thread work at load.
- **Shader compile:** stalls on mobile GPUs. Is the warm-up complete?
- **Adaptive resolution:** how it behaves on phones.
- **Battery:** the loop must stop when the hero is off-screen or the tab is hidden.
- **Page weight:** about 196 KB of HTML, about 72 KB gzipped, in one request. This is a deliberate choice.

### Cross-browser

- **Safari and iOS:**
  - WebGL1 paths;
  - `svh` and `overflow: clip`;
  - pointer events and `touch-action`;
  - Low Power Mode, which throttles requestAnimationFrame.
- **Firefox.**
- **Android Chrome.**

### Metadata and deploy

- **Head tags:** title, description, Open Graph and Twitter tags, `og.png` (1200×630), favicon set and `lang`.
- **Deploy files:**
  - the 404 page;
  - `_headers` syntax;
  - no dev ride shipped;
  - `SITE_URL` in `build.py` is right.

## Flash safety

Every ride must stay at 3 flashes per second or fewer (WCAG 2.3.1), both at normal speed and while a visitor holds to accelerate.

- **Check both** after any change to a ride or to the runtime's acceleration: `node tools/preview.mjs --ride=<id> --scans-only --flash --hold`. Both scans fail above 3.
- **Floating World is the tight one.** Its barrels already reach 3 at normal speed. Held at 5× they reached 6, so its held speed is capped at 2× with `warpCap` (2.5× measured 4). Its field-of-view kick, spray and vibration follow `live.intent`, so holding still feels like flooring it. Don't raise the cap without rerunning `--hold`.
- **Held scans replay the runtime's hold ramp.** If you change `frame()` in `src/runtime.js`, update the `--hold` block in `tools/preview.mjs` to match.

## Intentional choices (do not report these as problems)

- **Hero and build:** the animation-heavy hero is the point of the site. The page is one self-contained HTML file with inline JS and CSS, and no framework or bundler.
- **Copy:** the playful "intern" copy and the three "Open slot" Lab placeholders are Max's choices.
- **Storage:** `localStorage` and `sessionStorage` only remember which ride to avoid or show next. There are no cookies, analytics or trackers.
- **No sound:** the site is silent on purpose, and the sound feature was removed. Do not add audio.
- **No CSP:** `_headers` deliberately sets no Content-Security-Policy, because Cloudflare zone features inject scripts. You may recommend one in `REVIEW.md`, but do not add it.
- **Many Worlds:** it has five worlds. A sixth, "negative", was removed because it looked too much like "ink". At the ink rifts the hero text snaps between light and dark instead of fading, so it never matches its scrim.
- **Floating World's 2× held speed:** a flash-safety cap (see above), not a bug.
- **Retired essay:** `/articles/learning` and its `.html` and trailing-slash forms redirect home on purpose (`static/_redirects`).
- **Runtime globals:** `window.seek`, `play`, `render`, `DURATION`, `MM_RIDE` and `MM_STILL` stay. The tools use them.

## Rules for changes

- **Where to edit:** change `src/` or `static/`, never `public/`. Run `python3 build.py` afterwards.
- **Look and feel:** do not change it without Max. That covers colours, type, layout, copy, ride timing and what any shader draws. If you think something should change, write it up as a recommendation.
- **Static and dependency-free at runtime:** no frameworks, bundlers, external scripts, analytics or tracking.
- **Determinism:** `draw(t, null)` stays deterministic.
- **Dependencies:** new dev dependencies need Max's OK.
- **After any change:** run `npm run verify`.
- **After an engine change:**
  - run `node tools/preview.mjs --ride=<id> --flash --hold`;
  - compare `preview/<id>/desktop-frames.png` with `docs/reference/<id>-desktop-frames.png`.
- **Commits:** small, focused commits with clear messages. Never commit secrets or tokens.

## REVIEW.md format

```markdown
# Review: maxmartinelli.com
**Verdict:** Ship / Ship after fixes / Don't ship. One short paragraph on why.

## Findings
| # | Severity | Area | File:line | Problem | Evidence | Suggested fix | Fixed? |
P0 = broken or embarrassing for many visitors; P1 = broken on some browsers/devices, or an accessibility failure;
P2 = quality issue; P3 = polish.

## Changes made
(file, what, why, how verified)

## What I ran
(each command and its result)

## Recommendations for Max
(design or product suggestions you did not implement)
```

## Deploy (only when Max explicitly asks)

The live site runs on Cloudflare Pages, connected to a GitHub repo. A push to the production branch deploys it.

1. **Find the repo.** Find Max's site repo, or ask him for its path, then confirm the remote with `git remote -v`.
2. **Branch.** Create a branch such as `site-v2`.
3. **Replace the old site with this package.** Keep `.git`. List the old files you remove in your summary.
4. **Check the Pages build settings with Max.** He changes these in the dashboard (Workers & Pages, then the project, then Settings, then Build):
   - Build command: empty;
   - Build output directory: `public`.
5. **Canonical host (done).** The apex serves the site and `www` has no DNS record, so `SITE_URL`, the canonical link and `og:url` use `https://maxmartinelli.com/`. Recheck only if Max adds `www`.
6. **Old URLs (done).** `static/_redirects` sends the retired essay's three URLs home. Ask Max before adding any other redirect.
   Also ask Max to turn on **Always Use HTTPS** in Cloudflare (SSL/TLS, then Edge Certificates): `http://` currently serves the page without redirecting.
7. **Preview.** Push the branch. Pages builds a preview at `https://<branch>.<project>.pages.dev`. Check:
   - each `#ride`;
   - `/no-such-page` returns 404, and `/articles/learning` returns 301 to `/`;
   - the head tags (`curl -s <preview> | grep og:`).
8. **Go live.** Merge to the production branch only after Max approves the preview.
9. **After launch:**
   - verify the live domain;
   - run the URL through LinkedIn Post Inspector so the new `og.png` replaces the cached preview.
