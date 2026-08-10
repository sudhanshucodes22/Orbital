import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { tokens } from "./tokens";

/** Chrome for the signed-in product area.
 *
 * Intentionally not the landing page's fixed glass bar with its three canvas
 * layers: an application shell needs to be quiet and cheap, and the WebGL
 * globe has no business running behind a project list. Same palette, same
 * type, different job.
 */
export function AppShell({
  title,
  children,
  signedIn = false,
}: {
  title: string;
  children: ReactNode;
  signedIn?: boolean;
}) {
  return (
    <div style={{ minHeight: "100vh", background: tokens.bg, color: tokens.text }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 24px",
          borderBottom: `1px solid ${tokens.borderSoft}`,
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            fontFamily: tokens.display,
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: "-.01em",
          }}
        >
          <span
            style={{
              position: "relative",
              display: "block",
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: "1px solid rgba(160,225,255,.65)",
              boxShadow: "0 0 14px rgba(124,230,255,.35) inset",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 6,
                height: 6,
                margin: "-3px 0 0 -3px",
                borderRadius: "50%",
                background: "#bdf1ff",
              }}
            />
          </span>
          Orbital
        </Link>
        <span style={{ color: tokens.textFaint }}>/</span>
        <span style={{ fontSize: 14, color: tokens.textMuted }}>{title}</span>
        {signedIn && (
          <>
            <span style={{ flex: 1 }} />
            {/* A plain form post, so signing out works without client JS. */}
            <form action={signOutAction}>
              <button
                type="submit"
                style={{
                  padding: "7px 14px",
                  borderRadius: 999,
                  border: `1px solid ${tokens.borderSoft}`,
                  background: "transparent",
                  color: tokens.textMuted,
                  fontFamily: tokens.body,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Sign out
              </button>
            </form>
          </>
        )}
      </header>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 24px 80px" }}>
        {children}
      </main>
    </div>
  );
}
