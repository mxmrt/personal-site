# Engine contract

The page has one shared shell, one shared runtime and one ride: **Many Worlds**. It takes you through eight worlds in a 48 s loop. It draws five of them itself. The other three are drawn by the site's other engines, Scale Invariant, Floating World and Asymptote, which Many Worlds embeds as worlds. Those three still meet this contract as standalone rides, so they can be built and checked on their own.

This file is the contract between `src/runtime.js` and each `src/engines/<id>.js`, and between Many Worlds and the engines it embeds. `tools/engine-contract.mjs` checks every engine automatically, and `npm run check` runs that script.

## Files

| File | What it is |
|---|---|
| `src/shell.html` | All markup, copy and CSS. It holds the colour tokens (`:root[data-ride="many-worlds"]{...}`) and a small head script that sets `data-ride` before first paint. |
| `src/runtime.js` | Builds the ride's engine and owns everything around it (listed below). |
| `src/engines/many-worlds.js` | The ride. It hosts the embedded worlds. |
| `src/engines/scale-invariant.js`, `floating-world.js`, `asymptote.js` | Engines that ship as worlds inside Many Worlds. Each still runs standalone with `python3 build.py --only <id>`. |
| `src/engines/test.js` | A dev-only smoke-test ride. It never ships. |
| `rides.json` | The rides the page can pick: `["many-worlds"]`. |
| `worlds.json` | The engines that ship only to be embedded: Scale Invariant, Floating World and Asymptote. |
| `build.py` | Inlines the shell, the world engines, the ride and the runtime into `public/index.html`. |

## What the runtime owns

### Canvases and resolution

- **`#gl` (WebGL):** sized to CSS size × min(devicePixelRatio, `E.Q.pr`) × an adaptive render scale.
  - The scale starts at `E.Q.scale0`, steps down when frames run slow and steps back up when they are fast.
  - **Per-world scales:** if the engine has `E.qualityKey(t)`, each key keeps its own scale. A new key starts at `E.scale0For(key)`, or `E.Q.scale0` when that returns nothing. Many Worlds keys on the world, so a heavy world never leaves the light ones blurred. That matters most at 60 Hz, where a lowered scale can never climb back.
  - Resizing happens before drawing. A resize after a draw would present a cleared (black) frame.
  - The runtime calls `E.resize(w, h)` when the pixel size changes.
- **`#pc` (2D poster):** sized to CSS size × min(dpr, 2). `E.poster(ctx, w, h, t, photo)` paints it. It is the first thing a visitor sees, and the fallback when WebGL is missing or fails.
- **Fade-in:** `#gl` fades in over the poster after the first successful `E.draw`.

### Clock and playback

- **Live time:** `tLive` starts at `E.start`, or 0, and advances by dt × warp. Many Worlds sets `start` when the URL names one of its worlds.
- **Globals the tools and tests use:**
  - `window.seek(t)`, `play()` and `render(t)`;
  - `DURATION`, `MM_RIDE` and `MM_STILL`;
  - `MM_FRAMES`, the count of live hero frames;
  - `MM_SHOTS`, from `E.SHOTS`: the times the tools photograph;
  - `MM_WORLDS`, from `E.WORLDS`: the world list.
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
- **Cap:** `E.warpCap(t)` can limit warp. Many Worlds holds every rift near real time, and gives each embedded world its own engine's cap. Floating World's world tops out at 2×.

### Hero text

- **Hint:** "Hold to accelerate" hides on the first press, or once `E.hintAt` seconds of ride have passed.
- **Name entrance:** there is a default. `E.entrance(tw, nm, tg)` overrides it.
- **Ride name and caption:** the page no longer shows `E.title` and `E.caption`. Keep providing them: the runtime fills `#ride-name` and `#ride-note` if the page has them.

### Fallbacks

- **`prefers-reduced-motion: reduce`:** the runtime draws one still with `E.draw(E.T_STILL, null, true)`, runs no loop and hides the controls. Many Worlds' still is the tear from blue hour into the Menger sponge.
- **WebGL failure:** if WebGL is missing, `initGL()` returns false or throws, or `draw()` throws, the visitor sees the poster at `T_STILL` for the rest of the visit.

### No sound

The site is silent by design. Engines must not use audio of any kind.

## Engine file format

```js
window.MM_ENGINES['<id>'] = function (rt) {
  'use strict';
  // all of the engine's state lives in this closure: no globals, no top-level code outside it
  return {
    id: '<id>', title: 'Asymptote',        // the ride's name (#ride-name, if the page has one)
    caption: 'One plain-text sentence.',   // its caption, no HTML (#ride-note, if the page has one)
    DURATION: 20, T_STILL: 12.4,           // seconds: span the tools preview and scan; the reduced-motion / poster still
    hintAt: 6,                             // optional: ride seconds before the hint fades
    Q: { pr: 2, scale0: 1 },               // optional: pixel-ratio cap and starting render scale for #gl
    initGL() { /* get the context from rt.cv, compile, allocate; return true on success */ },
    resize(w, h) { /* optional: device-pixel size of rt.cv changed */ },
    draw(t, live, photo, target) { /* one frame at time t; live is null for seek/still frames (target: see below) */ },
    poster(ctx, w, h, t, photo) { /* 2D still on rt.pc, also the no-WebGL fallback */ },
    warpCap(t) { /* optional: max warp allowed at t */ },
    entrance(tw, nm, tg) { /* optional: name entrance; tw = wall seconds since load, 99 = finished */ },
    css: '...',                            // optional engine-only CSS (decoration); never restyle shared layout
    // optional, for a ride whose cost or look changes over time (Many Worlds):
    SHOTS: [3, 9],                         // times the tools photograph (frame sheets)
    WORLDS: [{ id, at, from }],            // its worlds, for the tests
    start: 0,                              // live time to start at
    qualityKey(t) { return 'world-id'; },  // adaptive-resolution key (see Canvases)
    scale0For(key) { return 0.7; }         // a key's starting scale (0 or nothing: Q.scale0)
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
- **`heroInk({hf, hs, hb, ha, hfoc, hh, st, sb})`:** re-inks the hero from `draw(t)`: text, scrim rgb, control borders, accent, focus ring, nav hover, and the scrim's top and bottom strength (`st` and `sb`, as strings).
  - Unset keys keep their current value, so call `heroInk(null)` first to start from the theme.
  - `heroInk(null)` on its own restores the theme.
  - Many Worlds sets one full set per world.

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

## Embedding: how Many Worlds hosts another engine

Many Worlds builds each engine in `worlds.json` once, at page load, with its own copy of `rt`. Each embedded world plays one 6 s slot of the loop. In that slot it shows its own ride's timeline from `from` (6 s) to `from` + 6 s, drawn by its own engine.

- **Shared canvas and context:** the engine's `rt.cv` is a stand-in for the canvas.
  - `getContext()` returns Many Worlds' WebGL context. It is created with a depth buffer, because Floating World's sea is depth-tested.
  - `width` and `height` are the size of the frame being drawn.
  - `addEventListener` and `classList` do nothing. Many Worlds owns context loss and the canvas fade.
  - `rt.heroInk` also does nothing: the hero's colours follow the world on screen.
- **Drawing:** `draw(t, live, photo, target)`.
  - The engine draws into whatever framebuffer is bound. Many Worlds binds the screen, its tear buffers, or a 64×64 warm-up buffer, and passes the same framebuffer as `target`.
  - An engine that binds its own framebuffers must return to `target`, never `null`. Scale Invariant does this after its post pass.
  - Tear buffers have depth attachments.
- **GL state:** Many Worlds resets GL state before and after every embedded draw: framebuffer and viewport, blend, depth, cull, scissor, stencil, masks, attribute arrays, buffers, texture units 0 and 1, and the program. An engine may assume a fresh context's state, and may leave any state behind.
- **When engines compile:**
  - **At load:** behind the poster, Many Worlds compiles the embedded world the ride starts in and the one after it.
  - **During each rift:** while the hit-stop freezes the frame, it compiles the world after next.
  - **Otherwise:** a seek, a deep link or a restored context compiles a world the moment it is needed.
  - **Warm-up:** each compile ends with one draw into the 64×64 warm-up buffer, so the first frame on screen never stalls.
- **Failure:** if an engine is missing, throws while being built or compiled, or throws while drawing, its slot plays a native stand-in world (`fb` in Many Worlds' world table) for the rest of the visit. A throw logs `console.error`, which fails the tests.
- **Context loss:** the engines never see it, because their listeners go to the stand-in canvas. Many Worlds marks every embedded world uncompiled, and after the restore it calls each engine's `initGL()` again the next time that world is needed. So `initGL()` must be safe to call more than once, rebuilding everything on the current context.
- **Decoration:**
  - `E.css` from each embedded engine is appended to Many Worlds' own CSS.
  - The hero carries `data-world="<id>"` for the world whose colours show.
  - Floating World's print marks are hidden except while its world shows.
- **Live input:** the engine gets the runtime's `live` fields, with `boost` held through each rift as Many Worlds holds its own.

## Rules

- **Deterministic:** `draw(t, null)` is a pure function of t, using seeded randomness only. `seek(t)` must reproduce a frame exactly. An embedded world must draw the same pixels as its engine standalone; a test compares them.
- **No throws:** `draw` must not throw in normal operation.
  - A throw from the ride drops the visitor to the poster for the rest of the visit.
  - A throw from an embedded world retires that world to its stand-in.
- **Flash safety:** no more than 3 flashes per second in any part of the hero, at normal speed and while held to accelerate.
  - `node tools/preview.mjs --ride=many-worlds --scans-only --flash --hold` checks both over the whole 48 s loop, every tear included.
  - If holding pushes an engine past 3, cap its speed with `warpCap` and drive its boost visuals from `live.intent`, as Floating World does (capped at 2×).
- **Legible text:**
  - every world keeps the area behind the name calm, using text-safe masks;
  - a world that turns light re-inks the hero, as Many Worlds' ink world does.
- **Decoration:** engine-only decoration goes in `rt.deco`, styled with `E.css`. It stays clear of the text and the controls.

## Changing a world or an engine

1. Edit `src/engines/<id>.js`.
2. Check an embedded engine standalone first.
   - Run `python3 build.py --only <id>`. It writes `dev/<id>.html` with just that engine as the ride.
   - Serve it with `node tools/serve.mjs dev` and open `/<id>.html`.
3. Run `python3 build.py`, then `npm run verify`.
   - `npm run verify` includes the world tests (`node tests/site.test.mjs --worlds` runs only those). One of them compares each embedded world with its engine standalone.
4. Run `node tools/preview.mjs --ride=many-worlds --flash --hold`.
5. Compare `preview/many-worlds/desktop-frames.png` with `docs/reference/many-worlds-desktop-frames.png`. Both photograph the middle of each world (`MM_SHOTS`).
6. To change which part of an embedded ride plays, the order of the worlds, or their hero colours, edit the `XW`, `ORDER` and `ui` entries near the top of `src/engines/many-worlds.js`. Then repeat steps 3 to 5.
