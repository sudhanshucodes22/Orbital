// Ports the <script type="text/x-dc"> logic block into a typed React class.
//
//   node port-logic.mjs   ->  components/orbital/OrbitalLanding.tsx
//
// The method bodies are lifted VERBATIM from the export and only the four
// things that genuinely have to change are rewritten. Retyping 340 lines by
// hand would be the easiest way to introduce a silent behavioural difference.
//
// DCLogic (support.js `StreamableLogic`) is a plain class with `props`,
// `state`, `setState`, `forceUpdate` and React-identical lifecycle names,
// driven by a host React component. Every one of those has the same meaning
// on React.Component, so the base swap is a drop-in.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const SRC = path.join(REPO, 'reference/artifact-export/Orbital Launch.dc.html');

// Font families are deliberately NOT rewritten.
//
// next/font registers each family under its real, unhashed name
// (`@font-face { font-family: IBM Plex Mono }`), so the design's original
// `font-family:'IBM Plex Mono',monospace` already resolves to the self-hosted
// file. Leaving the declarations untouched keeps them byte-identical to the
// export.
//
// Routing them through next/font's `--font-*` variables actively broke parity:
// those variables expand to `"IBM Plex Mono", "IBM Plex Mono Fallback"`, and
// the synthetic Fallback face (local Arial with size-adjust) sits ahead of the
// generic family. U+2192 is absent from IBM Plex Mono, so the arrow rendered
// in adjusted Arial at 20.19px instead of generic monospace at 9.03px,
// widening the hero buttons by 11.16px. `adjustFontFallback: false` is
// documented for next/font/google but is not honoured by Next 16.3, so not
// referencing the variables at all is the reliable fix.
const FONT_VARS = [];


// ---- retirement guard ----------------------------------------------------
// The generated components are hand-maintained from Phase 4 onward: they now
// carry accessibility attributes, a reduced-motion path and a defect fix that
// this codemod knows nothing about. Re-running it silently discarded all of
// them once during development, which is why this exists.
if (!process.argv.includes('--force')) {
  console.error(
    'tools/port/port-logic.mjs is retired.\n' +
    'components/orbital/OrbitalLanding.tsx is hand-maintained now;\n' +
    'regenerating would discard the a11y, reduced-motion and defect fixes\n' +
    'applied after the port. Pass --force only if you mean it, and re-run\n' +
    'the parity check afterwards.'
  );
  process.exit(1);
}

const raw = await readFile(SRC, 'utf8');
const script = raw.match(
  /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/
)?.[1];
if (!script) throw new Error('no <script type="text/x-dc"> block found');

// Slice from the first lifecycle method to the end of the class body, so the
// hand-written constructor and typed field declarations below replace the
// original constructor only.
const start = script.indexOf('  componentDidMount() {');
if (start === -1) throw new Error('componentDidMount not found');
// The class's own closing brace is the last `}` at column 0. Slicing to it
// keeps renderVals()'s closing brace, which `lastIndexOf('}\n}')` would eat.
const end = script.lastIndexOf('\n}');
if (end === -1) throw new Error('class close not found');

let body = script.slice(start, end).trimEnd();

// --- the four necessary rewrites -----------------------------------------

// 1. three.js is an npm import now, not a CDN global, so the polling that
//    waited for window.THREE has nothing to wait for. Drop waitThree() and
//    call initGlobe() directly.
body = body.replace(/^\s*waitThree\(\) \{[\s\S]*?\n  \}\n/m, '');
body = body.replace('this.waitThree();', 'this.initGlobe();');
body = body.replace('if (!cv || !window.THREE) return;', 'if (!cv) return;');
body = body.replace('const T = window.THREE;', 'const T = THREE;');

// 2. The texture was fetched relative to the export directory. Under Next it
//    lives in /public and must be addressed absolutely.
body = body.replace("load.load('earth-equirect.jpg')", "load.load('/earth-equirect.jpg')");

// 3. Fonts are self-hosted by next/font, addressed through CSS variables.
for (const [from, to] of FONT_VARS) body = body.split(from).join(to);

// 4. Strict-mode type annotations. Every one of these is a type-level
//    addition only — no runtime behaviour changes. Each is asserted below so
//    a missed replacement fails the port instead of silently compiling.
const TYPE_FIXES = [
  // Canvas 2d contexts: unchecked in the original, fine at runtime, not under
  // strict mode. `return` matches the existing guard style one line above.
  [/const ctx = cv\.getContext\('2d'\);/g,
   "const ctx = cv.getContext('2d'); if (!ctx) return;"],

  // querySelectorAll returns Element; the code sets .style on the results.
  ["document.querySelectorAll('[data-reveal]')",
   "document.querySelectorAll<HTMLElement>('[data-reveal]')"],

  // IntersectionObserverEntry.target is Element, likewise.
  ["e.target.style.opacity = '1'; e.target.style.transform = 'none'; this.io.unobserve(e.target);",
   "(e.target as HTMLElement).style.opacity = '1'; (e.target as HTMLElement).style.transform = 'none'; this.io!.unobserve(e.target);"],

  // Both observers are assigned immediately above their use.
  ['els.forEach(el => this.io.observe(el));',
   'els.forEach(el => this.io!.observe(el));'],
  ['this.stepRefs.forEach(r => { if (r.current) this.stepIo.observe(r.current); });',
   'this.stepRefs.forEach(r => { if (r.current) this.stepIo!.observe(r.current); });'],

  // onResize is optional; the two siblings beside it are already guarded.
  ["window.removeEventListener('resize', this.onResize);",
   "if (this.onResize) window.removeEventListener('resize', this.onResize);"],

  // Arrays/objects seeded empty, so inference cannot reach them.
  ['let stars = [], w = 0, h = 0;',
   'let stars: { x: number; y: number; z: number; r: number; tw: number }[] = [], w = 0, h = 0;'],
  ['let comet = null, next = 1.2;',
   'let comet: { x: number; y: number; vx: number; vy: number; len: number; life: number } | null = null, next = 1.2;'],

  // Local helpers in renderVals().
  ['const pill = (t, on) => ({', 'const pill = (t: string, on: boolean) => ({'],
  ['const artBox = (children, style) =>',
   'const artBox = (children: React.ReactNode, style?: React.CSSProperties) =>'],
  ['const line = (w, o) =>', 'const line = (w: string, o: number) =>'],

  // The original builds arrays of line() elements with no key, which React
  // warns about at runtime. The (w, o) pair is unique within every array it
  // appears in, so it makes a stable key. Rendering is unaffected; this only
  // silences a genuine console error inherited from the export.
  ["React.createElement('span', { style: { display: 'block', width: w, height: '6px'",
   "React.createElement('span', { key: `${w}-${o}`, style: { display: 'block', width: w, height: '6px'"],
];

for (const [from, to] of TYPE_FIXES) {
  const before = body;
  body = typeof from === 'string' ? body.split(from).join(to) : body.replace(from, to);
  if (body === before) {
    console.error(`FAIL type fix did not match: ${String(from).slice(0, 60)}`);
    process.exitCode = 1;
  }
}

// 5. Refs move out of renderVals() into a dedicated `nodeRefs` object passed
//    to the template as its own prop. Mixing refs into the render-values
//    object makes React's react-hooks/refs rule treat every read of that
//    object as a ref access, flagging even plain strings. Behaviourally inert.
const REF_FIXES = [
  ['      starRef: this.starRef, globeRef: this.globeRef, cometRef: this.cometRef,\n      navRef: this.navRef, heroStageRef: this.heroStageRef,\n', ''],
];
for (const [from, to] of REF_FIXES) {
  const before = body;
  body = body.split(from).join(to);
  if (body === before) {
    console.error('FAIL ref fix did not match');
    process.exitCode = 1;
  }
}
for (const name of ['starRef', 'globeRef', 'cometRef', 'navRef', 'heroStageRef']) {
  body = body.split(`this.${name}`).join(`this.nodeRefs.${name}`);
}

const out = `/* Ported from the <script type="text/x-dc"> block of
 * reference/artifact-export/Orbital Launch.dc.html by tools/port/port-logic.mjs.
 * Regenerate with: cd tools/port && node port-logic.mjs
 *
 * Method bodies are verbatim. Only four things were rewritten:
 *   - waitThree() removed; three.js is an npm import, so there is no CDN
 *     global to poll for and initGlobe() is called directly.
 *   - the globe texture is addressed as /earth-equirect.jpg (it now lives in
 *     /public rather than beside the document).
 *   - font-family declarations are left verbatim; see the FONT_VARS note.
 *   - 2d contexts get a null guard for strict mode.
 *
 * The base class changed from dc-runtime's DCLogic to React.Component. DCLogic
 * is a plain class with props/state/setState/forceUpdate and React-identical
 * lifecycle names, driven by a host component, so this is a drop-in swap.
 */
"use client";

import React from "react";
import * as THREE from "three";
import { Template } from "./template";

type State = {
  step: number;
  voice: string;
  vs: number;
  device: number;
  faq: number;
  evTick: number;
  detect: number;
};

export class OrbitalLanding extends React.Component<Record<string, never>, State> {
  /** DOM attachment points, kept out of renderVals(). See rewrite 5. */
  readonly nodeRefs = {
    starRef: React.createRef<HTMLCanvasElement>(),
    globeRef: React.createRef<HTMLCanvasElement>(),
    cometRef: React.createRef<HTMLCanvasElement>(),
    navRef: React.createRef<HTMLElement>(),
    heroStageRef: React.createRef<HTMLDivElement>(),
  };
  private stepRefs = [0, 1, 2, 3, 4, 5].map(() => React.createRef<HTMLDivElement>());

  private starRaf = 0;
  private globeRaf = 0;
  private cometRaf = 0;
  private scrollRaf = 0;
  private vTimer: ReturnType<typeof setInterval> | undefined;
  private evTimer: ReturnType<typeof setInterval> | undefined;
  private vsTimer: ReturnType<typeof setInterval> | undefined;
  private io: IntersectionObserver | undefined;
  private stepIo: IntersectionObserver | undefined;
  private onResize: (() => void) | undefined;
  private onCometResize: (() => void) | undefined;
  private _globeResize: (() => void) | undefined;

  constructor(props: Record<string, never>) {
    super(props);
    this.state = { step: 0, voice: '', vs: 0, device: 1, faq: 0, evTick: 0, detect: 0 };
  }

${body}

  render() {
    return <Template v={this.renderVals()} {...this.nodeRefs} />;
  }
}

export default OrbitalLanding;
`;

const dir = path.join(REPO, 'components/orbital');
await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, 'OrbitalLanding.tsx'), out);

console.log(`OrbitalLanding.tsx  ${out.split('\n').length} lines`);
// Assert the rewrites actually landed. A silently-skipped replace here would
// produce a file that compiles and renders a page with no globe.
const checks = [
  ['waitThree() method removed', !/^\s*waitThree\(\)/m.test(out)],
  ['initGlobe called directly', out.includes('this.initGlobe();')],
  ['no window.THREE left', !out.includes('window.THREE')],
  ['texture path absolute', out.includes("load.load('/earth-equirect.jpg')")],
  ['font names left verbatim', out.includes("'IBM Plex Mono',monospace")],
];
for (const [label, ok] of checks) console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
