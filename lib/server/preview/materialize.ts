/** Writing a revision's files to disk, safely. SERVER ONLY.
 *
 * This is where model-authored data becomes real files, which makes it the
 * highest-consequence function in the preview engine. Everything here treats
 * the tree as hostile input, even though it has already been validated once on
 * the way in: `normalizeFilePath` ran when the operations were applied, but a
 * second check costs nothing and this is the step where being wrong means
 * writing outside the project.
 *
 * Two independent defences, deliberately not one:
 *
 *   1. Every path is re-normalised through the domain validator.
 *   2. Every resolved absolute path is checked to still be inside the root
 *      after resolution — which catches anything the first check missed,
 *      including symlink games and platform-specific path quirks.
 *
 * The second check is the one that actually holds. The first is there so a
 * malformed path is rejected with a useful reason rather than a containment
 * error.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import {
  PREVIEW_MAX_FILES,
  PREVIEW_MAX_TOTAL_BYTES,
  normalizeFilePath,
  routeForFilePath,
  type FileSnapshot,
  type PreviewEntry,
  type PreviewFailure,
} from "../../domain";

export interface MaterializeResult {
  entries: PreviewEntry[];
  fileCount: number;
  totalBytes: number;
}

/** Thrown for every refusal, so the runtime can turn one catch into a
 *  structured failure rather than guessing from a message. */
export class MaterializeError extends Error {
  constructor(readonly failure: PreviewFailure) {
    super(failure.message);
    this.name = "MaterializeError";
  }
}

/** Pulls a usable title out of a page, for the switcher.
 *
 * Best-effort and bounded: this is a label, and a regex over untrusted HTML
 * must not be the thing that hangs the server. Falls back to the route. */
function titleOf(content: string, route: string): string {
  const match = /<title[^>]*>([^<]{0,200})<\/title>/i.exec(content.slice(0, 4000));
  const title = match?.[1]?.trim();
  return title && title.length > 0 ? title : route === "/" ? "Home" : route;
}

/** Writes `tree` into `root`, which must already be a directory this process
 *  owns exclusively.
 *
 * The root is emptied first. A preview shows one revision, and leaving files
 * from the previous one behind would mean serving a mixture of two — the kind
 * of bug where the page looks right and one stylesheet is stale.
 */
export async function materializeTree(
  root: string,
  tree: readonly FileSnapshot[]
): Promise<MaterializeResult> {
  if (tree.length === 0) {
    throw new MaterializeError({
      stage: "emptyProject",
      message: "This revision has no files to preview.",
      detail: null,
    });
  }

  if (tree.length > PREVIEW_MAX_FILES) {
    throw new MaterializeError({
      stage: "materialize",
      message: `This project has more files than the preview can serve (${tree.length}).`,
      detail: `limit ${PREVIEW_MAX_FILES}`,
    });
  }

  const totalBytes = tree.reduce((sum, f) => sum + (f.byteSize || 0), 0);
  if (totalBytes > PREVIEW_MAX_TOTAL_BYTES) {
    throw new MaterializeError({
      stage: "materialize",
      message: "This project is too large to preview.",
      detail: `${totalBytes} bytes exceeds the preview limit`,
    });
  }

  // A fresh root every time. `force` so a first run against a missing
  // directory is not an error.
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  // Resolved once, with a trailing separator, so the containment check below
  // is a prefix test that cannot be fooled by a sibling directory whose name
  // starts with the root's name ("/tmp/p1" vs "/tmp/p1-evil").
  const rootPath = resolve(root);
  const rootPrefix = rootPath.endsWith(sep) ? rootPath : rootPath + sep;

  const entries: PreviewEntry[] = [];
  let written = 0;

  for (const file of tree) {
    // Defence 1: the domain's own path rules. Rejects absolute paths, "..",
    // and the sensitive prefixes (.git, .env, node_modules, .ssh, .aws).
    const verdict = normalizeFilePath(file.path);
    if (!verdict.ok) {
      throw new MaterializeError({
        stage: "materialize",
        message: "This project contains a file path that cannot be written safely.",
        // The offending path is included — it is the project's own data, not
        // the host's — but no host path ever is.
        detail: `${file.path}: ${verdict.reason}`,
      });
    }

    const target = resolve(rootPath, verdict.path);

    // Defence 2, and the one that actually holds: wherever the path resolved
    // to, it must still be under the root. Checked after resolution rather
    // than before, because resolution is what a traversal attack manipulates.
    if (!target.startsWith(rootPrefix)) {
      throw new MaterializeError({
        stage: "materialize",
        message: "This project contains a file path that escapes the project directory.",
        detail: `${file.path} resolves outside the preview root`,
      });
    }

    // Binary files carry a storage key rather than content. The preview does
    // not resolve storage — it would mean handing the runtime credentials —
    // so they are skipped. Generated projects are told to embed images as data
    // URIs, so in practice this is empty.
    if (file.content === null) continue;

    await mkdir(dirname(target), { recursive: true });
    // Written without an executable bit and never executed; this runtime
    // serves bytes, it does not run them.
    await writeFile(target, file.content, { encoding: "utf8", mode: 0o644 });
    written++;

    if (verdict.path.endsWith(".html")) {
      const route = routeForFilePath(verdict.path);
      entries.push({ route, path: verdict.path, title: titleOf(file.content, route) });
    }
  }

  if (written === 0) {
    throw new MaterializeError({
      stage: "emptyProject",
      message: "This revision has no text files to preview.",
      detail: null,
    });
  }

  if (entries.length === 0) {
    throw new MaterializeError({
      stage: "unsupportedProject",
      message:
        "This project has no HTML pages, so there is nothing to show. Orbital previews static sites.",
      detail: `${written} files, none of them .html`,
    });
  }

  // "/" first, then alphabetically — the order someone would expect a site
  // map in, rather than the order the tree happened to be in.
  entries.sort((a, b) =>
    a.route === "/" ? -1 : b.route === "/" ? 1 : a.route.localeCompare(b.route)
  );

  return { entries, fileCount: written, totalBytes };
}

/** The directory a project's preview owns.
 *
 * Under one parent so the whole engine's footprint can be removed in one go,
 * and named by project id — which is a UUID from our own store, not user
 * input, so it cannot contain a separator.
 */
export function previewRootFor(base: string, projectId: string): string {
  // Belt and braces: even though the id is ours, a path is being built from
  // it, and asserting the shape costs nothing.
  if (!/^[A-Za-z0-9_-]+$/.test(projectId)) {
    throw new MaterializeError({
      stage: "materialize",
      message: "This project cannot be previewed.",
      detail: "project id is not a safe directory name",
    });
  }
  return join(base, projectId);
}
