"use client";

import Link from "next/link";
import { tokens } from "../ui/tokens";

/** The workspace's chrome.
 *
 * Compact on purpose. A builder's header is not where the work happens — it
 * says where you are, what state the project is in, and how to get out. Every
 * button here earns its place by being something you reach for *between*
 * turns, not during one.
 *
 * The mark is the same one the landing page and AppShell use, so crossing into
 * the workspace does not feel like arriving at a different product.
 */

const mono: React.CSSProperties = {
  fontFamily: tokens.mono,
  fontSize: 9.5,
  letterSpacing: ".1em",
  color: tokens.textFaint,
};

function IconButton({
  label,
  onClick,
  active,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        height: 30,
        padding: "0 10px",
        borderRadius: 8,
        border: `1px solid ${active ? tokens.borderAccent : tokens.borderSoft}`,
        background: active ? tokens.accentSoft : "transparent",
        color: active ? "rgba(196,236,255,.95)" : tokens.textMuted,
        cursor: "pointer",
        font: "inherit",
        fontSize: 11.5,
        transition: `border-color ${tokens.fast} ${tokens.ease}, color ${tokens.fast} ${tokens.ease}, background ${tokens.fast} ${tokens.ease}`,
      }}
    >
      {children}
    </button>
  );
}

export function BuilderHeader({
  projectId,
  projectName,
  busy,
  statusLabel,
  revisionLabel,
  onToggleFiles,
  onToggleChat,
  onOpenHistory,
  filesOpen,
  chatOpen,
}: {
  projectId: string;
  projectName: string;
  busy: boolean;
  /** The live generation state, or the project's own status when idle. */
  statusLabel: string;
  /** Which revision the workspace is showing. */
  revisionLabel: string;
  onToggleFiles: () => void;
  onToggleChat: () => void;
  onOpenHistory: () => void;
  filesOpen: boolean;
  chatOpen: boolean;
}) {
  return (
    <header className="b-header">
      {/* Out. First in the tab order because "how do I leave" should never
          require hunting. */}
      <Link
        href={`/projects/${projectId}`}
        aria-label="Back to this project"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          color: tokens.textMuted,
          textDecoration: "none",
          fontSize: 12.5,
          flexShrink: 0,
        }}
      >
        <span
          aria-hidden
          style={{
            position: "relative",
            display: "block",
            width: 16,
            height: 16,
            borderRadius: "50%",
            border: `1px solid ${tokens.borderAccent}`,
            background: "radial-gradient(circle at 32% 28%,rgba(124,230,255,.5),transparent 62%)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: "4.5px",
              borderRadius: "50%",
              background: tokens.accent,
              boxShadow: `0 0 9px ${tokens.accent}`,
            }}
          />
        </span>
        <span className="b-hide-sm">Projects</span>
      </Link>

      <span
        aria-hidden
        style={{ width: 1, height: 18, background: tokens.borderSoft, flexShrink: 0 }}
      />

      <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 10 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: tokens.display,
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "-.01em",
            color: tokens.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {projectName}
        </h1>
        <span className="b-hide-sm" style={mono}>
          {revisionLabel}
        </span>
      </div>

      <span style={{ flex: 1 }} />

      {/* Live state. `role="status"` so a generation finishing is announced
          rather than only visible. */}
      <div
        role="status"
        aria-live="polite"
        style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}
      >
        <span
          className={`o-dot${busy ? " o-dot--live" : ""}`}
          style={{
            background: busy ? tokens.violet : tokens.accent,
            color: busy ? tokens.violet : tokens.accent,
          }}
          aria-hidden
        />
        <span style={{ ...mono, color: busy ? "rgba(214,204,255,.95)" : tokens.textFaint }}>
          {statusLabel.toUpperCase()}
        </span>
      </div>

      <span
        aria-hidden
        className="b-hide-sm"
        style={{ width: 1, height: 18, background: tokens.borderSoft, flexShrink: 0 }}
      />

      <IconButton label="Files" onClick={onToggleFiles} active={filesOpen} className="b-drawer-toggle">
        Files
      </IconButton>

      <IconButton label="History and revisions" onClick={onOpenHistory}>
        History
      </IconButton>

      <IconButton label="Orbital" onClick={onToggleChat} active={chatOpen} className="b-chat-toggle">
        Orbital
      </IconButton>
    </header>
  );
}
