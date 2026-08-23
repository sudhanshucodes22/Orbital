"use client";

import React, { useState } from "react";
import type { Vals } from "../types";

export function ChapterUnderstanding({ v }: { v: Vals }) {
  const [selectedScore, setSelectedScore] = useState<number | null>(null);

  const understandItems = [
    {
      n: "F06",
      t: "Intent Understanding",
      d: "Three boxes in a row is a question, not an answer. Orbital reasons whether you meant pricing tiers or feature grid, commits once, and keeps your project clean.",
      tag: "Autonomous Reasoning",
      metric: "99.4% Intent Match",
      benefit: "Zero repetitive prompt back-and-forth"
    },
    {
      n: "F07",
      t: "AI Design Mentor",
      d: "Continuous automated critique: typography rhythm, CTA hierarchy, whitespace density, and color contrast. Every suggestion explained in plain human language.",
      tag: "Heuristic Linter",
      metric: "Score 94 / 100",
      benefit: "Live WCAG AAA & Apple HIG compliance"
    },
    {
      n: "F09",
      t: "Component Intelligence",
      d: "Repeated UI patterns are automatically lifted into modular, typed React 19 components with clean prop interfaces and zero copy-paste code bloat.",
      tag: "AST Deduplication",
      metric: "8 Components · 0 Duplicates",
      benefit: "Pure modular DRY architecture"
    },
    {
      n: "F11",
      t: "User Journey & Flow Detection",
      d: "Login ➔ Dashboard ➔ Settings ➔ Checkout. Ingests full user journeys from sketches and generates functional Next.js App Router subpaths.",
      tag: "Topology Mapper",
      metric: "Multi-Route Inferred",
      benefit: "Builds apps, not just isolated landing pages"
    },
    {
      n: "F23",
      t: "AI Synthetic UX Simulator",
      d: "Thousands of synthetic user personas walk your site pre-launch to predict bounce rates, attention heatmaps, and dead-click bottlenecks.",
      tag: "Pre-Launch Simulation",
      metric: "31% Bounce Reduction",
      benefit: "Validates usability before spending on ads"
    },
    {
      n: "F24",
      t: "Accessibility & WCAG Engine",
      d: "Automated keyboard tab order, semantic landmarks, aria labels, color-blind simulation, and screen reader tests run on every keystroke.",
      tag: "Automated Compliance",
      metric: "WCAG AAA 14:1",
      benefit: "100% accessible to every user"
    },
    {
      n: "F25",
      t: "SEO & Social Graph Synthesis",
      d: "Generates dynamic Open Graph cards, Twitter metadata, JSON-LD structured schema markup, and sitemaps automatically during compilation.",
      tag: "Metadata Compiler",
      metric: "100 SEO Lighthouse",
      benefit: "Instant indexing on Google & social platforms"
    }
  ];

  return (
    <section className="r-section r-pad-lg" style={{ position: "relative", padding: "0 28px 130px" }}>
      <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "18px", marginBottom: "34px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "11px", letterSpacing: ".18em", color: "rgba(164,139,255,.9)", background: "rgba(164,139,255,.1)", padding: "4px 10px", borderRadius: "999px", border: "1px solid rgba(164,139,255,.3)" }}>
            {"CHAPTER 02 · UNDERSTANDING"}
          </span>
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(26px,3.2vw,40px)", fontWeight: "600", letterSpacing: "-.03em", color: "#f2f6ff" }}>
            {"Design Reasoning"}
          </span>
          <span style={{ flex: "1", height: "1px", background: "linear-gradient(90deg,rgba(255,255,255,.16),transparent)", minWidth: "40px" }} />
          <span style={{ fontSize: "13.5px", color: "rgba(233,235,242,.6)", maxWidth: "340px", lineHeight: "1.5" }}>
            {"Reads structure and intent behind every sketch. Never assumes blindly."}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,.9fr)", gap: "40px", alignItems: "start" }} className="r-2col">
          {/* Left: Enhanced Capabilities Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {understandItems.map((cu, i0) => (
              <div
                key={i0}
                style={{
                  padding: "20px 22px",
                  borderRadius: "16px",
                  border: "1px solid rgba(255,255,255,.1)",
                  background: "rgba(8,12,22,.8)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  display: "grid",
                  gridTemplateColumns: "52px 1fr",
                  gap: "16px",
                  boxShadow: "0 10px 30px rgba(0,0,0,.4)",
                  transition: "all .25s ease"
                }}
                className="orb-card-hover"
              >
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "11px", color: "#a48bff", fontWeight: "600", background: "rgba(164,139,255,.12)", padding: "3px 6px", borderRadius: "6px", border: "1px solid rgba(164,139,255,.25)" }}>
                    {cu.n}
                  </span>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                    <h4 style={{ margin: "0", fontFamily: "'Space Grotesk',sans-serif", fontSize: "18px", fontWeight: "600", letterSpacing: "-.02em", color: "#f3f6ff" }}>
                      {cu.t}
                    </h4>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "9.5px", color: "#7ce6ff", background: "rgba(124,230,255,.1)", padding: "2px 7px", borderRadius: "999px", border: "1px solid rgba(124,230,255,.25)" }}>
                      {cu.metric}
                    </span>
                  </div>

                  <div style={{ marginTop: "8px", fontSize: "13px", lineHeight: "1.6", color: "rgba(233,235,242,.65)" }}>
                    {cu.d}
                  </div>

                  <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,.06)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                    <span style={{ color: "rgba(164,139,255,.85)", fontFamily: "'IBM Plex Mono',monospace" }}>
                      ● {cu.tag}
                    </span>
                    <span style={{ color: "#4ade80" }}>
                      ✓ {cu.benefit}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Right: Live Interactive Design Report Panel */}
          <div style={{ position: "sticky", top: "120px", padding: "28px", borderRadius: "20px", border: "1px solid rgba(164,139,255,.3)", background: "linear-gradient(168deg,rgba(22,18,42,.92),rgba(8,10,18,.96))", backdropFilter: "blur(20px)", boxShadow: "0 30px 90px rgba(0,0,0,.65)" }} className="r-sticky">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10.5px", letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(233,235,242,.5)" }}>
                {"Design report · aurora.studio"}
              </div>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "9px", color: "#4ade80", background: "rgba(74,222,128,.12)", padding: "2px 7px", borderRadius: "4px" }}>
                LIVE AUDIT
              </span>
            </div>

            <div style={{ marginTop: "22px", display: "flex", alignItems: "flex-end", gap: "14px" }}>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "58px", fontWeight: "600", lineHeight: ".9", letterSpacing: "-.04em", color: "#fff" }}>
                {"94"}
              </span>
              <div style={{ paddingBottom: "6px" }}>
                <div style={{ fontSize: "13px", fontWeight: "500", color: "#a48bff" }}>
                  {"Design Quality Score"}
                </div>
                <div style={{ fontSize: "11px", color: "rgba(233,235,242,.5)", marginTop: "2px" }}>
                  {"+3 points since last voice patch"}
                </div>
              </div>
            </div>

            {/* Score Breakdowns */}
            <div style={{ marginTop: "26px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {v.scores.map((sc, i0) => (
                <div key={i0} style={{ cursor: "pointer" }} onClick={() => setSelectedScore(i0)}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", color: "rgba(233,235,242,.8)" }}>
                    <span style={{ fontWeight: "500" }}>{sc.t}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: "#7ce6ff", fontWeight: "600" }}>
                      {sc.v}
                    </span>
                  </div>
                  <div style={{ marginTop: "7px", height: "4px", borderRadius: "2px", background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: sc.w, background: "linear-gradient(90deg,#a48bff,#7ce6ff)", boxShadow: "0 0 8px rgba(124,230,255,.6)" }} />
                  </div>
                </div>
              ))}
            </div>

            {/* AI Suggestion Bubble */}
            <div style={{ marginTop: "26px", padding: "16px", borderRadius: "14px", border: "1px solid rgba(164,139,255,.35)", background: "rgba(164,139,255,.12)", fontSize: "12.5px", lineHeight: "1.6", color: "rgba(240,238,255,.9)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#a48bff", fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", marginBottom: "6px", fontWeight: "600" }}>
                <span>💡</span>
                <span>AI REASONING EXPLANATION</span>
              </div>
              {"“Your secondary CTA sits below AA at 3.1:1. Darkening it to "}
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: "#7ce6ff", fontWeight: "600" }}>
                {"#0B1522"}
              </span>
              {" fixes contrast without touching your brand palette.”"}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
