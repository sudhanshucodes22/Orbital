"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/ui/AppShell";
import { Eyebrow, Panel } from "@/components/ui/Panel";
import { tokens } from "@/components/ui/tokens";

/** Error boundary for the project list.
 *
 * Shows that something failed and offers a retry, without echoing the
 * underlying message — a database error can carry schema details. The real
 * error is already on the server logs via the digest. */
export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[projects] render failed", error);
  }, [error]);

  return (
    <AppShell title="Projects">
      <Panel>
        <Eyebrow>Something went wrong</Eyebrow>
        <h2 style={{ margin: "14px 0 0", fontFamily: tokens.display, fontWeight: 500, fontSize: 22, letterSpacing: "-.02em" }}>
          Your projects could not be loaded.
        </h2>
        <p style={{ margin: "12px 0 0", fontSize: 14.5, lineHeight: 1.6, color: tokens.textMuted, maxWidth: 520 }}>
          This is usually a connection problem rather than anything wrong with
          your data. Nothing has been changed.
        </p>
        {error.digest && (
          <p style={{ margin: "12px 0 0", fontFamily: tokens.mono, fontSize: 11, color: tokens.textFaint }}>
            Reference: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 22,
            padding: "11px 20px",
            borderRadius: 999,
            border: `1px solid ${tokens.border}`,
            background: "rgba(255,255,255,.04)",
            color: tokens.text,
            fontFamily: tokens.body,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </Panel>
    </AppShell>
  );
}
