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

const FONT_VARS = [
  ["'Space Grotesk'", 'var(--font-space-grotesk)'],
  ["'IBM Plex Sans'", 'var(--font-ibm-plex-sans)'],
  ["'IBM Plex Mono'", 'var(--font-ibm-plex-mono)'],
  ["'Instrument Serif'", 'var(--font-instrument-serif)'],
  ["'Caveat'", 'var(--font-caveat)'],
];

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
const raw = await readFile(SRC, 'utf8');

const dc = raw.match(/<x-dc>([\s\S]*)<\/x-dc>/);
if (!dc) throw new Error('no <x-dc> block found');

const helmet = raw.match(/<helmet[^>]*>([\s\S]*?)<\/helmet>/);
const designCss = helmet?.[1].match(/<style>([\s\S]*?)<\/style>/)?.[1]?.trim();
if (!designCss) throw new Error('no <style> block found inside <helmet>');

const template = dc[1].replace(/<helmet[^>]*>[\s\S]*?<\/helmet>/, '');
const frag = parseFragment(template);

const roots = frag.childNodes.filter(
  (n) => n.nodeName !== '#text' || n.value.trim() || n.value.includes(' ')
);
const body = emitChildren(frag, 2, new Set());

const tsx = `/* GENERATED by tools/port/port.mjs — do not edit by hand.
 *
 * Mechanical translation of the <x-dc> template in
 * reference/artifact-export/Orbital Launch.dc.html. Regenerate with:
 *
 *   cd tools/port && node port.mjs
 *
 * The <img> below is the stray screenshot recorded as defect 1 in the repo
 * README: a 2940x1912 PNG sitting inside the six-item step loop. It is
 * reproduced faithfully because the parity baselines contain it. Removing it
 * is a visual change and needs sign-off.
 */
/* eslint-disable @next/next/no-img-element */
import React from "react";
import type { Refs, Vals } from "./types";

export function Template({ v, ${[...refNames].join(", ")} }: { v: Vals } & Refs) {
  return (
${body}
  );
}
`;

const outDir = path.join(REPO, 'components/orbital');
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'template.tsx'), tsx);

const hoverCss = [...hoverClasses.entries()]
  .map(([css, cls]) => hoverRule(css, cls))
  .join('\n');

const css = `/* GENERATED in part by tools/port/port.mjs — see below.
 *
 * Everything down to the marker is the <style> block from the <helmet>
 * element of reference/artifact-export/Orbital Launch.dc.html, verbatim,
 * except that quoted font-family names are rewritten to the next/font CSS
 * variables declared in app/layout.tsx. Same fonts, self-hosted.
 */

${mapFonts(designCss)}

/* ---- generated :hover classes ------------------------------------------
 * The design expresses hover via dc-runtime's \`style-hover\` attribute, which
 * the runtime compiled into a class whose :hover rule had !important appended
 * to every declaration. The !important is load-bearing: these elements carry
 * their base styles inline, and an inline style beats a class selector.
 */
${hoverCss}
`;

await writeFile(path.join(REPO, 'app/globals.css'), css);

console.log(`template.tsx   ${tsx.split('\n').length} lines`);
console.log(`globals.css    ${css.split('\n').length} lines`);
console.log(`hover classes  ${hoverClasses.size}`);
console.log(`interp spans   ${INTERP_SPANS ? 'ON' : 'off'}`);
console.log(`root nodes     ${roots.length}`);
console.log(`refs extracted ${[...refNames].join(', ')}`);
