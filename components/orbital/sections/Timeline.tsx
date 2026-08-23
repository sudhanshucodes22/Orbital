"use client";

import React, { useState } from "react";
import type { Vals } from "../types";

export function Timeline({ v }: { v: Vals }) {
  const [activeEra, setActiveEra] = useState<number>(2); // Default to 2026 (Orbital Era)

  const eras = [
    {
      y: "2024",
      t: "Prompt-based AI",
      tag: "THE TEXT BOX ERA",
      d: "You describe, it guesses, you describe again. The interface is a text box and the skill is phrasing. Every regeneration wipes your manual edits.",
      badgeColor: "#94a3b8",
      dot: "rgba(233,235,242,.4)",
      visual: (
        <div style={{ width: "100%", height: "100%", padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", color: "rgba(233,235,242,.5)" }}>2024 · THE PROMPT LOOP</span>
            <span style={{ fontSize: "10px", color: "#f87171", background: "rgba(248,113,113,.12)", padding: "2px 6px", borderRadius: "4px" }}>HIGH FRICTION</span>
          </div>

          {/* Clunky Chatbox Mockup */}
          <div style={{ background: "rgba(0,0,0,.5)", border: "1px solid rgba(255,255,255,.1)", borderRadius: "12px", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "11.5px", color: "rgba(233,235,242,.75)", fontStyle: "italic", background: "rgba(255,255,255,.05)", padding: "8px 10px", borderRadius: "6px" }}>
              "Create a landing page for an architecture studio in Copenhagen with glass cards..."
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#f87171", fontSize: "11px", fontFamily: "'IBM Plex Mono',monospace" }}>
              <span>⚠️</span>
              <span>Hallucinated 5 unwanted sections. Regenerating from scratch...</span>
            </div>
          </div>

          {/* Pain Points */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div style={{ padding: "8px 10px", borderRadius: "8px", background: "rgba(248,113,113,.08)", border: "1px solid rgba(248,113,113,.2)", fontSize: "10.5px", color: "#fca5a5" }}>
              ❌ 6 min phrasing prompt
            </div>
            <div style={{ padding: "8px 10px", borderRadius: "8px", background: "rgba(248,113,113,.08)", border: "1px solid rgba(248,113,113,.2)", fontSize: "10.5px", color: "#fca5a5" }}>
              ❌ Edits lost on retry
            </div>
          </div>
        </div>
      )
    },
    {
      y: "2025",
      t: "Visual AI",
      tag: "FLAT IMAGE GENERATION",
      d: "Images go in and layouts come out. Structure without meaning — shapes recognised, intent missed. Produces uneditable flat code.",
      badgeColor: "#fbbf24",
      dot: "rgba(251,191,36,.7)",
      visual: (
        <div style={{ width: "100%", height: "100%", padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", color: "rgba(233,235,242,.5)" }}>2025 · SCREENSHOT CLONING</span>
            <span style={{ fontSize: "10px", color: "#facc15", background: "rgba(250,204,21,.12)", padding: "2px 6px", borderRadius: "4px" }}>FLAT STRUCTURE</span>
          </div>

          {/* Image to Raw Layout Mockup */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "10px", alignItems: "center", background: "rgba(0,0,0,.4)", padding: "14px", borderRadius: "12px", border: "1px solid rgba(255,255,255,.1)" }}>
            <div style={{ height: "70px", borderRadius: "6px", background: "repeating-linear-gradient(128deg,rgba(255,255,255,.08) 0 6px,rgba(255,255,255,.02) 6px 12px)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontFamily: "'IBM Plex Mono',monospace", color: "#999" }}>
              RAW PNG
            </div>
            <span style={{ color: "#facc15", fontSize: "16px" }}>➔</span>
            <div style={{ height: "70px", borderRadius: "6px", border: "1px dashed rgba(250,204,21,.5)", background: "rgba(250,204,21,.06)", padding: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ width: "80%", height: "5px", background: "rgba(255,255,255,.3)", borderRadius: "2px" }} />
              <span style={{ width: "50%", height: "4px", background: "rgba(255,255,255,.2)", borderRadius: "2px" }} />
              <span style={{ flex: 1, background: "rgba(255,255,255,.05)", borderRadius: "3px" }} />
            </div>
          </div>

          <div style={{ padding: "8px 10px", borderRadius: "8px", background: "rgba(250,204,21,.08)", border: "1px solid rgba(250,204,21,.25)", fontSize: "11px", color: "#fde047", textAlign: "center" }}>
            ⚠️ Recognised shapes but missed design semantics & components
          </div>
        </div>
      )
    },
    {
      y: "2026",
      t: "Multimodal AI (Orbital)",
      tag: "THE ORBITAL STANDARD",
      d: "Draw, show, speak and scribble — together, in one session, with persistent memory. Zero prompt engineering. Live AST patched in real-time.",
      badgeColor: "#7ce6ff",
      dot: "#7ce6ff",
      visual: (
        <div style={{ width: "100%", height: "100%", padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "radial-gradient(circle at 50% 30%, rgba(124,230,255,.15), transparent 70%)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", color: "#7ce6ff", fontWeight: "600" }}>2026 · MULTIMODAL ORBITAL</span>
            <span style={{ fontSize: "10px", color: "#4ade80", background: "rgba(74,222,128,.15)", padding: "2px 8px", borderRadius: "4px", border: "1px solid rgba(74,222,128,.3)" }}>LIVE ACTIVE</span>
          </div>

          {/* 3 Streams Converging into Real Website */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
            <div style={{ padding: "10px 8px", borderRadius: "8px", background: "rgba(124,230,255,.1)", border: "1px solid rgba(124,230,255,.3)", textAlign: "center" }}>
              <div style={{ fontSize: "14px" }}>✏️</div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8.5px", color: "#7ce6ff", marginTop: "3px" }}>SKETCH</div>
            </div>
            <div style={{ padding: "10px 8px", borderRadius: "8px", background: "rgba(164,139,255,.1)", border: "1px solid rgba(164,139,255,.3)", textAlign: "center" }}>
              <div style={{ fontSize: "14px" }}>📷</div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8.5px", color: "#c9a7ff", marginTop: "3px" }}>CAMERA</div>
            </div>
            <div style={{ padding: "10px 8px", borderRadius: "8px", background: "rgba(56,189,248,.1)", border: "1px solid rgba(56,189,248,.3)", textAlign: "center" }}>
              <div style={{ fontSize: "14px" }}>🎙️</div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8.5px", color: "#7dd3fc", marginTop: "3px" }}>VOICE</div>
            </div>
          </div>

          {/* Real Live Output Box */}
          <div style={{ padding: "12px", borderRadius: "10px", background: "linear-gradient(165deg,#0e182c,#050811)", border: "1px solid rgba(124,230,255,.5)", boxShadow: "0 0 20px rgba(124,230,255,.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "12px", fontWeight: "600", color: "#fff" }}>Aurora Architecture</span>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8.5px", color: "#4ade80" }}>14ms Paint</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              <div style={{ padding: "6px", borderRadius: "6px", background: "rgba(255,255,255,.05)", fontSize: "9px", color: "rgba(233,235,242,.7)" }}>✓ 0 Regenerations</div>
              <div style={{ padding: "6px", borderRadius: "6px", background: "rgba(255,255,255,.05)", fontSize: "9px", color: "rgba(233,235,242,.7)" }}>✓ React 19 Tree</div>
            </div>
          </div>
        </div>
      )
    },
    {
      y: "Next",
      t: "Intent-driven software",
      tag: "AUTONOMOUS SYNTHESIS",
      d: "You describe the outcome. It builds the product, argues with you about design rhythm, runs simulated user personas, and deploys globally.",
      badgeColor: "#a48bff",
      dot: "#a48bff",
      visual: (
        <div style={{ width: "100%", height: "100%", padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "radial-gradient(circle at 50% 30%, rgba(164,139,255,.15), transparent 70%)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", color: "#a48bff", fontWeight: "600" }}>FUTURE · INTENT-DRIVEN</span>
            <span style={{ fontSize: "10px", color: "#c084fc", background: "rgba(192,132,252,.15)", padding: "2px 8px", borderRadius: "4px", border: "1px solid rgba(192,132,252,.3)" }}>AUTONOMOUS</span>
          </div>

          {/* Autonomous Neural Node Map */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
            {[
              { title: "Synthetic UX", val: "31% Bounce ↓" },
              { title: "Global CDN", val: "24 Edge Nodes" },
              { title: "Lighthouse", val: "100/100 All" }
            ].map((node, i) => (
              <div key={i} style={{ padding: "10px 8px", borderRadius: "8px", background: "rgba(164,139,255,.1)", border: "1px solid rgba(164,139,255,.3)", textAlign: "center" }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "10px", fontWeight: "600", color: "#f3f6ff" }}>{node.title}</div>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8.5px", color: "#4ade80", marginTop: "2px" }}>{node.val}</div>
              </div>
            ))}
          </div>

          <div style={{ padding: "10px 14px", borderRadius: "10px", background: "rgba(164,139,255,.1)", border: "1px solid rgba(164,139,255,.35)", fontSize: "11px", color: "#e8e5ff", textAlign: "center" }}>
            🚀 Outcome committed: Full global multi-tenant product with live user testing
          </div>
        </div>
      )
    }
  ];

  return (
    <section className="r-section r-pad-lg" style={{ position: "relative", padding: "0 28px 130px" }}>
      <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
        
        {/* Header */}
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10.5px", letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(124,230,255,.85)" }}>
          {"The future of website creation"}
        </div>
        <h2 style={{ margin: "16px 0 46px", fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "clamp(28px,3.6vw,46px)", letterSpacing: "-.03em", color: "#f2f6ff" }}>
          {"Prompting was a phase."}
        </h2>

        {/* 2-Column Layout: Left Timeline Milestones & Right Visual Graphic Stage */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.05fr)", gap: "48px", alignItems: "center" }} className="r-2col">
          
          {/* Left: Interactive Timeline Milestones */}
          <div style={{ position: "relative", paddingLeft: "26px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ position: "absolute", left: "5px", top: "14px", bottom: "24px", width: "2px", background: "linear-gradient(180deg,rgba(255,255,255,.1),rgba(124,230,255,.8) 60%,rgba(164,139,255,.8))" }} />
            
            {eras.map((er, idx) => {
              const isSelected = activeEra === idx;
              return (
                <div
                  key={er.y}
                  onClick={() => setActiveEra(idx)}
                  style={{
                    position: "relative",
                    padding: "18px 20px",
                    borderRadius: "16px",
                    border: isSelected ? `1px solid ${er.badgeColor}` : "1px solid rgba(255,255,255,.06)",
                    background: isSelected ? "linear-gradient(160deg,rgba(16,24,42,.85),rgba(8,12,22,.92))" : "transparent",
                    backdropFilter: isSelected ? "blur(14px)" : "none",
                    boxShadow: isSelected ? `0 10px 30px rgba(0,0,0,.5), 0 0 20px ${er.badgeColor}22` : "none",
                    cursor: "pointer",
                    transition: "all .3s ease",
                    transform: isSelected ? "translateX(4px)" : "none"
                  }}
                  className="orb-card-hover"
                >
                  <span
                    style={{
                      position: "absolute",
                      left: "-27px",
                      top: "24px",
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      background: er.dot,
                      boxShadow: isSelected ? `0 0 12px ${er.dot}, 0 0 0 4px rgba(3,4,8,1)` : "0 0 0 4px rgba(3,4,8,1)",
                      transition: "all .3s ease"
                    }}
                  />

                  <div style={{ display: "grid", gridTemplateColumns: "85px minmax(0,1fr)", gap: "16px", alignItems: "baseline" }}>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "24px", fontWeight: "700", letterSpacing: "-.03em", color: isSelected ? "#fff" : "rgba(233,235,242,.45)" }}>
                      {er.y}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "18px", fontWeight: "600", letterSpacing: "-.02em", color: isSelected ? "#f3f6ff" : "rgba(233,235,242,.7)" }}>
                          {er.t}
                        </span>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8.5px", color: er.badgeColor, background: "rgba(255,255,255,.05)", padding: "1px 5px", borderRadius: "4px" }}>
                          {er.tag}
                        </span>
                      </div>
                      <div style={{ marginTop: "6px", fontSize: "12.5px", lineHeight: "1.55", color: isSelected ? "rgba(233,235,242,.75)" : "rgba(233,235,242,.45)" }}>
                        {er.d}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Explainable Graphic Illustration Stage */}
          <div style={{ position: "sticky", top: "120px" }} className="r-sticky">
            <div style={{ borderRadius: "24px", border: `1px solid ${eras[activeEra].badgeColor}66`, background: "linear-gradient(168deg,rgba(16,22,38,.92),rgba(6,9,16,.96))", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "0 40px 120px rgba(0,0,0,.7)", overflow: "hidden", minHeight: "360px", display: "flex", flexDirection: "column", transition: "all .4s ease" }}>
              
              {/* Stage Top Bar */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)", fontFamily: "'IBM Plex Mono',monospace", fontSize: "10.5px", letterSpacing: ".12em", textTransform: "uppercase" }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: eras[activeEra].badgeColor, boxShadow: `0 0 8px ${eras[activeEra].badgeColor}` }} />
                <span style={{ color: "#f2f6ff", fontWeight: "600" }}>{eras[activeEra].y} · {eras[activeEra].t}</span>
                <span style={{ flex: 1 }} />
                <span style={{ color: eras[activeEra].badgeColor }}>EXPLAINABLE GRAPHIC</span>
              </div>

              {/* Stage Content Illustration */}
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {eras[activeEra].visual}
              </div>

            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
