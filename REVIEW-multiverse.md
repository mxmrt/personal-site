# Review: maxmartinelli.com

**Verdict:** Ship after fixes. Both identified recovery issues are fixed in separate commits and the final build passes the automated checks. The eight-world design, shaders, timing, colour sets and embedded-engine output are preserved. Production remains unchanged; merging and deployment require Max's approval. Physical phone GPU, iOS Safari and Low Power Mode testing remain outstanding.

Reviewed November 1, 2026. Base: `b60a09f`; supplied multiverse build: `c563384`; audited code: `6a9d345`.

Preview: https://421d0b28-personal-site.mxmartinelli.workers.dev/  
Draft pull request: https://github.com/mxmrt/personal-site/pull/5

## Findings

| # | Severity | Area | File:line | Problem | Evidence | Suggested fix | Fixed? |
|---|---|---|---|---|---|---|---|
| 1 | P2 | Context recovery | `src/runtime.js:263` | A restored WebGL context did not repaint a paused, manually sought or reduced-motion view. The visitor remained on the poster until another draw. This recovery gap predates the multiverse branch. | Injected loss/restore fired both events and restored the context, but the canvas remained hidden and `data-world` absent. The former test immediately sought afterward, concealing this behavior. | After the engine's restore listener, schedule one redraw when the live loop is stopped, preserving pause and reduced motion. | Yes, `42bbea1`; Chromium regression and Firefox/WebKit paused, reduced and manual checks pass. |
| 2 | P2 | Allocation failure | `src/engines/many-worlds.js:601` | Many Worlds used colour/depth targets without checking completeness. An unavailable depth allocation could leave a mostly black tear instead of the poster fallback. | Simulating missing depth storage produced framebuffer status 36054 and GL error 1286 while the WebGL canvas stayed visible. This was fault injection, not observed real-device memory exhaustion. | Validate target handles and completeness, free the failed target, and throw into the existing poster fallback. Preserve the context-loss recovery path. | Yes, `6a9d345`; regression confirms visible poster, stopped loop, diagnostic and resource cleanup. |

P0 = broken or embarrassing for many visitors; P1 = broken on some browsers/devices or an accessibility failure; P2 = quality issue; P3 = polish. No unresolved P0/P1 defect was found in the tested environments.

## Changes made

- `42bbea1` — `src/runtime.js`: registers a restoration listener after `E.initGL()`, allowing engine resources to rebuild before a single redraw of a stopped view. It does not resume paused/reduced-motion playback. Expanded the existing restoration regression in `tests/site.test.mjs` to test automatic recovery without an intervening seek or resize.
- `6a9d345` — `src/engines/many-worlds.js`: checks allocated target handles and framebuffer completeness, cleans up incomplete targets, and uses the established poster fallback. Added a browser regression that simulates unavailable depth storage and verifies cleanup.
- Rebuilt `public/index.html` using `python3 build.py` after each source change. No generated file was hand-edited.
- Added this report. The original `REVIEW.md` is unchanged.

No dependencies, redirects, shaders, colours, copy, world order, timeline windows or acceleration timings changed. `static/`, `public/sweet-spots/`, `wrangler.json` and `src/lab/` remain identical to `b60a09f`.

## What I ran

### Required commands

| Command | Result |
|---|---|
| `npm install` | Installed the six existing locked packages; audit reported zero vulnerabilities; package manifests and lockfile unchanged. |
| `npx playwright install chromium firefox webkit` | Installed Chromium 156.0.8078.4, Firefox 157 and WebKit 27.2 for locked Playwright 1.64.1. |
| `python3 build.py --check` | Passed before and after fixes. |
| `npm run verify` | Supplied build: 8/8 static checks, 15/15 browser tests. Final build: 8/8 static checks, 16/16 browser tests. |
| `node tests/site.test.mjs --worlds` | Supplied build: 7/7. The final full verification includes these checks plus the new allocation regression. |
| `node tools/preview.mjs --ride=many-worlds --scans-only --flash --hold` | Supplied build passed: 0 problems/warnings; normal and held maximum 3 flashes/s. |
| `node tools/preview.mjs` | Supplied build: 0 problems/warnings; desktop/phone pages and frame sheets reviewed. |
| `node tools/preview.mjs --ride=many-worlds --flash --hold` | Final build: 0 problems/warnings; regenerated screenshots and repeated both full scans. Normal: 48 s at 20 fps, maximum 3 at ride t=20.9 s. Held: 20 s at 30 fps, spanning 68.2 ride seconds, maximum 3 at wall t=6.7 s, maximum overall warp 5x. |
| `git diff --stat b60a09f..HEAD -- static public/sweet-spots wrangler.json src/lab REVIEW.md` | Empty. |
| `git diff --check` | Passed. |

An early verification attempt preceded completion of the browser downloads and exited for a missing browser binary. It was rerun successfully after installation. Default SwiftShader worked; the baseline and final image/flash tests did not require the GPU fallback.

### Browser and recovery checks

- **Chromium 156 / SwiftShader:** the repository suite verifies desktop/phone rendering, pause, off-screen sleep, silence, keyboard focus, Lab behavior, reduced motion, eight worlds and tears, deep links, restoration and embedded/standalone equivalence. The embedded engines still differ from their standalone output by at most a mean of **0.02/255**, with 0.00% of pixels differing by more than 24.
- **Firefox 157:** 6/6 desktop/phone audit groups on `c563384`, plus 4/4 recovery/allocation groups on final `6a9d345`. Each viewport completed at least 100 seconds of normal playback, visiting all eight worlds twice, then held through Floating World with measured maximum warp **2x**.
- **WebKit 27.2 on macOS:** 6/6 desktop/phone groups and 4/4 recovery/allocation groups on final `6a9d345`; two full loops per viewport and the same 2x Floating World cap. Eight worlds, tears, resize, pause, three deep links and reduced-motion checks passed without application errors.
- Phone configurations are viewport/touch emulation. The cross-browser hold uses synthetic touch pointer events; remote Chromium additionally uses touch input through the browser protocol.
- Native Safari opened the local page and its Pause control responded, but a complete native playback check was interrupted by the Mac locking. This is **not** recorded as a native Safari pass. No physical iOS/Android device, Low Power Mode, phone GPU compile-latency or actual low-memory-device test was completed.
- Each of the three embedded engines was fault-tested with init returning false, init throwing and draw throwing: **9/9** switched to the specified native stand-in without GL errors.
- **24 resize-during-tear samples** passed, including transitions around Floating World.
- Per-world adaptive scales remained independent and were restored on revisits.
- Three full seek loops held GPU object counts constant: 15 programs, 30 shaders, 22 buffers, 4 textures, 3 depth renderbuffers and 4 framebuffers. This checks bounded object allocation, not physical GPU memory consumption or long-duration mobile stability.

### Visuals and accessibility

- Final desktop and phone frame sheets visually match `docs/reference/`. Mean pixel differences are **0.626/255 desktop** and **1.019/255 phone**. References used Chromium 141; current tests use Chromium 156. The before/after-fix differences are only **0.003/255** and **0.010/255**, consistent with transient seek/CSS timing.
- Hero name remains legible in all sampled worlds and tears, including ink and Floating World. A separate 128-sample glyph-interior contrast probe found minimum frame-median ratios of 12.83:1 for desktop worlds, 10.97:1 for desktop tears, 11.85:1 for phone worlds and 11.86:1 for phone tears. It retained the intended text shadows. These are sampled medians, not a guarantee for every pixel.
- Pause labels/state, keyboard focus, skip link, off-screen sleep and reduced motion passed. Final preview measured zero animation frames off-screen and under reduced motion on both viewport sizes.
- Flash results are the repository's 3x3 mean-luminance heuristic, not complete WCAG certification. It does not implement saturated-red or detailed flashing-area analysis. The held scan also advances time in a slightly different order from live playback at transition boundaries. No timing change was made as part of this audit.

### Hosted preview and production boundary

- **Remote browser checks: 15/15 passed** against the immutable preview on code `6a9d345`, using Chromium 156 with Apple M1 Pro/Metal. Desktop ran 96.06 additional ride seconds and touch-emulated phone ran 96.18; each visited every world twice without application, GL or network errors.
- Mouse and browser-protocol touchscreen holds reached full acceleration intent and stayed at or below **2x** in Floating World.
- `#floating-world`, `#ink` and `#asymptote` each started in the correct world on both viewports; storage remained empty.
- `/sweet-spots/` returned 200 and displayed all 60 cards on desktop and phone. All **300** thumbnail/card-view image variants loaded and decoded. Both Lab links navigated successfully to the canonical Sweet Spots page.
- Curl GET/HEAD checks confirmed `/articles/learning` returns **301** to `/`, both other retired-essay forms redirect likewise, and `/no-such-page` returns **404**. Root, social image and favicon return 200; Open Graph and Twitter metadata are present. Homepage and Sweet Spots HTML exactly match the local built bytes.
- The initial Python urllib client was rejected by Cloudflare with error 1010; the requested curl client and normal browsers succeeded. No Cloudflare protection or configuration was changed.
- A remote test initially used an overly exact accessible-name match for the Lab link, missing its CSS arrow. The audit harness selector was corrected and only unfinished/affected checks were resumed; the final report is 15/15. No site edit was needed.

Cloudflare's dashboard confirmed production branch `main`, builds enabled for non-production branches, production command `npx wrangler deploy`, and non-production version command `npx wrangler versions upload`. The preview build for code `6a9d345` succeeded with version `421d0b28-4efa-4c94-a976-f8aede53b44e`. Only `multiverse` was pushed, and PR #5 is a draft. No merge or production-deployment command was performed.

After the preview upload, `main` remained at `b60a09fc8cc1ba32c2d87a814e3ddd5b597cec7d`. Production HTML before and after had identical SHA-256 `7959dd6e461621ece53f36bd7faa712d9836855b02b9f48828ef03105adf6359`. The active production version observed before the preview was `c5bd45c2-c925-4009-8626-806e01f32316`.

## Recommendations for Max

1. Review the preview, especially Floating World and the light ink world, on a physical iPhone/Safari and Android/Chrome. Let it run for two loops, hold through Floating World, rotate during a tear, and check Low Power Mode. Real phone compile hitches and memory limits remain unverified.
2. Approve the preview before merging PR #5. Cloudflare deploys `main` automatically, so approval should precede the merge itself.
3. If stronger flash assurance is desired, use a dedicated temporal flash analyzer and align the audit scanner's frame order with the runtime. Keep the existing Floating World 2x cap and timeline window unless separately retested.

Detailed logs, JSON results, screenshots and audit-only scripts are retained with this audit's local evidence. No secret or token was included in the repository or report.
