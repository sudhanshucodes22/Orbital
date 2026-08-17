"use client";

import { useRef, useState } from "react";
import type { PreviewTarget } from "@/lib/services/preview";
import { tokens } from "../ui/tokens";

/** The generated site, running.
 *
 * The frame points at a real HTTP server the preview runtime started on its
 * own port, serving the revision's actual files. That separate origin is the
 * point: model-authored HTML cannot reach this application's cookies or DOM
 * even if the iframe sandbox were relaxed, because the same-origin policy
 * applies as well.
 *
 * Everything rendered comes from `getPreviewTarget`. This component never
 * builds a preview URL, which is what stops it bypassing the authorisation and
 * availability checks in the service.
 *
 * States are the runtime's, not inferred: starting, ready, restarting, stopped
 * and failed are all things the runtime genuinely is. There is no progress
 * percentage, because the runtime knows what it is doing and not how far
 * through it is.
 */

const mono: React.CSSProperties = {
  fontFamily: tokens.mono,
  fontSize: 9.5,
  letterSpacing: ".1em",
  color: tokens.textFaint,
};

/** How the preview is contained, as a short badge.
 *
 * Shown because the tier varies by host and must never be assumed. The
 * in-process case is called out plainly rather than dressed up — a developer
 * running without isolation should be able to see that they are. */
const ISOLATION_LABEL: Record<string, { text: string; warn: boolean; title: string }> = {
  container: { text: "CONTAINER", warn: false, title: "Preview runs in an isolated container" },
  sandboxed: {
    text: "SANDBOXED",
    warn: false,
    title: "Preview runs in a separate process under an OS sandbox: no filesystem writes, no network egress",
  },
  process: {
    text: "PROCESS",
    warn: false,
    title: "Preview runs in a separate process with no application secrets. No OS sandbox on this host",
  },
  "in-process": {
    text: "NO SANDBOX",
    warn: true,
    title: "Preview runs inside the application process. Development only",
  },
};

/** The lifecycle, as a person would read it. */
const STATE_LABEL: Record<string, string> = {
  starting: "Starting preview…",
  restarting: "Refreshing preview…",
  ready: "Preview ready",
  stopped: "Preview stopped",
  failed: "Preview unavailable",
};

function Centred({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%", padding: 32 }}>
      <div style={{ maxWidth: 400, textAlign: "center" }}>{children}</div>
    </div>
  );
}

function Halo({ live, warn }: { live?: boolean; warn?: boolean }) {
  const colour = warn ? "rgba(255,150,140,.9)" : live ? tokens.violet : tokens.accent;
  return (
    <div
      aria-hidden
      style={{
        width: 46,
        height: 46,
        margin: "0 auto 18px",
        borderRadius: "50%",
        border: `1px solid ${warn ? "rgba(255,150,140,.35)" : tokens.borderAccent}`,
        background: warn ? "rgba(255,150,140,.07)" : tokens.accentSoft,
        display: "grid",
        placeItems: "center",
      }}
    >
      <span
        className={live ? "o-dot o-dot--live" : undefined}
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: colour,
          color: colour,
          boxShadow: `0 0 14px ${colour}`,
        }}
      />
    </div>
  );
}

/** A runtime failure, with the technical part behind a disclosure.
 *
 * The message is written for a person and is what they see. `detail` is a
 * stage code or a runtime error string — useful when debugging, noise
 * otherwise — and the runtime guarantees it carries no host path or secret. */
function Failed({
  failure,
  onRestart,
  restarting,
}: {
  failure: NonNullable<Extract<PreviewTarget, { kind: "runtime" }>["failure"]>;
  onRestart: () => void;
  restarting: boolean;
}) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <Centred>
      <Halo warn />
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "rgba(255,196,190,.95)" }}>
        Preview failed
      </p>
      <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.6, color: tokens.textMuted }}>
        {failure.message}
      </p>
      <p style={{ margin: "8px 0 16px", fontSize: 12.5, lineHeight: 1.6, color: tokens.textFaint }}>
        Your project and its history are unaffected — this is the preview
        runtime, not your files.
      </p>

      <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center" }}>
        <button
          type="button"
          onClick={onRestart}
          disabled={restarting}
          style={{
            font: "inherit",
            fontSize: 12.5,
            cursor: restarting ? "default" : "pointer",
            padding: "7px 16px",
            borderRadius: 999,
            border: `1px solid ${tokens.border}`,
            background: "rgba(255,255,255,.04)",
            color: tokens.text,
            opacity: restarting ? 0.6 : 1,
          }}
        >
          {restarting ? "Restarting…" : "Restart preview"}
        </button>
        {failure.detail && (
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            aria-expanded={showDetail}
            style={{ ...mono, background: "none", border: 0, cursor: "pointer", color: tokens.accent }}
          >
            {showDetail ? "HIDE DETAILS" : "DETAILS"}
          </button>
        )}
      </div>

      {showDetail && failure.detail && (
        <pre
          style={{
            margin: "14px 0 0",
            padding: "10px 12px",
            borderRadius: 9,
            border: `1px solid ${tokens.borderSoft}`,
            background: "rgba(255,255,255,.02)",
            fontFamily: tokens.mono,
            fontSize: 11.5,
            lineHeight: 1.55,
            color: tokens.textMuted,
            textAlign: "left",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {failure.stage}: {failure.detail}
        </pre>
      )}
    </Centred>
  );
}

export function PreviewPane({
  target,
  refreshToken,
  onRefresh,
  onRestart,
  restarting,
}: {
  target: PreviewTarget;
  /** Bumped by the workspace so a manual reload and an automatic one go
   *  through the same path. */
  refreshToken: number;
  onRefresh: () => void;
  onRestart: () => void;
  restarting: boolean;
}) {
  // What the current frame is showing. A new revision, a restart or a manual
  // reload invalidates all of it at once.
  const key =
    target.kind === "runtime" ? `${target.version}::${refreshToken}` : `none::${refreshToken}`;

  const [view, setView] = useState<{
    key: string;
    route: string | null;
    loading: boolean;
    failed: boolean;
  }>({ key, route: null, loading: true, failed: false });

  // Derived rather than reset in an effect: an effect would render the stale
  // page once and then re-render, which is a visible flash of the previous
  // revision every time a generation lands.
  const current = view.key === key ? view : { key, route: null, loading: true, failed: false };
  const frame = useRef<HTMLIFrameElement>(null);

  // `state` crosses a serialization boundary and is read straight into a
  // lookup, so a payload from a stale build — or a future one with a state
  // this client does not know — must degrade rather than crash the panel.
  const state: string = target.kind === "runtime" ? (target.state ?? "starting") : "starting";
  const label = STATE_LABEL[state] ?? "Preparing preview…";
  const isolation: string = target.kind === "runtime" ? (target.isolation ?? "process") : "process";

  if (target.kind === "unavailable") {
    return (
      <Centred>
        <Halo />
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: tokens.textMuted }}>
          {target.reason}
        </p>
      </Centred>
    );
  }

  if (state === "failed" && target.failure) {
    return <Failed failure={target.failure} onRestart={onRestart} restarting={restarting} />;
  }

  // Starting or restarting, with nothing to show yet. Named, never a
  // percentage.
  if (!target.url || target.pages.length === 0) {
    return (
      <Centred>
        <Halo live />
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: tokens.textMuted }}>
          {label}
        </p>
      </Centred>
    );
  }

  const { loading, failed } = current;
  const active = current.route
    ? (target.pages.find((p) => p.route === current.route) ?? target.pages[0])
    : target.pages[0];

  return (
    <>
      <div className="b-panel-head">
        <nav
          aria-label="Preview pages"
          style={{ display: "flex", gap: 6, flexWrap: "wrap", minWidth: 0, flex: 1 }}
        >
          {target.pages.map((p) => {
            const on = p.route === active.route;
            return (
              <button
                key={p.route}
                type="button"
                onClick={() => setView({ key, route: p.route, loading: true, failed: false })}
                aria-current={on ? "page" : undefined}
                style={{
                  font: "inherit",
                  fontSize: 11.5,
                  cursor: "pointer",
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: `1px solid ${on ? tokens.borderAccent : "transparent"}`,
                  background: on ? tokens.accentSoft : "transparent",
                  color: on ? "rgba(196,236,255,.95)" : tokens.textFaint,
                  transition: `background ${tokens.fast} ${tokens.ease}, color ${tokens.fast} ${tokens.ease}`,
                }}
              >
                {p.title}
              </button>
            );
          })}
        </nav>

        {/* What isolation is actually in force. Not decoration: the tier
            depends on the host, and a workspace that stayed silent would let
            "sandboxed" be an assumption. */}
        {(() => {
          const badge = ISOLATION_LABEL[isolation];
          if (!badge) return null;
          return (
            <span
              title={badge.title}
              style={{
                ...mono,
                flexShrink: 0,
                padding: "2px 7px",
                borderRadius: 999,
                border: `1px solid ${badge.warn ? "rgba(233,213,140,.35)" : tokens.borderSoft}`,
                color: badge.warn ? "rgba(233,213,140,.95)" : tokens.textFaint,
              }}
            >
              {badge.text}
            </span>
          );
        })()}

        {/* The runtime's state, live. `restarting` is worth showing even
            though the old frame is still up — it explains why a reload is
            about to happen on its own. */}
        <span
          style={{
            ...mono,
            flexShrink: 0,
            color: state === "ready" ? tokens.textFaint : "rgba(214,204,255,.95)",
          }}
        >
          {label.replace(/…$/, "").toUpperCase()}
        </span>

        <button
          type="button"
          onClick={onRefresh}
          aria-label="Reload the preview"
          style={{
            border: `1px solid ${tokens.borderSoft}`,
            background: "transparent",
            color: tokens.textMuted,
            borderRadius: 7,
            cursor: "pointer",
            padding: "3px 9px",
            font: "inherit",
            fontSize: 11,
            flexShrink: 0,
          }}
        >
          Reload
        </button>
        <button
          type="button"
          onClick={onRestart}
          disabled={restarting}
          aria-label="Restart the preview runtime"
          title="Restart the preview runtime"
          style={{
            border: `1px solid ${tokens.borderSoft}`,
            background: "transparent",
            color: tokens.textMuted,
            borderRadius: 7,
            cursor: restarting ? "default" : "pointer",
            padding: "3px 9px",
            font: "inherit",
            fontSize: 11,
            flexShrink: 0,
            opacity: restarting ? 0.55 : 1,
          }}
        >
          {restarting ? "Restarting…" : "Restart"}
        </button>
        <a
          href={active.url}
          target="_blank"
          rel="noreferrer noopener"
          style={{ ...mono, flexShrink: 0, color: tokens.accent, textDecoration: "none" }}
        >
          OPEN ↗
        </a>
      </div>

      <div style={{ position: "relative", minHeight: 0 }}>
        {loading && !failed && <div className="b-loading" />}

        {failed ? (
          <Centred>
            <Halo warn />
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "rgba(255,196,190,.95)" }}>
              The preview page could not be loaded.
            </p>
            <p
              style={{
                margin: "8px 0 16px",
                fontSize: 12.5,
                lineHeight: 1.6,
                color: tokens.textMuted,
              }}
            >
              The runtime may have stopped. Restarting it usually fixes this.
            </p>
            <button
              type="button"
              onClick={onRestart}
              disabled={restarting}
              style={{
                font: "inherit",
                fontSize: 12.5,
                cursor: restarting ? "default" : "pointer",
                padding: "7px 16px",
                borderRadius: 999,
                border: `1px solid ${tokens.border}`,
                background: "rgba(255,255,255,.04)",
                color: tokens.text,
              }}
            >
              {restarting ? "Restarting…" : "Restart preview"}
            </button>
          </Centred>
        ) : (
          <iframe
            ref={frame}
            className="b-frame"
            title="Live preview of the generated site"
            // The token is in the key, not the URL: changing the key remounts
            // the frame, which is a genuine reload. A cache-busting query
            // parameter would change what the runtime is asked for.
            key={`${active.url}::${refreshToken}`}
            src={active.url}
            // Belt and braces. The runtime already serves this from a separate
            // origin with a no-external-sources CSP; the sandbox means that
            // even if either of those were weakened, the content still cannot
            // script, navigate the top frame, or submit a form.
            sandbox=""
            referrerPolicy="no-referrer"
            onLoad={() => setView({ ...current, loading: false })}
            onError={() => setView({ ...current, loading: false, failed: true })}
          />
        )}
      </div>
    </>
  );
}
