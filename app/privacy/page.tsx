import type { Metadata } from "next";
import Link from "next/link";
import { SpaceBackground } from "@/components/ui/SpaceBackground";
import { tokens } from "@/components/ui/tokens";

export const metadata: Metadata = {
  title: "Privacy Policy · Orbital",
  description: "How Orbital processes sketches, voice inputs, and project data with zero retention.",
};

export default function PrivacyPage() {
  return (
    <>
      <SpaceBackground glow="center" />
      
      {/* Navigation Header */}
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
          background: "linear-gradient(180deg, rgba(3,5,10,.85), transparent)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
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
              width: 22,
              height: 22,
              borderRadius: "50%",
              border: "1.5px solid rgba(160,225,255,.7)",
              boxShadow: "0 0 16px rgba(124,230,255,.5) inset",
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
                background: "#7ce6ff",
              }}
            />
          </span>
          <span>Orbital</span>
        </Link>

        <Link
          href="/"
          style={{
            fontSize: 13,
            color: "rgba(233,235,242,.75)",
            padding: "7px 16px",
            borderRadius: "999px",
            background: "rgba(255,255,255,.05)",
            border: "1px solid rgba(255,255,255,.12)",
            textDecoration: "none",
            backdropFilter: "blur(8px)",
          }}
          className="orb-card-hover"
        >
          ← Back to Home
        </Link>
      </header>

      {/* Content Body */}
      <main
        className="space-content"
        style={{
          minHeight: "100vh",
          padding: "120px 24px 80px",
          color: tokens.text,
          maxWidth: 820,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            padding: "40px 36px",
            borderRadius: 24,
            border: "1px solid rgba(255,255,255,.12)",
            background: "linear-gradient(165deg, rgba(16,24,40,.88), rgba(8,12,22,.95))",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 30px 90px rgba(0,0,0,.7)",
          }}
        >
          <div style={{ fontFamily: tokens.mono, fontSize: "11px", letterSpacing: ".16em", color: "#7ce6ff", textTransform: "uppercase" }}>
            LEGAL & SECURITY
          </div>
          <h1 style={{ fontFamily: tokens.display, fontSize: "36px", fontWeight: 600, letterSpacing: "-.03em", marginTop: 12, color: "#fff" }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: "14px", color: "rgba(233,235,242,.55)", marginTop: 6 }}>
            Last updated: August 2026 · Orbital Engineering
          </p>

          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 28, fontSize: "14.5px", lineHeight: 1.7, color: "rgba(233,235,242,.8)" }}>
            <section>
              <h2 style={{ fontFamily: tokens.display, fontSize: "20px", fontWeight: 600, color: "#f2f6ff", marginBottom: 8 }}>
                1. Zero-Retention Multimodal Ingestion
              </h2>
              <p>
                When you draw on paper, upload a screenshot, or speak a voice command, your inputs are processed in-memory solely to synthesize your website's virtual DOM. We do not use your proprietary sketches, audio streams, or business briefs to train public foundation models without your explicit consent.
              </p>
            </section>

            <section>
              <h2 style={{ fontFamily: tokens.display, fontSize: "20px", fontWeight: 600, color: "#f2f6ff", marginBottom: 8 }}>
                2. Project & Code Ownership
              </h2>
              <p>
                All generated TypeScript, React 19 components, Tailwind stylesheets, and media assets belong 100% to you. You are free to export, deploy, license, and commercialize your creations without runtime royalties or vendor lock-in.
              </p>
            </section>

            <section>
              <h2 style={{ fontFamily: tokens.display, fontSize: "20px", fontWeight: 600, color: "#f2f6ff", marginBottom: 8 }}>
                3. Authentication & Storage
              </h2>
              <p>
                User authentication is secured using signed HTTP-only session cookies and cryptographic password hashing (scrypt). When deployed with Supabase, all workspace data is strictly isolated with PostgreSQL Row Level Security (RLS).
              </p>
            </section>

            <section>
              <h2 style={{ fontFamily: tokens.display, fontSize: "20px", fontWeight: 600, color: "#f2f6ff", marginBottom: 8 }}>
                4. Cookies & Analytics
              </h2>
              <p>
                We do not track you across third-party websites. Session cookies are used strictly to maintain your workspace state and active project sessions.
              </p>
            </section>

            <section style={{ paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.08)" }}>
              <p style={{ fontSize: "13px", color: "rgba(233,235,242,.5)" }}>
                Questions regarding our privacy architecture? Contact us at <strong style={{ color: "#7ce6ff" }}>security@orbital.app</strong>
              </p>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
