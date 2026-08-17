"use client";

import { useEffect, useRef } from "react";
import type { ProjectFormState } from "@/app/(product)/projects/actions";
import type { Revision } from "@/lib/domain";
import { RevisionTimeline } from "../ui/RevisionTimeline";
import { RunHistory, type RunPageResult } from "../ui/RunHistory";
import type { DiffResult } from "../ui/RevisionDiff";
import { tokens } from "../ui/tokens";

/** History, revisions, diffs and restore — the existing capabilities, in a
 *  panel rather than a page.
 *
 * Nothing here is new. `RunHistory` and `RevisionTimeline` are the same
 * components the project page renders, given the same actions; this drawer is
 * a container. Rebuilding them for the workspace would have produced a second
 * history view to keep in sync with the first, and they would have drifted the
 * first time either changed.
 *
 * It answers one question — "what did Orbital just change?" — so it opens over
 * the workspace rather than replacing it. You come back to what you were
 * looking at.
 */

export function HistoryDrawer({
  open,
  onClose,
  projectId,
  revisions,
  currentRevisionId,
  initialRuns,
  loadPage,
  onRetry,
  restoreAction,
  compareAction,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  revisions: Revision[];
  currentRevisionId: string | null;
  initialRuns: RunPageResult;
  loadPage: (input: {
    projectId: string;
    cursor: string | null;
    status: string | null;
  }) => Promise<RunPageResult | { error: string }>;
  onRetry: (prev: ProjectFormState, data: FormData) => Promise<ProjectFormState>;
  restoreAction: (prev: ProjectFormState, data: FormData) => Promise<ProjectFormState>;
  compareAction: (input: {
    projectId: string;
    fromRevisionId: string;
    toRevisionId: string;
  }) => Promise<DiffResult | { error: string }>;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Escape closes it, and focus moves in on open. A drawer you can open with
  // the keyboard but not close with it is worse than no keyboard support.
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="b-scrim" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="History and revisions"
        style={{
          position: "fixed",
          top: 54,
          right: 0,
          bottom: 0,
          width: "min(560px, 94vw)",
          zIndex: 9,
          display: "grid",
          gridTemplateRows: "auto minmax(0,1fr)",
          background: "rgba(8,10,16,.97)",
          borderLeft: `1px solid ${tokens.border}`,
          boxShadow: "-50px 0 100px -50px rgba(0,0,0,.95)",
        }}
      >
        <div className="b-panel-head">
          <span
            style={{
              fontFamily: tokens.display,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "-.01em",
            }}
          >
            History
          </span>
          <span style={{ flex: 1 }} />
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close history"
            style={{
              border: `1px solid ${tokens.borderSoft}`,
              background: "transparent",
              color: tokens.textMuted,
              borderRadius: 7,
              cursor: "pointer",
              padding: "3px 10px",
              font: "inherit",
              fontSize: 11.5,
            }}
          >
            Close
          </button>
        </div>

        <div className="b-scroll" style={{ padding: "18px 16px 32px", display: "grid", gap: 26 }}>
          {revisions.length > 0 && (
            <section>
              <div
                style={{
                  fontFamily: tokens.mono,
                  fontSize: 9.5,
                  letterSpacing: ".14em",
                  color: tokens.textFaint,
                  marginBottom: 14,
                }}
              >
                REVISIONS
              </div>
              {/* Expanding a revision here fetches its diff — the same
                  `compareRevisions` service the project page uses. */}
              <RevisionTimeline
                revisions={revisions}
                currentId={currentRevisionId ?? undefined}
                projectId={projectId}
                restoreAction={restoreAction}
                compareAction={compareAction}
              />
            </section>
          )}

          <section>
            <RunHistory
              projectId={projectId}
              initial={initialRuns}
              loadPage={loadPage}
              onRetry={onRetry}
            />
          </section>
        </div>
      </div>
    </>
  );
}
