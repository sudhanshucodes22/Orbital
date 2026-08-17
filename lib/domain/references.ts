/** What a generated file points at, and whether it is there.
 *
 * ## The failure this catches
 *
 * A generation can be perfectly valid at the operation level — safe paths,
 * sensible sizes, no conflicts — and still produce a broken site, because a
 * page links to `/pricing` that nobody wrote or loads `styles.css` that does
 * not exist. Every existing check looks at operations in isolation; this looks
 * at the tree they would produce and asks whether it hangs together.
 *
 * ## What it deliberately does not claim
 *
 * This is not semantic correctness. It parses references with regular
 * expressions over HTML and CSS, which is adequate for the self-contained
 * static files Orbital generates and would not be for arbitrary source. It
 * reports **warnings**, not errors, for anything it is not certain about —
 * a broken link is a bad page, but refusing the whole generation over a regex's
 * opinion would be worse than shipping it.
 *
 * The one thing it treats as an error is a reference to a file the batch
 * explicitly *deleted*, because that is a contradiction within a single change
 * rather than a judgement about the world.
 */
import type { FileSnapshot } from "./file";

export interface FileReference {
  /** The file doing the referencing. */
  from: string;
  /** What it points at, normalised to a repo-relative path where possible. */
  target: string;
  /** How it was referenced, for the message. */
  kind: "link" | "stylesheet" | "script" | "image" | "import";
  /** The raw text, so a message can quote what was actually written. */
  raw: string;
}

/** External and non-file references, which are never "missing".
 *
 * Data URIs matter especially: generated pages are told to embed images as
 * data URIs, so treating one as a missing file would flag the correct thing as
 * broken. */
function isExternal(target: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(target) || // any scheme: http, https, data, mailto, tel
    target.startsWith("//") ||
    target.startsWith("#") ||
    target.trim() === ""
  );
}

/** Resolves a reference against the file that made it.
 *
 * Root-relative ("/pricing") and document-relative ("pricing.html") both
 * normalise to a repo path, because that is what the tree is keyed by. */
function resolveTarget(from: string, target: string): string | null {
  const clean = target.split("#")[0].split("?")[0].trim();
  if (!clean || isExternal(clean)) return null;

  if (clean.startsWith("/")) return clean.slice(1);

  // Relative to the referencing file's directory.
  const slash = from.lastIndexOf("/");
  const base = slash === -1 ? "" : from.slice(0, slash + 1);
  const joined = `${base}${clean}`;

  // Collapse "./" and "../" without touching the filesystem.
  const parts: string[] = [];
  for (const segment of joined.split("/")) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

const PATTERNS: readonly { kind: FileReference["kind"]; regex: RegExp }[] = [
  { kind: "stylesheet", regex: /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]*>/gi },
  { kind: "script", regex: /<script[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi },
  { kind: "image", regex: /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi },
  { kind: "link", regex: /<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>/gi },
  { kind: "import", regex: /@import\s+(?:url\()?["']([^"']+)["']\)?/gi },
];

/** Every reference a file makes. */
export function referencesIn(file: { path: string; content: string | null }): FileReference[] {
  if (!file.content) return [];
  // Only formats whose reference syntax is actually known. Guessing at others
  // would produce warnings nobody can act on.
  if (!/\.(html?|css)$/i.test(file.path)) return [];

  const found: FileReference[] = [];
  for (const { kind, regex } of PATTERNS) {
    // Fresh each time: a /g regex carries lastIndex between calls, and reusing
    // one across files silently skips matches.
    const pattern = new RegExp(regex.source, regex.flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(file.content)) !== null) {
      const raw = match[1];
      if (isExternal(raw)) continue;
      const target = resolveTarget(file.path, raw);
      if (target) found.push({ from: file.path, target, kind, raw });
    }
  }
  return found;
}

export interface ReferenceCheck {
  /** References pointing at something not in the tree. */
  missing: readonly FileReference[];
  /** References pointing at a file this batch deleted — a contradiction
   *  inside one change, rather than a pre-existing gap. */
  broken: readonly FileReference[];
}

/** Which of a tree's references do not resolve.
 *
 * `deleted` is the set of paths the batch removed, so a link to one of them
 * can be distinguished from a link that was always dangling. Only the former
 * is the current change's fault.
 */
export function checkReferences(
  tree: readonly FileSnapshot[],
  deleted: readonly string[] = []
): ReferenceCheck {
  const present = new Set(tree.map((f) => f.path));
  const removed = new Set(deleted);

  // A route may be written either way, and both are legitimate: "/pricing"
  // resolves to pricing.html or pricing/index.html.
  const resolves = (target: string): boolean =>
    present.has(target) ||
    present.has(`${target}.html`) ||
    present.has(`${target}/index.html`) ||
    // A directory reference resolves to its index.
    (target.endsWith("/") && present.has(`${target}index.html`));

  const missing: FileReference[] = [];
  const broken: FileReference[] = [];

  for (const file of tree) {
    for (const reference of referencesIn(file)) {
      if (resolves(reference.target)) continue;
      if (removed.has(reference.target) || removed.has(`${reference.target}.html`)) {
        broken.push(reference);
      } else {
        missing.push(reference);
      }
    }
  }

  return { missing, broken };
}

/** Files a change must not touch, whatever a model proposes.
 *
 * `normalizeFilePath` already refuses these on the way in. This is the
 * statement of *why*, kept beside the reference checks so the set is
 * reviewable in one place rather than being a regex buried in a validator.
 */
export const PROTECTED_PATTERNS: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /(^|\/)\.env(\.|$)/i, reason: "environment files hold credentials" },
  { pattern: /(^|\/)\.git(\/|$)/i, reason: "the git directory is not project content" },
  { pattern: /(^|\/)node_modules(\/|$)/i, reason: "dependencies are not authored here" },
  { pattern: /(^|\/)\.(ssh|aws|gnupg)(\/|$)/i, reason: "credential directories" },
  { pattern: /(^|\/)package-lock\.json$/i, reason: "lockfiles are generated, not written" },
];

/** Whether a path is protected, and why. */
export function protectedReason(path: string): string | null {
  for (const { pattern, reason } of PROTECTED_PATTERNS) {
    if (pattern.test(path)) return reason;
  }
  return null;
}

/** Structural problems a file has on its own.
 *
 * Cheap, format-specific, and deliberately shallow: unbalanced tags in
 * generated HTML, and JSON that does not parse. Both are things a browser or a
 * reader will certainly trip over, and neither requires understanding what the
 * file means.
 */
export function malformationOf(path: string, content: string | null): string | null {
  if (content === null) return null;

  if (/\.json$/i.test(path)) {
    try {
      JSON.parse(content);
    } catch (error) {
      return `not valid JSON: ${error instanceof Error ? error.message : "parse failed"}`;
    }
    return null;
  }

  if (/\.html?$/i.test(path)) {
    // Counting the tags that must balance. Void elements and attribute values
    // make a general parser necessary for real correctness; these three are
    // unambiguous and are what a truncated response actually breaks.
    for (const tag of ["html", "head", "body", "style", "script"] as const) {
      const open = (content.match(new RegExp(`<${tag}[\\s>]`, "gi")) ?? []).length;
      const close = (content.match(new RegExp(`</${tag}\\s*>`, "gi")) ?? []).length;
      if (open > close) return `<${tag}> is opened ${open} time(s) but closed ${close}`;
      if (close > open) return `</${tag}> appears ${close} time(s) with only ${open} opening tag(s)`;
    }
    // A response cut short mid-attribute is the common truncation failure.
    if (/<[a-z][^>]*$/i.test(content.trimEnd())) return "the file ends inside an unclosed tag";
  }

  return null;
}
