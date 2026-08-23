"use client";

import React, { useState } from "react";
import type { Vals } from "../types";

export function InteractiveDemo({ v }: { v: Vals }) {
  const [activeSample, setActiveSample] = useState<number>(0);
  const [deviceMode, setDeviceMode] = useState<"mobile" | "desktop" | "tablet">("mobile");

  const samples = [
    {
      id: 0,
      title: "Paper Napkin Wireframe",
      badge: "SKETCH · PRICING",
      chip: "paper_sketch.jpg",
      note: "3 cards ➔ pricing?",
      events: [
        { mark: "▶", t: "Ingesting paper sketch · 4K OCR", color: "#7ce6ff" },
        { mark: "·", t: "Detected margin note: '3 cards ➔ pricing'", color: "rgba(233,235,242,.7)" },
        { mark: "·", t: "Ambiguity resolved: Pricing (98.4%)", color: "#4ade80" },
        { mark: "·", t: "Generating 3 tiered pricing cards", color: "rgba(233,235,242,.7)" },
        { mark: "✓", t: "WCAG AAA contrast verified", color: "#4ade80" }
      ],
      outputTitle: "Three ways to work with us.",
      outputSubtitle: "Detected as pricing — because the note in the margin said so.",
      cards: [
        { k: "PLAN 01", p: "$0", per: "per month", d: "Studio visit and a coffee. Free exploration.", featured: false },
        { k: "PLAN 02", p: "$2.4k", per: "per project", d: "Concept, architectural drawings, permits.", featured: true },
        { k: "PLAN 03", p: "$8k", per: "per project", d: "Full build supervision and bespoke finishes.", featured: false }
      ]
    },
    {
      id: 1,
      title: "Mobile E-Commerce App",
      badge: "CAMERA · STORE",
      chip: "live_camera_30fps",
      note: "Watch showcase + Cart",
      events: [
        { mark: "▶", t: "Detected physical product: Luxury Watch", color: "#7ce6ff" },
        { mark: "·", t: "Synthesizing 3D orbit viewer canvas", color: "rgba(233,235,242,.7)" },
        { mark: "·", t: "Injected color swatches & buy flow", color: "#4ade80" },
        { mark: "·", t: "Attached Stripe checkout mutation", color: "rgba(233,235,242,.7)" },
        { mark: "✓", t: "Mobile 320px responsive lock", color: "#4ade80" }
      ],
      outputTitle: "Zenith Titanium Chrono",
      outputSubtitle: "Detected as product storefront — 3D interactive viewer attached.",
      cards: [
        { k: "EDITION 01", p: "$1,280", per: "Midnight Titanium", d: "Grade 5 brushed titanium case, sapphire glass.", featured: true },
        { k: "EDITION 02", p: "$1,450", per: "Rose Gold Bezel", d: "Hand-finished 18k rose gold bezel insert.", featured: false },
        { k: "EDITION 03", p: "$1,320", per: "Raw Ceramic", d: "Scratch-proof matte black ceramic body.", featured: false }
      ]
    },
    {
      id: 2,
      title: "SaaS Analytics Dashboard",
      badge: "WHITEBOARD · SAAS",
      chip: "whiteboard_flow.png",
      note: "Metrics + Charts",
      events: [
        { mark: "▶", t: "Parsed whiteboard architecture diagram", color: "#7ce6ff" },
        { mark: "·", t: "Mapped 3 live telemetry KPI cards", color: "rgba(233,235,242,.7)" },
        { mark: "·", t: "Constructed dynamic sparkline chart", color: "#4ade80" },
        { mark: "·", t: "Mounted Supabase Postgres database", color: "rgba(233,235,242,.7)" },
        { mark: "✓", t: "Sub-16ms paint verified", color: "#4ade80" }
      ],
      outputTitle: "Live Infrastructure Health",
      outputSubtitle: "Detected as SaaS portal — 3 real-time metric gauges mounted.",
      cards: [
        { k: "TRAFFIC", p: "142.8k", per: "+18.4% weekly", d: "Global edge CDN requests across 24 regions.", featured: false },
        { k: "LATENCY", p: "12ms", per: "Global average", d: "SFO (12ms), LHR (18ms), HND (24ms).", featured: true },
        { k: "UPTIME", p: "99.99%", per: "Last 90 days", d: "Zero downtime deployments and rollbacks.", featured: false }
      ]
    }
  ];

  const current = samples[activeSample];

  const getDeviceWidth = () => {
    if (deviceMode === "mobile") return "320px";
    if (deviceMode === "tablet") return "500px";
    return "100%";
  };

  return (
    <section className="r-section r-pad-lg" id="demo" style={{ position: "relative", padding: "0 28px 130px" }}>
      <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
        
        {/* Section Title */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "20px", marginBottom: "34px" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontFamily: "'IBM Plex Mono',monospace", fontSize: "11px", letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(124,230,255,.9)", background: "rgba(124,230,255,.1)", padding: "4px 10px", borderRadius: "999px", border: "1px solid rgba(124,230,255,.25)" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#7ce6ff" }} />
              Interactive demo
            </div>
            <h2 style={{ margin: "14px 0 0", fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "clamp(30px,4vw,48px)", letterSpacing: "-.032em", lineHeight: "1.04", color: "#f2f6ff" }}>
              {"Watch an idea become software."}
            </h2>
          </div>

          {/* Sample Switcher Tabs */}
          <div style={{ display: "flex", gap: "8px", background: "rgba(255,255,255,.05)", padding: "4px", borderRadius: "12px", border: "1px solid rgba(255,255,255,.1)" }}>
            {samples.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setActiveSample(idx)}
                style={{
                  padding: "7px 14px",
                  borderRadius: "9px",
                  border: activeSample === idx ? "1px solid rgba(124,230,255,.5)" : "1px solid transparent",
                  background: activeSample === idx ? "rgba(124,230,255,.18)" : "transparent",
                  color: activeSample === idx ? "#7ce6ff" : "rgba(233,235,242,.65)",
                  fontFamily: "'Space Grotesk',sans-serif",
                  fontSize: "12px",
                  fontWeight: activeSample === idx ? "600" : "400",
                  cursor: "pointer",
                  transition: "all .2s ease"
                }}
              >
                Sample {idx + 1}: {s.title.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>

        {/* 3-Column Interactive Sandbox Container */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,.9fr) 230px minmax(0,1.3fr)", gap: "0", alignItems: "stretch", borderRadius: "24px", border: "1px solid rgba(255,255,255,.12)", background: "rgba(8,12,22,.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "0 40px 120px rgba(0,0,0,.7)", overflow: "hidden" }} className="r-demo">
          
          {/* ============================================================ */}
          {/* COLUMN 1: INPUT SKETCH & CAPTURE                             */}
          {/* ============================================================ */}
          <div style={{ padding: "30px 24px", borderRight: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.015)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10.5px", letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(233,235,242,.5)" }}>
                  Input 01 · Capture
                </span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "9px", color: "#7ce6ff", background: "rgba(124,230,255,.1)", padding: "2px 6px", borderRadius: "4px" }}>
                  {current.badge}
                </span>
              </div>

              {/* Realistic Hand-Drawn Napkin / Paper Mockup */}
              <div style={{ marginTop: "18px", padding: "20px", borderRadius: "10px", background: "linear-gradient(178deg,#f5f2e8,#e5e0d3)", color: "#3a3a36", boxShadow: "0 20px 50px rgba(0,0,0,.55)", transform: "rotate(-1.5deg)", position: "relative" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ height: "20px", border: "2px solid #3d3e42", borderRadius: "4px", background: "rgba(0,0,0,.03)" }} />
                  <div style={{ height: "64px", border: "2px solid #3d3e42", borderRadius: "6px", background: "rgba(0,0,0,.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ width: "50%", height: "3px", background: "#3d3e42", borderRadius: "2px" }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "6px", height: "46px" }}>
                    <div style={{ border: "2px solid #3d3e42", borderRadius: "4px" }} />
                    <div style={{ border: "2px solid #3d3e42", borderRadius: "4px", background: "rgba(124,230,255,.2)" }} />
                    <div style={{ border: "2px solid #3d3e42", borderRadius: "4px" }} />
                  </div>
                </div>

                <div style={{ marginTop: "12px", fontFamily: "'Caveat',cursive", fontSize: "19px", color: "#1e293b", fontWeight: "600" }}>
                  {current.note}
                </div>
              </div>
            </div>

            {/* Input Attributes Chips */}
            <div style={{ marginTop: "24px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
              <span style={{ padding: "5px 10px", borderRadius: "999px", border: "1px solid rgba(124,230,255,.4)", background: "rgba(124,230,255,.1)", fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", color: "#7ce6ff" }}>
                {current.chip}
              </span>
              <span style={{ padding: "5px 10px", borderRadius: "999px", border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.05)", fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", color: "rgba(233,235,242,.7)" }}>
                latency: 0.38s
              </span>
              <span style={{ padding: "5px 10px", borderRadius: "999px", border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.05)", fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", color: "rgba(233,235,242,.7)" }}>
                ast_sync: true
              </span>
            </div>
          </div>

          {/* ============================================================ */}
          {/* COLUMN 2: REAL-TIME REASONING STREAM                         */}
          {/* ============================================================ */}
          <div style={{ position: "relative", padding: "30px 18px", borderRight: "1px solid rgba(255,255,255,.08)", background: "linear-gradient(180deg,rgba(124,230,255,.08),rgba(6,10,18,.5) 60%)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "'IBM Plex Mono',monospace", fontSize: "10.5px", letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(124,230,255,.9)", fontWeight: "600" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#7ce6ff", boxShadow: "0 0 8px #7ce6ff" }} />
                Reasoning 02
              </div>

              {/* Event Log Stream */}
              <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                {current.events.map((ev, i0) => (
                  <div key={i0} style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontFamily: "'IBM Plex Mono',monospace", fontSize: "10.5px", lineHeight: "1.45", color: ev.color }}>
                    <span style={{ fontWeight: "700" }}>{ev.mark}</span>
                    <span>{ev.t}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: "20px", paddingTop: "14px", borderTop: "1px solid rgba(255,255,255,.08)", fontFamily: "'IBM Plex Mono',monospace", fontSize: "9.5px", color: "rgba(233,235,242,.5)" }}>
              AST nodes committed · 0 regenerations
            </div>
          </div>

          {/* ============================================================ */}
          {/* COLUMN 3: REALISTIC OUTPUT WEB APPLICATION                   */}
          {/* ============================================================ */}
          <div style={{ padding: "30px 28px", background: "rgba(255,255,255,.015)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              {/* Output Header with Responsive Device Controls */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10.5px", letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(233,235,242,.5)" }}>
                  Output 03 · Running Build
                </span>
                
                <div style={{ display: "flex", gap: "4px", background: "rgba(255,255,255,.05)", padding: "3px", borderRadius: "8px", border: "1px solid rgba(255,255,255,.1)" }}>
                  {(["mobile", "desktop", "tablet"] as const).map((dm) => (
                    <button
                      key={dm}
                      onClick={() => setDeviceMode(dm)}
                      style={{
                        padding: "4px 9px",
                        borderRadius: "6px",
                        border: deviceMode === dm ? "1px solid rgba(124,230,255,.5)" : "1px solid transparent",
                        background: deviceMode === dm ? "rgba(124,230,255,.15)" : "transparent",
                        color: deviceMode === dm ? "#7ce6ff" : "rgba(233,235,242,.55)",
                        fontFamily: "'IBM Plex Mono',monospace",
                        fontSize: "9.5px",
                        cursor: "pointer",
                        textTransform: "uppercase"
                      }}
                    >
                      {dm}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Resizing Canvas */}
              <div style={{ marginTop: "18px", display: "flex", justifyContent: "center" }}>
                <div style={{ width: getDeviceWidth(), transition: "width .5s cubic-bezier(.4,0,.2,1)", borderRadius: "16px", border: "1px solid rgba(255,255,255,.12)", background: "linear-gradient(168deg,#101728,#070a14)", boxShadow: "0 30px 90px rgba(0,0,0,.7)", overflow: "hidden" }} className="r-device-frame">
                  
                  {/* Canvas Navbar */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
                    <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: "linear-gradient(140deg,#8fe6ff,#a48bff)" }} />
                    <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "13px", fontWeight: "600", color: "#fff" }}>
                      Aurora
                    </span>
                    <span style={{ flex: "1" }} />
                    <span style={{ fontSize: "11px", color: "rgba(233,235,242,.5)" }}>
                      Plans
                    </span>
                    <span style={{ fontSize: "11px", padding: "5px 12px", borderRadius: "999px", background: "#e9f6ff", color: "#08111c", fontWeight: "600" }}>
                      Enquire
                    </span>
                  </div>

                  {/* Canvas Body */}
                  <div style={{ padding: "20px 18px 22px" }}>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "22px", lineHeight: "1.1", letterSpacing: "-.03em", color: "#f2f6ff" }}>
                      {current.outputTitle}
                    </div>
                    <div style={{ marginTop: "6px", fontSize: "12px", color: "rgba(233,235,242,.55)" }}>
                      {current.outputSubtitle}
                    </div>

                    {/* 3 Real Product/Pricing Cards */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginTop: "16px" }}>
                      {current.cards.map((card, i0) => (
                        <div
                          key={i0}
                          style={{
                            padding: "14px 10px",
                            borderRadius: "12px",
                            border: card.featured ? "1.5px solid rgba(124,230,255,.6)" : "1px solid rgba(255,255,255,.1)",
                            background: card.featured ? "rgba(124,230,255,.12)" : "rgba(255,255,255,.04)",
                            boxShadow: card.featured ? "0 0 20px rgba(124,230,255,.2)" : "none"
                          }}
                          className="orb-card-hover"
                        >
                          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8.5px", letterSpacing: ".1em", color: card.featured ? "#7ce6ff" : "rgba(233,235,242,.5)", fontWeight: "600" }}>
                            {card.k}
                          </div>
                          <div style={{ marginTop: "8px", fontFamily: "'Space Grotesk',sans-serif", fontSize: "18px", fontWeight: "700", color: "#fff" }}>
                            {card.p}
                          </div>
                          <div style={{ marginTop: "2px", fontSize: "9.5px", color: "rgba(233,235,242,.45)" }}>
                            {card.per}
                          </div>
                          <div style={{ marginTop: "8px", height: "1px", background: "rgba(255,255,255,.08)" }} />
                          <div style={{ marginTop: "8px", fontSize: "10.5px", lineHeight: "1.4", color: "rgba(233,235,242,.6)" }}>
                            {card.d}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            </div>

            {/* Bottom Status Telemetry */}
            <div style={{ marginTop: "18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", color: "rgba(233,235,242,.6)" }}>
              <span style={{ padding: "4px 9px", borderRadius: "6px", border: "1px solid rgba(74,222,128,.4)", color: "#4ade80", background: "rgba(74,222,128,.1)" }}>
                ● PRODUCTION READY
              </span>
              <span>
                lighthouse 100 · a11y AAA · 8 components mounted
              </span>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
