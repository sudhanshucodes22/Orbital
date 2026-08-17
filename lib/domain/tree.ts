/** A flat list of paths as a navigable tree.
 *
 * The store keeps files flat — `project_files` is keyed by `(project_id,
 * path)` and there is no folder table, because folders are not things that
 * exist independently of the files in them. A folder is a prefix.
 *
 * That is the right storage model and the wrong display model, so the
 * conversion happens here: pure, on the server, once per render, rather than
 * in a component that rebuilds it on every keystroke.
 */
import type { ProjectFile } from "./file";

export interface TreeFileNode {
  type: "file";
  /** Full path: "app/components/Hero.tsx". */
  path: string;
  /** Just the last segment: "Hero.tsx". */
  name: string;
  byteSize: number;
  /** Content hash. Lets the UI notice a file changed without holding its
   *  contents — the tree never carries file bodies. */
  hash: string;
  updatedAt: string;
}

export interface TreeFolderNode {
  type: "folder";
  /** Full path of the folder: "app/components". */
  path: string;
  name: string;
  children: TreeNode[];
  /** Files anywhere beneath this folder, not just its direct children. */
  fileCount: number;
}

export type TreeNode = TreeFileNode | TreeFolderNode;

/** Folders first, then files, each alphabetically.
 *
 * The convention every file explorer uses, and worth matching rather than
 * inventing: people scan for a folder by shape before they read the name. */
function order(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** Builds the tree.
 *
 * Paths are already normalised by `normalizeFilePath` before anything is
 * written, so this does not re-validate them — it would be validating the
 * store against itself. It does tolerate odd shapes (empty segments, a
 * trailing slash) by skipping them, because a display function should not be
 * the thing that throws.
 */
export function buildFileTree(files: readonly ProjectFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  // Folder nodes by path, so a folder is created once no matter how many files
  // live under it.
  const folders = new Map<string, TreeFolderNode>();

  for (const file of files) {
    const segments = file.path.split("/").filter(Boolean);
    if (segments.length === 0) continue;

    const fileName = segments[segments.length - 1];
    const folderSegments = segments.slice(0, -1);

    let siblings = root;
    let prefix = "";

    for (const segment of folderSegments) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      let folder = folders.get(prefix);
      if (!folder) {
        folder = { type: "folder", path: prefix, name: segment, children: [], fileCount: 0 };
        folders.set(prefix, folder);
        siblings.push(folder);
      }
      // Counted on every ancestor, so a collapsed folder can still say how
      // much it is hiding.
      folder.fileCount++;
      siblings = folder.children;
    }

    siblings.push({
      type: "file",
      path: file.path,
      name: fileName,
      byteSize: file.byteSize,
      hash: file.hash,
      updatedAt: file.updatedAt,
    });
  }

  order(root);
  for (const folder of folders.values()) order(folder.children);
  return root;
}

/** Every folder path in a tree. What "expand all" needs, and what a fresh
 *  workspace opens with — a collapsed tree hides the thing the panel exists
 *  to show. */
export function allFolderPaths(nodes: readonly TreeNode[]): string[] {
  const paths: string[] = [];
  const walk = (list: readonly TreeNode[]) => {
    for (const node of list) {
      if (node.type === "folder") {
        paths.push(node.path);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return paths;
}

/** Total files in a tree. Cheaper than flattening it to ask. */
export function countFiles(nodes: readonly TreeNode[]): number {
  let total = 0;
  for (const node of nodes) {
    if (node.type === "file") total++;
    else total += node.fileCount;
  }
  return total;
}

/** A language hint from the extension, for the viewer's label.
 *
 * Deliberately a label, not a parser selection: this milestone shows file
 * contents in a plain viewer, and calling it "TypeScript" is a description
 * rather than a promise of syntax highlighting. */
export function languageOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  // No dot at all, or a leading dot with nothing after it (".gitignore" is a
  // name, not an extension). `lastIndexOf` returning -1 is the trap here:
  // slicing from 0 would turn "LICENSE" into the extension "LICENSE".
  if (dot <= 0) return "File";
  const extension = name.slice(dot + 1).toLowerCase();
  const known: Record<string, string> = {
    html: "HTML",
    css: "CSS",
    js: "JavaScript",
    jsx: "JavaScript",
    ts: "TypeScript",
    tsx: "TypeScript",
    json: "JSON",
    md: "Markdown",
    svg: "SVG",
    txt: "Text",
    yml: "YAML",
    yaml: "YAML",
  };
  // An extensionless path ("Dockerfile", or a stray "LICENSE") yields an empty
  // string rather than undefined, so the fallback has to catch both.
  return known[extension] ?? (extension.toUpperCase() || "File");
}
