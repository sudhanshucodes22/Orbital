# Orbital

Landing page for Orbital, a multimodal AI website engineer.

## Repository layout

```
reference/
  artifact-export/   Frozen, byte-identical copy of the original design export.
                     Read-only. Never edit — it is the source of visual truth.
  baselines/         28 deterministic screenshots + 2 live references, used to
                     prove the port does not change how the page looks.
tools/
  baseline/          The capture harness. See tools/baseline/README.md.
```

Before and after any work that could touch rendering:

```bash
npm run build && npm run start &                  # parity is measured on prod
cd tools/baseline && npm install
node capture.mjs --check --target=next            # 28 shots, expect zero drift
```

This pixel-diffs the running app against `reference/baselines/` and exits
non-zero on drift. It never overwrites the baselines.

**Current status: 28/28 shots reproduce with zero differing pixels** — 4 full
page layouts (1440/1024/768/375), 18 interactive states driven by real clicks,
and 6 hero scroll positions.

Tags: `artifact-export` (the untouched export) and `baselines-v1`.

The Next.js application lives at the repository root (`app/`, `next.config.ts`,
`package.json`).

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run typecheck
npm run lint
```

## Scaffold decisions

Next.js 16.3, React 19.2, App Router, TypeScript. `create-next-app` will not
run in a directory that already contains `reference/` and `tools/`, so the
scaffold was generated elsewhere and merged in deliberately. Four of its
outputs were **not** taken:

- **`app/globals.css`.** It ships `* { padding: 0; margin: 0 }`,
  `body { display: flex; flex-direction: column; font-family: Arial }` and
  light/dark tokens. The Orbital design resets only `box-sizing` and
  `body { margin: 0 }`, and otherwise relies on user-agent defaults. Keeping
  Next's reset would have silently changed spacing across the ported page.
  It now holds the design's own `<style>` block verbatim, plus the
  `:focus-visible` and `prefers-reduced-motion` rules added in Phase 4.
- **`app/favicon.ico`** and **`public/*.svg`** — Vercel branding and demo
  assets. Replaced in Phase 4 by `app/icon.svg` (the Orbital mark) and
  `app/opengraph-image.png` (rendered from the real page).
- **Tailwind** was declined. The design is 100% inline styles; Tailwind's
  preflight is a CSS reset and would change rendering.
- **`README.md`** — this file already existed.

`reference/**` is excluded from ESLint. `support.js` is a generated
third-party bundle and linting it produced real-but-irrelevant findings on a
file that must stay byte-identical.

`three` is pinned to **exactly** `0.128.0` (no caret) with matching
`@types/three`. Verified at scaffold time that every API the globe uses still
exists in r128 (`sRGBEncoding`, `ACESFilmicToneMapping`,
`LinearMipMapLinearFilter`, and the rest) and that it bundles under Turbopack.

Fonts are declared in `app/layout.tsx` via `next/font/google` with the exact
weights and styles the export's Google Fonts `<link>` requested. Confirmed
self-hosting works: the running page issues **zero** external requests.

The design's own `font-family` declarations are left verbatim rather than
rewritten to `var(--font-*)` — next/font registers each family under its real
name, so they already resolve to the self-hosted file. See "Parity notes"
below for why routing them through the variables broke rendering.

`AGENTS.md` / `CLAUDE.md` are generated and re-added by `next dev`; they are
committed so the tree stays clean.

## Provenance

The design was produced as a Claude design artifact and exported as
`.dc.html` files. These are **not** static HTML. They are templates for
`dc-runtime` (`support.js`), a preview runtime that:

1. fetches React 18.3.1 UMD from unpkg at page load,
2. compiles the `<x-dc>` template to React elements in the browser, and
3. pairs it with the `<script type="text/x-dc">` block, which defines
   `class Component extends DCLogic` (`DCLogic` extends `React.Component`).

Template syntax is custom: `{{ expr }}` interpolation, `<sc-for list as>`
loops, `<helmet>` for head injection, and `style-hover` for hover styles.

`Orbital Launch.dc.html` is the canonical page. `Multimodal AI Website
Engineer.dc.html` is an earlier draft, retained for history only.

## Port plan

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Freeze the export in git; capture parity baselines | **done** |
| 1 | Scaffold Next.js (App Router, TypeScript, server runtime) | **done** |
| 2 | Mechanical port of the template to JSX via codemod | **done** |
| 3 | Verify parity against baselines | **done** — 28/28 pixel-identical |
| 4 | Production hardening (components, metadata, a11y, images) | **done** |
| 5 | Responsive design (new design work, not a port) | **done** |
| 6 | Product foundation, backend, deployment | not started |

The governing constraint: **the visual design is final.** Baselines exist to
prove that. Since Phase 4 they are captured from the application rather than
the export, so they now represent *the approved design*; re-baselining needs
`--accept` and a reviewed diff.

Two intentional visual changes have been accepted: the stray screenshot
(defect 1) was removed with sign-off, and the 768 / 375 baselines now carry
the responsive layout. Every 1440 and 1024 shot is still pixel-identical to
the approved design.

## Parity notes

Two things were found by the pixel diff during the port and are worth knowing
before touching fonts or the hero:

- **Do not route the design's fonts through next/font's `--font-*` variables.**
  They expand to `"IBM Plex Mono", "IBM Plex Mono Fallback"`, and that
  synthetic fallback (local Arial with `size-adjust`) sits ahead of the generic
  family. U+2192 is absent from IBM Plex Mono, so the hero arrow rendered in
  adjusted Arial at 20.19px instead of generic monospace at 9.03px, widening
  the hero buttons by 11.16px. next/font registers each family under its real
  name, so the design's own declarations already resolve to the self-hosted
  file. `adjustFontFallback: false` is documented but is **not honoured** by
  Next 16.3.
- **`--hp` at scroll 0 is a race in the original code.** The scroll loop only
  recomputes when `scrollY` changes, so the value is whatever the first rAF
  tick saw. The harness nudges the scroll before the hero set so both
  implementations measure settled layout.

## Known defects in the export

Recorded at freeze time; none are fixed in `reference/artifact-export/`.

1. ~~**Stray screenshot rendered six times.**~~ **Fixed in the app** (Phase 4,
   with sign-off). `Orbital Launch.dc.html:217` places a 2940x1912, 3.0 MB PNG
   inside `<sc-for list="{{ steps }}">`, so it rendered once per step at
   540x351, forcing the step rows apart by 2108px in total. It was a screenshot
   of the artifact editor displaying this same page.
2. ~~**No `@media` queries in either file.**~~ **Addressed in the app**
   (Phase 5) by `app/responsive.css`. The export remains desktop-only.
3. ~~**No document metadata.**~~ **Fixed in the app** (Phase 4): title,
   description, Open Graph, Twitter card, canonical, `lang`, an SVG favicon
   and an `opengraph-image.png` rendered from the real page.
4. **Accessibility.** Largely **fixed in the app** (Phase 4): the 11 FAQ and
   step rows are keyboard operable with `role="button"`, `tabIndex`, Enter/Space
   and `aria-pressed`; the FAQ answer panel is `aria-live`; the background
   canvases and scrims are `aria-hidden`; `:focus-visible` gives a visible
   keyboard focus ring; `prefers-reduced-motion` is respected in both CSS and
   the animation loops. A full audit (contrast, screen-reader pass) is still
   outstanding.
5. **Corrupted CSS.** Line 18: `background:#03040 8` (overridden by the
   following declaration, so currently harmless).
6. **Fragile texture path.** `load.load('earth-equirect.jpg')` is relative
   without `./` and breaks when served from a nested route.
7. **Unused keyframe.** `orbitDot` is declared and never referenced.
8. **~21 MB of unreferenced assets.** `uploads/` and `.thumbnail` are export
   leftovers, confined to `reference/` and never deployed. `public/` carries
   only `earth-equirect.jpg` (764 KB), the globe texture.

## Runtime dependencies of the export

All fetched from third-party CDNs at page load.

| Dependency | Version | Note |
|------------|---------|------|
| React + ReactDOM | 18.3.1 UMD | SRI-pinned by `support.js` |
| @babel/standalone | 7.29.0 | loaded conditionally |
| three.js | **0.128.0** | no SRI; version is load-bearing |
| Google Fonts | — | 5 families |

three.js r128 dates from 2021 and the globe uses `outputEncoding`,
`sRGBEncoding` and `LinearMipMapLinearFilter`, all removed in later
versions. Pin `three@0.128.0` from npm during the port or the shaders break.

## Responsive layer

`app/responsive.css` holds every responsive rule; the components carry only
`r-*` class hooks. Nothing restyles the design — it re-flows it, and all
colours, borders, type and spacing come from the untouched inline styles.

Because the design is expressed entirely in inline styles, which a media query
cannot reach, every override is `!important`. That is the same mechanism the
design's own hover system uses. It is also what makes the desktop guarantee
structural rather than hopeful: none of these rules exist above 768px.

| Tier | Behaviour |
|------|-----------|
| `<= 768px` | Nav collapses to a hamburger; every multi-column grid becomes one column; sticky side panels go static; vertical column rules become horizontal row rules; touch targets grow to 44px; Earth moves right and dims to 0.62 so full-width content stays legible over it |
| `<= 480px` | Tighter gutters (16px), hero re-scaled to `clamp(30px, 8.6vw, 40px)`, hero CTAs stack full width |

480 rather than 375 for the phone tier so it covers every common handset
(375–430), not only the narrowest test point.

The capability strip stays horizontally scrollable on small screens — that is
the design's own behaviour, not a concession.
