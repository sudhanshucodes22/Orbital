// One-time mechanical transform of the dc-runtime template into JSX.
//
//   node port.mjs
//
// Reads  reference/artifact-export/Orbital Launch.dc.html
// Writes components/orbital/template.tsx   (the render tree)
//        app/globals.css                   (design <style> + :hover classes)
//
// This is a translation, not a rewrite. Every rule below mirrors what
// dc-runtime's support.js does at runtime, because the baselines in
// reference/baselines were captured from that behaviour:
//
//   walkText          a whitespace-only text node is dropped ONLY if it
//                     contains no space character; otherwise the text is
//                     emitted verbatim (not collapsed) and the browser
//                     applies normal white-space collapsing.
//   collectProps      attribute names arrive lowercased from the HTML parser;
//                     `onclick` -> `onClick`, `class` -> `className`.
//   createPseudoSheet `style-hover` becomes a generated class whose :hover
//                     rule has !important appended to every declaration, so
//                     it can win against the element's own inline style.
//   walkElement       style strings become style objects.
//
// The one deliberate divergence is `--interp-spans`; see below.

import { parseFragment } from 'parse5';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const SRC = path.join(REPO, 'reference/artifact-export/Orbital Launch.dc.html');

// dc-runtime wraps every resolved {{ }} scalar in <span class="sc-interp">.
// Those spans are runtime cruft, but they are real DOM nodes and in a flex or
// grid container an extra element can change box generation. Ported without
// them by default; the Phase 3 pixel diff decides whether any are needed.
const INTERP_SPANS = process.argv.includes('--interp-spans');

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

const mapFonts = (s) =>
  FONT_VARS.reduce((acc, [from, to]) => acc.split(from).join(to), s);

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** Split on `sep` at paren/quote depth 0. */
function splitTopLevel(input, sep) {
  const out = [];
  let depth = 0;
  let quote = null;
  let buf = '';
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === sep && depth === 0) { out.push(buf); buf = ''; continue; }
    buf += ch;
  }
  out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** `background-color` -> `backgroundColor`, `-webkit-x` -> `WebkitX`,
 *  `--custom` kept verbatim (React passes custom properties through). */
function cssKey(prop) {
  const p = prop.trim();
  if (p.startsWith('--')) return p;
  if (p.startsWith('-webkit-')) {
    const rest = p.slice('-webkit-'.length);
    return 'Webkit' + rest.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      .replace(/^([a-z])/, (_, c) => c.toUpperCase());
  }
  return p.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

const jsStr = (s) =>
  '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';

const INTERP = /\{\{([\s\S]+?)\}\}/;
const INTERP_G = /\{\{([\s\S]+?)\}\}/g;

/** Prefix with `v.` unless the root identifier is a loop variable in scope. */
function expr(raw, scope) {
  const e = raw.trim();
  const root = e.split(/[.[\s(]/)[0];
  return scope.has(root) ? e : `v.${e}`;
}

/** A string that may contain {{ }} -> a JS expression source. */
function interpolated(raw, scope) {
  if (!INTERP.test(raw)) return jsStr(raw);
  const whole = raw.trim().match(/^\{\{([\s\S]+?)\}\}$/);
  if (whole) return expr(whole[1], scope);
  // Mixed literal + holes -> template literal.
  let out = '';
  let last = 0;
  for (const m of raw.matchAll(INTERP_G)) {
    out += m.index > last
      ? raw.slice(last, m.index).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
      : '';
    out += '${' + expr(m[1], scope) + '}';
    last = m.index + m[0].length;
  }
  out += raw.slice(last).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  return '`' + out + '`';
}

function styleObject(css, scope) {
  const entries = splitTopLevel(css, ';').map((decl) => {
    const i = decl.indexOf(':');
    if (i === -1) return null;
    const key = cssKey(decl.slice(0, i));
    const value = mapFonts(decl.slice(i + 1).trim());
    const k = /^[A-Za-z][A-Za-z0-9]*$/.test(key) ? key : jsStr(key);
    return `${k}: ${interpolated(value, scope)}`;
  }).filter(Boolean);
  return `{ ${entries.join(', ')} }`;
}

// ---- hover classes -------------------------------------------------------
const hoverClasses = new Map(); // css -> className
const refNames = new Set(); // top-level ref names used by the template
let usedRefs = new Set();   // refs used by the component currently being emitted

function hoverClass(css) {
  const hit = hoverClasses.get(css);
  if (hit) return hit;
  const cls = `orb-h${hoverClasses.size}`;
  hoverClasses.set(css, cls);
  return cls;
}

function hoverRule(css, cls) {
  const decls = splitTopLevel(css, ';').map((d) => {
    const i = d.indexOf(':');
    return `${d.slice(0, i).trim()}:${mapFonts(d.slice(i + 1).trim())} !important`;
  });
  return `.${cls}:hover { ${decls.join('; ')}; }`;
}

// ---- emitter -------------------------------------------------------------
const pad = (n) => '  '.repeat(n);

function emitText(txt, depth) {
  if (!INTERP.test(txt)) {
    // Mirrors walkText: drop whitespace-only nodes that contain no space.
    if (!txt.trim() && !txt.includes(' ')) return null;
    return `${pad(depth)}{${jsStr(txt)}}`;
  }
  const parts = txt.split(INTERP_G);
  const pieces = parts.map((p, i) => {
    if (!(i & 1)) return p ? jsStr(p) : null;
    const e = expr(p, CURRENT_SCOPE);
    return INTERP_SPANS ? `<span className="sc-interp">{${e}}</span>` : `{${e}}`;
  }).filter(Boolean);
  return pieces
    .map((p) => (p.startsWith('<') || p.startsWith('{') ? `${pad(depth)}${p}` : `${pad(depth)}{${p}}`))
    .join('\n');
}

let CURRENT_SCOPE = new Set();
let loopDepth = 0;

function emitElement(node, depth, scope) {
  const tag = node.nodeName;
  if (tag === 'helmet' || tag === 'sc-helmet') return null;
  if (tag === 'sc-for') return emitFor(node, depth, scope);

  const attrs = [];
  let hoverCss = null;

  for (const { name, value } of node.attrs ?? []) {
    if (name === 'hint-placeholder-count' || name === 'sc-name' || name === 'data-dc-tpl') continue;
    if (name.startsWith('style-')) { hoverCss = value; continue; }

    let key = name;
    if (key === 'class') key = 'className';
    else if (key === 'for') key = 'htmlFor';
    else if (key.startsWith('on')) key = 'on' + key[2].toUpperCase() + key.slice(3);

    if (key === 'style') {
      attrs.push(`style={${styleObject(value, scope)}}`);
    } else if (key === 'ref') {
      // Refs are attachment points, not render data. Keeping them in the same
      // object as the interpolated values makes React's `react-hooks/refs`
      // rule treat every `v.*` read as a ref access, so they get their own
      // prop. Loop-scoped refs (steps[].ref) stay where they are.
      const inner = value.trim().match(/^\{\{([\s\S]+?)\}\}$/)?.[1]?.trim() ?? '';
      const root = inner.split(/[.[\s(]/)[0];
      if (inner && !scope.has(root)) {
        refNames.add(inner);
        usedRefs.add(inner);
        attrs.push(`ref={${inner}}`);
      } else {
        attrs.push(`ref={${interpolated(value, scope)}}`);
      }
    } else if (key.startsWith('data-') || key.startsWith('aria-')) {
      attrs.push(INTERP.test(value) ? `${key}={${interpolated(value, scope)}}` : `${key}=${jsStr(value)}`);
    } else if (INTERP.test(value)) {
      attrs.push(`${key}={${interpolated(value, scope)}}`);
    } else if (key === 'src' && value.startsWith('./')) {
      // The export is served from a directory, so `./x` worked. A Next route
      // is not a directory: make it absolute against /public.
      attrs.push(`${key}=${jsStr('/' + value.slice(2))}`);
    } else {
      attrs.push(`${key}=${jsStr(value)}`);
    }
  }

  if (hoverCss) attrs.push(`className=${jsStr(hoverClass(hoverCss))}`);

  const open = attrs.length ? `<${tag} ${attrs.join(' ')}` : `<${tag}`;

  if (VOID.has(tag)) return `${pad(depth)}${open} />`;

  const kids = emitChildren(node, depth + 1, scope);
  if (!kids) return `${pad(depth)}${open} />`;
  return `${pad(depth)}${open}>\n${kids}\n${pad(depth)}</${tag}>`;
}

function emitFor(node, depth, scope) {
  const list = node.attrs.find((a) => a.name === 'list')?.value ?? '';
  const item = node.attrs.find((a) => a.name === 'as')?.value ?? 'item';
  const listExpr = interpolated(list, scope);
  const idx = `i${loopDepth}`;

  const inner = new Set(scope);
  inner.add(item);
  loopDepth++;
  const kids = emitChildren(node, depth + 2, inner);
  loopDepth--;

  return [
    `${pad(depth)}{${listExpr}.map((${item}, ${idx}) => (`,
    `${pad(depth + 1)}<React.Fragment key={${idx}}>`,
    kids,
    `${pad(depth + 1)}</React.Fragment>`,
    `${pad(depth)}))}`,
  ].join('\n');
}

function emitChildren(node, depth, scope) {
  const prev = CURRENT_SCOPE;
  CURRENT_SCOPE = scope;
  const out = (node.childNodes ?? [])
    .map((c) => {
      if (c.nodeName === '#text') return emitText(c.value, depth);
      if (c.nodeName === '#comment') return null;
      return emitElement(c, depth, scope);
    })
    .filter(Boolean)
    .join('\n');
  CURRENT_SCOPE = prev;
  return out || null;
}

// ---- main ----------------------------------------------------------------

// ---- retirement guard ----------------------------------------------------
// The generated components are hand-maintained from Phase 4 onward: they now
// carry accessibility attributes, a reduced-motion path and a defect fix that
// this codemod knows nothing about. Re-running it silently discarded all of
// them once during development, which is why this exists.
if (!process.argv.includes('--force')) {
  console.error(
    'tools/port/port.mjs is retired.\n' +
    'components/orbital/** and app/globals.css are hand-maintained now;\n' +
    'regenerating would discard the a11y, reduced-motion and defect fixes\n' +
    'applied after the port. Pass --force only if you mean it, and re-run\n' +
    'the parity check afterwards.'
  );
  process.exit(1);
}

const raw = await readFile(SRC, 'utf8');

const dc = raw.match(/<x-dc>([\s\S]*)<\/x-dc>/);
if (!dc) throw new Error('no <x-dc> block found');

const helmet = raw.match(/<helmet[^>]*>([\s\S]*?)<\/helmet>/);
const designCss = helmet?.[1].match(/<style>([\s\S]*?)<\/style>/)?.[1]?.trim();
if (!designCss) throw new Error('no <style> block found inside <helmet>');

const template = dc[1].replace(/<helmet[^>]*>[\s\S]*?<\/helmet>/, '');
const frag = parseFragment(template);



// ---- split into one component per section ------------------------------
// A single 1300-line render function is not maintainable. The split is done
// here rather than by hand so it stays a mechanical, reviewable step: the
// pixel diff must stay at zero across it.

const SECTION_NAMES = [
  'Hero', 'Triad', 'HowItWorks', 'InteractiveDemo', 'ConversationalEditing',
  'ChaptersIntro', 'ChapterInput', 'ChapterUnderstanding', 'ChapterBuild',
  'ChapterProduct', 'Workspace', 'Comparison', 'Timeline', 'Pricing',
  'Faq', 'CallToAction',
];

const GENERATED_HEADER = `/* GENERATED by tools/port/port.mjs — do not edit by hand.
 *
 * Mechanical translation of the <x-dc> template in
 * reference/artifact-export/Orbital Launch.dc.html.
 * Regenerate with: cd tools/port && node port.mjs
 */`;

const files = [];

/** Emit one component file from a list of sibling nodes. */
function emitComponent(name, nodes, { depth = 2 } = {}) {
  usedRefs = new Set();
  const fake = { childNodes: nodes };
  const body = emitChildren(fake, depth + 1, new Set());
  const refs = [...usedRefs];

  const needsReact = /React\./.test(body);
  const single = nodes.filter((n) => n.nodeName !== '#text').length === 1 && !refs.length;

  // A few sections are pure markup with no interpolation. Declaring an unused
  // `v` prop on those is dead weight and lint flags it.
  const usesVals = /\bv\./.test(body);
  const fields = [usesVals ? 'v' : null, ...refs].filter(Boolean);
  const types = [
    usesVals ? '{ v: Vals }' : null,
    refs.length ? `Pick<Refs, ${refs.map((r) => `"${r}"`).join(' | ')}>` : null,
  ].filter(Boolean).join(' & ') || 'Record<string, never>';
  const props = fields.length ? `{ ${fields.join(', ')} }: ${types}` : '';

  const typeImports = [refs.length ? 'Refs' : null, usesVals ? 'Vals' : null].filter(Boolean);
  const imports = [
    needsReact ? 'import React from "react";' : null,
    typeImports.length ? `import type { ${typeImports.join(', ')} } from "../types";` : null,
  ].filter(Boolean).join('\n');

  const inner = single ? body : `<>\n${body}\n${pad(depth)}</>`;
  const src = `${GENERATED_HEADER}\n${imports}\n\nexport function ${name}(${props}) {\n  return (\n${single ? body : inner}\n  );\n}\n`;
  files.push({ name, src, refs });
  return { refs, usesVals };
}

const rootDiv = frag.childNodes.find((n) => n.nodeName === 'div');
if (!rootDiv) throw new Error('root <div> not found');

const kids = rootDiv.childNodes.filter((n) => n.nodeName !== '#text');
const backgroundNodes = kids.filter((n) => n.nodeName === 'canvas' || n.nodeName === 'div');
const headerNode = kids.find((n) => n.nodeName === 'header');
const mainNode = kids.find((n) => n.nodeName === 'main');
if (!headerNode || !mainNode) throw new Error('<header> or <main> not found');

const mainKids = mainNode.childNodes.filter((n) => n.nodeName !== '#text');
const sectionNodes = mainKids.filter((n) => n.nodeName === 'section');
const footerNode = mainKids.find((n) => n.nodeName === 'footer');
if (sectionNodes.length !== SECTION_NAMES.length) {
  throw new Error(`expected ${SECTION_NAMES.length} sections, found ${sectionNodes.length}`);
}
if (!footerNode) throw new Error('<footer> not found');

const bg = emitComponent('Background', backgroundNodes);
const header = emitComponent('SiteHeader', [headerNode]);
const sections = SECTION_NAMES.map((name, i) => emitComponent(name, [sectionNodes[i]]));
const footer = emitComponent('SiteFooter', [footerNode]);

// ---- the composing template --------------------------------------------
const call = (name, { refs, usesVals }) =>
  `<${name}${usesVals ? ' v={v}' : ''}${refs.map((r) => ` ${r}={${r}}`).join('')} />`;

const allRefs = [...refNames];
const rootStyle = styleObject(
  rootDiv.attrs.find((a) => a.name === 'style')?.value ?? '', new Set()
);
const mainStyle = styleObject(
  mainNode.attrs.find((a) => a.name === 'style')?.value ?? '', new Set()
);

const composed = `${GENERATED_HEADER}
import type { Refs, Vals } from "./types";
import { Background } from "./sections/Background";
import { SiteHeader } from "./sections/SiteHeader";
import { SiteFooter } from "./sections/SiteFooter";
${SECTION_NAMES.map((n) => `import { ${n} } from "./sections/${n}";`).join('\n')}

export function Template({ v, ${allRefs.join(', ')} }: { v: Vals } & Refs) {
  return (
    <div style={${rootStyle}}>
      ${call('Background', bg)}
      ${call('SiteHeader', header)}
      <main style={${mainStyle}}>
${SECTION_NAMES.map((n, i) => `        ${call(n, sections[i])}`).join('\n')}
        ${call('SiteFooter', footer)}
      </main>
    </div>
  );
}
`;

const outDir = path.join(REPO, 'components/orbital');
await mkdir(path.join(outDir, 'sections'), { recursive: true });
for (const f of files) {
  await writeFile(path.join(outDir, 'sections', `${f.name}.tsx`), f.src);
}
await writeFile(path.join(outDir, 'template.tsx'), composed);

const hoverCss = [...hoverClasses.entries()]
  .map(([css, cls]) => hoverRule(css, cls))
  .join('\n');

const css = `/* GENERATED in part by tools/port/port.mjs — see below.
 *
 * Everything down to the marker is the <style> block from the <helmet>
 * element of reference/artifact-export/Orbital Launch.dc.html, verbatim.
 * Font families are deliberately not rewritten; next/font registers each
 * family under its real name, so these declarations already resolve to the
 * self-hosted files.
 */

${designCss}

/* ---- generated :hover classes ------------------------------------------
 * The design expresses hover via dc-runtime's \`style-hover\` attribute, which
 * the runtime compiled into a class whose :hover rule had !important appended
 * to every declaration. The !important is load-bearing: these elements carry
 * their base styles inline, and an inline style beats a class selector.
 */
${hoverCss}

/* ---- accessibility additions -------------------------------------------
 * Not part of the export. Neither rule changes the page at rest.
 */

/* The design defines no focus styling at all, so keyboard users get whatever
 * the user agent decides on top of a dark background. :focus-visible only
 * paints for keyboard focus, so pointer users see no change. */
:focus-visible {
  outline: 2px solid #7ce6ff;
  outline-offset: 3px;
  border-radius: 4px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  html { scroll-behavior: auto !important; }
}
`;

await writeFile(path.join(REPO, 'app/globals.css'), css);

console.log(`components    ${files.length} files in components/orbital/sections/`);
console.log(`largest       ${files.map(f => f.src.split('\n').length).sort((a,b)=>b-a)[0]} lines`);

console.log(`globals.css   ${css.split('\n').length} lines`);
console.log(`hover classes ${hoverClasses.size}`);
console.log(`interp spans  ${INTERP_SPANS ? 'ON' : 'off'}`);
console.log(`refs          ${[...refNames].join(', ')}`);
