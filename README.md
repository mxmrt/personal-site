# maxmartinelli.com

maxmartinelli.com is a single static page.

- **The hero:** one animated ride, **Many Worlds**. Every 6 seconds the frame tears open into another world: eight worlds in a 48-second loop. Three of them are the site's former stand-alone rides (Scale Invariant, Floating World and Asymptote), drawn by their own engines inside Many Worlds. Every visit gets the same ride.
- **Everything else:** the name, tagline, About, Podcast, Lab, Contact and footer wear Many Worlds' colours. Only the hero's text and scrim re-colour themselves with each world.
- **Hidden for now:** Talks and Writing are written but commented out in `src/shell.html` until there's something to show.
- **The Lab:** Sweet Spots in its own project's look, with that project's live candy map touring its new candies and a link to the project at `/sweet-spots/`; then Offbook Chess, showing its first piece (the Archer), and the CAS game theory monograph. Both are coming soon.
- **Interaction:** holding anywhere on the hero accelerates the ride (up to 5×; the Floating World world tops out at 2× for flash safety), and a Pause button stops it.
- **Delivery:** `public/` holds one self-contained `index.html` (all CSS and JS inline) plus a 404 page, icons, a social image, the Lab's pictures and the Sweet Spots project (`/sweet-spots/`). Cloudflare serves it as static files, with no server code.

## The ride: Many Worlds

You ride one light trail, accelerating without end. At the peak of each 6 s cycle the frame freezes, tears along a seeded fracture, and you punch through into the next world. Each world is one member of a forecast ensemble: the Everett many-worlds idea applied to a forecast.

| # | Slot | World | Drawn by | What you see |
|---|---|---|---|---|
| 1 | 0–6 s | Blue hour | Many Worlds | Red and white ensemble trails over a dark plain under a sodium-lit horizon. |
| 2 | 6–12 s | **Scale Invariant** | its own engine | A dive through a Menger sponge with taillight trails threading the channel. Each of its cycles goes two levels deeper into an identical world; fractal dimension log 20 / log 3 ≈ 2.727. |
| 3 | 12–18 s | Contour | Many Worlds | Glowing level lines above and below. |
| 4 | 18–24 s | **Floating World** | its own engine | A woodblock-print ocean in Prussian blue (eight summed Gerstner waves), bursting out of one barrel and riding into the next. Its seal and print marks show only in this world. |
| 5 | 24–30 s | Ink | Many Worlds | Paper, wet brushstrokes and a sumi-e ridge: the one light world, so the hero's text flips to dark ink. |
| 6 | 30–36 s | **Asymptote** | its own engine | Accelerating toward the speed of light: aberrated, Doppler-shifted starlight squeezes into a starbow. Each extra nine (0.9c, 0.99c, …) adds the same rapidity, ½ ln 10. |
| 7 | 36–42 s | Crystal | Many Worlds | Prisms split the white trails into spectra that recombine at the next prism. |
| 8 | 42–48 s | Molten | Many Worlds | Heat haze and embers, then the tear back into blue hour. The loop repeats forever. |

Every world feels like it accelerates forever. They use a Shepard–Risset trick: speed layers an octave apart fade in while slow and out while fast.

**The embedded worlds** (bold above) were the site's other three rides. Many Worlds now builds their engines itself and lends them its WebGL context.

- **What plays:** each one plays 6 s of its own ride, from 6 s into that ride's timeline, pixel for pixel as the ride drew it on its own (a test compares them).
- **Hero colours:** each keeps the hero colours it wore as a ride, and the colours switch when the tear has uncovered half the name.
- **Hold cap:** each keeps its ride's hold-to-accelerate cap, so Floating World's world tops out at 2×.
- **Fallback:** if one of their engines fails, a Many Worlds world stands in for it (crystal, blue hour and contour respectively) and the ride carries on.
- **More detail:** see `docs/ENGINE_API.md`, "Embedding".

The site has no sound.

### Behaviour

- **Loading:** a poster frame paints instantly, and the WebGL animation fades in over it. Behind the poster, the ride compiles the world it starts in and the next one. Every later world compiles one tear early, while that tear's frame is frozen, so nothing stalls on screen.
- **Adaptive resolution:** render resolution adapts to keep phones smooth, separately for each world, so a heavy world never leaves the light ones blurry.
- **When the animation stops:**
  - the Pause button is pressed;
  - the hero scrolls out of view;
  - the tab is hidden.
- **Reduced motion:** with `prefers-reduced-motion`, visitors get a still frame and no loop: the tear from blue hour into the Menger sponge.
- **No WebGL:** if WebGL is missing or fails, the poster stays.
- **Starting in a world:** a world's id in the URL starts the ride just past the tear into that world: `#scale-invariant`, `#contour`, `#floating-world`, `#ink`, `#asymptote`, `#crystal` or `#molten` (`#many-worlds` and `#night` start at the beginning). Old links to the retired rides land in their worlds this way.
- **Storage:** none. The page stores nothing and sets no cookies, and has no analytics or third-party scripts. Google Fonts is the only external request.

### Layout

- **Phones and tablets:** one column, the full width between the side margins.
- **Screens 1200 px and wider:** each section's heading sits in a left rail with its content on the right, up to 1440 px in all, aligned with the hero's name.
- **The Lab:** once it is 860 px wide, the Sweet Spots card switches to its banner's layout, with words on the left and the map on the right (a CSS container query).
- **Footer:** only "Back to top". The ride's name, its caption and "Take another ride" were removed. The runtime still fills `#ride-name` and `#ride-note` if they're put back.

### The Lab's Sweet Spots map

The Sweet Spots card carries the hero map from the Sweet Spots page, ported to this site: Claude's map of 404 real candies (dots in their family colours), the 11 spots that stayed empty (dashed rings) and the 30 new candies (diamonds; filled for tier A).

- **Fly-in:** the first time the map scrolls into view, the dots fly in and the diamonds drop onto it.
- **Tour:** about 2 seconds later the map zooms to each new candy in turn, most novel first, with its picture, pitch and score (about 5 seconds a stop).
- **Exploring:** hovering (or tapping) a candy shows a tooltip, and the family legend highlights one family. Exploring stops the tour; it picks up again after 30 seconds without input.
- **Pause tour:** the button above the map stops the tour until it is pressed again (WCAG 2.2.2).
- **Drawing:** the map draws only while something moves. Off-screen it stops, and its tour stops with it. Under `prefers-reduced-motion` it is drawn in place, with no fly-in and no tour.
- **Without JavaScript:** a static SVG of the same map shows instead.
- **Weight:** the map's data is inline (28 KB, about 11 KB gzipped). The 30 candy pictures (15 KB each on average) load one at a time as the tour reaches them.

## How it is built

```
src/shell.html        markup, copy, CSS, colour tokens, and the head script that sets the ride before first paint
src/runtime.js        the shared host: canvases, per-world adaptive resolution, clock, input, pause, fallbacks, in-page links
src/engines/          many-worlds.js, the ride; scale-invariant.js, floating-world.js and asymptote.js, the engines it embeds
                        as worlds (each still runs on its own: python3 build.py --only <id>); test.js, a dev-only smoke test
src/lab/              the Sweet Spots card's parts, inlined by <!--include:...-->: the live map (sweet-spots-map.js) and its
                        data (sweet-spots-data.json), plus generated SVGs (the wordmark, and the map without JavaScript)
rides.json            the ride that ships: ["many-worlds"]
worlds.json           the engines that ship only as Many Worlds' worlds: ["scale-invariant", "floating-world", "asymptote"]
static/               404.html, favicon.svg/.ico, apple-touch-icon.png, og.png, _headers, _redirects; lab/: the Offbook Chess
                        Archer (offbook-archer-*.webp) and the Sweet Spots candy pictures (sweet-spots/); and sweet-spots/:
                        the Sweet Spots project itself, served at /sweet-spots/ (a separate page; this build only copies it)
build.py              inlines shell + engines + runtime + src/lab into public/index.html and copies static/ next to it
wrangler.json         the Cloudflare Worker that serves public/ (personal-site)
public/               what Cloudflare serves: generated, committed, never edited by hand
tools/                check.py, engine-contract.mjs, serve.mjs, preview.mjs, make-images.mjs, browser.mjs
tools/lab/            dev-only scripts that regenerate src/lab/ and static/lab/sweet-spots/ from the Sweet Spots page
tests/site.test.mjs   browser tests
docs/ENGINE_API.md    the contract between the runtime and the engines, and how Many Worlds embeds its worlds
docs/reference/       expected screenshots: Many Worlds' eight worlds (desktop and phone frame sheets), full-page layout
```

The build has no dependencies and is deterministic: Python 3.8+ with the standard library only. Node 20+ and Playwright are needed only for the checks and tests.

## Commands

```bash
npm install                        # dev tools: Playwright, pngjs, local copies of the three fonts
npx playwright install chromium    # once: headless Chromium for tests and screenshots

python3 build.py                   # rebuild public/ after any change to src/ or static/  (npm run build)
npm run check                      # static checks, no browser: build is fresh, scripts parse, engines honour the
                                   #   contract, no audio, HTML/meta/links, deploy files (~5 s)
npm test                           # browser tests: the ride on desktop + phone, pause, off-screen sleep, reduced
                                   #   motion, all eight worlds and tears, embedded = standalone, deep links, a live
                                   #   loop through the worlds, a lost WebGL context, the Lab map, keyboard (~5 min)
node tests/site.test.mjs --worlds  # the Many Worlds world tests only (~2 min); --quick: desktop only, no live loop
node tests/site.test.mjs --lab     # the Lab map tests only (~1 min)
npm run verify                     # check + test
npm run serve                      # http://127.0.0.1:8788 behaves like Cloudflare (404 page, _headers, _redirects)
node tools/preview.mjs             # screenshots into preview/many-worlds/: the middle of each world, layout pages
node tools/preview.mjs --scans-only --flash --hold   # flash scans of the whole 48 s loop and of 20 s held (~10 min)
python3 build.py --only floating-world   # dev page with one embedded engine as a stand-alone ride: dev/floating-world.html
node tools/make-images.mjs         # regenerate og.png and the icons, then run python3 build.py (--icons-only keeps og.png)
```

The tests render WebGL in software (SwiftShader) so they run anywhere. That is much slower than a real GPU.

- **`USE_GPU=1`:** use the machine's GPU instead. Use this if headless Chromium can't start WebGL on your machine, or for speed. Screenshots then vary slightly by machine.
- **`CHROMIUM_PATH=/path/to/chrome`:** use a different Chromium.

## Editing

- **Copy:** all text lives in `src/shell.html`, under the `<main>` sections. Edit it, then run `python3 build.py` and `npm run check`.
- **Talks and Writing:** to bring one back, uncomment its section in `src/shell.html` and its link in the hero nav. Move the `#articles` alias (for old `/#articles` bookmarks) from the Lab heading back to the Writing heading.
- **Lab cards:** in the Lab section of `src/shell.html`.
  - **Sweet Spots** uses that project's fixed colours and the parts in `src/lab/`. Its wordmark and "Explore Sweet Spots" link go to the project, `https://maxmartinelli.com/sweet-spots/`. The project itself is kept in this repo as `static/sweet-spots/`, a separate page that `build.py` only copies; edit it there.
  - **To refresh its map** from a newer Sweet Spots page, save the page and its `img/` folder, then run `python3 tools/lab/sweet_spots_data.py <page.html> --images <folder>` and `python3 tools/lab/sweet_spots_map.py <page.html> src/lab/sweet-spots-map.svg`, then `python3 build.py`.
  - **Offbook Chess** shows the Archer, `static/lab/offbook-archer-360.webp` and `-720.webp`, made from the original photo. To swap the picture, replace both files (square images) and update the `alt` text.
- **Site settings:** these are at the top of `build.py`:
  - title;
  - meta description;
  - `SITE_URL`, the canonical host (`https://maxmartinelli.com`), used for the canonical link, `og:url` and `og:image`;
  - theme colour.
- **A world:** its order, which 6 s of an embedded ride it plays, and its hero colours are the `XW`, `ORDER` and `ui` entries near the top of `src/engines/many-worlds.js`. Rerun the flash scans after any change. See `docs/ENGINE_API.md`.

## Deploying to Cloudflare

Commit everything, including `public/`. Cloudflare only needs `public/`, and needs no build step.

The live site is the Cloudflare Worker **`personal-site`**, serving static assets only. `wrangler.json` (in this repo) points it at `./public` and answers unknown paths with `404.html`. `_headers` and `_redirects` in `public/` apply to Workers static assets as they did on Pages.

1. **Check a preview first.** `npx wrangler versions upload` uploads a version without making it live and, with preview URLs enabled on the Worker, prints a URL to check. If the Worker's Git integration (Workers Builds) is connected, pushing a non-production branch does the same.
2. **Go live.** Merge to `main`, then `npx wrangler deploy`, unless the Git integration already deploys `main`.

### Checks for every deploy

On the preview, then on `https://maxmartinelli.com`:

- **The ride:** the page loads one ride, Many Worlds. Hold it to accelerate, and watch at least one full 48 s loop on a phone. `#floating-world`, `#ink` and `#asymptote` each start in that world.
- **`/sweet-spots/`:** it still loads with its pictures (`static/sweet-spots/`, copied into `public/sweet-spots/`), as does the Lab card's link to it.
- **Status codes:** `curl -sI <url>/articles/learning` shows `301` to `/`, and `curl -sI <url>/no-such-page` shows `404`.
- **Head tags:** `curl -s <url> | grep og:` shows the social tags.

### Launch checklist

Already done:

- **Canonical host:** the apex, `https://maxmartinelli.com`. It serves the current site and `www` has no DNS record.
- **Old URLs:** the retired essay's three addresses (`/articles/learning`, `.html`, and with a trailing slash) redirect home with a 301, via `static/_redirects`. Every other unknown path gets the real 404 page.
- **Sweet Spots:** the project lives in `static/sweet-spots/`, so every deploy carries it.

Still open:

1. **Always Use HTTPS:** turn it on in Cloudflare (SSL/TLS, then Edge Certificates), if `http://maxmartinelli.com` still serves the page without redirecting.
2. **Social preview:** run `https://maxmartinelli.com` through LinkedIn's Post Inspector so it picks up `og.png`.

`_headers` sets `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY` and a restrictive `Permissions-Policy`. It sets no Content-Security-Policy on purpose: Cloudflare features such as Email Obfuscation and Web Analytics inject scripts, and a strict policy would silently block them.

## Status

Last verified on this build (branch `multiverse`):

- `npm run check`: 8/8 checks pass, with all four engines honouring the contract.
- `npm test`: 16/16 tests pass, using Chromium 141 with SwiftShader and Playwright 1.64. Each embedded world matches its engine run standalone to a mean of 0.02/255.
  - Firefox and WebKit have not been run on this build.
  - Codex's launch review ran them on the four-ride build (48/48), before the follow-up fixes and the live Lab map.
- Flash scans (3×3 grid, worst flashes in any second; WCAG 2.3.1 allows 3):

  | Scan | Worst | Where |
  |---|---|---|
  | Normal speed: the whole 48 s loop at 20 fps | 3 | the Floating World world, around t = 21 s |
  | Held to accelerate: 20 s at 30 fps (68 s of ride, up to 5×) | 3 | the Floating World world, at its 2× cap |

  Both match Floating World's results as a stand-alone ride. Its barrels reach 3 at normal speed, so its held speed stays capped at 2×: uncapped it reached 6, and 2.5× reached 4.
- Text contrast:
  - **Outside the hero:** at least 5.69:1. The lowest is the "New candy" label on the Sweet Spots map's tour card.
  - **Hero name, mid-world:** the median against what is behind its glyphs, at 1.5, 3 and 4.5 s into each world, is at least 12.3:1. The lowest is Floating World on a phone.
  - **Hero name, through all eight tears:** no single frame's median drops below 10.2:1 (the tear from ink into Asymptote).
