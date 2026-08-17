import type { ProjectFormState } from "@/app/(product)/projects/actions";
import type { Revision } from "@/lib/domain";
import { RestoreButton } from "./RestoreButton";
import { RevisionDiff, type DiffResult } from "./RevisionDiff";
import { tokens } from "./tokens";

/** Revision history as a rail.
 *
 * The list arrives newest-first from the repository, so the numbering counts
 * down: 01 has to be the first revision made, not the first one printed. The
 * rail exists because "nothing is overwritten" is the product's actual claim,
 * and a flat list of rows does not show a chain — a connected spine does.
 */
export function RevisionTimeline({
  revisions,
  currentId,
  projectId,
  restoreAction,
  compareAction,
}: {
  revisions: Revision[];
  currentId?: string;
  projectId: string;
  restoreAction: (prev: ProjectFormState, data: FormData) => Promise<ProjectFormState>;
  compareAction: (input: {
    projectId: string;
    fromRevisionId: string;
    toRevisionId: string;
  }) => Promise<DiffResult | { error: string }>;
}) {
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 2 }}>
      {revisions.map((revision, index) => {
        const current = revision.id === currentId;
        const last = index === revisions.length - 1;
        // Newest-first, so the *next* entry is the older one — the thing this
        // revision changed. The oldest revision has nothing before it, and a
        // pair without both trees frozen cannot be compared at all.
        const previous = revisions[index + 1];
        const comparable = Boolean(previous && previous.tree && revision.tree);

        return (
          <li key={revision.id} style={{ display: "flex", gap: 14 }}>
            {/* The spine: a node, and a line that stops at the final item so
                the chain does not dangle past its own end. */}
            <div
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flexShrink: 0,
                width: 12,
              }}
            >
              <span
                style={{
                  width: current ? 10 : 7,
                  height: current ? 10 : 7,
                  marginTop: 5,
                  borderRadius: "50%",
                  background: current ? tokens.accent : "rgba(233,235,242,.25)",
                  boxShadow: current ? "0 0 12px rgba(124,230,255,.8)" : "none",
                }}
                aria-hidden
              />
              {!last && (
                <span
                  style={{
                    flex: 1,
                    width: 1,
                    marginTop: 4,
                    minHeight: 26,
                    background:
                      "linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.04))",
                  }}
                  aria-hidden
                />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 18 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontFamily: tokens.mono,
                    fontSize: 9.5,
                    letterSpacing: ".12em",
                    color: current ? "rgba(124,230,255,.85)" : tokens.textFaint,
                  }}
                >
                  {String(revisions.length - index).padStart(2, "0")}
                </span>
                {current && (
                  <span
                    style={{
                      fontFamily: tokens.mono,
                      fontSize: 9,
                      letterSpacing: ".12em",
                      padding: "3px 8px",
                      borderRadius: 999,
                      border: `1px solid ${tokens.borderAccent}`,
                      background: tokens.accentSoft,
                      color: "rgba(196,236,255,.95)",
                    }}
                  >
                    CURRENT
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: tokens.mono, fontSize: 10, color: tokens.textFaint }}>
                  {new Date(revision.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  color: current ? tokens.text : tokens.textMuted,
                }}
              >
                {revision.summary}
              </p>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  marginTop: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: tokens.mono,
                    fontSize: 9.5,
                    letterSpacing: ".1em",
                    color: tokens.textFaint,
                  }}
                >
                  {revision.tree ? `${revision.tree.length} FILES` : "NO SNAPSHOT"}
                </span>
                {/* Only the current revision has nothing to restore to, and a
                    revision without a frozen tree cannot be restored at all —
                    offering the button anyway would be offering a failure. */}
                {!current && revision.tree && (
                  <RestoreButton
                    projectId={projectId}
                    revisionId={revision.id}
                    label={revision.summary}
                    action={restoreAction}
                  />
                )}
              </div>

              {comparable && (
                <RevisionDiff
                  projectId={projectId}
                  fromRevisionId={previous.id}
                  toRevisionId={revision.id}
                  compare={compareAction}
                />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
