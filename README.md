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
  The file is now a near-empty placeholder; Phase 2 replaces it with the
  design's own `<style>` block verbatim.
- **`app/favicon.ico`** and **`public/*.svg`** — Vercel branding and demo
  assets. A real favicon is Phase 4.
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
| 4 | Production hardening (metadata, a11y, images, CTA) | not started |
| 5 | Responsive design (new design work, not a port) | not started |

The governing constraint: **the visual design is final.** No phase before 5
may change how the page looks. Baselines exist to prove that.

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

1. **Stray screenshot rendered six times.** `Orbital Launch.dc.html:217`
   places a 2940x1912, 3.0 MB PNG inside `<sc-for list="{{ steps }}">`, so it
   renders once per step at 540x351, forcing the step rows apart. The image is
   a screenshot of the artifact editor displaying this same page. Unintended.
2. **No `@media` queries in either file.** Type is fluid via `clamp()`;
   layout is fixed multi-column grids. There is no mobile design yet.
3. **No document metadata.** No `<title>`, `<html lang>`, description,
   Open Graph, canonical, or favicon.
4. **Accessibility.** One `alt` attribute project-wide; zero `aria-*` or
   `role`. FAQ and step rows are `<div onClick>`, so they are not keyboard
   reachable. No `prefers-reduced-motion` guard despite three continuous
   `requestAnimationFrame` loops.
5. **Corrupted CSS.** Line 18: `background:#03040 8` (overridden by the
   following declaration, so currently harmless).
6. **Fragile texture path.** `load.load('earth-equirect.jpg')` is relative
   without `./` and breaks when served from a nested route.
7. **Unused keyframe.** `orbitDot` is declared and never referenced.
8. **~21 MB of unreferenced assets.** `uploads/` and `.thumbnail` are export
   leftovers. Kept in git as history; excluded from any deploy.

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
