"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { tokens } from "./tokens";

/** A generation that is in flight, according to the database.
 *
 * The generation panel only knows about runs it started itself, so before this
 * a reload mid-build showed an idle-looking project with work happening behind
 * it. This is rendered from the persisted run, so it survives reloads, second
 * tabs, and the browser being closed and reopened.
 *
 * It refreshes the route rather than polling a job: the server already renders
 * everything from the run row, so `router.refresh()` gets the current state and
 * the whole page — history, revisions, status — updates together. Polling a
 * job here would produce a banner that disagreed with the list beneath it.
 */

const PHASE: Record<string, { label: string; detail: string }> = {
  queued: {
    label: "Queued",
    detail: "Waiting for a worker to pick this up.",
  },
  running: {
    label: "Building",
    detail: "Reading the project, planning the change and writing files.",
  },
  validating: {
    label: "Validating",
    detail: "Checking the proposed file operations before anything is applied.",
  },
};

export function ActiveRunBanner({
  status,
  prompt,
  startedAt,
  /** When the current worker's claim expires. Past this, the run is
   *  recoverable — the worker holding it is presumed gone. */
  leaseExpiresAt,
}: {
  status: string;
  prompt: string;
  startedAt: string | null;
  leaseExpiresAt: string | null;
}) {
  const router = useRouter();
  const [stalled, setStalled] = useState(false);
  // Held in state rather than computed during render. `Date.now()` in a render
  // is impure — it would differ between the server's HTML and the client's
  // first pass, which is a hydration mismatch, and React would be free to
  // recompute it on any incidental re-render. Null until the first tick, so
  // both sides start by rendering nothing.
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    const sample = () => {
      setElapsed(startedAt ? Date.now() - Date.parse(startedAt) : null);
      // A lapsed lease means whoever claimed this run died. It is not lost —
      // the next worker tick reclaims it — but saying so is better than a
      // spinner that appears to have hung.
      setStalled(Boolean(leaseExpiresAt && Date.parse(leaseExpiresAt) < Date.now()));
    };
    sample();

    // Three seconds is fast enough to feel live and slow enough not to hammer
    // the server for a page that only changes when a stage completes.
    const tick = setInterval(() => {
      router.refresh();
      sample();
    }, 3000);
    return () => clearInterval(tick);
  }, [router, leaseExpiresAt, startedAt]);

  const phase = PHASE[status] ?? PHASE.queued;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: "14px 16px",
        borderRadius: 12,
        border: `1px solid ${stalled ? "rgba(233,213,140,.3)" : tokens.borderAccent}`,
        background: stalled ? "rgba(233,213,140,.06)" : tokens.accentSoft,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span
          className="o-dot o-dot--live"
          style={{ background: tokens.violet, color: tokens.violet }}
          aria-hidden
        />
        <span
          style={{
            fontFamily: tokens.mono,
            fontSize: 10,
            letterSpacing: ".1em",
            color: "rgba(214,204,255,.95)",
          }}
        >
          {phase.label.toUpperCase()}
        </span>
        <span style={{ flex: 1 }} />
        {elapsed !== null && elapsed > 0 && (
          <span
            style={{ fontFamily: tokens.mono, fontSize: 10, color: tokens.textFaint }}
          >
            {Math.floor(elapsed / 1000)}S
          </span>
        )}
      </div>

      <p style={{ margin: "9px 0 0", fontSize: 13.5, lineHeight: 1.5, color: tokens.text }}>
        {prompt || "Generation in progress."}
      </p>
      <p style={{ margin: "5px 0 0", fontSize: 12.5, lineHeight: 1.5, color: tokens.textMuted }}>
        {stalled
          ? "This run's worker stopped responding. It has not been lost — the next worker pass will pick it up and continue."
          : phase.detail}
      </p>
    </div>
  );
}
