/** The project as a file tree.
 *
 * This is the model the builder is being moved onto. Today a generation
 * produces `GeneratedSite`, which is three complete HTML documents held as
 * strings — fine for showing a result, useless for changing one. You cannot
 * ask "which file holds the navbar" of a string, cannot diff it usefully, and
 * cannot install a dependency into it.
 *
 * A file tree can answer all three, which is what every later phase needs:
 * targeted edits, context retrieval, patches, rollback and eventually a real
 * dev server.
 *
 * Pure types and pure helpers. Zero I/O, per lib/domain's contract.
 */
import type { ProjectId, RevisionId, Timestamp } from "./ids";

/** Text or binary. Binary content lives in object storage and the row carries
 *  a key; text lives inline because it is what the model reads and writes. */
export type FileKind = "text" | "binary";

export interface ProjectFile {
  projectId: ProjectId;
  /** Repo-relative POSIX path, no leading slash: "app/page.tsx". */
  path: string;
  kind: FileKind;
  /** Present for text files. Null for binary, which carries storageKey. */
  content: string | null;
  /** Present for binary files. Null for text. */
  storageKey: string | null;
  /** Content hash of `content`, used to detect no-op writes and to let a
   *  revision reference a tree without copying every byte. */
  hash: string;
  byteSize: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** A file tree at a point in time, keyed by path. */
export type FileTree = ReadonlyMap<string, ProjectFile>;

/** What a revision froze. Kept separate from ProjectFile so a revision can
 *  record a tree without duplicating the rows. */
export interface FileSnapshot {
  path: string;
  kind: FileKind;
  content: string | null;
  storageKey: string | null;
  hash: string;
  byteSize: number;
}

export interface RevisionTree {
  revisionId: RevisionId;
  files: readonly FileSnapshot[];
}

/* ------------------------------------------------------------- paths ---- */

export const MAX_PATH_LENGTH = 400;
export const MAX_TEXT_FILE_BYTES = 512 * 1024;

/** Paths the builder must never write, whatever a model proposes.
 *
 * This is a containment rule, not a style rule. A generated project that can
 * write .env or .git is a generated project that can exfiltrate secrets or
 * rewrite history, and the model producing these paths is not trusted. */
const FORBIDDEN_SEGMENTS = new Set([".git", ".env", "node_modules", ".ssh", ".aws"]);

export type PathVerdict = { ok: true; path: string } | { ok: false; reason: string };

/** Normalises and validates a model-proposed path.
 *
 * Rejects rather than sanitises. Silently rewriting "../../etc/passwd" into
 * something harmless would hide that the model tried, and the attempt is the
 * signal worth keeping.
 */
export function normalizeFilePath(raw: string): PathVerdict {
  const trimmed = raw.trim().replace(/\\/g, "/");
  if (!trimmed) return { ok: false, reason: "Path is empty." };
  if (trimmed.length > MAX_PATH_LENGTH) {
    return { ok: false, reason: `Path exceeds ${MAX_PATH_LENGTH} characters.` };
  }
  if (trimmed.startsWith("/")) return { ok: false, reason: "Path must be relative." };
  if (/^[a-zA-Z]:/.test(trimmed)) return { ok: false, reason: "Path must not be absolute." };
  if (trimmed.includes("\0")) return { ok: false, reason: "Path contains a null byte." };

  const segments = trimmed.split("/").filter((s) => s !== "." && s !== "");
  if (segments.some((s) => s === "..")) {
    return { ok: false, reason: "Path must not traverse outside the project." };
  }
  if (segments.some((s) => FORBIDDEN_SEGMENTS.has(s))) {
    return { ok: false, reason: "Path targets a protected location." };
  }
  if (segments.length === 0) return { ok: false, reason: "Path resolves to nothing." };

  return { ok: true, path: segments.join("/") };
}

/* -------------------------------------------------------------- hash ---- */

/** FNV-1a, 32-bit, hex.
 *
 * Deliberately not a cryptographic hash: this detects "did the content
 * change" and nothing else. Using SHA-256 here would mean importing node:crypto
 * into lib/domain, which is barred from I/O and must stay usable from
 * anywhere. If content addressing ever needs collision resistance, this moves
 * behind a port.
 */
export function hashContent(content: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    h ^= content.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function byteLength(content: string): number {
  // Matches what a UTF-8 write would cost, without pulling in Buffer.
  let bytes = 0;
  for (let i = 0; i < content.length; i++) {
    const c = content.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

/* ------------------------------------------------------------ helpers --- */

/** Extension without the dot, lowercased. "" when there is none. */
export function fileExtension(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot + 1).toLowerCase();
}

const TEXT_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "css", "scss", "html", "htm",
  "md", "mdx", "txt", "svg", "yml", "yaml", "toml", "env", "sql", "graphql",
]);

export function looksTextual(path: string): boolean {
  return TEXT_EXTENSIONS.has(fileExtension(path));
}
