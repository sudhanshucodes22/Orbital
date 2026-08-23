"use client";

import { useState, useTransition } from "react";
import type { RunSummary } from "@/lib/domain";
import type { ValidationIssue } from "@/lib/domain";
import type { ProjectFormState } from "@/app/(product)/projects/actions";
import { Button } from "./Button";
import { formatRelative } from "./format";
import { Eyebrow } from "./Panel";
import { statusTone, tokens } from "./tokens";

/** Build history.
 *
 * Everything shown here was already being recorded — the plan, the operations,
 * the validation result, the timings, which model answered. Until now none of
 * it was visible, which made a failed run something you could only diagnose by
 * reading the database.
 *
 * Progressive disclosure throughout: the row answers "what happened and did it
 * work", and the detail answers "why". Nothing dumps raw JSON — a run's
 * internals are rendered as the things they are, because an admin log is not
 * what someone building a site wants to read.
 *
 * Takes `RunSummary`, not `GenerationRun`. A run's operations carry the full
 * text of every file it wrote; rendering a row that shows *the count* must not
 * cost a payload of entire generated sites.
 *
 * Paged rather than capped. The server sends the first page and a cursor; the
 * rest arrives only if someone asks for it. A project with three hundred runs
 * therefore costs the same to open as one with ten.
 */

const RUN_TONE: Record<string, { label: string; dot: string; text: string }> = {
  queued: { label: "Queued", dot: "rgba(233,235,242,.45)", text: tokens.textMuted },
  running: { label: "Running", dot: tokens.violet, text: "rgba(214,204,255,.95)" },
  validating: { label: "Validating", dot: tokens.violet, text: "rgba(214,204,255,.95)" },
  succeeded: { label: "Succeeded", dot: tokens.accent, text: "rgba(196,236,255,.95)" },
  failed: { label: "Failed", dot: "#ff9b8f", text: "rgba(255,196,190,.95)" },
  cancelled: { label: "Cancelled", dot: "rgba(233,235,242,.35)", text: tokens.textFaint },
};

const toneFor = (status: string) => RUN_TONE[status] ?? RUN_TONE.queued;

/** Wall-clock time the run took. Null while it is still going — showing a
 *  duration that keeps growing reads as a stopwatch, not a record. */
function duration(run: RunSummary): string | null {
  if (!run.startedAt || !run.completedAt) return null;
  const ms = Date.parse(run.completedAt) - Date.parse(run.startedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

const mono: React.CSSProperties = {
  fontFamily: tokens.mono,
  fontSize: 10,
  letterSpacing: ".1em",
  color: tokens.textFaint,
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span style={mono}>
      {value} <span style={{ opacity: 0.62 }}>{label}</span>
    </span>
  );
}

function IssueList({ issues, tone }: { issues: readonly ValidationIssue[]; tone: string }) {
  return (
    <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
      {issues.map((issue, i) => (
        <li key={`${issue.code}-${i}`} style={{ display: "flex", gap: 9, fontSize: 12.5 }}>
          <span style={{ ...mono, color: tone, flexShrink: 0 }}>{issue.code}</span>
          <span style={{ color: tokens.textMuted, lineHeight: 1.5 }}>
            {issue.message}
            {issue.path && <span style={{ ...mono, marginLeft: 6 }}>{issue.path}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Retries a failed run.
 *
 * Only offered on failures, and the service refuses anything else regardless —
 * the button being absent is a courtesy, not the check.
 */
function RetryButton({
  projectId,
  runId,
  action,
}: {
  projectId: string;
  runId: string;
  action: (prev: ProjectFormState, data: FormData) => Promise<ProjectFormState>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      action={(data) =>
        start(async () => {
          const result = await action({ error: null }, data);
          setError(result.error);
        })
      }
      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="runId" value={runId} />
      <Button type="submit" variant="ghost" size="sm" busy={pending} disabled={pending}>
        {pending ? "Retrying…" : "Retry"}
      </Button>
      {error && (
        <span role="alert" style={{ fontSize: 12, color: "rgba(255,196,190,.95)" }}>
          {error}
        </span>
      )}
    </form>
  );
}

function RunRow({
  run,
  projectId,
  onRetry,
}: {
  run: RunSummary;
  projectId: string;
  onRetry?: (prev: ProjectFormState, data: FormData) => Promise<ProjectFormState>;
}) {
  const tone = toneFor(run.status);
  const took = duration(run);
  const changed = run.changedPaths;
  const validation = run.validation;

  return (
    <li
      style={{
        padding: "14px 15px",
        borderRadius: 12,
        border: `1px solid ${run.status === "failed" ? "rgba(255,150,140,.28)" : tokens.borderSoft}`,
        background: run.status === "failed" ? "rgba(255,150,140,.05)" : "rgba(255,255,255,.02)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span
          className={`o-dot${run.status === "running" || run.status === "validating" ? " o-dot--live" : ""}`}
          style={{ background: tone.dot, color: tone.dot }}
          aria-hidden
        />
        <span style={{ ...mono, color: tone.text }}>{tone.label.toUpperCase()}</span>
        {/* A retry is a different fact from a first attempt, and the number is
            what tells you whether this has been going wrong repeatedly. */}
        {run.isRetry && (
          <span
            style={{
              ...mono,
              color: "rgba(214,204,255,.9)",
              padding: "2px 8px",
              borderRadius: 999,
              border: `1px solid ${tokens.borderSoft}`,
            }}
          >
            RETRY · ATTEMPT {run.attempt}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={mono}>{formatRelative(run.createdAt).toUpperCase()}</span>
      </div>

      {/* The prompt is the thing a person recognises a run by, so it leads. */}
      <p
        style={{
          margin: "10px 0 0",
          fontSize: 13.5,
          lineHeight: 1.55,
          color: run.prompt ? tokens.text : tokens.textFaint,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {run.prompt || "No instruction — attachments only."}
      </p>

      {run.status === "failed" && run.error && (
        <p
          style={{
            margin: "10px 0 0",
            padding: "9px 11px",
            borderRadius: 9,
            background: "rgba(255,150,140,.08)",
            border: "1px solid rgba(255,150,140,.25)",
            fontSize: 12.5,
            lineHeight: 1.5,
            color: "rgba(255,196,190,.95)",
          }}
        >
          {run.error}
        </p>
      )}

      <div
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: 12,
          paddingTop: 11,
          borderTop: `1px solid ${tokens.borderSoft}`,
        }}
      >
        <Stat label="OPS" value={String(run.operationCount)} />
        {run.applied !== null && <Stat label="CHANGED" value={String(run.applied)} />}
        {took && <Stat label="TOOK" value={took} />}
        <span style={mono}>
          {run.mode === "model" && run.model
            ? `${run.model.providerId} · ${run.model.modelId}`
            : "TEMPLATE ENGINE"}
        </span>
        {run.status === "failed" && onRetry && (
          <>
            <span style={{ flex: 1 }} />
            <RetryButton projectId={projectId} runId={run.id} action={onRetry} />
          </>
        )}
      </div>

      {/* Detail behind a disclosure: the answer to "why", for the runs where
          someone actually asks. */}
      {(changed.length > 0 || run.plan || validation || run.events.length > 0) && (
        <details style={{ marginTop: 10 }}>
          <summary
            style={{
              cursor: "pointer",
              listStyle: "none",
              ...mono,
              color: tokens.accent,
            }}
          >
            Details
          </summary>

          <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
            {run.plan && (
              <div>
                <div style={mono}>
                  PLAN{run.plan.intent ? ` · ${run.plan.intent.toUpperCase()}` : ""}
                </div>
                {run.plan.summary && (
                  <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.55, color: tokens.textMuted }}>
                    {run.plan.summary}
                  </p>
                )}
                {run.plan.steps.length > 0 && (
                  <ol style={{ margin: "8px 0 0", padding: "0 0 0 18px", display: "grid", gap: 4 }}>
                    {run.plan.steps.map((step) => (
                      <li key={step.id} style={{ fontSize: 12.5, color: tokens.textMuted }}>
                        {step.title}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            {changed.length > 0 && (
              <div>
                <div style={mono}>FILES CHANGED</div>
                <ul
                  style={{
                    margin: "8px 0 0",
                    padding: 0,
                    listStyle: "none",
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  {changed.map((path) => (
                    <li
                      key={path}
                      style={{
                        ...mono,
                        color: "rgba(196,236,255,.9)",
                        padding: "4px 9px",
                        borderRadius: 999,
                        border: `1px solid ${tokens.borderSoft}`,
                      }}
                    >
                      {path}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {validation && (
              <div>
                <div style={mono}>
                  VALIDATION · {validation.checkedOperations} CHECKED ·{" "}
                  {validation.valid ? "PASSED" : `${validation.errors.length} ERROR(S)`}
                </div>
                {validation.errors.length > 0 && (
                  <IssueList issues={validation.errors} tone="rgba(255,150,140,.9)" />
                )}
                {validation.warnings.length > 0 && (
                  <IssueList issues={validation.warnings} tone="rgba(233,213,140,.9)" />
                )}
              </div>
            )}

            {run.events.length > 0 && (
              <div>
                <div style={mono}>STAGES</div>
                <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
                  {run.events.map((e, i) => (
                    <li key={`${e.status}-${i}`} style={{ ...mono, color: tokens.textMuted }}>
                      <span style={{ color: tokens.textFaint, marginRight: 8 }}>
                        {e.status.toUpperCase()}
                      </span>
                      {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}
    </li>
  );
}

const FILTERS: readonly { value: string | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "succeeded", label: "Succeeded" },
  { value: "failed", label: "Failed" },
];

export interface RunPageResult {
  runs: RunSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function RunHistory({
  projectId,
  initial,
  loadPage,
  onRetry,
}: {
  projectId: string;
  /** The first page, rendered on the server. */
  initial: RunPageResult;
  loadPage: (input: {
    projectId: string;
    cursor: string | null;
    status: string | null;
  }) => Promise<RunPageResult | { error: string }>;
  onRetry?: (prev: ProjectFormState, data: FormData) => Promise<ProjectFormState>;
}) {
  const [page, setPage] = useState<RunPageResult>(initial);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const fetchPage = (cursor: string | null, nextStatus: string | null) => {
    start(async () => {
      const result = await loadPage({ projectId, cursor, status: nextStatus });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError(null);
      setPage((current) =>
        cursor === null
          ? result
          : // Appending, not replacing: "load more" extends the list rather
            // than paging it out from under whoever is reading it.
            {
              runs: [...current.runs, ...result.runs],
              nextCursor: result.nextCursor,
              hasMore: result.hasMore,
            }
      );
    });
  };

  // Changing the filter restarts from the top: a cursor is only meaningful
  // within the result set it came from.
  const changeFilter = (next: string | null) => {
    if (next === status) return;
    setStatus(next);
    fetchPage(null, next);
  };

  if (initial.runs.length === 0) return null;

  const failed = page.runs.filter((r) => r.status === "failed").length;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Eyebrow>Build history</Eyebrow>
        <span style={{ flex: 1 }} />
        <div
          role="group"
          aria-label="Filter runs by outcome"
          style={{ display: "flex", gap: 6 }}
        >
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => changeFilter(f.value)}
              aria-pressed={status === f.value}
              disabled={pending}
              style={{
                ...mono,
                cursor: pending ? "default" : "pointer",
                padding: "4px 10px",
                borderRadius: 999,
                background: status === f.value ? "rgba(255,255,255,.07)" : "transparent",
                border: `1px solid ${status === f.value ? tokens.border : "transparent"}`,
                color: status === f.value ? tokens.text : tokens.textFaint,
              }}
            >
              {f.label.toUpperCase()}
            </button>
          ))}
        </div>
        <span style={mono}>
          {page.runs.length}
          {page.hasMore ? "+" : ""} RUN{page.runs.length === 1 ? "" : "S"}
          {failed > 0 ? ` · ${failed} FAILED` : ""}
        </span>
      </div>

      {page.runs.length === 0 ? (
        <p style={{ margin: "18px 0 0", fontSize: 13, color: tokens.textFaint }}>
          No {status ?? ""} runs.
        </p>
      ) : (
        <ul
          style={{
            margin: "18px 0 0",
            padding: 0,
            listStyle: "none",
            display: "grid",
            gap: 10,
          }}
        >
          {page.runs.map((run) => (
            <RunRow key={run.id} run={run} projectId={projectId} onRetry={onRetry} />
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" style={{ margin: "12px 0 0", fontSize: 12.5, color: "rgba(255,196,190,.95)" }}>
          {error}
        </p>
      )}

      {page.hasMore && (
        <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            busy={pending}
            disabled={pending}
            onClick={() => fetchPage(page.nextCursor, status)}
          >
            {pending ? "Loading…" : "Load older runs"}
          </Button>
        </div>
      )}
    </>
  );
}

export { statusTone };
