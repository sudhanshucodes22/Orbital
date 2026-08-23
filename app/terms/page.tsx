import type { Metadata } from "next";
import Link from "next/link";
import { SpaceBackground } from "@/components/ui/SpaceBackground";
import { tokens } from "@/components/ui/tokens";

export const metadata: Metadata = {
  title: "Terms of Service · Orbital",
  description: "Terms and conditions for building, exporting, and deploying websites with Orbital.",
};

export default function TermsPage() {
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
          <div style={{ fontFamily: tokens.mono, fontSize: "11px", letterSpacing: ".16em", color: "#a48bff", textTransform: "uppercase" }}>
            TERMS & AGREEMENTS
          </div>
          <h1 style={{ fontFamily: tokens.display, fontSize: "36px", fontWeight: 600, letterSpacing: "-.03em", marginTop: 12, color: "#fff" }}>
            Terms of Service
          </h1>
          <p style={{ fontSize: "14px", color: "rgba(233,235,242,.55)", marginTop: 6 }}>
            Last updated: August 2026 · Orbital Engineering
          </p>

          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 28, fontSize: "14.5px", lineHeight: 1.7, color: "rgba(233,235,242,.8)" }}>
            <section>
              <h2 style={{ fontFamily: tokens.display, fontSize: "20px", fontWeight: 600, color: "#f2f6ff", marginBottom: 8 }}>
                1. Service Overview
              </h2>
              <p>
                Orbital provides an intelligent multimodal workspace that compiles visual sketches, voice commands, and design inputs into production-ready web applications, responsive codebases, and global edge deployments.
              </p>
            </section>

            <section>
              <h2 style={{ fontFamily: tokens.display, fontSize: "20px", fontWeight: 600, color: "#f2f6ff", marginBottom: 8 }}>
                2. Full Intellectual Property Rights
              </h2>
              <p>
                You retain complete, unrestricted ownership of all source code, design systems, assets, and applications generated through Orbital. Orbital claims zero intellectual property rights over software built using the platform.
              </p>
            </section>

            <section>
              <h2 style={{ fontFamily: tokens.display, fontSize: "20px", fontWeight: 600, color: "#f2f6ff", marginBottom: 8 }}>
                3. Acceptable Use
              </h2>
              <p>
                You agree not to use Orbital to synthesize malicious software, phishing interfaces, deceptive websites, or any content that violates applicable regional or international laws.
              </p>
            </section>

            <section>
              <h2 style={{ fontFamily: tokens.display, fontSize: "20px", fontWeight: 600, color: "#f2f6ff", marginBottom: 8 }}>
                4. Service Availability & SLA
              </h2>
              <p>
                While in public orbit release, the service is provided with standard 99.9% uptime targets. Enterprise accounts receive customized SLAs, dedicated inference capacity, and private VPC deployment options.
              </p>
            </section>

            <section style={{ paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.08)" }}>
              <p style={{ fontSize: "13px", color: "rgba(233,235,242,.5)" }}>
                Questions regarding our terms? Contact us at <strong style={{ color: "#a48bff" }}>legal@orbital.app</strong>
              </p>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
