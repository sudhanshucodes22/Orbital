"use client";

import { useEffect, useRef, useState } from "react";
import type { ConversationTurn } from "@/lib/domain";
import { Button } from "../ui/Button";
import { tokens } from "../ui/tokens";

/** Orbital, as a conversation.
 *
 * Every turn here is a real generation. There is no chat model behind this
 * panel answering questions — the pipeline plans, writes files and cuts a
 * revision, and that is the only thing it can do. A panel that appeared to
 * hold small talk would be claiming a capability the product does not have.
 *
 * The turns come from run history, projected by `conversationFrom`. Nothing is
 * stored twice, so nothing can disagree: a run recovered by the worker, or
 * retried, shows up here because it is the same row.
 *
 * Status text names the stage and never guesses a percentage. The pipeline
 * knows which stage it is in; it does not know how far through it is, and a
 * progress bar would be an invention.
 */

const mono: React.CSSProperties = {
  fontFamily: tokens.mono,
  fontSize: 9.5,
  letterSpacing: ".1em",
  color: tokens.textFaint,
};

const SUGGESTIONS: readonly string[] = [
  "Make the hero section more premium.",
  "Add a testimonials section above the footer.",
  "Use a warmer palette — less blue.",
];

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span style={mono}>
      {value} <span style={{ opacity: 0.62 }}>{label}</span>
    </span>
  );
}

function Reply({
  turn,
  onOpenChanges,
  onRetry,
  retrying,
}: {
  turn: ConversationTurn;
  onOpenChanges: (revisionId: string) => void;
  onRetry: (runId: string) => void;
  retrying: boolean;
}) {
  const { reply } = turn;
  const [showDetail, setShowDetail] = useState(false);

  const tone =
    reply.kind === "failure"
      ? "b-reply b-reply--bad"
      : reply.kind === "pending"
        ? "b-reply b-reply--live"
        : "b-reply";

  const dot =
    reply.kind === "failure"
      ? "#ff9b8f"
      : reply.kind === "pending"
        ? tokens.violet
        : reply.kind === "cancelled"
          ? "rgba(233,235,242,.35)"
          : tokens.accent;

  return (
    <div className={tone}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span
          className={`o-dot${reply.kind === "pending" ? " o-dot--live" : ""}`}
          style={{ background: dot, color: dot }}
          aria-hidden
        />
        <span style={{ fontSize: 13, fontWeight: 500, color: tokens.text }}>
          {reply.headline}
        </span>
        <span style={{ flex: 1 }} />
        {/* Which engine answered. Recorded per run, so history cannot imply a
            model was involved when none was. */}
        <span style={mono}>{turn.mode === "model" ? "MODEL" : "TEMPLATE"}</span>
      </div>

      {reply.detail && (
        <p
          style={{
            margin: "7px 0 0",
            fontSize: 12.5,
            lineHeight: 1.55,
            color: tokens.textMuted,
          }}
        >
          {reply.detail}
        </p>
      )}

      {reply.kind === "failure" && reply.error && (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "rgba(255,196,190,.95)",
          }}
        >
          {reply.error}
        </p>
      )}

      {reply.kind === "success" && (
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginTop: 10,
            paddingTop: 9,
            borderTop: `1px solid ${tokens.borderSoft}`,
          }}
        >
          {reply.filesChanged !== null && <Stat label="FILES" value={reply.filesChanged} />}
          <Stat label="OPS" value={reply.operationCount} />
          {reply.validation && (
            <Stat label="CHECKED" value={reply.validation.checkedOperations} />
          )}
          <span style={{ flex: 1 }} />
          {reply.revisionId && (
            <button
              type="button"
              onClick={() => onOpenChanges(reply.revisionId!)}
              style={{
                font: "inherit",
                fontSize: 11.5,
                cursor: "pointer",
                padding: "4px 11px",
                borderRadius: 999,
                border: `1px solid ${tokens.borderAccent}`,
                background: tokens.accentSoft,
                color: "rgba(196,236,255,.95)",
              }}
            >
              Open changes
            </button>
          )}
        </div>
      )}

      {reply.kind === "failure" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button
            type="button"
            onClick={() => onRetry(turn.runId)}
            disabled={retrying}
            style={{
              font: "inherit",
              fontSize: 11.5,
              cursor: retrying ? "default" : "pointer",
              padding: "4px 12px",
              borderRadius: 999,
              border: `1px solid ${tokens.border}`,
              background: "rgba(255,255,255,.05)",
              color: tokens.text,
              opacity: retrying ? 0.6 : 1,
            }}
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
          {/* Validation detail sits behind a disclosure: it is the answer to
              "why", and only some failures prompt the question. */}
          {reply.validation && reply.validation.errors.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              aria-expanded={showDetail}
              style={{
                ...mono,
                background: "none",
                border: 0,
                cursor: "pointer",
                color: tokens.accent,
                padding: 0,
              }}
            >
              {showDetail ? "HIDE DETAILS" : "DETAILS"}
            </button>
          )}
        </div>
      )}

      {showDetail && reply.validation && (
        <ul
          style={{
            margin: "10px 0 0",
            padding: 0,
            listStyle: "none",
            display: "grid",
            gap: 5,
          }}
        >
          {reply.validation.errors.map((issue, i) => (
            <li key={`${issue.code}-${i}`} style={{ display: "flex", gap: 8, fontSize: 12 }}>
              <span style={{ ...mono, color: "rgba(255,150,140,.9)", flexShrink: 0 }}>
                {issue.code}
              </span>
              <span style={{ color: tokens.textMuted, lineHeight: 1.5 }}>
                {issue.message}
                {issue.path && <span style={{ ...mono, marginLeft: 6 }}>{issue.path}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ChatPanel({
  turns,
  busy,
  error,
  onSend,
  onRetry,
  onOpenChanges,
  retryingRunId,
  hasMoreHistory,
  onOpenHistory,
  engineLabel,
}: {
  turns: ConversationTurn[];
  /** A generation is in flight. Sending is refused server-side too — one
   *  active run per project — so this is a courtesy, not the check. */
  busy: boolean;
  error: string | null;
  onSend: (prompt: string) => void;
  onRetry: (runId: string) => void;
  onOpenChanges: (revisionId: string) => void;
  retryingRunId: string | null;
  hasMoreHistory: boolean;
  onOpenHistory: () => void;
  /** Which engine will answer this project's next request. */
  engineLabel: string;
}) {
  const [draft, setDraft] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;

  // Follow the conversation as it grows, and as the last turn's status
  // changes — a status moving from queued to building is new content even
  // though the turn count did not change.
  //
  // Deferred a frame: the effect runs before the browser has laid the new turn
  // out, so `scrollHeight` is still the old height and the scroll lands short.
  // That is why sending a message appeared to jump the log to the top — the
  // list had been replaced but not yet measured.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const node = log.current;
      if (!node) return;
      node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [turns.length, lastTurn?.status]);

  const submit = () => {
    const prompt = draft.trim();
    if (!prompt || busy) return;
    onSend(prompt);
    setDraft("");
    // Keep focus for the next instruction: building is iterative, and
    // reaching for the mouse between turns is friction.
    input.current?.focus();
  };

  return (
    <>
      <div className="b-panel-head">
        <span
          style={{
            fontFamily: tokens.display,
            fontSize: 12.5,
            fontWeight: 600,
            letterSpacing: "-.01em",
          }}
        >
          Orbital
        </span>
        <span style={{ flex: 1 }} />
        <span style={mono} title="Which engine answers this project's requests">
          {engineLabel.toUpperCase()}
        </span>
      </div>

      <div
        className="b-scroll"
        ref={log}
        style={{ display: "grid", gridTemplateRows: "1fr auto", minHeight: 0 }}
      >
        <div style={{ padding: "16px 14px", display: "grid", gap: 18, alignContent: "start" }}>
          {hasMoreHistory && (
            <button
              type="button"
              onClick={onOpenHistory}
              style={{
                ...mono,
                justifySelf: "center",
                background: "none",
                border: 0,
                cursor: "pointer",
                color: tokens.accent,
              }}
            >
              EARLIER IN HISTORY ↑
            </button>
          )}

          {turns.length === 0 && (
            <div style={{ display: "grid", gap: 12, paddingTop: 10 }}>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: tokens.textMuted }}>
                Describe what you want and Orbital will build it. Each change is
                applied to the current version, so you can keep going from here
                — nothing is ever overwritten.
              </p>
              <div style={{ display: "grid", gap: 6 }}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setDraft(s);
                      input.current?.focus();
                    }}
                    style={{
                      font: "inherit",
                      fontSize: 12.5,
                      textAlign: "left",
                      cursor: "pointer",
                      padding: "9px 12px",
                      borderRadius: 10,
                      border: `1px solid ${tokens.borderSoft}`,
                      background: "rgba(255,255,255,.02)",
                      color: tokens.textMuted,
                      transition: `border-color ${tokens.fast} ${tokens.ease}, color ${tokens.fast} ${tokens.ease}`,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn) => (
            <div key={turn.runId} className="b-turn">
              <div className="b-said">{turn.prompt || "Attachments only."}</div>
              {turn.isRetry && (
                <span style={{ ...mono, justifySelf: "start" }}>
                  RETRY · ATTEMPT {turn.attempt}
                </span>
              )}
              <Reply
                turn={turn}
                onOpenChanges={onOpenChanges}
                onRetry={onRetry}
                retrying={retryingRunId === turn.runId}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "10px 12px 12px", borderTop: `1px solid ${tokens.borderSoft}` }}>
        {error && (
          <p
            role="alert"
            style={{
              margin: "0 0 9px",
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "rgba(255,196,190,.95)",
            }}
          >
            {error}
          </p>
        )}

        <div className="b-compose">
          <textarea
            ref={input}
            rows={3}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter breaks the line. The convention every
              // chat input uses, and the one people's hands already know.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={busy ? "Orbital is working…" : "Describe the change you want…"}
            aria-label="Describe the change you want"
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0 10px 9px 13px",
            }}
          >
            <span style={mono}>{busy ? "WORKING" : "ENTER TO SEND"}</span>
            <span style={{ flex: 1 }} />
            <Button
              size="sm"
              onClick={submit}
              busy={busy}
              disabled={busy || draft.trim().length === 0}
            >
              {busy ? "Building…" : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
