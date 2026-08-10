# Port codemods — retired

One-time mechanical transforms that produced `components/orbital/**` and
`app/globals.css` from the frozen dc-runtime export.

```
port.mjs        <x-dc> template  -> sections/*.tsx + template.tsx + globals.css
port-logic.mjs  <script text/x-dc> -> OrbitalLanding.tsx
```

**Both refuse to run without `--force`, and you almost certainly should not
pass it.** Their outputs are hand-maintained now: they carry accessibility
attributes, a reduced-motion path, and the stray-screenshot fix, none of which
these scripts know about. Regenerating silently discarded all of it once
during development, which is why the guard exists.

They are kept for provenance — they document exactly how the export became
React, and every rule in them cites the `support.js` behaviour it mirrors.

If you ever do need to re-derive from the export, expect to reapply by hand:

- the stray `<img>` removal in `HowItWorks.tsx` (README defect 1),
- `role="button"` / `tabIndex` / `onKeyDown` / `aria-pressed` on the FAQ and
  step rows, and `aria-live` on the FAQ answer panel,
- `aria-hidden` on the background canvases and gradient scrims,
- the `:focus-visible` and `prefers-reduced-motion` blocks in `globals.css`,
- the reduced-motion branches in `OrbitalLanding.tsx`.

Then run the parity check.
