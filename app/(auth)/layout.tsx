import Link from "next/link";
import type { ReactNode } from "react";
import { SpaceBackground } from "@/components/ui/SpaceBackground";
import { tokens } from "@/components/ui/tokens";

/** Auth screens are a centred column — no product chrome, and none of the
 *  landing page's canvas layers.
 *
 *  Wide enough for a form and the column beside it. The pages own that split
 *  (`.r-auth`) rather than the layout, because the not-configured screens
 *  render a single panel and should not be stretched across the same width.
 *
 *  The mark sits in the layout rather than in each page: signing in is the
 *  first moment after leaving the landing page, and arriving at an unbranded
 *  form is exactly where a product stops feeling like one product.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SpaceBackground glow="center" />
      <div
        className="space-content"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "40px 20px 56px",
          // No background colour: body already paints the deep-space base, and
          // an opaque layer here would hide the environment behind it.
          color: tokens.text,
        }}
      >
        <div style={{ width: "100%", maxWidth: 920 }}>
          <div
            className="o-enter"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 26,
            }}
          >
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 12,
                fontFamily: tokens.display,
                fontWeight: 600,
                fontSize: 17,
                letterSpacing: "-.015em",
              }}
            >
              <span
                style={{
                  position: "relative",
                  display: "block",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: "1px solid rgba(160,225,255,.65)",
                  boxShadow:
                    "0 0 18px rgba(124,230,255,.4) inset, 0 0 26px -6px rgba(124,230,255,.5)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: 7,
                    height: 7,
                    margin: "-3.5px 0 0 -3.5px",
                    borderRadius: "50%",
                    background: "#bdf1ff",
                  }}
                />
              </span>
              Orbital
            </Link>
          </div>

          <div className="o-enter" style={{ animationDelay: "70ms" }}>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
