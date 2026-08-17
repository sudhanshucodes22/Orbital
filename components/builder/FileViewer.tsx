"use client";

import { languageOf } from "@/lib/domain";
import { tokens } from "../ui/tokens";

/** A file's contents, read-only.
 *
 * Deliberately not an editor. This milestone's premise is that Orbital writes
 * the files and the person describes what they want — shipping a text area
 * that looks editable but discards what you type would be worse than showing
 * nothing. A real editor means conflict handling against a generation in
 * flight, which is its own piece of work.
 *
 * So: a viewer that is honest about being one, with line numbers because
 * "which line" is the question you ask when reading generated code.
 */

const mono: React.CSSProperties = {
  fontFamily: tokens.mono,
  fontSize: 9.5,
  letterSpacing: ".08em",
  color: tokens.textFaint,
};

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileViewer({
  path,
  content,
  byteSize,
  kind,
  truncated,
  loading,
  error,
  onClose,
}: {
  path: string;
  content: string | null;
  byteSize: number;
  kind: string;
  truncated: boolean;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const lines = content ? content.split("\n") : [];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        gridTemplateRows: "auto minmax(0,1fr)",
        background: "#05060b",
        zIndex: 2,
      }}
    >
      <div className="b-panel-head">
        <span
          style={{
            fontFamily: tokens.mono,
            fontSize: 11.5,
            color: tokens.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            direction: "rtl",
            textAlign: "left",
          }}
          title={path}
        >
          {/* rtl so a long path truncates at the *front*, keeping the file
              name — the part you are looking for — visible. */}
          {path}
        </span>
        <span style={{ flex: 1 }} />
        <span style={mono}>{languageOf(path).toUpperCase()}</span>
        <span style={mono}>{bytes(byteSize)}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close file and return to preview"
          style={{
            border: `1px solid ${tokens.borderSoft}`,
            background: "transparent",
            color: tokens.textMuted,
            borderRadius: 7,
            cursor: "pointer",
            padding: "3px 9px",
            font: "inherit",
            fontSize: 11,
          }}
        >
          Close
        </button>
      </div>

      <div className="b-scroll" style={{ position: "relative" }}>
        {loading && <div className="b-loading" />}

        {error && (
          <p
            role="alert"
            style={{ margin: 0, padding: "18px 16px", fontSize: 13, color: "rgba(255,196,190,.95)" }}
          >
            {error}
          </p>
        )}

        {!loading && !error && content === null && (
          <p style={{ margin: 0, padding: "18px 16px", fontSize: 13, color: tokens.textFaint }}>
            {kind === "binary"
              ? "This is a binary file. Its contents are stored, but there is nothing useful to show as text."
              : "This file is empty."}
          </p>
        )}

        {!loading && !error && content !== null && (
          <>
            <pre
              style={{
                margin: 0,
                padding: "14px 16px 14px 0",
                fontFamily: tokens.mono,
                fontSize: 12,
                lineHeight: 1.65,
                color: "rgba(233,235,242,.86)",
                whiteSpace: "pre",
                tabSize: 2,
              }}
            >
              <code>
                {lines.map((line, i) => (
                  <div key={i} style={{ display: "flex" }}>
                    <span
                      aria-hidden
                      style={{
                        flexShrink: 0,
                        width: 46,
                        paddingRight: 14,
                        textAlign: "right",
                        color: "rgba(233,235,242,.22)",
                        userSelect: "none",
                      }}
                    >
                      {i + 1}
                    </span>
                    <span style={{ minWidth: 0 }}>{line || " "}</span>
                  </div>
                ))}
              </code>
            </pre>

            {truncated && (
              <p
                style={{
                  margin: 0,
                  padding: "10px 16px 20px 62px",
                  fontSize: 12,
                  color: tokens.textFaint,
                }}
              >
                Showing the first part of this file only — it is too large to
                display in full here.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
