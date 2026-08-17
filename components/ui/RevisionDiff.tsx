"use client";

import { useState, useTransition } from "react";
import { tokens } from "./tokens";

/** What a revision changed, compared to the one before it.
 *
 * The summary line on a revision is written by whatever produced it, which
 * makes it a claim rather than evidence. This is the evidence: the actual file
 * paths, what happened to each, and how many lines moved.
 *
 * Fetched on open, not on render. Diffing every revision on a project with
 * fifty of them would mean loading fifty pairs of file trees to draw a
 * timeline nobody has expanded — and the trees are the largest thing the
 * project stores.
 */

export interface DiffResult {
  changes: { path: string; status: string; linesAdded: number; linesRemoved: number }[];
  added: number;
  modified: number;
  deleted: number;
  identical: boolean;
}

const mono: React.CSSProperties = {
  fontFamily: tokens.mono,
  fontSize: 9.5,
  letterSpacing: ".1em",
};

/** The marker convention: + added, ~ modified, − deleted. Colour carries the
 *  same information, so the marker is not the only signal. */
const MARK: Record<string, { glyph: string; color: string }> = {
  added: { glyph: "+", color: "rgba(150,235,190,.95)" },
  modified: { glyph: "~", color: "rgba(233,213,140,.95)" },
  deleted: { glyph: "−", color: "rgba(255,166,158,.95)" },
};

export function RevisionDiff({
  projectId,
  fromRevisionId,
  toRevisionId,
  compare,
}: {
  projectId: string;
  /** The older revision. */
  fromRevisionId: string;
  toRevisionId: string;
  compare: (input: {
    projectId: string;
    fromRevisionId: string;
    toRevisionId: string;
  }) => Promise<DiffResult | { error: string }>;
}) {
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = () => {
    // Already have it, or already asking for it.
    if (diff || pending) return;
    start(async () => {
      const result = await compare({ projectId, fromRevisionId, toRevisionId });
      if ("error" in result) setError(result.error);
      else setDiff(result);
    });
  };

  return (
    <details
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) load();
      }}
      style={{ marginTop: 8 }}
    >
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          ...mono,
          color: tokens.accent,
        }}
      >
        What changed
      </summary>

      <div style={{ marginTop: 9 }}>
        {pending && <span style={{ ...mono, color: tokens.textFaint }}>COMPARING…</span>}

        {error && (
          <span role="alert" style={{ fontSize: 12, color: "rgba(255,196,190,.95)" }}>
            {error}
          </span>
        )}

        {diff && diff.identical && (
          <span style={{ ...mono, color: tokens.textFaint }}>NO FILE CHANGES</span>
        )}

        {diff && !diff.identical && (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
              {diff.added > 0 && (
                <span style={{ ...mono, color: MARK.added.color }}>+{diff.added} ADDED</span>
              )}
              {diff.modified > 0 && (
                <span style={{ ...mono, color: MARK.modified.color }}>
                  ~{diff.modified} CHANGED
                </span>
              )}
              {diff.deleted > 0 && (
                <span style={{ ...mono, color: MARK.deleted.color }}>
                  −{diff.deleted} REMOVED
                </span>
              )}
            </div>

            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
              {diff.changes.map((change) => {
                const mark = MARK[change.status] ?? MARK.modified;
                return (
                  <li
                    key={change.path}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                      fontSize: 12,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{ ...mono, color: mark.color, flexShrink: 0, width: 8 }}
                      aria-hidden
                    >
                      {mark.glyph}
                    </span>
                    <span
                      style={{
                        fontFamily: tokens.mono,
                        fontSize: 11.5,
                        color: tokens.textMuted,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={change.path}
                    >
                      {change.path}
                    </span>
                    <span style={{ flex: 1 }} />
                    {/* Line counts are meaningless for a whole added or
                        removed file — "+120 lines" on a file that did not
                        exist is just its length. */}
                    {change.status === "modified" && (
                      <span style={{ ...mono, color: tokens.textFaint, flexShrink: 0 }}>
                        <span style={{ color: MARK.added.color }}>+{change.linesAdded}</span>{" "}
                        <span style={{ color: MARK.deleted.color }}>−{change.linesRemoved}</span>
                      </span>
                    )}
                    {/* Screen readers get the status as a word, since the
                        glyph and the colour both say it visually only. */}
                    <span className="o-sr-only">{change.status}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}
