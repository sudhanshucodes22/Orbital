# Baseline harness

Captures the frozen artifact export deterministically so the Next.js port can
be proven not to change how the page looks.

```bash
npm install
npm run capture                          # write reference/baselines/ (destructive)
npm run check                            # re-verify the export against them
node capture.mjs --check --target=next   # PARITY GATE: ported app vs them
```

`check` never writes to `reference/baselines/`. It captures into
`reference/.baseline-check/` (gitignored) and compares.

`--target=next` captures from a running Next server (`NEXT_URL`, default
`http://localhost:3000`) instead of the frozen export, and diffs it against the
same baselines. Run it against a **production** build (`npm run build && npm
run start`): the dev server paints a Next indicator badge that lands in every
diff. It refuses to run without `--check`, so it can never overwrite the
baselines with output from the thing being tested.

## Why this is not just "take a screenshot"

The page animates continuously: three `requestAnimationFrame` loops (starfield,
comet, WebGL globe), a typewriter on a 58 ms interval, an event ticker on 1700
ms, and a style-morph cycle on 5200 ms. Naive screenshots never reproduce.

`freeze.js` is injected before any page script runs and stubs `setInterval` and
`requestAnimationFrame`. This is safe because `support.js` — the dc-runtime —
uses neither (it polls with `setTimeout`, which is left alone). Each rAF loop
body runs once directly before it first schedules itself, so layout-affecting
work still happens exactly once, deterministically.

Three further sources of nondeterminism are handled:

- **Canvases.** The starfield seeds with `Math.random()`, the comet spawns
  randomly, and the globe's rotation accumulates per frame. None can be made
  deterministic cheaply and none is part of the DOM layout the port must
  reproduce, so they are hidden for the hashed sets. The `live/` set covers
  them as a human reference.
- **The 3 MB stray screenshot.** It decodes asynchronously and appears six
  times at 540x351, so until it lands every element position below it is wrong.
  Capture waits for all images to complete.
- **Reveal-on-scroll.** `initReveal()` hides `[data-reveal]` inline and only
  shows it when an IntersectionObserver fires. Captures force them visible
  rather than depending on observer timing.

## Comparison is pixel-based, not hash-based

Chrome's subpixel antialiasing is not bit-stable across page instances. The
same section re-rendered in the same browser was measured drifting by about 2
pixels out of 2.3 million (0.0003%), and it could not be eliminated by warming
the browser, the page, or the screenshot path.

So `check` compares decoded pixels with `pixelmatch` and allows up to **0.05%**
of pixels to differ. Anything that actually matters — a shifted element, a
wrong colour, a missing block — moves thousands of pixels, orders of magnitude
above that floor. Verified by injecting a 40x40 block into one baseline: it was
caught at 0.2021% while the other 27 stayed clean.

When a shot exceeds tolerance, a highlighted diff is written to
`reference/.baseline-check/_diff/`.

## Sets

| Set | Shots | Hashed | Purpose |
|-----|-------|--------|---------|
| `layout/` | 4 | yes | Full page at 1440 / 1024 / 768 / 375, hero morph pinned to `--hp: 1` |
| `states/` | 18 | yes | Device switch (3), style morph (4), FAQ (5), steps (6), driven by real clicks |
| `hero/` | 6 | yes | Scroll-driven morph sampled across its range, `--hp` 0.15 to 1.0 |
| `live/` | 2 | **no** | Nothing stubbed. Globe, starfield and comet visible. Human reference only. |

`hero/` deliberately leaves `requestAnimationFrame` alive so the real scroll
loop computes `--hp` and the `detect` state from the scroll offset. Both are
pure functions of scroll position, so it stays deterministic.

Each group asserts its expected shot count. A set that silently captures
nothing would make `check` pass on an empty comparison, which is worse than no
harness at all — this happened during development and the assertion exists
because of it.

## Browser

Drives the **installed Google Chrome** via Playwright's `channel: 'chrome'`
rather than a Playwright-managed build, to avoid a ~150 MB download. The exact
version is recorded in `reference/baselines/manifest.json`.

The trade-off: Chrome auto-updates, and a major rendering change could shift
every baseline at once. That is easy to spot (everything drifts, not one thing)
and the fix is to pin a build with `npx playwright install chromium` and drop
the `channel` option. Re-capture baselines if you do.

## Why the hero set nudges the scroll

The page's scroll loop only recomputes `--hp` when `scrollY` changes, so at
scroll 0 the variable keeps whatever the first `requestAnimationFrame` tick
happened to observe — a pre-settle transient that never corrects itself. The
export read 0.1541, the port read 0.1562, with byte-identical stage geometry
either way (top 664.44, height 654, document 14526). That is a race in the
original code, not a design property, so the harness scrolls to 1 and back
before the hero set to make both targets measure the settled layout.
