"use client";

import { useState } from "react";
import type { TreeNode } from "@/lib/domain";
import { tokens } from "../ui/tokens";

/** The project's files, as a tree.
 *
 * Reads the real tree from `listFiles` — there is no separate index and no
 * scaffold. An empty project shows an empty tree, because that is the true
 * state before anything has been built.
 *
 * Rendered as nested lists with `role="tree"` so the structure is available to
 * assistive technology rather than implied by indentation. Rows are buttons,
 * so they are reachable by keyboard without any roving-tabindex machinery —
 * the simplest thing that is genuinely accessible.
 */

const mono: React.CSSProperties = {
  fontFamily: tokens.mono,
  fontSize: 9.5,
  letterSpacing: ".08em",
  color: tokens.textFaint,
};

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      className={`b-caret${open ? " b-caret--open" : ""}`}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <path
        d="M4.5 2.5 8 6l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".7"
      />
    </svg>
  );
}

/** A folder glyph and a file glyph, drawn rather than emoji — an emoji here
 *  renders differently on every platform and breaks the type rhythm. */
function Glyph({ folder, open }: { folder: boolean; open?: boolean }) {
  return folder ? (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d={
          open
            ? "M1.5 11.5V4a1 1 0 0 1 1-1h3l1.2 1.4h4.8a1 1 0 0 1 1 1v.6M1.5 11.5l1.6-4.4a1 1 0 0 1 .94-.6h8.7a.6.6 0 0 1 .57.8l-1.4 3.9a.9.9 0 0 1-.85.6H1.5Z"
            : "M1.5 11V4a1 1 0 0 1 1-1h3l1.2 1.4h5.8a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1Z"
        }
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
        opacity=".62"
      />
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3 1.75h4.6L11 5.2v7.05a.7.7 0 0 1-.7.7H3a.7.7 0 0 1-.7-.7V2.45a.7.7 0 0 1 .7-.7Z"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
        opacity=".5"
      />
      <path d="M7.4 1.9v3.3h3.3" stroke="currentColor" strokeWidth="1.15" opacity=".5" />
    </svg>
  );
}

function Node({
  node,
  depth,
  expanded,
  toggle,
  selected,
  onSelect,
  changed,
}: {
  node: TreeNode;
  depth: number;
  expanded: ReadonlySet<string>;
  toggle: (path: string) => void;
  selected: string | null;
  onSelect: (path: string) => void;
  changed: ReadonlySet<string>;
}) {
  // Indentation is padding on the row rather than a wrapper, so the hover and
  // selection backgrounds span the full width of the panel instead of starting
  // at the text.
  const indent = 10 + depth * 13;

  if (node.type === "folder") {
    const open = expanded.has(node.path);
    return (
      <li role="none">
        <button
          type="button"
          role="treeitem"
          aria-expanded={open}
          // Folders in this tree toggle rather than select — only files open
          // in the viewer — but `treeitem` requires the attribute, and saying
          // "not selected" is more accurate than omitting it.
          aria-selected={false}
          aria-level={depth + 1}
          className="b-row"
          style={{ paddingLeft: indent }}
          onClick={() => toggle(node.path)}
        >
          <Caret open={open} />
          <Glyph folder open={open} />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {node.name}
          </span>
          {/* What the folder is hiding, so collapsing does not lose the sense
              of how big it is. */}
          {!open && <span style={mono}>{node.fileCount}</span>}
        </button>
        {open && (
          <ul role="group" style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {node.children.map((child) => (
              <Node
                key={child.path}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                toggle={toggle}
                selected={selected}
                onSelect={onSelect}
                changed={changed}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const on = selected === node.path;
  const touched = changed.has(node.path);

  return (
    <li role="none">
      <button
        type="button"
        role="treeitem"
        aria-selected={on}
        aria-level={depth + 1}
        className={`b-row${on ? " b-row--on" : ""}${touched ? " b-row--changed" : ""}`}
        // Aligned with folder names: files have no caret, so they need the
        // caret's width added back or the columns drift.
        style={{ paddingLeft: indent + 12 }}
        onClick={() => onSelect(node.path)}
      >
        <Glyph folder={false} />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.name}
        </span>
        {/* A dot, not a word: the tree is dense, and "changed" repeated down a
            column is noise. The title gives it a name for anyone who needs
            one, and the label carries it to a screen reader. */}
        {touched && (
          <>
            <span
              aria-hidden
              title="Changed by the last generation"
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: tokens.accent,
                boxShadow: `0 0 8px ${tokens.accent}`,
                flexShrink: 0,
              }}
            />
            <span className="o-sr-only">changed by the last generation</span>
          </>
        )}
      </button>
    </li>
  );
}

export function FileTree({
  tree,
  selected,
  onSelect,
  changedPaths,
  initialExpanded,
}: {
  tree: TreeNode[];
  selected: string | null;
  onSelect: (path: string) => void;
  /** Paths the most recent successful generation wrote. */
  changedPaths: readonly string[];
  /** Folders open on first render — everything, so the panel opens showing
   *  what is in the project rather than a row of closed folders. */
  initialExpanded: readonly string[];
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(initialExpanded)
  );

  const toggle = (path: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  if (tree.length === 0) {
    return (
      <p
        style={{
          margin: 0,
          padding: "18px 14px",
          fontSize: 12.5,
          lineHeight: 1.55,
          color: tokens.textFaint,
        }}
      >
        No files yet. Describe what you want in the panel on the right and
        Orbital will write the first ones.
      </p>
    );
  }

  const changed = new Set(changedPaths);

  return (
    <ul
      role="tree"
      aria-label="Project files"
      style={{ margin: 0, padding: "8px 8px 20px 0", listStyle: "none" }}
    >
      {tree.map((node) => (
        <Node
          key={node.path}
          node={node}
          depth={0}
          expanded={expanded}
          toggle={toggle}
          selected={selected}
          onSelect={onSelect}
          changed={changed}
        />
      ))}
    </ul>
  );
}
