# Ride engine contract

The page has one shared shell, one shared runtime and four ride engines. Each visit picks one ride. Only the hero animation and a small set of colour tokens change between rides. Everything else is common.

This file is the contract between `src/runtime.js` and each `src/engines/<id>.js`. `tools/engine-contract.mjs` checks it automatically, and `npm run check` runs that script.

## Files

| File | What it is |
|---|---|
| `src/shell.html` | All markup, copy and CSS. It holds the per-ride colour tokens (`:root[data-ride="<id>"]{...}`) and a small head script that picks the ride before first paint. |
| `src/runtime.js` | Builds the chosen engine and owns everything the rides share (listed below). |
| `src/engines/<id>.js` | One ride. The shipped ids are listed in `rides.json`. `test.js` is a dev-only smoke-test ride and never ships. |
| `rides.json` | The rides that ship, in order. `build.py` and the tools all read it. |
| `build.py` | Inlines the shell, engines and runtime into `public/index.html`. |

## What the runtime owns

### Canvases and resolution

- **`#gl` (WebGL):** sized to CSS size × min(devicePixelRatio, `E.Q.pr`) × an adaptive render scale.
  - The scale starts at `E.Q.scale0`, steps down when frames run slow and steps back up when they are fast.
  - Resizing happens before drawing. A resize after a draw would present a cleared (black) frame.
  - The runtime calls `E.resize(w, h)` when the pixel size changes.
- **`#pc` (2D poster):** sized to CSS size × min(dpr, 2). `E.poster(ctx, w, h, t, photo)` paints it. It is the first thing a visitor sees, and the fallback when WebGL is missing or fails.
- **Fade-in:** `#gl` fades in over the poster after the first successful `E.draw`.

### Clock and playback

- **Live time:** `tLive` advances by dt × warp.
- **Globals the tools and tests use:** `window.seek(t)`, `play()`, `render(t)`, `DURATION`, `MM_RIDE` and `MM_STILL`.
- **When the loop stops:**
  - the Pause button is pressed (WCAG 2.2.2);
  - the hero scrolls off-screen (IntersectionObserver);
  - the tab is hidden.
- **Resize:** a debounced resize triggers a redraw.

### Input: hold to accelerate

- **Lean:** follows mouse x or a touch drag, smoothed.
- **Hold (mouse, touch or Space):**
  - warp eases from 1× to 4× over 1.2 s, then creeps toward 5×;
  - a tap gives a 0.6 s burst;
  - on release, warp eases back over about a second.
- **Cap:** `E.warpCap(t)` can limit warp. Many Worlds uses it so every rift plays at near real time.

### Hero text and footer

- **Hint:** "Hold to accelerate" hides on the first press, or once ride time passes `E.hintAt`.
- **Name entrance:** there is a default. `E.entrance(tw, nm, tg)` overrides it.
- **Footer:** shows "This visit: `E.title`. `E.caption`" and a "Take another ride" button.

### Fallbacks

- **`prefers-reduced-motion: reduce`:** the runtime draws one still with `E.draw(E.T_STILL, null, true)`, runs no loop and hides the controls.
- **WebGL failure:** if WebGL is missing, `initGL()` returns false or throws, or `draw()` throws, the visitor sees the poster at `T_STILL` for the rest of the visit.

### No sound

The site is silent by design. Engines must not use audio of any kind.

## Engine file format

```js
window.MM_ENGINES['<id>'] = function (rt) {
  'use strict';
  // all of the ride's state lives in this closure: no globals, no top-level code outside it
  return {
    id: '<id>', title: 'Asymptote',        // footer: "This visit: Asymptote."
    caption: 'One plain-text sentence.',   // footer caption, no HTML
    DURATION: 20, T_STILL: 12.4,           // seconds: preview span for the tools; the reduced-motion / poster still
    hintAt: 6,                             // optional: ride seconds before the hint fades
    Q: { pr: 2, scale0: 1 },               // optional: pixel-ratio cap and starting render scale for #gl
    initGL() { /* create the context on rt.cv, compile, allocate; return true on success */ },
    resize(w, h) { /* optional: device-pixel size of rt.cv changed */ },
    draw(t, live, photo) { /* one frame at time t; live is null for seek/still frames */ },
    poster(ctx, w, h, t, photo) { /* 2D still on rt.pc, also the no-WebGL fallback */ },
    warpCap(t) { /* optional: max warp allowed at t */ },
    entrance(tw, nm, tg) { /* optional: name entrance; tw = wall seconds since load, 99 = finished */ },
    css: '...'                             // optional ride-only CSS (decoration); never restyle shared layout
  };
};
```

### What `rt` gives you

- **Helpers:** `W`, `D`, `TAU`, `clamp`, `sat`, `sstep`, `smoother`, `mod`, `mulberry32`, `hash`.
- **Environment flags:** `REDUCED`, `COARSE`, `PHONE`.
- **Elements:**
  - `hero`, `cv` (#gl), `pc` (#pc), `nm`, `tg`, `idBlock`;
  - `deco`, an empty `aria-hidden` layer above the canvases and below the scrim, for decorative DOM such as Floating World's seal.
- **Hero size:** `cssW` and `cssH`, updated on every sizing.
- **`textBox(tight)`:** the name block's rect in CSS px relative to the hero, `{x, y, w, h, W, H}`, for text-safe masks.
- **`heroInk({hf, hs, hb, ha, hfoc, hh})`:** re-inks the hero text, scrim, control borders, accent, focus ring and nav hover from `draw(t)`. Many Worlds' light "ink" world uses it. `heroInk(null)` restores the theme.

### `live` (live frames only)

| Field | Meaning |
|---|---|
| `lean` | −1..1, smoothed |
| `warp` | 1..5 |
| `boost` | sat((warp − 1) / 3) |
| `intent` | the boost the hold asks for before `warpCap` (equals `boost` when uncapped); drive boost visuals from it so a capped ride still feels the hold |
| `wave` | seconds since the last press (large if never) |
| `down` | downshift envelope 0..1 after a long hold is released |
| `holding` | bool |

## Rules

- **Deterministic:** `draw(t, null)` is a pure function of t, using seeded randomness only. `seek(t)` must reproduce a frame exactly.
- **No throws:** `draw` must not throw in normal operation. A throw drops the visitor to the poster for the rest of the visit.
- **Flash safety:** no more than 3 flashes per second in any part of the hero, at normal speed and while held to accelerate.
  - `node tools/preview.mjs --ride=<id> --scans-only --flash --hold` checks both.
  - If holding pushes a ride past 3, cap its speed with `warpCap` and drive its boost visuals from `live.intent`, as Floating World does (capped at 2×).
- **Legible text:**
  - rides keep the area behind the name calm, using text-safe masks;
  - a ride that turns light re-inks the hero with `rt.heroInk`.
- **Decoration:** ride-only decoration goes in `rt.deco`, styled with `E.css`. It stays clear of the text and the controls.

## Adding or changing a ride

1. Edit `src/engines/<id>.js`.
   - For a new ride, add its id to `rides.json`.
   - Also add a `:root[data-ride="<id>"]{...}` token block to `src/shell.html`.
2. Run `python3 build.py --only <id>`. It writes `dev/<id>.html` containing just that ride.
   - Serve it with `node tools/serve.mjs dev`.
   - Open `/<id>.html#<id>`.
3. Run `python3 build.py`, then `npm run verify`.
4. Run `node tools/preview.mjs --ride=<id> --flash --hold`.
5. Compare `preview/<id>/desktop-frames.png` with `docs/reference/<id>-desktop-frames.png`. Both use the same t values.
