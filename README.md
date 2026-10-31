# maxmartinelli.com

maxmartinelli.com is a single static page.

- **The hero:** one of four animated "rides". The page picks one at random on every visit, never repeating the ride from the visitor's last visit.
- **Everything else is shared:** the name, tagline, About, Podcast, Lab, Contact and footer stay the same; only the animation and its colours change.
- **Hidden for now:** Talks and Writing are written but commented out in `src/shell.html` until there's something to show.
- **The Lab:** Sweet Spots in its own project's look, with that project's live candy map touring its new candies and a link to the project at `/sweet-spots/`; then Offbook Chess, showing its first piece (the Archer), and the CAS game theory monograph. Both are coming soon.
- **Interaction:** holding anywhere on the hero accelerates the ride (up to 5×; Floating World tops out at 2× for flash safety), and a Pause button stops it.
- **Delivery:** `public/` holds one self-contained `index.html` (all CSS and JS inline) plus a 404 page, icons, a social image and the Lab's pictures. Cloudflare serves it as static files, with no server code.

## The rides

| Ride | What you're riding | The idea |
|---|---|---|
| **Many Worlds** | A light trail through five worlds: blue hour, contour, ink, crystal and molten. At the peak of each 6 s cycle the frame tears along a seeded fracture and you punch into the next world. | Each world is one member of a forecast ensemble: the Everett many-worlds idea applied to a forecast. |
| **Scale Invariant** | A dive through a Menger sponge with taillight trails threading the channel. | Each cycle carries you two levels deeper into an identical world, so the acceleration never has to stop. Fractal dimension: log 20 / log 3 ≈ 2.727. |
| **Floating World** | A woodblock-print ocean ridden at endless speed. Each cycle ends in a barrel whose tube hides the reset. | The waves are eight summed Gerstner waves, in Prussian blue. |
| **Asymptote** | Accelerating toward the speed of light. Aberrated, Doppler-shifted starlight squeezes into a starbow. | Each extra nine (0.9c, 0.99c, 0.999c) adds the same rapidity, ½ ln 10. |

All four rides feel like they accelerate forever. They use a Shepard–Risset trick: speed layers an octave apart fade in while slow and out while fast.

The site has no sound.

### Behaviour every ride shares

- **Loading:** a poster frame paints instantly, and the WebGL animation fades in over it.
- **Adaptive resolution:** render resolution adapts to keep phones smooth.
- **When the animation stops:**
  - the Pause button is pressed;
  - the hero scrolls out of view;
  - the tab is hidden.
- **Reduced motion:** with `prefers-reduced-motion`, visitors get a still frame and no loop.
- **No WebGL:** if WebGL is missing or fails, the poster stays.
- **Choosing a ride:**
  - `#many-worlds`, `#scale-invariant`, `#floating-world` or `#asymptote` in the URL forces that ride;
  - "Take another ride" in the footer reloads into a different one.
- **Storage:** the only stored data is the last ride shown, in `localStorage`, and the requested next ride, in `sessionStorage`. There are no cookies, analytics or third-party scripts. Google Fonts is the only external request.

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
src/shell.html        markup, copy, CSS, per-ride colour tokens, and the head script that picks the ride
src/runtime.js        the shared host: canvases, clock, input, pause, fallbacks, footer
src/engines/*.js      the four rides (test.js is a dev-only smoke test, never shipped)
src/lab/              the Sweet Spots card's parts, inlined by <!--include:...-->: the live map (sweet-spots-map.js) and its
                        data (sweet-spots-data.json), plus generated SVGs (the wordmark, and the map without JavaScript)
rides.json            the rides that ship
static/               404.html, favicon.svg/.ico, apple-touch-icon.png, og.png, _headers, _redirects, and lab/: the
                        Offbook Chess Archer (offbook-archer-*.webp) and the Sweet Spots candy pictures (sweet-spots/)
build.py              inlines shell + engines + runtime + src/lab into public/index.html and copies static/ next to it
public/               what Cloudflare serves: generated, committed, never edited by hand
tools/                check.py, engine-contract.mjs, serve.mjs, preview.mjs, make-images.mjs, browser.mjs
tools/lab/            dev-only scripts that regenerate src/lab/ and static/lab/sweet-spots/ from the Sweet Spots page
tests/site.test.mjs   browser tests
docs/ENGINE_API.md    the contract between the runtime and the rides
docs/reference/       expected screenshots of every ride (desktop and phone frame sheets, full-page layout)
```

The build has no dependencies and is deterministic: Python 3.8+ with the standard library only. Node 20+ and Playwright are needed only for the checks and tests.

## Commands

```bash
npm install                        # dev tools: Playwright, pngjs, local copies of the three fonts
npx playwright install chromium    # once: headless Chromium for tests and screenshots

python3 build.py                   # rebuild public/ after any change to src/ or static/  (npm run build)
npm run check                      # static checks, no browser: build is fresh, scripts parse, engines honour the
                                   #   contract, no audio, HTML/meta/links, deploy files (~5 s)
npm test                           # browser tests: each ride on desktop + phone, pause, off-screen sleep, reduced
                                   #   motion, the Lab map, random pick, "Take another ride", keyboard (~5 min)
node tests/site.test.mjs --lab     # the Lab map tests only (~1 min)
npm run verify                     # check + test
npm run serve                      # http://127.0.0.1:8788 behaves like Cloudflare Pages (404 page, _headers)
node tools/preview.mjs --flash     # screenshots of every ride into preview/ + flash-safety scan (~3 min per ride)
node tools/preview.mjs --scans-only --flash --hold   # flash scans only, at normal speed and while held (~10 min per ride)
node tools/make-images.mjs         # regenerate og.png and the icons, then run python3 build.py
```

The tests render WebGL in software (SwiftShader) so they run anywhere. That is much slower than a real GPU.

- **`USE_GPU=1`:** use the machine's GPU instead. Use this if headless Chromium can't start WebGL on your machine, or for speed. Screenshots then vary slightly by machine.
- **`CHROMIUM_PATH=/path/to/chrome`:** use a different Chromium.

## Editing

- **Copy:** all text lives in `src/shell.html`, under the `<main>` sections. Edit it, then run `python3 build.py` and `npm run check`.
- **Talks and Writing:** to bring one back, uncomment its section in `src/shell.html` and its link in the hero nav. Move the `#articles` alias (for old `/#articles` bookmarks) from the Lab heading back to the Writing heading.
- **Lab cards:** in the Lab section of `src/shell.html`.
  - **Sweet Spots** uses that project's fixed colours and the parts in `src/lab/`. Its wordmark and "Explore Sweet Spots" link go to the project, `https://maxmartinelli.com/sweet-spots/`, which is not part of this repo.
  - **To refresh its map** from a newer Sweet Spots page, save the page and its `img/` folder, then run `python3 tools/lab/sweet_spots_data.py <page.html> --images <folder>` and `python3 tools/lab/sweet_spots_map.py <page.html> src/lab/sweet-spots-map.svg`, then `python3 build.py`.
  - **Offbook Chess** shows the Archer, `static/lab/offbook-archer-360.webp` and `-720.webp`, made from the original photo. To swap the picture, replace both files (square images) and update the `alt` text.
- **Site settings:** these are at the top of `build.py`:
  - title;
  - meta description;
  - `SITE_URL`, the canonical host (`https://maxmartinelli.com`), used for the canonical link, `og:url` and `og:image`;
  - theme colour.
- **A ride:** see `docs/ENGINE_API.md`.

## Deploying to Cloudflare

Commit everything, including `public/`. Cloudflare only needs `public/`, and needs no build step.

### Cloudflare Pages connected to GitHub (the current setup)

1. In the Cloudflare dashboard, open Workers & Pages, then the project, then Settings, then Build, and set:
   - **Build command:** leave it empty;
   - **Build output directory:** `public`.
2. Push to a non-production branch. Pages builds a preview at `https://<branch>.<project>.pages.dev`. Check it there.
3. Merge to the production branch to go live.

### Without Git

Two options:

- **Wrangler:** run `npx wrangler pages deploy public --project-name=<project>`.
- **Dashboard:** create a project with "Upload assets" and drag in the `public` folder or a zip of it.

A project created by direct upload cannot be switched to Git later.

### Cloudflare Workers

Cloudflare now recommends Workers static assets for new projects. To use it, add a `wrangler.jsonc` and run `npx wrangler deploy`:

```jsonc
{ "name": "maxmartinelli", "compatibility_date": "2026-10-01", "assets": { "directory": "./public", "not_found_handling": "404-page" } }
```

### Launch checklist

Already done in the code:

- **Canonical host:** the apex, `https://maxmartinelli.com`. It serves the current site and `www` has no DNS record.
- **Old URLs:** the retired essay's three addresses (`/articles/learning`, `.html`, and with a trailing slash) redirect home with a 301, via `static/_redirects`. Every other unknown path gets the real 404 page.

To do at launch:

1. **Pages build settings:** empty build command, build output directory `public` (see above).
2. **Always Use HTTPS:** turn it on in Cloudflare (SSL/TLS, then Edge Certificates). Today `http://maxmartinelli.com` serves the page without redirecting.
3. **On the preview URL**, before merging:
   - check that `/sweet-spots/` still loads: the Sweet Spots project lives there but not in `public/`, so it must survive the deploy (as a separate Pages project or route, or by adding it to `static/sweet-spots/`);
   - open the page on your phone and try each ride (`#many-worlds`, `#scale-invariant`, `#floating-world`, `#asymptote`), including holding to accelerate;
   - `curl -sI <preview>/articles/learning` shows `301` to `/`, and `curl -sI <preview>/no-such-page` shows `404`.
4. **After going live:** run `https://maxmartinelli.com` through LinkedIn's Post Inspector so it picks up the new `og.png`.

`_headers` sets `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY` and a restrictive `Permissions-Policy`. It sets no Content-Security-Policy on purpose: Cloudflare features such as Email Obfuscation and Web Analytics inject scripts, and a strict policy would silently block them.

## Status

Last verified on this build:

- `npm run check`: 8/8 checks pass.
- `npm test`: 17/17 tests pass, using Chromium 141 with SwiftShader and Playwright 1.64. Codex's review ran Firefox 157 and WebKit 27.2 (48/48) on the build before its follow-up fixes and before the live Lab map.
- Flash scans (3×3 grid, worst flashes in any second; WCAG 2.3.1 allows 3):

  | Ride | Normal speed (20 s at 20 fps) | Held to accelerate (20 s at 30 fps) |
  |---|---|---|
  | Many Worlds | 0 | 0 (up to 5×) |
  | Scale Invariant | 0 | 0 (up to 5×) |
  | Floating World | 3 | 3 (capped at 2×) |
  | Asymptote | 0 | 0 (up to 5×) |

  Floating World's barrels reach 3 at normal speed, so its held speed is capped at 2×: uncapped it reached 6, and 2.5× reached 4.
- Text contrast: everything outside the hero is at least 5.69:1 on every ride (the lowest is the "New candy" label on the Sweet Spots map's tour card). The hero text keeps a median of at least 5.5:1 through Many Worlds' ink rifts.
