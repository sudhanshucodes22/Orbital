"use client";

import React, { useState } from "react";
import type { Vals } from "../types";

export function ChapterBuild({ v }: { v: Vals }) {
  const [selectedTheme, setSelectedTheme] = useState<number>(0);
  const themes = [
    { name: "Space Navy", primary: "#7ce6ff", secondary: "#a48bff", bg: "#060913" },
    { name: "Nordic Minimal", primary: "#f5f0e6", secondary: "#d4cdbe", bg: "#1a1b1e" },
    { name: "Cyberpunk Glow", primary: "#ff2a85", secondary: "#00f0ff", bg: "#050014" },
    { name: "Emerald Pro", primary: "#34d399", secondary: "#38bdf8", bg: "#021512" }
  ];

  const buildCapabilities = [
    {
      n: "F08",
      t: "Style engine",
      d: "Swap the entire design system in one tap. Structure, components and copy stay locked.",
      badge: "5 SYSTEMS · 0 RELAYOUT",
      graphic: (
        <div style={{ width: "130px", height: "70px", borderRadius: "10px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", padding: "6px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "5px" }}>
            {themes.map((th, i) => (
              <span
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTheme(i);
                }}
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  background: `linear-gradient(135deg, ${th.primary}, ${th.secondary})`,
                  border: selectedTheme === i ? "2px solid #fff" : "1px solid rgba(255,255,255,.2)",
                  boxShadow: selectedTheme === i ? `0 0 10px ${th.primary}` : "none",
                  cursor: "pointer",
                  transition: "all .2s ease"
                }}
              />
            ))}
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8.5px", color: themes[selectedTheme].primary, display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: themes[selectedTheme].primary }} />
            {themes[selectedTheme].name}
          </div>
        </div>
      )
    },
    {
      n: "F10",
      t: "Multi-page understanding",
      d: "Feed it 5 sketches at once. It links routes, builds navbar and synchronizes design tokens.",
      badge: "UNLIMITED PAGES",
      graphic: (
        <div style={{ width: "130px", height: "70px", borderRadius: "10px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", padding: "6px", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", position: "relative" }}>
          {/* 3 Interconnected Pages */}
          <div style={{ width: "32px", height: "46px", borderRadius: "4px", background: "rgba(124,230,255,.15)", border: "1px solid #7ce6ff", padding: "3px", display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ width: "100%", height: "3px", background: "#7ce6ff", borderRadius: "1px" }} />
            <span style={{ width: "60%", height: "2px", background: "rgba(255,255,255,.4)", borderRadius: "1px" }} />
          </div>
          <span style={{ color: "#a48bff", fontSize: "10px" }}>➔</span>
          <div style={{ width: "32px", height: "46px", borderRadius: "4px", background: "rgba(164,139,255,.15)", border: "1px solid #a48bff", padding: "3px", display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ width: "100%", height: "3px", background: "#a48bff", borderRadius: "1px" }} />
            <span style={{ width: "70%", height: "2px", background: "rgba(255,255,255,.4)", borderRadius: "1px" }} />
          </div>
          <span style={{ color: "#38bdf8", fontSize: "10px" }}>➔</span>
          <div style={{ width: "32px", height: "46px", borderRadius: "4px", background: "rgba(56,189,248,.15)", border: "1px solid #38bdf8", padding: "3px", display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ width: "100%", height: "3px", background: "#38bdf8", borderRadius: "1px" }} />
            <span style={{ width: "50%", height: "2px", background: "rgba(255,255,255,.4)", borderRadius: "1px" }} />
          </div>
        </div>
      )
    },
    {
      n: "F12",
      t: "Live preview engine",
      d: "Every edit lands instantly on the running virtual DOM tree. Zero full-page refresh.",
      badge: "EDIT ➔ PAINT <16MS",
      graphic: (
        <div style={{ width: "130px", height: "70px", borderRadius: "10px", background: "linear-gradient(145deg,rgba(124,230,255,.1),rgba(6,10,18,.9))", border: "1px solid rgba(124,230,255,.3)", padding: "8px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px" }}>⚡</span>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8px", color: "#4ade80" }}>60 FPS V-SYNC</span>
          </div>
          <div style={{ height: "4px", borderRadius: "2px", background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: "96%", background: "linear-gradient(90deg,#7ce6ff,#4ade80)" }} />
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8px", color: "rgba(124,230,255,.9)" }}>
            TURBOPACK 14MS
          </div>
        </div>
      )
    },
    {
      n: "F13",
      t: "Responsive AI",
      d: "Desktop, tablet and phone views generated in parallel and kept synchronized as you speak.",
      badge: "3 VIEWPORTS SYNCED",
      graphic: (
        <div style={{ width: "130px", height: "70px", borderRadius: "10px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", padding: "6px", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "6px" }}>
          {/* Desktop */}
          <div style={{ width: "54px", height: "42px", borderRadius: "4px", border: "1px solid #7ce6ff", background: "rgba(124,230,255,.1)", padding: "3px", display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ width: "100%", height: "2px", background: "#7ce6ff" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1px", flex: 1 }}>
              <span style={{ background: "rgba(255,255,255,.2)", borderRadius: "1px" }} />
              <span style={{ background: "rgba(255,255,255,.2)", borderRadius: "1px" }} />
              <span style={{ background: "rgba(255,255,255,.2)", borderRadius: "1px" }} />
            </div>
          </div>
          {/* Tablet */}
          <div style={{ width: "32px", height: "48px", borderRadius: "4px", border: "1px solid #a48bff", background: "rgba(164,139,255,.1)", padding: "3px", display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ width: "100%", height: "2px", background: "#a48bff" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", flex: 1 }}>
              <span style={{ background: "rgba(255,255,255,.2)", borderRadius: "1px" }} />
              <span style={{ background: "rgba(255,255,255,.2)", borderRadius: "1px" }} />
            </div>
          </div>
          {/* Mobile */}
          <div style={{ width: "20px", height: "54px", borderRadius: "4px", border: "1px solid #38bdf8", background: "rgba(56,189,248,.1)", padding: "2px", display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ width: "100%", height: "2px", background: "#38bdf8" }} />
            <span style={{ flex: 1, background: "rgba(255,255,255,.2)", borderRadius: "1px" }} />
          </div>
        </div>
      )
    },
    {
      n: "F26",
      t: "Live conversational editing",
      d: "The conversation is the compiler. Remembers your design decisions across days and sessions.",
      badge: "PERSISTENT MEMORY",
      graphic: (
        <div style={{ width: "130px", height: "70px", borderRadius: "10px", background: "rgba(164,139,255,.08)", border: "1px solid rgba(164,139,255,.3)", padding: "6px 8px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#a48bff", boxShadow: "0 0 8px #a48bff" }} />
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8px", color: "#c9a7ff" }}>AI MEMORY</span>
          </div>
          <div style={{ padding: "3px 6px", borderRadius: "4px", background: "rgba(255,255,255,.06)", fontFamily: "'IBM Plex Mono',monospace", fontSize: "8px", color: "rgba(233,235,242,.8)" }}>
            "Kyoto Warm Grey"
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "7.5px", color: "#4ade80" }}>
            ✓ RESTORED MID-EDIT
          </div>
        </div>
      )
    }
  ];

  return (
    <section className="r-section r-pad-lg" style={{ position: "relative", padding: "0 0 130px" }}>
      <div style={{ maxWidth: "1180px", margin: "0 auto", padding: "0 28px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "18px", marginBottom: "34px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "11px", letterSpacing: ".18em", color: "rgba(124,230,255,.9)" }}>
            {"CHAPTER 03"}
          </span>
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(26px,3.2vw,40px)", fontWeight: "500", letterSpacing: "-.03em" }}>
            {"Build"}
          </span>
          <span style={{ flex: "1", height: "1px", background: "linear-gradient(90deg,rgba(255,255,255,.16),transparent)", minWidth: "40px" }} />
          <span style={{ fontSize: "13px", color: "rgba(233,235,242,.5)", maxWidth: "290px", lineHeight: "1.5" }}>
            {"Typed components, real routing, responsive from frame one."}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,.85fr) minmax(0,1.15fr)", gap: "0", border: "1px solid rgba(255,255,255,.12)", borderRadius: "20px", overflow: "hidden", background: "rgba(8,12,22,.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "0 24px 60px rgba(0,0,0,.6)" }} className="r-2col">
          
          {/* Left: Component Tree & Export Targets */}
          <div style={{ padding: "28px", borderRight: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.015)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10.5px", letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(124,230,255,.8)" }}>
                  {"Component tree · live AST"}
                </div>
                <span style={{ fontSize: "10px", color: "#4ade80" }}>● SYNCHRONIZED</span>
              </div>

              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "11.5px", lineHeight: "2.1", color: "rgba(233,235,242,.75)", background: "rgba(3,6,12,.6)", padding: "14px 18px", borderRadius: "12px", border: "1px solid rgba(255,255,255,.06)" }}>
                {v.tree.map((tn, i0) => (
                  <div key={i0} style={{ paddingLeft: tn.pad, color: tn.color, display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>{tn.t}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: "24px", paddingTop: "18px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", color: "rgba(233,235,242,.45)", marginBottom: "8px", textTransform: "uppercase" }}>
                Supported Framework Targets
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {v.exportTargets.map((et, i0) => (
                  <span
                    key={i0}
                    style={{ padding: "5px 10px", borderRadius: "7px", border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)", fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", color: "rgba(196,236,255,.85)" }}
                    className="orb-card-hover"
                  >
                    {et}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Rich Visual Build Capabilities */}
          <div style={{ padding: "26px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {buildCapabilities.map((cb, i0) => (
                <div
                  key={i0}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "18px",
                    alignItems: "center",
                    padding: "16px 18px",
                    borderRadius: "14px",
                    border: "1px solid rgba(255,255,255,.1)",
                    background: "rgba(255,255,255,.03)",
                    backdropFilter: "blur(10px)",
                    transition: "all .25s ease"
                  }}
                  className="orb-card-hover"
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", color: "#7ce6ff", fontWeight: "600", background: "rgba(124,230,255,.12)", padding: "2px 6px", borderRadius: "4px" }}>
                        {cb.n}
                      </span>
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "17px", fontWeight: "500", letterSpacing: "-.02em", color: "#f3f6ff" }}>
                        {cb.t}
                      </span>
                    </div>
                    <div style={{ marginTop: "6px", fontSize: "12.5px", lineHeight: "1.5", color: "rgba(233,235,242,.6)", maxWidth: "340px" }}>
                      {cb.d}
                    </div>
                    <div style={{ marginTop: "6px", fontFamily: "'IBM Plex Mono',monospace", fontSize: "9px", color: "rgba(124,230,255,.8)" }}>
                      {cb.badge}
                    </div>
                  </div>

                  {/* Designed Visual Graphic */}
                  <div>{cb.graphic}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
