# Instructions for Codex

## What this is

This is maxmartinelli.com, Max Martinelli's personal site: one static page.

- **The hero:** one WebGL ride, **Many Worlds**. Every 6 s the frame tears into another world: eight worlds in a 48 s loop.
  - Many Worlds draws five worlds itself: blue hour, contour, ink, crystal and molten.
  - The other three are the site's former stand-alone rides: Scale Invariant, Floating World and Asymptote. Many Worlds builds their engines itself and lends them its WebGL context, so each world plays 6 s of its old ride.
  - Every visit gets the same ride. The random pick between four rides is gone.
- **The rest of the page:** wears Many Worlds' theme. Only the hero's text and scrim change colour, per world.
- **Who built it:** Claude, working with Max.
  - Codex reviewed the launch build in `REVIEW.md`, and the launch blockers it found are fixed (see the end of that file).
  - The site is live as the Cloudflare Worker `personal-site`.
  - The one-ride ("multiverse") version goes live once Max approves its preview.
- **Where to read more:**
  - `README.md` explains the architecture, the commands and deploying;
  - `docs/ENGINE_API.md` is the contract between the runtime and the engines, and explains how Many Worlds embeds its worlds.

## Your job

1. **Review.** Look for anything that would break for visitors or embarrass Max:
   - bugs, crashes and broken links;
   - accessibility failures;
   - poor performance on phones;
   - cross-browser problems (Safari and iOS especially);
   - weak metadata;
   - deploy problems.
2. **Write a review file** in the format below. The file is `REVIEW.md` for a full review, or whatever name your task gives. The multiverse audit uses `REVIEW-multiverse.md`, so the launch review stays as it is.
3. **Fix only clear, low-risk problems**, following the rules below. List every change in your review file.
4. **Do not deploy** unless Max explicitly asks in this session. See "Deploy" below.

## Setup and commands

```bash
npm install && npx playwright install chromium   # once
python3 build.py              # rebuild public/ from src/ + static/ (deterministic, stdlib only)
npm run check                 # static checks (~5 s): build freshness, script syntax, engine contract (all four engines),
                              #   silence, HTML/meta, deploy files
npm test                      # browser tests (~5 min): the ride on desktop + phone, pause, off-screen, reduced motion,
                              #   all eight worlds and tears (desktop + phone), lost/restored WebGL context, each embedded
                              #   world = its engine standalone, deep links, a live hold through the worlds, the Lab map,
                              #   keyboard
                              #   only the worlds: node tests/site.test.mjs --worlds; only the Lab map: --lab; --quick
                              #   skips the phone runs and the live hold
node tools/preview.mjs        # screenshots into preview/many-worlds/: the middle of each world (MM_SHOTS), layout pages
node tools/preview.mjs --ride=many-worlds --scans-only --flash --hold   # flash scans: the 48 s loop, and 20 s held (~10 min)
python3 build.py --only floating-world   # dev page with one embedded engine as a stand-alone ride (dev/, never deploy)
npm run serve                 # http://127.0.0.1:8788, served like Cloudflare; #asymptote, #ink etc. start in that world
```

`npm run verify` must pass before you finish.

The tests and screenshots use software WebGL (SwiftShader), so expect them to be slow.

- **Check SwiftShader before calling a performance problem real.** Example: compiling an embedded world's shaders takes 0.2–1.3 s in SwiftShader, far longer than on a real GPU. The tests wait for it.
- **If tests fail with "WebGL canvas never faded in"**, headless Chromium could not start software WebGL on this machine. Rerun with `USE_GPU=1` to use the real GPU before treating it as a site bug.

## Layout

```
src/shell.html       all markup, copy and CSS; colour tokens; head script that sets data-ride before first paint
src/runtime.js       shared host: canvases + adaptive resolution (per world), clock, seek/play, hold-to-accelerate,
                     pause, fallbacks
src/engines/         many-worlds.js (the ride; hosts the embedded worlds); scale-invariant.js, floating-world.js,
                     asymptote.js (the embedded engines, still standalone-capable); test.js (dev-only, never shipped)
rides.json           the ride that ships: ["many-worlds"]
worlds.json          the engines that ship only inside Many Worlds: ["scale-invariant", "floating-world", "asymptote"]
src/lab/             the Sweet Spots Lab card's parts, inlined by <!--include:...-->: sweet-spots-map.js (the live map),
                     sweet-spots-data.json (its data) and two generated SVGs (tools/lab/ regenerates the data and SVGs)
static/              404.html, icons, og.png, _headers, _redirects, lab/ pictures, and sweet-spots/ (the Sweet Spots
                     project, served at /sweet-spots/); build.py copies all of it into public/
public/              GENERATED: what Cloudflare serves. Never edit by hand
wrangler.json        the Cloudflare Worker personal-site: static assets from ./public, 404.html for unknown paths
tools/, tests/       checks, contract test, Cloudflare-like server, screenshot/flash tool, browser tests
docs/reference/      expected screenshots: many-worlds-desktop-frames.png and many-worlds-phone-frames.png (the middle of
                     each world, MM_SHOTS); layout-desktop-page.png and layout-phone-page.png (whole page, Lab map paused)
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
- **WebGL context loss and restore.** Many Worlds owns it for all four engines; the tests cover one loss and restore.
- **Long sessions:** precision as t grows over hours, especially `mediump` on mobile GPUs, and NaN or Infinity paths. The embedded engines only ever see their own 6 s windows (6–12 s of their timelines), whatever the loop count.
- **Allocations:** per-frame allocations that cause garbage-collection stutter.
- **Deep links:** a world's id in the hash (`#asymptote`, `#ink`, ...) starts the ride just past the tear into that world. `#many-worlds`, `#night` and unknown hashes start at the beginning. Nothing is stored.
- **The Lab map (`src/lab/sweet-spots-map.js`):** its fly-in, tour, Pause tour button, hover and tap, resize, and sleeping off-screen. It has its own loop, separate from the hero's.

### Many Worlds embedding (new in the multiverse version)

Read `docs/ENGINE_API.md`, "Embedding", first.

- **One context, four engines.** Many Worlds resets GL state before and after every embedded draw (`cleanGL`). Look for state that still leaks: an engine leaving a framebuffer, program, texture unit, attribute or blend state that the next one depends on. Scale Invariant renders through its own framebuffer and must return to the `target` it was given.
- **Render targets.** The tear buffers (`fbFor`) carry depth renderbuffers because Floating World's sea is depth-tested. Check resize, and a tear at a new size.
- **When engines compile.**
  - Behind the poster: the world the ride starts in and the next one.
  - During each tear's frozen frame (the hit-stop): the world after next.
  - A seek, a deep link or a restored context compiles on demand.
  - Look for a visible hitch the first time each world appears on a phone GPU.
- **Failure.** If an embedded engine is missing, or throws while building, compiling or drawing, its slot plays a native stand-in world for the rest of the visit (`fb` in the world table) and logs `console.error`. Try it, for example by making an engine's `initGL` return false in a dev build.
- **Resolution.** Each world keeps its own adaptive render scale (`qualityKey` and `scale0For` in the engine, `quality()` in the runtime). The key switches at the hit-stop, so the frozen frame and the tear render at the incoming world's scale.
- **Hero colours.**
  - Each world has its own set: the `ui` entries in `many-worlds.js`, applied through `rt.heroInk`.
  - The switch snaps when the tear has uncovered half the name.
  - The hero carries `data-world`.
  - Floating World's seal and print marks show only in its world, and never in the reduced-motion still.
- **Speed caps.** Every tear plays near real time (`warpCap` 1.25). An embedded world keeps its ride's own cap, so Floating World's world tops out at 2×.
- **Memory.** All four engines' GPU programs and buffers live on one context at once. Watch phones with little memory.

### Accessibility (WCAG 2.2 AA)

- **Pause controls:** the hero's works and is labelled correctly (`aria-pressed`, `aria-label`); the Lab map's Pause tour button stops its tour for good.
- **Reduced motion:** visitors get a still and no animation loop, in the hero (the tear from blue hour into the Menger sponge) and in the Lab map.
- **Flashing:** no more than 3 flashes per second, over the whole 48 s loop and while held (`preview.mjs --flash --hold`).
- **Keyboard:**
  - focus order and visible focus;
  - the skip link;
  - landmarks and headings;
  - accessible names.
- **Contrast:** the hero text over all eight worlds and through every tear, including the light ink world, where the hero re-inks itself dark, and Floating World's cream-on-navy set.
- **Touch targets:** at least 44 px.

### Performance

- **Load:** time to the poster frame and main-thread work at load. The page still builds all four engines, then compiles two worlds before the first frame.
- **Shader compile:** stalls on mobile GPUs (see "When engines compile" above).
- **Adaptive resolution:** how it behaves on phones, world by world.
- **Battery:** the hero's loop must stop when the hero is off-screen or the tab is hidden, and the Lab map's when it is off-screen.
- **Page weight:** about 283 KB of HTML, about 105 KB gzipped, in one request. This is a deliberate choice. The Lab map's data is about 11 KB of that; its candy pictures load only during its tour.

### Cross-browser

- **Safari and iOS:**
  - WebGL1 paths, and a context with a depth buffer;
  - `svh` and `overflow: clip`;
  - pointer events and `touch-action`;
  - Low Power Mode, which throttles requestAnimationFrame.
- **Firefox.**
- **Android Chrome.**

### Metadata and deploy

- **Head tags:** title, description, Open Graph and Twitter tags, `og.png` (1200×630), favicon set and `lang`.
- **Deploy files:**
  - the 404 page;
  - `_headers` and `_redirects` syntax;
  - no dev ride shipped;
  - `SITE_URL` in `build.py` is right;
  - `wrangler.json` serves `./public`.

## Flash safety

The hero must stay at 3 flashes per second or fewer (WCAG 2.3.1), both at normal speed and while a visitor holds to accelerate.

- **Check both** after any change to an engine, to the world order or windows, or to the runtime's acceleration: `node tools/preview.mjs --ride=many-worlds --scans-only --flash --hold`. The normal scan covers the whole 48 s loop and the held scan 20 s of holding (about 68 s of ride, every world and tear). Both fail above 3.
- **The Floating World world is the tight one.** It measures 3 at normal speed (around t = 21 s) and 3 while held at its 2× cap.
  - As a stand-alone ride held at 5× it reached 6, and 2.5× reached 4.
  - Its field-of-view kick, spray and vibration follow `live.intent`, so holding still feels like flooring it.
  - Don't raise its cap, or move its 6 s window (`from` in `XW`), without rerunning both scans.
- **Held scans replay the runtime's hold ramp.** If you change `frame()` in `src/runtime.js`, update the `--hold` block in `tools/preview.mjs` to match.

## Intentional choices (do not report these as problems)

- **Hero and build:** the animation-heavy hero is the point of the site. The page is one self-contained HTML file with inline JS and CSS, and no framework or bundler.
- **One ride:** Max chose to stop changing the theme on every visit.
  - Many Worlds is the only ride, and the other three rides live on as its worlds.
  - Their engines stay in `src/engines/` and still pass the engine contract on their own, so they can be checked stand-alone, but they ship only inside Many Worlds.
- **The embedded worlds play 6 s of their rides**, from 6 s into each ride's timeline, not their whole 20 s loops.
- **Copy:** the playful "intern" copy and the one-sentence About are Max's choices.
- **Hidden sections:** Talks and Writing are commented out in `src/shell.html` on purpose until there's something to show; the `#articles` alias sits on the Lab heading meanwhile.
- **Lab:** the Sweet Spots card deliberately wears that project's own design (strawberry wrapper, Archivo wordmark as outlines, the project's live map and tour), in fixed colours.
  - The map tours on its own when it scrolls into view, as it does on the Sweet Spots page.
  - Its tour card is a picture only, because this site has no candy pages to open.
  - Offbook Chess and the monograph say "Coming soon" on purpose.
- **Storage:** none. No cookies, analytics, trackers or `localStorage`.
- **Footer:** only "Back to top", on purpose. The ride's name, caption and "Take another ride" were removed.
- **Desktop layout:** at 1200 px and wider, section headings sit in a left rail; content is capped at 1440 px and left-aligned with the hero's name.
- **No sound:** the site is silent on purpose, and the sound feature was removed. Do not add audio.
- **No CSP:** `_headers` deliberately sets no Content-Security-Policy, because Cloudflare zone features inject scripts. You may recommend one in your review, but do not add it.
- **Many Worlds' native worlds:** five of them. A sixth, "negative", was removed because it looked too much like "ink". At every tear the hero text snaps between world colour sets instead of fading, so it never matches its scrim.
- **Floating World's 2× held speed:** a flash-safety cap (see above), not a bug.
- **og.png:** the social image is a frame of the former stand-alone Asymptote ride (its t = 12.4 s). The embedded Asymptote world never shows that exact frame, but the image still shows a world of the hero. It was kept on purpose.
- **Retired essay:** `/articles/learning` and its `.html` and trailing-slash forms redirect home on purpose (`static/_redirects`).
- **Runtime globals:** the tools use these, so they stay:
  - `window.seek`, `play`, `render`;
  - `DURATION`, `MM_RIDE`, `MM_STILL`;
  - `MM_FRAMES` (the hero's live frame count);
  - `MM_SHOTS` (the times the tools photograph) and `MM_WORLDS` (the world list).

  The tools also use the Lab map's `data-state` attribute and the hero's `data-world` attribute.

## Rules for changes

- **Where to edit:** change `src/` or `static/`, never `public/`. Run `python3 build.py` afterwards.
- **Look and feel:** do not change it without Max. That covers:
  - colours, type, layout and copy;
  - the order of the worlds, their windows and their timing;
  - what any shader draws.

  If you think something should change, write it up as a recommendation.
- **Static and dependency-free at runtime:** no frameworks, bundlers, external scripts, analytics or tracking.
- **Determinism:** `draw(t, null)` stays deterministic, and an embedded world draws exactly what its engine draws standalone (a test checks it).
- **Dependencies:** new dev dependencies need Max's OK.
- **After any change:** run `npm run verify`.
- **After an engine change:**
  - run `node tools/preview.mjs --ride=many-worlds --flash --hold`;
  - compare `preview/many-worlds/desktop-frames.png` with `docs/reference/many-worlds-desktop-frames.png`.
- **Commits:** small, focused commits with clear messages. Never commit secrets or tokens.

## Review file format

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

The live site is the Cloudflare Worker `personal-site`, serving `public/` as static assets (`wrangler.json`). The GitHub repo is `mxmrt/personal-site`, production branch `main`.

1. **Branch.** Work on a branch, never directly on `main`. Confirm the remote with `git remote -v`.
2. **Before you push:** `npm run verify` passes, and `python3 build.py --check` shows `public/` is fresh.
3. **Preview.** Push the branch and open a pull request. Get a preview URL without touching production:
   - `npx wrangler versions upload` uploads a version and, with preview URLs enabled on the Worker, prints its URL;
   - or, if the Worker's Git integration is connected, use the preview it builds for the branch.

   On the preview, check:
   - the ride: hold to accelerate, watch a full 48 s loop, and try `#floating-world`, `#ink` and `#asymptote`;
   - `/sweet-spots/` still loads, with its pictures;
   - `/no-such-page` returns 404, and `/articles/learning` returns 301 to `/`;
   - the head tags (`curl -s <preview> | grep og:`).
4. **Go live.** Only after Max approves the preview: merge the pull request. Then run `npx wrangler deploy` from `main`, unless the Git integration already deploys `main`. Verify `https://maxmartinelli.com` the same way.
5. **Roll back** if something is wrong live: `npx wrangler rollback` returns to the previous version, or revert the merge on `main` and deploy again.
6. **Ask Max** before adding redirects. Ask him to turn on **Always Use HTTPS** (SSL/TLS, then Edge Certificates) if `http://` still serves the page without redirecting.
