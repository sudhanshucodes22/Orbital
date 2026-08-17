import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "./Button";
import { SpaceBackground } from "./SpaceBackground";
import { tokens } from "./tokens";

/** Chrome for the signed-in product area.
 *
 * Intentionally not the landing page's fixed glass bar with its three canvas
 * layers: an application shell needs to be quiet and cheap, and the WebGL
 * globe has no business running behind a project list. Same palette, same
 * type, same mark — different job.
 *
 * The mark is the one piece deliberately shared with the landing page, so
 * that crossing from marketing into the product does not feel like arriving
 * at a different company's dashboard.
 */
export function AppShell({
  title,
  children,
  signedIn = false,
  /** Rendered at the right of the breadcrumb row — a status pill, usually. */
  aside,
}: {
  title: string;
  children: ReactNode;
  signedIn?: boolean;
  aside?: ReactNode;
}) {
  return (
    <>
      <SpaceBackground />
      <div className="space-content" style={{ minHeight: "100vh", color: tokens.text }}>
        <header
          className="o-appbar"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 13,
            padding: "15px 24px",
            borderBottom: `1px solid ${tokens.borderSoft}`,
            /* The bar sits over the starfield too, so it needs to be a surface
             * rather than a line floating in space. */
            background: "rgba(6,8,14,.72)",
            backdropFilter: "blur(20px) saturate(1.3)",
            WebkitBackdropFilter: "blur(20px) saturate(1.3)",
            position: "sticky",
            top: 0,
            zIndex: 5,
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

          <span style={{ color: "rgba(233,235,242,.22)" }}>/</span>
          <span
            style={{
              fontSize: 14,
              color: tokens.textMuted,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </span>

          {aside}

          {signedIn && (
            <>
              <span style={{ flex: 1 }} />
              {/* A plain form post, so signing out works without client JS. */}
              <form action={signOutAction}>
                <Button type="submit" variant="ghost" size="sm">
                  Sign out
                </Button>
              </form>
            </>
          )}
        </header>

        <main style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 24px 96px" }}>
          {children}
        </main>
      </div>
    </>
  );
}
