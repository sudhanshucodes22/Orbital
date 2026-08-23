"use client";

import React, { useState } from "react";
import type { Vals } from "../types";

export function ChapterInput({ v }: { v: Vals }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const capabilities = [
    {
      n: "F01",
      k: "sketch",
      t: "Sketch to website",
      d: "Draw on paper or a napkin. Get clean live code.",
      visual: (
        <div style={{ width: "100%", height: "150px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* Backing glow */}
          <div style={{ position: "absolute", width: "120px", height: "120px", borderRadius: "50%", background: "radial-gradient(circle, rgba(124,230,255,.25), transparent 70%)" }} />
          
          {/* Napkin / Paper Sketch */}
          <div style={{ position: "relative", width: "140px", height: "100px", borderRadius: "8px", background: "linear-gradient(145deg,#f5f0e6,#dfd7c5)", transform: "rotate(-4deg)", boxShadow: "0 16px 36px rgba(0,0,0,.5)", padding: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {/* Hand-drawn scribble look */}
            <div style={{ height: "12px", border: "2px solid #3c3d42", borderRadius: "4px", background: "rgba(60,61,66,.1)" }} />
            <div style={{ height: "34px", border: "2px solid #3c3d42", borderRadius: "6px", background: "rgba(60,61,66,.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ width: "40px", height: "3px", background: "#3c3d42", borderRadius: "2px" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px", height: "18px" }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ border: "1.5px solid #3c3d42", borderRadius: "3px" }} />
              ))}
            </div>
            {/* Glowing magic corner */}
            <div style={{ position: "absolute", bottom: "-6px", right: "-6px", width: "24px", height: "24px", borderRadius: "50%", background: "linear-gradient(135deg,#7ce6ff,#a48bff)", boxShadow: "0 0 16px #7ce6ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px" }}>
              ✨
            </div>
          </div>
        </div>
      )
    },
    {
      n: "F02",
      k: "camera",
      t: "Live camera mode",
      d: "Point your phone. The build updates as the pen moves.",
      visual: (
        <div style={{ width: "100%", height: "150px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* Phone Frame */}
          <div style={{ width: "110px", height: "125px", borderRadius: "16px", border: "2px solid rgba(124,230,255,.6)", background: "linear-gradient(180deg,#0a1122,#03060e)", boxShadow: "0 20px 40px rgba(0,0,0,.6), 0 0 20px rgba(124,230,255,.2)", position: "relative", overflow: "hidden", padding: "8px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* Phone Notch */}
            <div style={{ width: "30px", height: "4px", borderRadius: "999px", background: "rgba(255,255,255,.3)", marginBottom: "8px" }} />
            
            {/* Camera Viewfinder & Laser Scan */}
            <div style={{ flex: 1, width: "100%", borderRadius: "8px", border: "1px dashed rgba(124,230,255,.5)", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ position: "absolute", left: 0, right: 0, height: "40%", background: "linear-gradient(180deg,transparent,rgba(124,230,255,.35))", borderBottom: "2px solid #7ce6ff", animation: "scanY 2.2s ease-in-out infinite" }} />
              <div style={{ width: "20px", height: "20px", borderRadius: "50%", border: "2px solid #7ce6ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#7ce6ff", boxShadow: "0 0 8px #7ce6ff" }} />
              </div>
            </div>
            <div style={{ marginTop: "4px", fontFamily: "'IBM Plex Mono',monospace", fontSize: "7.5px", color: "#7ce6ff" }}>30 FPS · 4K</div>
          </div>
        </div>
      )
    },
    {
      n: "F03",
      k: "voice",
      t: "Voice editing",
      d: "Say the change out loud. Lands on the live tree.",
      visual: (
        <div style={{ width: "100%", height: "150px", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          {/* Glowing 3D Voice Orb */}
          <div style={{ position: "relative", width: "56px", height: "56px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
            <div style={{ position: "absolute", inset: "-10px", borderRadius: "50%", background: "radial-gradient(circle, rgba(124,230,255,.4), transparent 70%)", animation: "pulseRing 2s infinite" }} />
            <div style={{ position: "absolute", inset: "-4px", borderRadius: "50%", background: "radial-gradient(circle, rgba(164,139,255,.5), transparent 70%)", animation: "pulseRing 2s infinite 0.5s" }} />
            <div style={{ position: "relative", width: "44px", height: "44px", borderRadius: "50%", background: "linear-gradient(135deg,#7ce6ff,#a48bff,#f472b6)", boxShadow: "0 0 24px rgba(124,230,255,.9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>
              🎙️
            </div>
          </div>

          {/* Equalizer Frequency Waves */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "24px" }}>
            {[10, 20, 14, 24, 18, 22, 12, 18].map((h, i) => (
              <span key={i} style={{ width: "3px", height: `${h}px`, borderRadius: "2px", background: i % 2 === 0 ? "#7ce6ff" : "#a48bff", animation: `bar 0.8s ease-in-out infinite ${i * 0.08}s` }} />
            ))}
          </div>
        </div>
      )
    },
    {
      n: "F04",
      k: "text",
      t: "Text editing",
      d: "Sometimes typing is faster. Voice and text share context.",
      visual: (
        <div style={{ width: "100%", height: "150px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* Glass Command Bubble */}
          <div style={{ width: "150px", padding: "12px 14px", borderRadius: "12px", border: "1px solid rgba(124,230,255,.4)", background: "linear-gradient(165deg,rgba(16,28,48,.9),rgba(8,12,22,.95))", boxShadow: "0 16px 36px rgba(0,0,0,.6), 0 0 16px rgba(124,230,255,.15)", display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#7ce6ff" }} />
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8.5px", color: "rgba(124,230,255,.8)" }}>COMMAND BAR</span>
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", color: "#f2f6ff", display: "flex", alignItems: "center" }}>
              <span>tighten footer</span>
              <span style={{ display: "inline-block", width: "2px", height: "12px", background: "#7ce6ff", marginLeft: "2px", animation: "pulseRing 1s infinite" }} />
            </div>
          </div>
        </div>
      )
    },
    {
      n: "F05",
      k: "handwriting",
      t: "Handwriting",
      d: "Margin notes become palette, radius and density rules.",
      visual: (
        <div style={{ width: "100%", height: "150px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* Handwritten Sticky Note */}
          <div style={{ width: "135px", height: "100px", borderRadius: "10px", background: "linear-gradient(145deg,#161e32,#0e1322)", border: "1px solid rgba(164,139,255,.4)", boxShadow: "0 16px 36px rgba(0,0,0,.5)", padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "3px", transform: "rotate(3deg)" }}>
            <span style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: "16px", color: "#7ce6ff", lineHeight: "1.2" }}>
              glass effect
            </span>
            <span style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: "16px", color: "#c9a7ff", lineHeight: "1.2" }}>
              rounded cards
            </span>
            <span style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: "16px", color: "#93c5fd", lineHeight: "1.2" }}>
              blue glow ➔
            </span>
          </div>
        </div>
      )
    },
    {
      n: "F17",
      k: "screenshot",
      t: "Screenshot to site",
      d: "Any screenshot, rebuilt as clean responsive code.",
      visual: (
        <div style={{ width: "100%", height: "150px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* Split Transformation Cards */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Raw Image */}
            <div style={{ width: "56px", height: "74px", borderRadius: "8px", background: "repeating-linear-gradient(128deg,rgba(255,255,255,.09) 0 7px,rgba(255,255,255,.02) 7px 14px)", border: "1px solid rgba(255,255,255,.15)", boxShadow: "0 10px 24px rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end", padding: "6px" }}>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "7px", color: "rgba(255,255,255,.5)" }}>PNG</span>
            </div>
            <span style={{ color: "#7ce6ff", fontSize: "16px" }}>➔</span>
            {/* Reconstructed Code UI */}
            <div style={{ width: "70px", height: "82px", borderRadius: "8px", background: "linear-gradient(165deg,#101b2e,#070c16)", border: "1.5px solid rgba(124,230,255,.6)", boxShadow: "0 12px 30px rgba(0,0,0,.6), 0 0 16px rgba(124,230,255,.25)", padding: "7px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ width: "80%", height: "6px", background: "linear-gradient(90deg,#7ce6ff,#a48bff)", borderRadius: "2px" }} />
              <span style={{ width: "50%", height: "4px", background: "rgba(255,255,255,.3)", borderRadius: "2px" }} />
              <span style={{ flex: 1, background: "rgba(124,230,255,.08)", borderRadius: "4px", border: "1px solid rgba(124,230,255,.2)" }} />
            </div>
          </div>
        </div>
      )
    },
    {
      n: "F18",
      k: "pdf",
      t: "PDF to website",
      d: "Brochures, decks and proposals become responsive pages.",
      visual: (
        <div style={{ width: "100%", height: "150px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* 3D PDF Document Conversion */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "50px", height: "68px", borderRadius: "6px", background: "#f0ede4", color: "#333", padding: "6px", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 12px 28px rgba(0,0,0,.5)", transform: "rotate(-6deg)" }}>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "7px", fontWeight: "700", color: "#e11d48" }}>PDF</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                <span style={{ height: "2px", background: "#aaa", borderRadius: "1px" }} />
                <span style={{ height: "2px", background: "#ccc", borderRadius: "1px" }} />
              </div>
            </div>
            <span style={{ color: "#a48bff", fontSize: "16px" }}>➔</span>
            <div style={{ width: "74px", height: "74px", borderRadius: "8px", border: "1.5px solid rgba(164,139,255,.6)", background: "linear-gradient(165deg,#16142e,#0a0718)", boxShadow: "0 12px 28px rgba(0,0,0,.6), 0 0 16px rgba(164,139,255,.25)", padding: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ height: "6px", background: "#a48bff", borderRadius: "2px" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px", flex: 1 }}>
                <span style={{ background: "rgba(255,255,255,.08)", borderRadius: "2px" }} />
                <span style={{ background: "rgba(255,255,255,.08)", borderRadius: "2px" }} />
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      n: "F19",
      k: "whiteboard",
      t: "Whiteboard mode",
      d: "One photo of the meeting room wall. Arrows included.",
      visual: (
        <div style={{ width: "100%", height: "150px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* Whiteboard Architecture Diagram */}
          <div style={{ width: "150px", height: "86px", borderRadius: "10px", background: "linear-gradient(165deg,#0c1322,#060a14)", border: "1px solid rgba(124,230,255,.3)", boxShadow: "0 14px 32px rgba(0,0,0,.5)", padding: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", position: "relative" }}>
            <div style={{ width: "42px", height: "46px", borderRadius: "6px", border: "1.5px solid #7ce6ff", background: "rgba(124,230,255,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", fontFamily: "'IBM Plex Mono',monospace", color: "#7ce6ff" }}>
              Page 1
            </div>
            <div style={{ display: "flex", alignItems: "center", color: "#a48bff", fontSize: "14px" }}>➔</div>
            <div style={{ width: "42px", height: "46px", borderRadius: "6px", border: "1.5px solid #a48bff", background: "rgba(164,139,255,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", fontFamily: "'IBM Plex Mono',monospace", color: "#c9a7ff" }}>
              Page 2
            </div>
          </div>
        </div>
      )
    }
  ];

  return (
    <section className="r-section r-pad-lg" id="capabilities" style={{ position: "relative", padding: "56px 0 120px" }}>
      <div style={{ maxWidth: "1180px", margin: "0 auto", padding: "0 28px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "18px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "11px", letterSpacing: ".18em", color: "rgba(124,230,255,.9)" }}>
            {"CHAPTER 01"}
          </span>
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(26px,3.2vw,40px)", fontWeight: "500", letterSpacing: "-.03em" }}>
            {"Input"}
          </span>
          <span style={{ flex: "1", height: "1px", background: "linear-gradient(90deg,rgba(255,255,255,.16),transparent)", minWidth: "40px" }} />
          <span style={{ fontSize: "13px", color: "rgba(233,235,242,.5)", maxWidth: "290px", lineHeight: "1.5" }}>
            {"Eight ways in. Not one of them is a text box you have to be clever in."}
          </span>
        </div>
      </div>

      <div style={{ marginTop: "36px", overflowX: "auto", padding: "0 28px 18px", WebkitOverflowScrolling: "touch" }}>
        <div style={{ display: "flex", gap: "16px", minWidth: "min-content", maxWidth: "1180px", margin: "0 auto" }}>
          {capabilities.map((ci, idx) => {
            const isHovered = hoveredIdx === idx;
            return (
              <div
                key={ci.n}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{
                  flex: "0 0 auto",
                  width: "250px",
                  height: "340px",
                  padding: "20px",
                  borderRadius: "18px",
                  border: isHovered ? "1px solid rgba(124,230,255,.5)" : "1px solid rgba(255,255,255,.12)",
                  background: isHovered ? "linear-gradient(170deg,rgba(16,24,42,.92),rgba(8,12,22,.96))" : "rgba(8,13,24,.82)",
                  backdropFilter: "blur(18px)",
                  WebkitBackdropFilter: "blur(18px)",
                  boxShadow: isHovered ? "0 24px 50px rgba(0,0,0,.6), 0 0 25px rgba(124,230,255,.15)" : "0 14px 40px rgba(0,0,0,.45)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  transition: "all .3s ease",
                  transform: isHovered ? "translateY(-4px)" : "none",
                  cursor: "pointer"
                }}
                className="orb-card-hover"
              >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10.5px", letterSpacing: ".12em", color: "rgba(124,230,255,.85)", fontWeight: "500" }}>
                    {ci.n}
                  </span>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "9.5px", color: "rgba(233,235,242,.35)" }}>
                    {ci.k}
                  </span>
                </div>

                {/* Big Creative Visual Illustration */}
                {ci.visual}

                {/* Text Content */}
                <div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "17.5px", fontWeight: "500", letterSpacing: "-.02em", color: "#f2f6ff" }}>
                    {ci.t}
                  </div>
                  <div style={{ marginTop: "6px", fontSize: "12.5px", lineHeight: "1.5", color: "rgba(233,235,242,.55)" }}>
                    {ci.d}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
