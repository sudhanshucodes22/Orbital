# Orbital

Landing page for Orbital, a multimodal AI website engineer.

## Repository layout

```
reference/
  artifact-export/   Frozen, byte-identical copy of the original design export.
                     Read-only. Never edit — it is the source of visual truth.
  baselines/         Reference screenshots used to prove visual parity
                     during the port.
```

The Next.js application is added at the repository root in Phase 1.

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
| 0 | Freeze the export in git; capture parity baselines | in progress |
| 1 | Scaffold Next.js (App Router, TypeScript, server runtime) | not started |
| 2 | Mechanical port of the template to JSX via codemod | not started |
| 3 | Verify parity against baselines | not started |
| 4 | Production hardening (metadata, a11y, images, CTA) | not started |
| 5 | Responsive design (new design work, not a port) | not started |

The governing constraint: **the visual design is final.** No phase before 5
may change how the page looks. Baselines exist to prove that.

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
