# Review: maxmartinelli.com

> **Update, October 25, 2026:** the launch blockers below are resolved in follow-up commits. See [Follow-up after review](#follow-up-after-review) at the end. Codex's findings below are unchanged.

**Verdict:** Don't ship. Six narrow fixes are complete and the final build passes the supplied tests, Firefox/WebKit checks and targeted lifecycle checks. However, Floating World triggers a **6-flashes-per-second alarm under a simulated normal hold ramp**, and two measured text-contrast failures remain. These need an approved timing or visual-treatment change before launch. The published machine-learning essay also needs a preservation/redirect decision. Nothing was pushed or deployed.

Reviewed October 24, 2026 (America/New_York; some evidence timestamps are October 25 UTC). Untouched baseline: `df0519a`, **Baseline from Claude**. Final site commit: `bb3848d`. Final `public/index.html` SHA-256: `d99439f1a9c5f39f74891581ab95a6f57b5c5acc6e00a8a8a7c26b779490089f`.

## Findings

P0 = broken or embarrassing for many visitors; P1 = broken on some browsers/devices, or an accessibility failure; P2 = quality issue; P3 = polish. Open findings precede fixed findings. File references describe the final source, not generated HTML.

| # | Severity | Area | File:line | Problem | Evidence | Suggested fix | Fixed? |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Flash safety | `src/runtime.js:138`; `src/engines/floating-world.js:879` | Held acceleration produces a serious flash alarm beyond the bundled scan's normal-speed result. | After the camera fix, 30fps sampling with the runtime's actual held-time equation reaches 6 flashes/s in grid cell 3 at wall 14.067–15.067s, ride time about 66.04–71.04s. See the analysis below and saved alarm frames. This is a conservative release gate, not a formal WCAG certification result. | Approve a Floating World acceleration cap or another visual mitigation; repeat broader general/red-flash and area analysis at phone/desktop sizes. | No — timing and shader/visual changes excluded by scope. |
| 2 | P1 | Text contrast | `src/engines/many-worlds.js:700` | The transition into the light ink world briefly makes hero text and scrim nearly the same gray; pausing can hold it there. | `seek(12.16)` through `12.20`: foreground `rgb(129,130,131)`; sampled nav/background contrast about 1.29:1. [Screenshot](preview/review/runtime-ink-transition.png), [seek/context data](preview/review/runtime-transition-context.json). | Approve a contrast-preserving foreground/scrim transition, then inspect every transition and paused state. | No — visual/color treatment excluded. |
| 3 | P1 | Text contrast | `src/shell.html:13`; `src/shell.html:72` | Floating World's Forthcoming badge fails normal-text contrast. | 11px, weight 500, `#F2EBDD` on `#C8402F`: 4.185:1, below 4.5:1. | Approve a small foreground/background change and remeasure. | No — colors excluded. |
| 4 | P2 | Published URLs | `src/shell.html:140`; `build.py:108` | Replacing production with this package loses the existing essay. | Live `/articles/learning` is 200; `.html` and trailing-slash forms redirect to it. All three are 404 in the rebuild. | Preserve/migrate the essay, or choose an explicit destination and approve redirects. See Deploy readiness. | No — content/redirect decision needed. |
| 5 | P2 | Reduced motion | `src/runtime.js:18` | Changing the OS reduced-motion preference after load does not stop animation. | Preference captured once; 49 draws observed in 800ms after switching to reduce. Initial reduced-motion loads pass in every tested engine. | Add a preference-change listener in a follow-up, preserving Pause and initial still behavior. | No. This is a live preference-response limitation, not a failed initial-load path or a blanket AA claim. |
| 6 | P2 | Adaptive resolution | `src/runtime.js:161` | After a genuine slowdown, resolution cannot normally recover on a 60Hz display. | Recovery requires average frame interval below 12ms; stable 60Hz is about 16.7ms. Hidden-tab-triggered degradation was fixed separately. | Calibrate recovery against refresh rate/frame budget on physical phones before adjusting thresholds. | No — performance-policy tuning needs device evidence. |
| 7 | P2 | Shader portability | `src/engines/many-worlds.js:377` | Reversed-edge GLSL `smoothstep` calls have undefined results. | Example `smoothstep(0.,-.3,e)`; other occurrences exist, including Floating World. No actual Firefox/WebKit failure observed. | Address in a separate visual-preservation pass with target-GPU reference comparisons. | No — potential portability issue; shader changes excluded. |
| 8 | P2 | Context-loss fallback | `src/engines/many-worlds.js:521` | Context loss in the ink world can retain dark hero ink over the poster; restoring a paused/manual page waits for another draw. | Forced loss at an ink-world seek retains `rgb(14,18,30)` and hides GL; restore rebuilds GL but canvas stays hidden until a seek/play/redraw. Saved context data above. | Coordinate fallback ink and restoration redraw with the runtime and engine's ink cache; verify live, paused, manual and reduced states. | No — separate lifecycle follow-up; do not confuse with the fixed thrown-draw path. |
| 9 | P3 | Canonical metadata | `build.py:66` | Canonical link and `og:url` are absent. | Built head and current live head both omit them. Existing `SITE_URL` is already the working apex. | Add `https://maxmartinelli.com/` for both in a separate build-metadata change. | No — not a launch blocker. |
| 10 | P2 | Camera clearance | `src/engines/floating-world.js:187` | Camera dropped below a narrow sea crest around 10.15s, producing the flat dark-blue frame. | Baseline camera Y 16.814 vs estimated current-point sea 17.474. Final Y 18.988; nine surrounding seeks and reference sheets checked. | Include the current point in the minimum-clearance calculation. | **Yes**, `236db40`. |
| 11 | P2 | Hidden-tab clock | `src/runtime.js:150` | A pending rAF resumed with stale elapsed time after the tab was hidden, contaminating adaptive resolution. | Actual-source VM reproduced a 60s interruption reducing a 1000px canvas to 700px; after fix it stays 1000px and resumes with a fresh delta. | Cancel queued frame and reset clock whenever loop should stop. | **Yes**, `411999a`. |
| 12 | P2 | Thrown-draw fallback | `src/runtime.js:79` | Draw failure in the ink world left the poster with the wrong hero theme. | Injected failure retained dark ink before fix; final regression confirms default theme and still fallback. | Reset hero ink before drawing the fallback poster. | **Yes**, `6d67978`. |
| 13 | P2 | Storage exceptions | `src/runtime.js:238` | Take another ride could repeat the current ride when storage throws. | With both storages blocked, baseline repeated Asymptote; final regression selects a different ride. | Carry the already-chosen next ride in the hash when session storage fails. | **Yes**, `ef26672`. |
| 14 | P2 | Keyboard focus | `src/runtime.js:230` | Back to top scrolled but left focus in the footer. | Baseline active element remained Back to top; final regression focuses the existing visible skip link. | Focus that link while preserving its normal tab behavior. | **Yes**, `0598433`. |
| 15 | P2 | Legacy fragment | `src/shell.html:140` | Existing `/#articles` bookmarks lost their target. | Old homepage links that fragment. Final direct navigation shows Writing in view and retains `aria-labelledby="h-writing"`. | Add an anchor alias inside the unchanged heading. | **Yes**, `bb3848d`. |

Normal text needs 4.5:1 and large text 3:1; a ratio below the threshold cannot be rounded into a pass. See [W3C Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Flash conformance also depends on flash type and affected area; see [W3C Three Flashes or Below Threshold](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html). GLSL defines reversed/equal smoothstep edges as undefined: [Khronos GLSL ES specification](https://registry.khronos.org/OpenGL/specs/es/2.0/GLSL_ES_Specification_1.00.pdf#page=73).

## Changes made

Every fix has its own commit, includes regenerated `public/index.html`, and passed `npm run verify` (8 static checks, 13 browser cases) before committing. Production edits are limited to `src/`; `public/` was generated with `python3 build.py`. No dependencies, shaders, wave geometry, timing, colors, copy, audio, analytics, external scripts or CSP were added/changed. Diagnostic tools and evidence remain in ignored `preview/`.

| Commit | File and change | Why and specific verification |
|---|---|---|
| `236db40` Keep Floating World camera above narrow wave crests | `src/engines/floating-world.js`: floor the existing outside-tube camera envelope at current-point height + its existing 1.5-unit margin. | Averaged look-ahead missed the crest directly under the camera. Nine seeks around 10.15s remove the dip. Final desktop/phone sheets preserve reference composition; final normal-speed scan remains 3/s. |
| `411999a` Reset the animation clock when the hero stops running | `src/runtime.js`: cancel pending rAF and reset timestamp when the running predicate is false. | Prevent stale hidden time from entering the clock/adaptive calculation. Four VM regressions pass, including fresh resume and retained resolution. |
| `6d67978` Restore the hero theme when rendering falls back to a poster | `src/runtime.js`: clear runtime hero ink in `fail()`. | Injected draw failure from the ink world returns to default poster theme; browser regression passes. |
| `ef26672` Choose a different ride when browser storage is blocked | `src/runtime.js`: use next-ride hash only if sessionStorage write fails. | Blocked-storage regression passes; normal-storage suite still verifies next ride and removal of forced ride hash. |
| `0598433` Return keyboard focus to the top of the page | `src/runtime.js`: focus existing skip link for Back to top. | Focus regression passes; skip link remains first in normal keyboard order. |
| `bb3848d` Preserve the legacy articles section anchor | `src/shell.html`: add `span#articles` inside `h2#h-writing`. | Direct `/#articles` navigation reaches unchanged Writing heading; heading name, section association and layout preserved. |

### Floating World diagnosis and flash evidence

The original lip diagnosis was not supported at 10.15s: the camera was already below the Gerstner sea surface, while the local lip was well to the side and lower. The fix changes only camera clearance where the previous envelope misses its margin; it does not change shader output formulas, geometry, barrel schedule or speed. It still blends into the original tube camera.

Inspected [baseline narrow seeks](preview/review/baseline-chrome/seeks.png), [final narrow seeks](preview/review/fixed/seeks.png), [final desktop frames](preview/floating-world/desktop-frames.png), [final phone frames](preview/floating-world/phone-frames.png), and both corresponding files in `docs/reference/`. The final nine seeks are 10.00, 10.10, 10.13, 10.15, 10.17, 10.20, 10.30, 10.60 and 10.85 seconds. The flat blue frame is gone. Reference geometry/composition remains visually consistent; the desktop hint is hidden in generated sheets because playback hides it. These are visual comparisons, not claims of pixel-identical rendering across GPUs.

| Flash sample | Many Worlds | Scale Invariant | Floating World | Asymptote |
|---|---:|---:|---:|---:|
| Supplied normal-speed scan, baseline, first 20s at 20fps | 0/s | 0/s | 3/s | 0/s |
| Supplied normal-speed scan, after camera fix | — | — | 3/s | — |
| Supplemental 30s normal-speed Many Worlds scan, 30fps (includes molten world) | 1/s | — | — | — |
| Supplemental constant-5x stress, 12 wall seconds, baseline (Many Worlds honors its cap) | 1/s | 0/s | 4/s | 0/s |
| Supplemental actual held-time equation, 20 wall seconds, 30fps, corrected camera | — | — | **6/s** | — |

The constant-5x case is a stress scenario, not a fresh-load interaction. The final hold-ramp case instead starts at warp 1, reproduces `runtime.js`'s held-time equation at dt=1/30s, and reaches warp 5 after about 3.2s. It directly renders the engine with the matching live fields and samples screenshots; this is a deterministic simulation of holding, not a recorded physical touch session. It covers ride time 0–95.707s. The worst one-second interval contains 12 qualifying opposing luminance reversals in the scan's cell 3. The [alarm contact sheet](preview/engine-review/postfix-runtime-hold/alarm-contact-sheet.png) visibly alternates large light sky/wave regions and dark barrel regions. [Raw report and series](preview/engine-review/postfix-runtime-hold/floating-world-runtime-hold-flash.json) and [reusable harness](preview/engine-review/supplemental-flash.mjs) are saved.

The hold scan froze HTML hash `e20dbb7f763ff9e5c695c54a3e3e284fe62acbb322b8070e5a106888498efe0c`, containing the camera and clock fixes. Later commits only affect fallback, navigation, storage and the legacy anchor; they do not change the sampled engine or acceleration equation. No GL or page errors occurred. The supplied scanner measures a 3×3 mean-linear-luminance grid at 720×450 (`tools/preview.mjs:146`), omits normal interactive acceleration and much of longer ride timelines, and is not a complete saturated-red/area analysis. Its normal-speed “0 problems” result does not dismiss the supplemental alarm. Require mitigation and broader assessment before launch.

## Review coverage and limits

| Area | Evidence and outcome |
|---|---|
| Setup and final verification | npm install completed, six declared packages, zero reported vulnerabilities, lockfile unchanged. Chromium installed as requested. Downloaded Chromium stalled/closed on local navigation in software and GPU modes; installed Google Chrome 155.0.8059.86 with `USE_GPU=1` ran the original suite successfully. No downloaded-browser failure was classified as a site bug. |
| Supplied suite | 8/8 static checks and 13/13 browser cases pass after every fix: freshness, JS syntax, engine contract, silence, markup/meta, deploy files; four rides on desktop/phone, input, pause, offscreen sleep, reduced motion, picking and keyboard. Logs: `preview/verify-*.log`. |
| Firefox and WebKit | **Firefox 157: 24/24; WebKit 27.2: 24/24 on final HTML hash above.** Four rides × desktop/phone × live/reduced/no-WebGL. Live cases check GL appearance, frames, Pause label/pressed state, stop/resume. No overflow, page/console errors or unexpected requests. Both support WebGL1/2, svh and overflow:clip in capability probes. [Final results](preview/review/cross-browser-final/cross-browser-results.json). Baseline matrix separately preserved in `cross-browser-baseline/`. |
| Runtime regressions | 4/4 hidden-clock VM checks and 3/3 final browser checks (blocked storage, thrown-draw theme, Back to top). [VM data](preview/review/runtime-vm-after-lifecycle.json), [browser data](preview/review/runtime-regression-after-fixes.json). |
| Additional lifecycle/input | 52/52 checks across all rides: seek→play, paused portrait resize, manual landscape resize, Space on controls/offscreen/body, synthetic touch cancellation/recentering, explicit initGL false/throw fallbacks. Expected injected failures were distinguished from unexpected errors. [Results](preview/review/lifecycle-extra-current.json), [harness](preview/review/lifecycle-extra.mjs). |
| Initial reduced motion and missing GL | All rides show a nonempty still, hide controls and stop looping at both sizes in Firefox/WebKit. Chrome suite also passes initial reduced motion. Dynamic preference change remains open. |
| Context loss/restore | All engines install loss/restore handlers, rebuild their GL resources and render again after restore + seek; final Floating World test also passed. Paused/manual/reduced pages need a subsequent draw to redisplay GL; Many Worlds ink fallback issue remains listed. |
| Long-time robustness | Three non-water engines: 192 VM draws over 16 times through 1e7s, desktop/phone live/still, 10,390,552 numeric geometry values finite. GPU seeks 24.1/27/3600/86400/1e7s gave nonblack readback and zero GL errors. Floating World: CPU camera probes finite through 1e7s; final GPU seeks 3600/86400/1e7s checked 1,919,000 numeric upload/uniform values, all finite, nonzero RGB, GL error 0. [Floating World evidence](preview/engine-review/floating-world-lifecycle.json). Sparse extreme-time probes are not an hours-long soak or proof on mediump phone GPUs. |
| Keyboard/semantics/touch | Skip link first and visible on focus, in-page headings receive focus, Back to top now returns focus, landmarks/headings/control names inspected. On 390×844: Pause44×44, nav≥44px high, Again142.81×44, Back to top92.41×45, content links331.12×64. The keyboard-only skip link is 137.03×39, an exception to AGENTS' preferred44px sizing; no normal touch target is exposed there. This does not imply the WCAG2.2AA target minimum is44px. |
| Contrast | Text remains the blocker: the badge and Many Worlds transition fail. Reference samples and both ink/dark states were inspected, but a few screenshots cannot establish every animated-frame contrast combination. |
| Visual review | All eight generated ride sheets compared with their eight reference sheets; desktop/phone full-page captures compared with both layout references; final Floating World narrow sequence and both frame sheets inspected. Social card and representative final Firefox/WebKit screenshots inspected. No unintended layout/copy change found. |
| Phone performance | Mac GPU viewport tests recorded about60–61rAF/s live,0offscreen/reduced. This is not a physical-phone benchmark. Canvas DPR/quality limits and pooled geometry reduce work; hidden-tab clock degradation is fixed, but adaptive recovery remains open. Shader warm-up and mobile precision need real-device confirmation. |
| Load and payload | Poster is painted before GL initialization; first shader work remains synchronous. Final HTML200,931bytes (196.2KiB), gzip9 73,963bytes (72.2KiB), versus baseline200,511/73,807bytes. One inline page is intentional; Google Fonts remains the external stylesheet/font source. Local font routing makes tests deterministic and does not measure public font-network latency or cold mobile startup. |
| Metadata/assets | Title, description, Open Graph title/description/type/image/size/alt, Twitter large-image card, viewport, lang and icons present. `og.png`1200×630,686,692bytes, visually legible and unclipped; apple icon180×180. Development engine absent. Canonical/og:url remain polish items. |
| Static delivery | `/` and `/og.png`200; unknown routes dedicated404 with status404; `_headers` not served as content. Expected headers present; 404 has noindex/home link/focus styling. No CSP added. |

The engine review found substantial reuse of typed geometry buffers and explicit buffer/index bounds. Remaining allocation sites include per-upload `.subarray()` views, small color arrays, Asymptote's per-frame text TreeWalkers/geometry reads (`src/engines/asymptote.js:223`), and Floating World's crest candidates/sort and returned frame object (`src/engines/floating-world.js:409`, `:545`). These are profiling opportunities, not demonstrated phone stutter.

Many Worlds warms its main blend/framebuffer/post pipelines before reveal and uses `gl.finish()` (`src/engines/many-worlds.js:655`, `:660`). Scale Invariant first executes its post shader when effects become active; Floating World compiles six programs at initialization but draws the barrel conditionally. Asymptote exercises its background/star/geometry programs in its first normal draw. Initial compilation alone does not prove that every later driver pipeline is warm. All four request WebGL1, use 16-bit indices and provide fragment precision fallbacks; optional derivatives are handled in Many Worlds/Floating World. Physical minimum-precision mobile GPUs remain untested.

Long-time math uses camera-relative/bounded coordinates: Many Worlds bounds shader time with `%600`, Scale Invariant normalizes fractional depth, Asymptote uses bounded rapidity-layer offsets, and Floating World reduces CPU-double wave phase modulo 2π. The sampled long-time results support those approaches but do not rule out every phase-dependent artifact.

Firefox's phone case uses a narrow viewport and touch capability; its Playwright backend does not implement full mobile emulation. macOS WebKit coverage is useful but does not replace Safari on a physical iPhone. Android Chrome hardware, iOS browser chrome/orientation, Low Power Mode, thermal/battery behavior, VoiceOver and cold mobile shader timings remain unverified. These limits are material to phone readiness.

## Deploy readiness


### Cloudflare Pages settings

Use the existing Pages project with **build output directory `public`** and **an empty build command**. The committed `public/` directory is already generated locally; rebuild with `python3 build.py` before committing source changes. Cloudflare's [build configuration documentation](https://developers.cloudflare.com/pages/configuration/build-configuration/) permits a blank command for a site without a framework. Root directory should point to the repository location containing `public` if the production repository nests this package.

The package contains `public/index.html`, `404.html`, `og.png`, both favicons, `apple-touch-icon.png`, and `_headers`. The `_headers` rule applies `nosniff`, the intended referrer policy, DENY framing, and the specified permissions policy. Local serving confirms those headers and correct missing-route status. The generated output excludes the development test ride. No Cloudflare account settings have been changed.

### Canonical host

Keep `SITE_URL = 'https://maxmartinelli.com'` in `build.py:25`. Direct network checks on October 24, 2026, confirmed:

| URL | Actual result |
|---|---|
| `https://maxmartinelli.com/` | 200, no redirect. |
| `http://maxmartinelli.com/` | 200, no HTTPS redirect. |
| `https://www.maxmartinelli.com/` | DNS resolution failed, including outside the restricted sandbox. |

The apex is the working host; changing the social-image URL to `www` would be incorrect for the observed setup. Recommend configuring HTTP→HTTPS at Cloudflare. If Max wants www to work, configure its DNS/custom domain and redirect it to the apex. No canonical `<link>` or `og:url` was found in either the old homepage or essay; the rebuilt head also omits them. Evidence is saved in `preview/review/live-url-audit.json`.

### Existing URLs requiring a decision

| Existing URL | Current public behavior | New package behavior | Recommendation |
|---|---|---|---|
| `/articles/learning` | 200, “What Does It Mean for Machines to Learn?” scrollytelling essay. | 404. | Preserve/migrate the essay or choose an intentional redirect destination before launch. |
| `/articles/learning.html` | 307 to `/articles/learning`; currently linked from the homepage. | 404. | Preserve as an alias/redirect alongside the extensionless URL. |
| `/articles/learning/` | 307 to `/articles/learning`. | 404. | Preserve as an alias/redirect alongside the extensionless URL. |
| `/#about` | About section. | Existing `about` section remains. | No redirect required. |
| `/#articles` | Articles section. | Baseline lacked the anchor; final build preserves it inside the Writing heading. | Fixed in `bb3848d`; direct fragment navigation verified. |

The old homepage links the essay and the two anchors above. The essay exposed no further internal page links. This is a crawl of reachable links, not proof that no older unlinked URLs ever existed. `/sitemap.xml` currently returns 404. `/robots.txt` returns Cloudflare content-signals text; it is not an identified content page requiring migration.

Do not redirect every missing route to the homepage: keep genuine 404s and make the article decision explicit. If Max chooses to retire the essay and redirect these paths home, the proposed `static/_redirects` entries would be:

```text
/articles/learning / 301
/articles/learning.html / 301
/articles/learning/ / 301
```

These entries are a proposal only. AGENTS.md's Deploy instructions require Max's agreement before adding old-URL redirects; no agreement or redirect implementation is claimed here. Rebuild after any approved `static/_redirects` change. Hash fragments such as `#articles` need an HTML anchor alias because they are not sent to the server.

After the later authorized preview deployment, check each forced ride URL, missing-route status, live response headers and social metadata. After the eventual production launch, refresh the cached preview using LinkedIn Post Inspector. No preview branch, production deployment or push occurred during this review.

## What I ran

Commands and results include failed setup attempts. Multiline diagnostic commands are identified by operation, with reusable scripts saved where available; repeated read-only log polling is grouped. All project work stayed in the requested folder.

### Root review command ledger

All project commands below ran from `/Users/maxmartinelli/Downloads/maxmartinelli-site`. Read-only path discovery before the folder existed ran from the task workspace. `NODE` below denotes `/Users/maxmartinelli/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`; it is an abbreviation in this ledger, not a change to the commands' behavior. Multiline diagnostic heredocs are described by purpose, with saved runnable equivalents linked where available. Repeated log/status reads are grouped; they never changed source files.

For successful npm/browser commands, the shell environment was:

```sh
export PATH="$PWD/preview/toolchain/bin:/Users/maxmartinelli/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
export npm_config_cache="$PWD/preview/npm-cache"
export PLAYWRIGHT_BROWSERS_PATH="$PWD/preview/browsers"
# Added after the downloaded Chromium failed:
export CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export USE_GPU=1
```

| Command / operation, in order | Result |
|---|---|
| `pwd && ls -ld /Users/maxmartinelli/Downloads/maxmartinelli-site /Users/maxmartinelli/Downloads/maxmartinelli-site.zip 2>/dev/null` | Initial turn: exit 1, neither project nor ZIP existed. |
| `ls -la /Users/maxmartinelli/Downloads`; `ls -la` | Exit 0; confirmed absent input and empty task workspace. |
| `rg --files /Users/maxmartinelli/Downloads /Users/maxmartinelli/Documents /Users/maxmartinelli/Desktop 2>/dev/null \| rg -i 'maxmartinelli[-_ ]site\|ENGINE_API\.md$'` | Exit 1: no matching project. Requested location; resumed after Max supplied folder. |
| `ls -la /Users/maxmartinelli/Downloads/maxmartinelli-site && git -C /Users/maxmartinelli/Downloads/maxmartinelli-site status --short` | Folder present; Git exit 128 because it was not yet a repository. No unzip needed. |
| `git init && git add -A && git commit -m 'Baseline from Claude'` | Exit 0; untouched 45-file baseline `df0519a`. |
| `cat AGENTS.md README.md docs/ENGINE_API.md package.json .gitignore` | Exit 0; read instructions, architecture and dependency configuration. |
| `npm install && npx playwright install chromium` | First attempt exit 127: npm absent from PATH. |
| `cat tools/browser.mjs tools/preview.mjs tests/site.test.mjs`; `nl -ba src/engines/floating-world.js` | Exit 0; inspected test/preview implementation and complete engine. |
| `sed -n '1,300p' src/engines/floating-world.js` | Exit 0; inspected camera, wave and path math. |
| `ls .../dependencies/node/bin && sed -n '300,365p' src/engines/floating-world.js && sed -n '470,505p' src/engines/floating-world.js` | Exit 0; bundled runtime contained Node only; inspected tube geometry. |
| With bundled Node bin added to PATH: `npm install && npx playwright install chromium` | Exit 127: npm was still absent. |
| `command -v node npm npx python3; ls -d /opt/homebrew/bin/{node,npm,npx} /usr/local/bin/{node,npm,npx} /Users/maxmartinelli/.nvm/versions/node/*/bin .../node_modules/npm 2>/dev/null; rg --files /Users/maxmartinelli/.cache/codex-runtimes /Users/maxmartinelli/.codex \| rg '/(npm-cli\|npx-cli)\.js$' \| head -20` | Python found; zsh glob had no match; no npm CLI found. |
| `mkdir -p preview/toolchain`; `curl -fsSL https://registry.npmjs.org/npm/-/npm-10.9.4.tgz -o preview/toolchain/npm.tgz`; `tar -xzf preview/toolchain/npm.tgz -C preview/toolchain`; `mkdir -p preview/toolchain/bin`; `ln -sf ../package/bin/npm-cli.js preview/toolchain/bin/npm`; `ln -sf ../package/bin/npx-cli.js preview/toolchain/bin/npx`; then `npm install && npx playwright install chromium` with local cache/browser paths | Exit 0; local npm installed, six declared packages installed, zero audit vulnerabilities; Chromium156/FFmpeg/headless shell downloaded. package-lock.json unchanged. |
| `sed -n '505,555p' src/engines/floating-world.js; cat tools/engine-contract.mjs` | Exit 0; inspected frame construction and sandbox contract tests. |
| `npm run verify > preview/baseline-verify.log 2>&1` | Exit 1: 8/8 static checks pass; browser closed at first navigation, 1/13 browser cases pass. |
| `node tools/preview.mjs --flash --out=preview/baseline > preview/baseline-preview.log 2>&1` | Downloaded Chromium stalled/timed out loading the first page; no usable complete scan. |
| `mkdir -p preview/review`; heredoc creation of `preview/review/fw-probe.mjs`; `NODE preview/review/fw-probe.mjs > preview/review/fw-probe-baseline.jsonl`; `cat` probe data and baseline logs | Exit 0; at10.15s cameraY16.814 versus estimated sea17.474; local lip well away. |
| `tail -25 preview/baseline-preview.log; git status --short; cat package-lock.json \| head -35` | Read successfully; source and lockfile clean then. |
| `USE_GPU=1 npm run verify > preview/baseline-verify-gpu.log 2>&1` | Exit 1, same downloaded-browser close/navigation failure; not treated as a site bug. |
| Heredoc creation of `preview/review/seeks.mjs`; `USE_GPU=1 NODE preview/review/seeks.mjs baseline > preview/review/seeks-baseline.log 2>&1` | Downloaded Chromium timed out; no usable screenshots. |
| `ps -axo pid,ppid,%cpu,%mem,etime,command \| rg 'preview.mjs\|seeks.mjs\|chromium\|Chrome\|site.test' \| head -40; ls /Applications \| rg -i 'Chrome\|Firefox\|Safari'` | Restricted ps denied; installed Chrome, Firefox, Safari found. |
| `DEBUG=pw:browser NODE --input-type=module` heredoc launching downloaded Chromium and installed Chrome on a blank data URL | Exit 0; both blank pages loaded; installed Chrome printed display-link diagnostics but succeeded. |
| `cat tools/serve.mjs; sed -n '1,125p' src/runtime.js; tail -10 preview/baseline-preview.log; cat preview/review/seeks-baseline.log` | Exit 0; checked server and startup paths. |
| `NODE --input-type=module` heredoc tracing local server/font requests in downloaded Chromium | Local fetch200 and stylesheet200; browser still timed out at DOMContentLoaded15s. Diagnostic caught exception, exited0. |
| `sed -n '1,45p' src/shell.html; sed -n '160,260p' src/runtime.js; tail -5 preview/review/seeks-baseline.log` | Exit 0; inspected input/storage handlers and startup. |
| `rg -n 'script\|while\|do \{' src/shell.html build.py \| head -50; ps -axo pid,ppid,%cpu,%mem,etime,command \| rg 'preview.mjs\|seeks.mjs\|chrome-headless\|site.test' \| head -30` | Approved read succeeded; identified stalled review processes. |
| `NODE --input-type=module` heredoc launching installed Chrome with an empty font stylesheet | Exit 0; Asymptote loaded completely and GL canvas visible. Isolated browser/environment failure. |
| `USE_GPU=1 npm run verify > preview/baseline-verify-chrome.log 2>&1` with installed CHROMIUM_PATH | Exit 0:8/8 static checks and13/13 browser tests. Original local-font routing retained. |
| `USE_GPU=1 NODE preview/review/seeks.mjs baseline-chrome > preview/review/seeks-baseline-chrome.log 2>&1` | Exit 0; captured9frames10.0–10.85s; reproduced dark-blue10.15s view. |
| `kill -TERM 28238 28480` | Exit2: both stalled review processes had already exited; no process killed. |
| `USE_GPU=1 node tools/preview.mjs --flash --out=preview/baseline-chrome > preview/baseline-preview-chrome.log 2>&1` | Exit0:all4rides, desktop/phone/full-page/still screenshots;0problems,0warnings; flash0/0/3/0. |
| Python heredoc adding camera-candidate response substitution to ignored `seeks.mjs`; `USE_GPU=1 NODE preview/review/seeks.mjs candidate > preview/review/seeks-candidate.log 2>&1` | Exit0; candidate removes blue dip in narrow seek sequence. No production files changed by this trial. |
| Python heredoc copying preview tool into ignored `candidate-preview.mjs` with candidate response substitution; `USE_GPU=1 NODE preview/review/candidate-preview.mjs --ride=floating-world --flash --out=preview/candidate > preview/candidate-preview.log 2>&1` | Exit0;0problems,0warnings,3flashes/s; desktop/phone reference frames retain appearance. |
| `sed -n '690,746p' src/engines/many-worlds.js; sed -n '125,165p' src/runtime.js; tail -10 preview/baseline-preview-chrome.log; tail -10 preview/review/cross-browser.log; cat preview/review/runtime-probe.json` | Exit0; reviewed fallback ink cache, adaptive clock and focused evidence. |
| Python heredoc reading baseline/candidate `report.json` flash entries | Baseline peak3/s at8.7s; candidate peak3/s at8.9s, cell3. Dip removal does not remove all3/s windows. |
| Python heredoc replacing the FloatingWorld camera clearance in `src/engines/floating-world.js`; `git diff -- src/engines/floating-world.js`; second Python heredoc clarifying its comment | Exit0;only camera-floor calculation/comment changed; no shader edits. |
| `python3 build.py && npm run verify > preview/verify-camera.log 2>&1 && git add src/engines/floating-world.js public && git commit -m 'Keep Floating World camera above narrow wave crests'` | Exit0;8/8+13/13; commit236db40. |
| `USE_GPU=1 node tools/preview.mjs --ride=floating-world --flash > preview/final-floating-world.log 2>&1`; `USE_GPU=1 node preview/review/seeks.mjs fixed > preview/review/seeks-fixed.log 2>&1` | Exit0;corrected source standard scan3/s,0problems/warnings; final narrow seeks captured. |
| `cat preview/review/runtime-vm.mjs; sed -n '1,240p' preview/review/runtime-regression.mjs; tail -8 preview/verify-camera.log` | Exit0; reviewed actual-source regression harnesses before using them. |
| Heredoc creation of `preview/review/apply-runtime-fix.py`; shell loop for lifecycle/fallback/storage/focus/anchor: run Python patch, `python3 build.py`, `npm run verify > preview/verify-<fix>.log 2>&1`, `git add src/runtime.js src/shell.html public`, focused `git commit -m ...` | First4fixes each passed8/8+13/13 and committed separately (411999a,6d67978,ef26672,0598433). Anchor assertion then safely stopped the script before any anchor mutation because existing heading has an id. |
| Within lifecycle loop: `node preview/review/runtime-vm.mjs --label=after-lifecycle > preview/review/runtime-vm-after-lifecycle.log` | Exit0;4/4checks:cancel pending rAF,fresh resume delta,1000px resolution retained,loop resumes. |
| `sed -n '1,220p' preview/review/REVIEW-draft.md`; `sed -n '75,240p' tests/site.test.mjs` | Exit0; reviewed draft and existing coverage. |
| `sed -n '1,260p' preview/engine-review/supplemental-flash.mjs`; Python JSON inspection of fixed runtime-hold alarm | Exit0; verified actual hold equation and frozen HTML hash;6/s alarm, no GL/JSerrors. |
| `node preview/review/fw-probe.mjs > preview/review/fw-probe-fixed.jsonl`; Python creation of `fw-long.mjs`; `node preview/review/fw-long.mjs > preview/review/fw-long.jsonl` | Exit0;corrected current-point measurements and finite camera states through1e7s. |
| `nl -ba src/runtime.js \| sed -n '76,92p;145,170p;220,258p'; nl -ba src/shell.html \| sed -n '135,145p'`; Python summary of baseline preview reports | Exit0;confirmed final-runtime references and measured60–61rAF/s on host,0offscreen/reduced. |
| Python heredoc adding `<span id="articles">` inside existing `h2#h-writing`; `python3 build.py`; `npm run verify > preview/verify-anchor.log 2>&1`; `git add src/shell.html public`; `git commit -m 'Preserve the legacy articles section anchor'`; `node preview/review/runtime-regression.mjs --label=after-fixes > preview/review/runtime-regression-after-fixes.log 2>&1` | Exit 0: 8/8 static + 13/13 browser tests; commit bb3848d; all 3 targeted browser regressions passed. |

Repeated read-only progress checks used `tail`/`cat` on the named baseline, candidate, verification, seek, cross-browser and regression logs; `ls` on their screenshot folders; `git status --short`, `git diff --stat`, and `git log --oneline -3/-4/-5/-6/-8`. They succeeded except absent-yet logs guarded by `2>/dev/null`; no source edits resulted. Exec sessions were polled using `write_stdin` with empty input. Tool lookups read runtime paths; they installed or modified nothing themselves.

Image-tool checks: viewed all four rides' desktop and phone contact sheets against all eight matching `docs/reference/` sheets; viewed generated Asymptote full-page desktop/phone against both layout references; viewed baseline/candidate/fixed FloatingWorld narrow seeks; viewed ManyWorlds low-contrast transition and the held-FloatingWorld alarm contact sheet. Visual differences in full-page live hero time are expected; no layout/copy changes were found.

Non-shell research: web tool opened official Cloudflare build/redirect documentation and W3C pause/flash/contrast documents; current-site link evidence was subsequently verified by direct HTTP probes. No messages, deployments or pushes were sent to external services.

### Public URLs, metadata and static serving


| Command / operation | Result |
|---|---|
| Initial `python3` heredoc using `urllib.request` against HTTPS/HTTP apex/www, both article forms, robots and sitemap, before project availability. | All requests failed sandbox DNS resolution. Superseded by the escalated probes below; not interpreted as public-site downtime. |
| `pwd && cat AGENTS.md && cat README.md && cat docs/ENGINE_API.md` | Successfully read the project instructions and architecture. |
| `nl -ba build.py && nl -ba static/_headers && nl -ba static/404.html && rg -n 'canonical\|og:\|twitter:\|favicon\|apple-touch\|href=\|SITE_URL\|description\|<html' src/shell.html && rg --files static public` | Inspected metadata generation and static assets. |
| `curl -sI https://maxmartinelli.com; curl -sI https://www.maxmartinelli.com` | Restricted attempt failed DNS. Escalated repeat returned apex HTTP/2 200, then exit 6 because www could not resolve. |
| `nl -ba src/shell.html \| sed -n '1,185p'; cat rides.json; nl -ba tools/serve.mjs \| sed -n '1,200p'; nl -ba tools/check.py \| sed -n '110,260p'; git status --short` | Inspected markup, shipped rides, static server and checks; working tree was clean at that point. |
| `curl -sSI https://www.maxmartinelli.com` | Escalated network request: exit 6, “Could not resolve host.” |
| `python3` heredoc: urllib + HTMLParser homepage/article/robots/sitemap probe, following redirects and extracting links. | Apex and essay reachable; article final URL extensionless; robots 200; sitemap 404. |
| `python3` heredoc: struct/gzip/pathlib/re asset dimensions, page size and metadata/dev-engine checks. | og.png 1200×630 / 686,692 bytes; apple icon 180×180; HTML 200,511 / gzip9 73,807 bytes; canonical and og:url absent; test engine absent. |
| `python3` heredoc: no-redirect HTTPRedirectHandler for HTTP apex, article aliases and robots. | HTTP apex 200; `.html` and slash aliases 307 to `/articles/learning`; robots text returned. |
| `node --input-type=module` heredoc importing `startSiteServer` and fetching local routes. | Failed immediately: node was not on shell PATH. |
| `python3` heredoc: final live URL/metadata/link audit, writing `preview/review/live-url-audit.json`. | Successful, evidence table above. Actual recorded timestamp 2026-10-25T00:24:05Z (October 24 locally). |
| Bundled Node executable with `--input-type=module` heredoc importing `startSiteServer`; fetched `/`, `/no-such-page`, all three essay variants, `/og.png`, `/_headers`; wrote `preview/review/local-route-audit.json`. | Exit 0. Correct local statuses and expected headers on all seven paths. |
| `cat tools/browser.mjs; cat package.json; cat static/favicon.svg` | Read browser setup, dependency list and favicon. |
| Bundled Node executable with `--input-type=module` heredoc importing `launch`, `routeRequests`, `startSiteServer` for 404 desktop/phone screenshots. | Failed before navigation: default cache lacked `chromium_headless_shell-1248`. No 404 screenshot generated. Subsequent cross-browser work used the correct project-local cache. |

### Firefox and WebKit

The toolchain prefix was:

```sh
PATH="$PWD/preview/toolchain/bin:/Users/maxmartinelli/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
PLAYWRIGHT_BROWSERS_PATH="$PWD/preview/browsers"
npm_config_cache="$PWD/preview/npm-cache"
```

| Command / operation | Result |
|---|---|
| With the prefix above: `npx playwright install firefox webkit` | Downloaded Firefox 157 / Playwright build 1555 and WebKit 27.2 / build 2370 into `preview/browsers`; exit 0. No new package dependencies. |
| `sed -n '1,260p' tests/site.test.mjs; sed -n '1,280p' src/runtime.js` | Read existing tests and runtime before implementing the audit harness. |
| `python3` heredoc writing `preview/review/cross-browser.mjs`. | Saved a review-only harness using the existing Playwright package, routeRequests and local server. |
| With PATH and PLAYWRIGHT_BROWSERS_PATH above: `node preview/review/cross-browser.mjs > preview/review/cross-browser.log 2>&1` | Exit 0; Firefox 24/24 and WebKit 24/24 passed. Finished 2026-10-25T00:29:34.895Z. |
| Six `python3` heredoc JSON status summaries of `preview/review/cross-browser-results.json`. | All read successfully; progress checked without changing site files; final summary confirmed 48 passed, zero failed, one HTML hash. |
| `rg -n 'uiLit\|smoothstep\\(\|heightAt\|camera\\(\|mm-next\|const REDUCED\|visibilitychange\|function fail\|id === .top.\|id="writing"\|badge' src/engines/many-worlds.js src/engines/floating-world.js src/runtime.js src/shell.html; git status --short; git log --oneline -3` | Located baseline findings; clean source tree and baseline commit still present when drafting. |
| `nl -ba src/engines/floating-world.js \| sed -n '170,210p'; nl -ba src/engines/many-worlds.js \| sed -n '695,708p'; rg -n '20\|flash\|dt\|fps\|grid\|seek\|DURATION' tools/preview.mjs; nl -ba src/runtime.js \| sed -n '75,88p;120,170p;210,238p'` | Confirmed camera, ink, flash-scan and runtime source references for this draft. |
| `python3` heredoc writing `preview/review/REVIEW-draft.md`. | Saved this draft only; not final REVIEW.md and not a source change. |

Non-shell verification: web-tool lookups of the live homepage/article, W3C contrast/flash explanations and Cloudflare build configuration; image-tool inspections of static/og.png and four cross-browser screenshots. The Khronos smoothstep reference URL could not be fetched by the web tool because of its XHTML content type; retain the shader concern as an explicit portability uncertainty unless another reviewer's primary-source evidence is added. Browser/command session polling used read-only `write_stdin` with no input.


### Runtime reviewer commands

| Command / operation | Result |
|---|---|
| `pwd`; `cat AGENTS.md README.md docs/ENGINE_API.md`; numbered runtime/shell reads; `rg` context/init/draw handlers through engines, tests and tools; `cat package.json`; `sed` browser/site tests | Success; inspected complete runtime, shared markup and all engine lifecycle hooks. |
| Inline Node VM for picker/adaptation, first with `node`, then bundled absolute Node | First exit127 (PATH); repeat succeeded and reproduced same-ride selection/scale0.7. |
| `rg` REDUCED, PHONE, quality, document/font/lifecycle usage; `sed` GL/context sections in all four engines | Success; confirmed static preference capture and context handlers. |
| Downloaded-Chromium GPU browser probe | Exit1, navigation30s timeout; setup limitation. |
| Python sRGB contrast calculation | Exit0, Floating World badge4.185:1. |
| Inline actual-runtime VM hidden-tab probe | Exit0, reproduced stale clock and1000→700px degradation. |
| `rg --files docs/reference`; `sed -n '1,180p' tools/preview.mjs` | Success; confirmed screenshot and flash method. |
| Installed-Chrome focused browser probe; second probe with43seeks12.00–12.42s and context loss/restore | Exit0; saved `runtime-probe.json`, `runtime-transition-context.json` and PNGs. |
| Node/pngjs screenshot luminance/contrast sampling | Exit0; nav samples approximately1.285/1.305:1. |
| Python heredocs creating `runtime-vm.mjs` and `runtime-regression.mjs`; baseline runs | Harness creation succeeded; baseline VM exit1 with1/4 passing; baseline browser exit1 with0/3 passing, expected reproductions. |
| Python heredoc creating `lifecycle-extra.mjs`; `node preview/review/lifecycle-extra.mjs --label=current`; Python JSON measurement summary | Exit0,52/52checks, touch-target measurements saved. |

### Engine reviewer commands

| Command / operation | Result |
|---|---|
| `pwd`; project docs; `wc -l` and numbered reads of Many Worlds, Scale Invariant and Asymptote; `cat tools/browser.mjs`; `nl -ba src/runtime.js`; `cat tools/serve.mjs tools/engine-contract.mjs` | Success; complete engine/runtime contract review. |
| Inline VM192draws at16times, desktop/phone and live/still; initial plain `node`, then absolute bundled Node | Initial exit127; repeat pass,10,390,552 finite numeric geometry values. |
| Installed-browser discovery using `rg --files` runtime locations | No PATH Node found; used known bundled executable. |
| Initial browser long-session probe | Sandbox server bind EPERM; approved retry navigated to30s timeout; DOMContentLoaded90s retry also timed out with downloaded Chromium. |
| Installed-Chrome long-time/context probe for the three non-water engines | Exit0, sparse long seeks nonblack/error0 and context restore→seek working. Initial diagnostic output was returned by the command, not persisted as a reusable script. |
| Inline two Many Worlds screenshots at24.1/27s | Exit0; saved under `preview/engine-review/`; illustrative only because first-reveal fade can affect those captures. |
| `rg` flash duration/fps/seek references; read preview scanner and `.gitignore`; heredoc create `preview/engine-review/supplemental-flash.mjs` | Success; review-only scanner uses existing Playwright/pngjs dependencies. |
| `node preview/engine-review/supplemental-flash.mjs` with installed Chrome/GPU | Exit0; five scans saved, including Many Worlds30s normal and four constant5x stress cases. Exit0 means scan completed; alarms are data, not an automatic failure exit. |
| Python edits to ignored supplemental harness for filters, frozen HTML and runtime ramp; `REVIEW_HOLD_RAMP=1 REVIEW_RUN_LABEL=postfix-runtime-hold node preview/engine-review/supplemental-flash.mjs` | Exit0; corrected-camera ramp6/s alarm, no GL/page errors, source hash saved. |
| Compose/view alarm contact sheet; recompute transition timestamps from JSON; check source hash/camera-fix presence | Success;12qualifying reversals in worst1s window; screenshots inspected. |
| Two final read-only `rg -n` allocation/GL/precision searches and numbered Floating World/Many Worlds setup/warm-up reads | Success; allocation, warm-up and precision notes above confirmed. |
| Inline final Floating World GPU long-time/context probe using installed Chrome/GPU | Exit0;1,919,000 finite numeric values, nonzero RGB and error0 at3600/86400/1e7s; loss→restore→seek10.15 succeeds. `floating-world-lifecycle.json` saved. |

### Final build and reporting commands

| Command / operation | Result |
|---|---|
| Python copy19baseline cross-browser evidence files and add `REVIEW_OUT` to harness; poll source/public for legacy anchor | Success; final test started only after rebuilt anchor present. |
| `mkdir -p preview/review/cross-browser-final`; `REVIEW_OUT="$PWD/preview/review/cross-browser-final" node preview/review/cross-browser.mjs > preview/review/cross-browser-final/cross-browser.log 2>&1` | Exit0,48/48; final hash matches current public file. |
| Two Python final browser status/hash summaries | Success; matrix complete2026-10-25T00:40:46Z. |
| `git status --short && git log -8 --oneline`; final `cat`/`sed` report/command/test evidence; `git diff df0519a..HEAD -- src`; numbered line/flash-scanner reads; `rg --files` diagnostic inventory | Success; six focused fixes present, clean source tree, final claims cross-checked. |
| Inline Node legacy-anchor check using local server, installed Chrome and reduced motion | Exit0; direct `/#articles` displays Writing, original heading/section association retained. Saved `legacy-anchor.json`. |
| Python final HTML byte/gzip/hash calculation; `git diff --check && git diff df0519a..HEAD --stat && git status --short` | Exit0;200,931/73,963bytes and final hash above; no whitespace errors; only intended source/generated files changed before report. |
| Heredoc write `preview/review/root-commands.md`; heredoc write/run `preview/review/assemble-review.py` | Success; assembled this report from verified evidence and command ledgers. |
| `npm run verify > preview/verify-final.log 2>&1` after report assembly, with the documented Chrome/GPU environment | Exit0; **8/8 static checks and13/13 browser tests passed** on the final site build. |
| Python report local-link/marker validation and final browser JSON validation; `tail -18/-8 preview/verify-final.log`; `git diff --numstat df0519a..HEAD`; `git status --short` | Exit0; all local evidence links resolve, no unfinished draft markers,48/48 final cross-browser cases pass. Only REVIEW.md remained untracked before its commit. |
| Python final report update with allocation/warm-up/precision notes and completed verification record; `git diff --check`; `git add REVIEW.md`; `git diff --cached --check`; `git commit -m 'Document prelaunch review and remaining release blockers'`; `git status --short`; `git log -8 --oneline` | Report saved and committed separately; whitespace checks pass and final tracked working tree is clean. Commit identity is in Git history. |

No push/deploy command was run. Final Floating World image reads succeeded. The Codex file-open request for REVIEW.md returned queued (it did not change file contents).

## Recommendations for Max

1. **Resolve the held-acceleration flash alarm and both contrast failures before launch.** Approve a timing/visual change and validate the result; the current user scope prevents silently making those changes.
2. Decide whether to keep the machine-learning essay. Preserve its three URL forms, or approve an explicit redirect destination. `AGENTS.md`, Deploy step6, says to add old-URL redirects “only if Max agrees”; no redirects were added. This review does not need to stop for that decision.
3. Run physical iPhone/Safari and Android Chrome acceptance checks, including Low Power Mode, rotate while paused/live, long hold, background/foreground, VoiceOver and shader startup. Measure frame pacing and adaptive recovery there.
4. Follow up on live reduced-motion changes, paused context restoration/ink fallback and undefined reversed smoothstep edges, keeping visual comparisons for shader changes.
5. Keep `SITE_URL` on the apex, configure HTTP→HTTPS, and optionally support www with a redirect to apex. Add canonical/og:url as metadata polish.
6. When a later deployment is authorized, use an empty Pages build command and output `public`; verify headers, 404s, ride hashes, social image and old URLs on its preview. Refresh LinkedIn's cached preview only after the eventual launch.

All six fixes are committed locally against the untouched baseline. `git diff df0519a..HEAD` shows their complete reviewable history. `preview/` contains ignored local evidence/tooling and is not shipped; preserve it separately if moving this checkout.

## Follow-up after review

Claude validated this review on October 25, 2026, then fixed the blockers. Each change is its own commit after `e9ab28d`; commits are listed by subject.

**Validation.** The held Floating World scan was reproduced independently, with the same 6 flashes per second and the same worst count in every cell. The badge (4.18:1) and the ink-rift contrast (about 1.1:1, for about two frames at each ink rift) were reproduced. The camera fix was confirmed: cell luminance stays between 0.42 and 0.45 from 10.05 to 10.25 s, with no dip. One methodology correction: the original hold harness advanced ride time at the uncapped speed even when a ride caps it. That did not affect its Floating World result, but it would overstate any capped ride; `tools/preview.mjs --hold` replays the runtime exactly.

| Finding | Resolution | Commit | Evidence |
|---|---|---|---|
| 1. Held Floating World flashing | Held speed capped at 2× (`warpCap`); field-of-view kick, spray and vibration follow the new `live.intent`, so the hold still feels like accelerating. Other rides unchanged. | Cap Floating World's held speed at 2x to stay within flash limits | Hold ramp, 720×450, 30 fps: uncapped 6/s, 2.5× 4/s, 2× 3/s (60 s of ride, and again with full visual kick). Normal speed unchanged at 3/s. |
| 2. Many Worlds ink-rift contrast | Hero ink snaps when the tear has covered half the name, instead of cross-fading through grey. | Snap Many Worlds hero ink at the rift midpoint instead of fading through grey | Lowest median text contrast across both ink rifts: 1.1:1 before, 5.5:1 after. Only pixels where the tear edge crosses a letter dip, for a frame or two. Severity was closer to P3: it lasted about 40 ms. |
| 3. Floating World badge | Text `#FFFAF0` on the unchanged `#C8402F`. | Raise Floating World's Forthcoming badge contrast to 4.77:1 | 4.18:1 to 4.77:1. A computed-style audit of all text outside the hero on all four rides finds nothing lower. |
| 4. Essay URLs | Max retired the essay; all three forms 301 to `/`. | Redirect the retired essay URLs to the home page | `static/_redirects`; the local server applies it and a browser test checks all three forms. Confirm on the Pages preview. |
| 8. Context loss in the ink world | The loss handler restores the default ink. | Reset Many Worlds hero ink when its WebGL context is lost | `WEBGL_lose_context` at `seek(15)`: text returns from rgb(14,18,30) to rgb(244,241,232). |
| 9. Canonical metadata | Canonical link and `og:url` on the apex; `check.py` requires them to agree with `og:image`. | Add a canonical URL and og:url for the apex host | Static checks. |
| Regression from `0598433` | Back to top still moves focus to the skip link, but the link only becomes visible for keyboard focus. | Keep the skip link hidden after Back to top for pointer users | A mouse click or tap used to leave a "Skip to content" box over the hero; a browser test now covers mouse and keyboard. |
| Tooling | `preview.mjs --hold` scans 20 s of holding; `--scans-only` skips screenshots. | Add a held-acceleration flash scan to the preview tool | Fails above 3 flashes per second. |

**Final verification** (Chromium 141 with SwiftShader): 8/8 static checks; 14/14 browser tests; flash scans at normal speed / held: Many Worlds 0/0, Scale Invariant 0/0, Floating World 3/3 (2× cap), Asymptote 0/0 flashes per second. All eight frame sheets are pixel-identical to `docs/reference/`, except the playback hint's visibility on one phone sheet.

**Updated verdict: ready to launch.** First check the Cloudflare preview on a phone (each ride, holding to accelerate) and confirm the essay redirects there. Still open, none blocking:

- 6: adaptive resolution can't recover on 60 Hz screens. This is the first thing to do after launch, because any startup stall lowers resolution for the rest of the visit.
- 5: live reduced-motion change.
- 7: reversed `smoothstep` edges.
- The physical-device checks listed above.
