import Link from "next/link";
import type { ReactNode } from "react";
import { SpaceBackground } from "@/components/ui/SpaceBackground";
import { tokens } from "@/components/ui/tokens";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SpaceBackground glow="center" />
      
      {/* Top Navigation Bar with Logo in the Corner */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 32px",
          background: "linear-gradient(180deg, rgba(3,5,10,.8), transparent)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        {/* Brand Logo in Top-Left Corner */}
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            fontFamily: tokens.display,
            fontWeight: 600,
            fontSize: 18,
            letterSpacing: "-.02em",
            color: "#f2f6ff",
            textDecoration: "none",
          }}
        >
          <span
            style={{
              position: "relative",
              display: "block",
              width: 24,
              height: 24,
              borderRadius: "50%",
              border: "1.5px solid rgba(160,225,255,.7)",
              boxShadow:
                "0 0 18px rgba(124,230,255,.5) inset, 0 0 24px -4px rgba(124,230,255,.6)",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 8,
                height: 8,
                margin: "-4px 0 0 -4px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #bdf1ff, #7ce6ff)",
                boxShadow: "0 0 10px #7ce6ff",
              }}
            />
          </span>
          <span>Orbital</span>
          <span
            style={{
              fontFamily: tokens.mono,
              fontSize: "9.5px",
              color: "rgba(124,230,255,.85)",
              background: "rgba(124,230,255,.1)",
              padding: "2px 7px",
              borderRadius: "4px",
              border: "1px solid rgba(124,230,255,.25)",
              marginLeft: "2px",
              letterSpacing: ".06em",
            }}
          >
            v2026.8
          </span>
        </Link>

        {/* Back to Home Link in Top-Right Corner */}
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "rgba(233,235,242,.75)",
            padding: "7px 16px",
            borderRadius: "999px",
            background: "rgba(255,255,255,.05)",
            border: "1px solid rgba(255,255,255,.12)",
            textDecoration: "none",
            transition: "all .2s ease",
            backdropFilter: "blur(8px)",
          }}
          className="orb-card-hover"
        >
          <span style={{ fontSize: "12px" }}>←</span>
          <span>Back to Landing</span>
        </Link>
      </header>

      {/* Main Centered Auth Container */}
      <div
        className="space-content"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "100px 20px 60px",
          color: tokens.text,
        }}
      >
        <div style={{ width: "100%", maxWidth: 940 }}>
          <div className="o-enter" style={{ animationDelay: "50ms" }}>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
