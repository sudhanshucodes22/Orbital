"use client";

import React, { useState } from "react";
import type { Vals } from "../types";

export function Workspace({ v }: { v: Vals }) {
  // Navigation active tab (default to Components)
  const [activeTab, setActiveTab] = useState<string>("Components");

  // Device viewport width
  const [deviceWidth, setDeviceWidth] = useState<string>("320px");
  const [activeDeviceIndex, setActiveDeviceIndex] = useState<number>(0);

  // Selected element in preview
  const [selectedElement, setSelectedElement] = useState<string>("hero");

  // Active dock tool
  const [activeTool, setActiveTool] = useState<string>("Text");
  const [toolFeedback, setToolFeedback] = useState<string | null>(null);

  // Projects list state
  const [projects, setProjects] = useState([
    { id: 1, name: "Aurora Architecture", type: "Next.js 16 · Tailwind", status: "Live", url: "aurora.studio", updated: "2m ago", score: "99" },
    { id: 2, name: "Koto Living E-Commerce", type: "React 19 · Shopify", status: "Live", url: "koto-living.com", updated: "3h ago", score: "98" },
    { id: 3, name: "Linear Redesign Concept", type: "Next.js App Router", status: "Draft", url: "linear-v2.orbital.app", updated: "1d ago", score: "96" },
    { id: 4, name: "Zenith 3D Watch Store", type: "Three.js · WebGL", status: "Live", url: "zenith-time.io", updated: "4d ago", score: "100" },
    { id: 5, name: "SaaS Analytics Engine", type: "TypeScript · Supabase", status: "Staging", url: "metrics-staging.internal", updated: "6d ago", score: "97" },
    { id: 6, name: "Nordic Minimalist Studio", type: "Next.js Static Export", status: "Archived", url: "nordic-studio.site", updated: "12d ago", score: "94" }
  ]);

  // Assets list state
  const [assetTab, setAssetTab] = useState<"all" | "images" | "models" | "icons">("all");

  // Export target state
  const [exportTarget, setExportTarget] = useState<"nextjs" | "react" | "html" | "flutter">("nextjs");
  const [exportedZip, setExportedZip] = useState(false);

  // Chat message history
  const [chatMessages, setChatMessages] = useState<Array<{ t: string; align: "flex-start" | "flex-end"; border: string; bg: string; color: string }>>([
    { t: "Three cards under the hero — pricing or features?", align: "flex-start", border: "rgba(255,255,255,.1)", bg: "rgba(255,255,255,.045)", color: "rgba(233,235,242,.85)" },
    { t: "Features. And make the hero taller.", align: "flex-end", border: "rgba(124,230,255,.4)", bg: "rgba(124,230,255,.12)", color: "#e9f8ff" },
    { t: "Done — 82vh. Design score 91 → 94.", align: "flex-start", border: "rgba(164,139,255,.32)", bg: "rgba(164,139,255,.1)", color: "#efeaff" }
  ]);

  // Input prompt
  const [inputText, setInputText] = useState<string>("");

  // Deployment modal state
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [deploySuccess, setDeploySuccess] = useState<boolean>(false);

  // Preview custom styling triggers
  const [heroTheme, setHeroTheme] = useState<{ dark: boolean; glass: boolean; tall: boolean }>({
    dark: false,
    glass: false,
    tall: true
  });

  const handleDeviceSelect = (index: number) => {
    setActiveDeviceIndex(index);
    if (index === 0) setDeviceWidth("320px"); // Mobile
    else if (index === 1) setDeviceWidth("100%"); // Desktop
    else if (index === 2) setDeviceWidth("540px"); // Tablet
  };

  const handleDockToolClick = (toolName: string) => {
    setActiveTool(toolName);
    setToolFeedback(`Active Input Mode: ${toolName}`);
    setTimeout(() => setToolFeedback(null), 3000);

    if (toolName === "Voice") {
      handleChatSubmit("Make the cards glassmorphic and increase contrast.");
    } else if (toolName === "Camera" || toolName === "Screenshot") {
      handleChatSubmit(`Imported layout from ${toolName}. Parsed 6 DOM regions.`);
    }
  };

  const handleChatSubmit = (customText?: string) => {
    const textToSend = customText || inputText;
    if (!textToSend.trim()) return;

    const userMsg = {
      t: textToSend,
      align: "flex-end" as const,
      border: "rgba(124,230,255,.4)",
      bg: "rgba(124,230,255,.14)",
      color: "#e9f8ff"
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (!customText) setInputText("");

    // Simulate AI response based on command
    setTimeout(() => {
      let aiReply = `Applied "${textToSend}". Live AST tree patched (0 regenerations).`;
      const lower = textToSend.toLowerCase();

      if (lower.includes("dark")) {
        setHeroTheme((prev) => ({ ...prev, dark: true }));
        aiReply = "Dropped background luminance by 2 stops. Contrast verified AA.";
      } else if (lower.includes("glass")) {
        setHeroTheme((prev) => ({ ...prev, glass: true }));
        aiReply = "Applied backdrop-filter: blur(16px) to cards and navigation.";
      } else if (lower.includes("tall") || lower.includes("height")) {
        setHeroTheme((prev) => ({ ...prev, tall: true }));
        aiReply = "Adjusted hero height to 85vh. Responsive rhythm aligned.";
      } else if (lower.includes("pricing")) {
        aiReply = "Injected 3 pricing tier components ($0, $29, $99).";
      }

      setChatMessages((prev) => [
        ...prev,
        {
          t: aiReply,
          align: "flex-start" as const,
          border: "rgba(164,139,255,.35)",
          bg: "rgba(164,139,255,.12)",
          color: "#f3efff"
        }
      ]);
    }, 450);
  };

  const handleDeploy = () => {
    setIsDeploying(true);
    setDeploySuccess(false);

    setTimeout(() => {
      setIsDeploying(false);
      setDeploySuccess(true);
      setTimeout(() => setDeploySuccess(false), 5000);
    }, 1800);
  };

  return (
    <section className="r-section r-pad-lg" id="workspace" style={{ position: "relative", padding: "0 28px 130px" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "30px", flexWrap: "wrap", marginBottom: "34px" }}>
          <h2 style={{ margin: "0", fontFamily: "'Space Grotesk',sans-serif", fontWeight: "500", fontSize: "clamp(28px,3.6vw,46px)", letterSpacing: "-.03em", lineHeight: "1.04" }}>
            {"The room where it happens."}
          </h2>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "11px", letterSpacing: ".14em", color: "rgba(124,230,255,.9)", textTransform: "uppercase", background: "rgba(124,230,255,.08)", padding: "6px 14px", borderRadius: "999px", border: "1px solid rgba(124,230,255,.25)" }}>
            {"Interactive Workspace · build 2026.8"}
          </div>
        </div>

        <div style={{ border: "1px solid rgba(255,255,255,.12)", borderRadius: "20px", background: "rgba(8,12,22,.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "0 50px 130px rgba(0,0,0,.7)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr) 330px", minHeight: "620px" }} className="r-workspace">
            
            {/* ============================================================ */}
            {/* 1. LEFT SIDEBAR (Interactive Navigation & Project Memory)   */}
            {/* ============================================================ */}
            <aside style={{ borderRight: "1px solid rgba(255,255,255,.08)", padding: "18px 14px", display: "flex", flexDirection: "column", gap: "3px", background: "rgba(255,255,255,.015)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "9px", padding: "6px 10px 16px" }}>
                <span style={{ width: "16px", height: "16px", borderRadius: "50%", border: "1px solid rgba(160,225,255,.6)", position: "relative" }}>
                  <span style={{ position: "absolute", left: "50%", top: "50%", width: "6px", height: "6px", margin: "-3px 0 0 -3px", borderRadius: "50%", background: "#bdf1ff" }} />
                </span>
                <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "14px", fontWeight: "600", color: "#f2f6ff" }}>
                  {"Aurora Labs"}
                </span>
              </div>

              {v.navItems.map((ni, i0) => {
                const isActive = activeTab === ni.t;
                return (
                  <div
                    key={i0}
                    onClick={() => setActiveTab(ni.t)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "9px 12px",
                      borderRadius: "10px",
                      fontSize: "13px",
                      fontWeight: isActive ? "600" : "400",
                      color: isActive ? "#eaf7ff" : "rgba(233,235,242,.66)",
                      background: isActive ? "linear-gradient(90deg, rgba(124,230,255,.18), rgba(124,230,255,.06))" : "transparent",
                      border: isActive ? "1px solid rgba(124,230,255,.4)" : "1px solid transparent",
                      cursor: "pointer",
                      transition: "all .2s ease",
                      boxShadow: isActive ? "0 4px 14px rgba(124,230,255,.12)" : "none"
                    }}
                    className="orb-card-hover"
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {isActive && <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#7ce6ff" }} />}
                      {ni.t}
                    </span>
                    {ni.c && (
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", color: isActive ? "#7ce6ff" : "rgba(233,235,242,.35)", background: "rgba(255,255,255,.05)", padding: "1px 6px", borderRadius: "4px" }}>
                        {ni.c}
                      </span>
                    )}
                  </div>
                );
              })}

              <span style={{ flex: "1", minHeight: "20px" }} />

              {/* Project Memory Interactive Cards */}
              <div style={{ padding: "14px", borderRadius: "14px", border: "1px solid rgba(255,255,255,.09)", background: "rgba(255,255,255,.03)", backdropFilter: "blur(10px)" }}>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "9.5px", letterSpacing: ".1em", color: "rgba(124,230,255,.8)", fontWeight: "500" }}>
                  {"PROJECT MEMORY · F16"}
                </div>
                <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {v.memory.map((mi, i0) => (
                    <div
                      key={i0}
                      onClick={() => handleChatSubmit(`Restore context: ${mi.t}`)}
                      style={{ display: "flex", gap: "8px", fontSize: "11px", color: "rgba(233,235,242,.7)", cursor: "pointer", padding: "4px 6px", borderRadius: "6px", transition: "background .2s ease" }}
                      className="orb-card-hover"
                      title="Click to restore context"
                    >
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: "#7ce6ff", fontWeight: "500" }}>
                        {mi.d}
                      </span>
                      <span>{mi.t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            {/* ============================================================ */}
            {/* 2. CENTER STAGE (Dynamic Views Based on Left Nav Selection)  */}
            {/* ============================================================ */}
            <div style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
              {/* Top Viewport Header */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.015)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#7ce6ff" }} />
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "11px", color: "rgba(233,235,242,.7)" }}>
                    {"aurora.studio"}
                  </span>
                  <span style={{ color: "rgba(255,255,255,.2)" }}>/</span>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10.5px", color: "#7ce6ff", fontWeight: "500", textTransform: "lowercase" }}>
                    {activeTab.toLowerCase()}
                  </span>
                </div>

                <span style={{ flex: "1" }} />

                {/* Viewport switchers (only on Components / Design view) */}
                {activeTab === "Components" && (
                  <div style={{ display: "flex", gap: "4px", background: "rgba(255,255,255,.05)", padding: "3px", borderRadius: "9px", border: "1px solid rgba(255,255,255,.1)" }}>
                    {["MOBILE", "DESKTOP", "TABLET"].map((deviceLabel, idx) => {
                      const isSelected = activeDeviceIndex === idx;
                      return (
                        <button
                          key={deviceLabel}
                          onClick={() => handleDeviceSelect(idx)}
                          style={{
                            cursor: "pointer",
                            padding: "5px 11px",
                            borderRadius: "7px",
                            border: isSelected ? "1px solid rgba(124,230,255,.45)" : "1px solid transparent",
                            background: isSelected ? "rgba(124,230,255,.18)" : "transparent",
                            color: isSelected ? "#cdf2ff" : "rgba(233,235,242,.55)",
                            fontFamily: "'IBM Plex Mono',monospace",
                            fontSize: "10px",
                            fontWeight: isSelected ? "600" : "400",
                            transition: "all .2s ease"
                          }}
                        >
                          {deviceLabel}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Dynamic Center Panel Body */}
              <div style={{ flex: "1", padding: "24px", display: "flex", justifyContent: "center", background: "radial-gradient(700px 340px at 50% -10%,rgba(124,230,255,.07),transparent 70%)", overflow: "auto" }}>
                
                {/* -------------------------------------------------------- */}
                {/* VIEW 1: COMPONENTS (The Interactive Live Canvas Preview) */}
                {/* -------------------------------------------------------- */}
                {activeTab === "Components" && (
                  <div
                    style={{
                      width: deviceWidth,
                      transition: "width .5s cubic-bezier(.4,0,.2,1)",
                      borderRadius: "16px",
                      border: "1px solid rgba(255,255,255,.12)",
                      background: heroTheme.dark ? "linear-gradient(170deg,#060910,#020408)" : "linear-gradient(170deg,#0d1422,#070a12)",
                      boxShadow: "0 30px 80px rgba(0,0,0,.6)",
                      overflow: "hidden",
                      position: "relative"
                    }}
                    className="r-device-frame"
                  >
                    {/* Canvas Sub-Header */}
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,.07)", background: heroTheme.glass ? "rgba(255,255,255,.06)" : "transparent", backdropFilter: heroTheme.glass ? "blur(14px)" : "none" }}>
                      <span style={{ width: "14px", height: "14px", borderRadius: "50%", background: "linear-gradient(140deg,#8fe6ff,#a48bff)" }} />
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "13px", fontWeight: "600" }}>
                        {"Aurora"}
                      </span>
                      <span style={{ flex: "1" }} />
                      <button onClick={() => setSelectedElement("nav-work")} style={{ background: "transparent", border: "none", color: selectedElement === "nav-work" ? "#7ce6ff" : "rgba(233,235,242,.6)", fontSize: "11.5px", cursor: "pointer" }}>
                        {"Work"}
                      </button>
                      <button onClick={() => setSelectedElement("nav-studio")} style={{ background: "transparent", border: "none", color: selectedElement === "nav-studio" ? "#7ce6ff" : "rgba(233,235,242,.6)", fontSize: "11.5px", cursor: "pointer" }}>
                        {"Studio"}
                      </button>
                      <button onClick={() => setSelectedElement("nav-enquire")} style={{ fontSize: "11.5px", padding: "6px 13px", borderRadius: "999px", background: "#e9f6ff", color: "#08111c", fontWeight: "500", border: "none", cursor: "pointer" }}>
                        {"Enquire"}
                      </button>
                    </div>

                    {/* Canvas Body */}
                    <div
                      onClick={() => setSelectedElement("hero")}
                      style={{
                        padding: heroTheme.tall ? "32px 24px 28px" : "24px 20px",
                        position: "relative",
                        cursor: "pointer"
                      }}
                    >
                      <div style={{ position: "absolute", top: "14px", right: "14px", padding: "3px 8px", borderRadius: "6px", border: "1px dashed rgba(124,230,255,.6)", background: "rgba(124,230,255,.12)", fontFamily: "'IBM Plex Mono',monospace", fontSize: "9px", color: "#cdeaff" }}>
                        {selectedElement} · selected
                      </div>

                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: "500", fontSize: "clamp(24px,3vw,38px)", lineHeight: "1.02", letterSpacing: "-.032em", maxWidth: "420px", color: "#f2f6ff" }}>
                        {"Light, glass and quiet rooms."}
                      </div>
                      <div style={{ marginTop: "14px", fontSize: "13.5px", lineHeight: "1.6", color: "rgba(233,235,242,.6)", maxWidth: "340px" }}>
                        {"An architecture practice working between Copenhagen and Kyoto, mostly in daylight."}
                      </div>

                      <div style={{ display: "flex", gap: "10px", marginTop: "22px" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedElement("cta-primary");
                          }}
                          style={{ fontSize: "12.5px", padding: "10px 18px", borderRadius: "999px", background: "linear-gradient(180deg,#d6f4ff,#8ad9ff)", color: "#08111c", fontWeight: "600", border: selectedElement === "cta-primary" ? "2px solid #fff" : "none", cursor: "pointer" }}
                        >
                          {"See the work"}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedElement("cta-secondary");
                          }}
                          style={{ fontSize: "12.5px", padding: "10px 18px", borderRadius: "999px", border: selectedElement === "cta-secondary" ? "2px solid #7ce6ff" : "1px solid rgba(255,255,255,.16)", background: "transparent", color: "rgba(233,235,242,.85)", cursor: "pointer" }}
                        >
                          {"Studio"}
                        </button>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: "14px", marginTop: "26px" }}>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedElement("photo-card");
                          }}
                          style={{ borderRadius: "12px", border: selectedElement === "photo-card" ? "1px solid #7ce6ff" : "1px solid rgba(255,255,255,.1)", background: "repeating-linear-gradient(128deg,rgba(255,255,255,.07) 0 9px,rgba(255,255,255,.02) 9px 18px)", minHeight: "150px", display: "flex", alignItems: "flex-end", padding: "12px", fontFamily: "'IBM Plex Mono',monospace", fontSize: "9.5px", color: "rgba(233,235,242,.55)", cursor: "pointer" }}
                        >
                          {"interior photograph"}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          {v.heroCards.map((wc, i0) => (
                            <div
                              key={i0}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedElement(`card-${wc.k}`);
                              }}
                              style={{
                                flex: "1",
                                padding: "12px",
                                borderRadius: "11px",
                                border: selectedElement === `card-${wc.k}` ? "1px solid #7ce6ff" : "1px solid rgba(255,255,255,.1)",
                                background: heroTheme.glass ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.04)",
                                backdropFilter: heroTheme.glass ? "blur(12px)" : "none",
                                cursor: "pointer"
                              }}
                            >
                              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "9.5px", color: "rgba(124,230,255,.85)", fontWeight: "500" }}>
                                {wc.k}
                              </div>
                              <div style={{ marginTop: "6px", fontSize: "12px", color: "#f2f6ff", fontWeight: "500" }}>
                                {wc.t}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* -------------------------------------------------------- */}
                {/* VIEW 2: PROJECTS (All 12 Active & Managed Workspaces)    */}
                {/* -------------------------------------------------------- */}
                {activeTab === "Projects" && (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <h3 style={{ margin: "0", fontFamily: "'Space Grotesk',sans-serif", fontSize: "20px", color: "#f3f6ff" }}>All Projects (12)</h3>
                        <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "rgba(233,235,242,.55)" }}>Managed repositories, exports and cloud deployments</p>
                      </div>
                      <button
                        onClick={() => {
                          const newProj = { id: Date.now(), name: "Untitled New Project", type: "Next.js 16 · Tailwind", status: "Draft", url: "new-site.orbital.app", updated: "Just now", score: "98" };
                          setProjects([newProj, ...projects]);
                          handleChatSubmit("Created new project: Untitled New Project");
                        }}
                        style={{ padding: "8px 16px", borderRadius: "999px", background: "linear-gradient(180deg,#cdf3ff,#7ad6ff)", color: "#04060c", border: "none", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}
                      >
                        + New Project
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px" }}>
                      {projects.map((p) => (
                        <div key={p.id} style={{ padding: "18px", borderRadius: "14px", border: "1px solid rgba(255,255,255,.1)", background: "rgba(10,15,26,.8)", backdropFilter: "blur(12px)", display: "flex", flexDirection: "column", gap: "10px" }} className="orb-card-hover">
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "999px", background: p.status === "Live" ? "rgba(74,222,128,.15)" : "rgba(255,255,255,.08)", color: p.status === "Live" ? "#4ade80" : "rgba(233,235,242,.7)", border: p.status === "Live" ? "1px solid rgba(74,222,128,.3)" : "1px solid rgba(255,255,255,.1)" }}>
                              ● {p.status}
                            </span>
                            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", color: "rgba(124,230,255,.8)" }}>
                              LH {p.score}
                            </span>
                          </div>
                          <div>
                            <h4 style={{ margin: "0", fontFamily: "'Space Grotesk',sans-serif", fontSize: "15px", color: "#f2f6ff" }}>{p.name}</h4>
                            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10.5px", color: "rgba(233,235,242,.45)", marginTop: "3px" }}>{p.url}</div>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,.06)", fontSize: "11px", color: "rgba(233,235,242,.5)" }}>
                            <span>{p.type}</span>
                            <span>{p.updated}</span>
                          </div>
                          <button
                            onClick={() => {
                              setActiveTab("Components");
                              handleChatSubmit(`Loaded project ${p.name}`);
                            }}
                            style={{ width: "100%", padding: "7px", borderRadius: "8px", background: "rgba(124,230,255,.1)", border: "1px solid rgba(124,230,255,.3)", color: "#cdeaff", fontSize: "11px", cursor: "pointer", marginTop: "4px" }}
                          >
                            Open in Editor →
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* -------------------------------------------------------- */}
                {/* VIEW 3: DASHBOARD (Analytics, Traffic, Design Quality)   */}
                {/* -------------------------------------------------------- */}
                {activeTab === "Dashboard" && (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "20px" }}>
                    <div>
                      <h3 style={{ margin: "0", fontFamily: "'Space Grotesk',sans-serif", fontSize: "20px", color: "#f3f6ff" }}>Production Performance</h3>
                      <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "rgba(233,235,242,.55)" }}>Real-time telemetry and Core Web Vitals across 24 edge nodes</p>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                      {[
                        { label: "Global Traffic", val: "142.8k", change: "+18.4% this week", color: "#4ade80" },
                        { label: "Lighthouse Score", val: "99.4", change: "100 Performance", color: "#7ce6ff" },
                        { label: "Time to First Byte", val: "28ms", change: "Edge Cached (SFO/LHR)", color: "#a48bff" },
                        { label: "Design Quality Score", val: "94 / 100", change: "+3 from last voice patch", color: "#38bdf8" }
                      ].map((card, i) => (
                        <div key={i} style={{ padding: "16px", borderRadius: "14px", border: "1px solid rgba(255,255,255,.1)", background: "rgba(8,14,24,.8)", backdropFilter: "blur(12px)" }}>
                          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", color: "rgba(233,235,242,.5)", textTransform: "uppercase" }}>{card.label}</div>
                          <div style={{ marginTop: "8px", fontFamily: "'Space Grotesk',sans-serif", fontSize: "26px", fontWeight: "600", color: card.color }}>{card.val}</div>
                          <div style={{ marginTop: "4px", fontSize: "10.5px", color: "rgba(233,235,242,.6)" }}>{card.change}</div>
                        </div>
                      ))}
                    </div>

                    {/* Edge Nodes Map Simulator */}
                    <div style={{ padding: "18px", borderRadius: "14px", border: "1px solid rgba(255,255,255,.1)", background: "rgba(6,10,18,.8)" }}>
                      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "11px", color: "rgba(124,230,255,.9)", marginBottom: "12px" }}>ACTIVE EDGE TRAFFIC NODES</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
                        {[
                          { region: "North America (SFO)", ping: "12ms", load: "42%" },
                          { region: "Europe (LHR)", ping: "18ms", load: "34%" },
                          { region: "Asia Pacific (HND)", ping: "24ms", load: "58%" },
                          { region: "Latin America (GRU)", ping: "38ms", load: "19%" }
                        ].map((node, i) => (
                          <div key={i} style={{ padding: "10px", borderRadius: "8px", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                            <div style={{ fontSize: "11px", fontWeight: "500", color: "#f2f6ff" }}>{node.region}</div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontFamily: "'IBM Plex Mono',monospace", fontSize: "9.5px", color: "rgba(233,235,242,.5)" }}>
                              <span style={{ color: "#4ade80" }}>{node.ping}</span>
                              <span>Load: {node.load}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* -------------------------------------------------------- */}
                {/* VIEW 4: ASSETS (Media, SVGs, 3D Assets, Fonts)           */}
                {/* -------------------------------------------------------- */}
                {activeTab === "Assets" && (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <h3 style={{ margin: "0", fontFamily: "'Space Grotesk',sans-serif", fontSize: "20px", color: "#f3f6ff" }}>Asset Gallery (96)</h3>
                        <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "rgba(233,235,242,.55)" }}>Vector icons, 4K WebP textures, 3D models and font subsets</p>
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        {(["all", "images", "models", "icons"] as const).map((tab) => (
                          <button
                            key={tab}
                            onClick={() => setAssetTab(tab)}
                            style={{ padding: "5px 11px", borderRadius: "8px", border: assetTab === tab ? "1px solid rgba(124,230,255,.5)" : "1px solid rgba(255,255,255,.1)", background: assetTab === tab ? "rgba(124,230,255,.15)" : "transparent", color: assetTab === tab ? "#7ce6ff" : "rgba(233,235,242,.6)", fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", cursor: "pointer", textTransform: "capitalize" }}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "12px" }}>
                      {[
                        { name: "earth-day.jpg", type: "4K TEXTURE", size: "1.2 MB", icon: "🌍" },
                        { name: "earth-night.jpg", type: "4K TEXTURE", size: "980 KB", icon: "🌃" },
                        { name: "interior-copenhagen.webp", type: "WEBP IMAGE", size: "340 KB", icon: "🏛️" },
                        { name: "aurora-logo.svg", type: "VECTOR SVG", size: "8 KB", icon: "✨" },
                        { name: "watch-3d-model.gltf", type: "3D ASSET", size: "4.8 MB", icon: "⌚" },
                        { name: "SpaceGrotesk.woff2", type: "FONT", size: "48 KB", icon: "🔤" }
                      ].map((item, i) => (
                        <div key={i} style={{ padding: "14px", borderRadius: "12px", border: "1px solid rgba(255,255,255,.1)", background: "rgba(10,15,26,.8)", textAlign: "center", cursor: "pointer" }} className="orb-card-hover">
                          <div style={{ fontSize: "28px", marginBottom: "8px" }}>{item.icon}</div>
                          <div style={{ fontSize: "11px", fontWeight: "500", color: "#f2f6ff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8.5px", color: "rgba(124,230,255,.8)", marginTop: "4px" }}>{item.type} · {item.size}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* -------------------------------------------------------- */}
                {/* VIEW 5: AI ASSISTANT (Model tuning & multimodal studio)  */}
                {/* -------------------------------------------------------- */}
                {activeTab === "AI Assistant" && (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "18px" }}>
                    <div>
                      <h3 style={{ margin: "0", fontFamily: "'Space Grotesk',sans-serif", fontSize: "20px", color: "#f3f6ff" }}>AI Engineering Intelligence</h3>
                      <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "rgba(233,235,242,.55)" }}>Multimodal reasoning models, design autonomy and token budgeting</p>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: "14px" }}>
                      <div style={{ padding: "18px", borderRadius: "14px", border: "1px solid rgba(255,255,255,.1)", background: "rgba(8,14,24,.8)", display: "flex", flexDirection: "column", gap: "14px" }}>
                        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "11px", color: "rgba(124,230,255,.9)" }}>ACTIVE INFERENCE PIPELINE</div>
                        
                        <div style={{ padding: "12px", borderRadius: "10px", background: "rgba(124,230,255,.08)", border: "1px solid rgba(124,230,255,.25)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: "600", color: "#fff" }}>
                            <span>Orbital Vision 3.2 Pro</span>
                            <span style={{ color: "#4ade80" }}>Active Model</span>
                          </div>
                          <p style={{ margin: "4px 0 0", fontSize: "11px", color: "rgba(233,235,242,.65)" }}>Low-latency multimodal engine: freehand drawing, live camera, AST patching</p>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", color: "rgba(233,235,242,.7)" }}>
                            <span>Design Autonomy</span>
                            <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: "#7ce6ff" }}>92% (High Confidence)</span>
                          </div>
                          <div style={{ height: "4px", borderRadius: "2px", background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
                            <span style={{ display: "block", height: "100%", width: "92%", background: "linear-gradient(90deg,#7ce6ff,#a48bff)" }} />
                          </div>
                        </div>
                      </div>

                      <div style={{ padding: "18px", borderRadius: "14px", border: "1px solid rgba(255,255,255,.1)", background: "rgba(8,14,24,.8)", display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "11px", color: "rgba(164,139,255,.9)" }}>MULTIMODAL SENSORS</div>
                        {[
                          { name: "Camera OCR", status: "Enabled (30fps)" },
                          { name: "Voice Spectrogram", status: "Active (en-GB)" },
                          { name: "AST Patch Engine", status: "Zero-Regen Pass" }
                        ].map((sensor, idx) => (
                          <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", borderRadius: "6px", background: "rgba(255,255,255,.03)", fontSize: "11px" }}>
                            <span style={{ color: "#f2f6ff" }}>{sensor.name}</span>
                            <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: "#7ce6ff" }}>{sensor.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* -------------------------------------------------------- */}
                {/* VIEW 6: DEPLOYMENTS (Vercel, Cloudflare, Live Domains)   */}
                {/* -------------------------------------------------------- */}
                {activeTab === "Deployments" && (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <h3 style={{ margin: "0", fontFamily: "'Space Grotesk',sans-serif", fontSize: "20px", color: "#f3f6ff" }}>Active Deployments (4)</h3>
                        <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "rgba(233,235,242,.55)" }}>Production, preview environments, DNS routing and SSL certificates</p>
                      </div>
                      <button
                        onClick={handleDeploy}
                        style={{ padding: "8px 16px", borderRadius: "999px", background: "linear-gradient(180deg,#cdf3ff,#7ad6ff)", color: "#04060c", border: "none", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}
                      >
                        + Trigger Deploy
                      </button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {[
                        { domain: "https://aurora.studio", env: "Production", branch: "main", commit: "v2.4 Patch", status: "Ready", ping: "14ms" },
                        { domain: "https://staging.aurora.studio", env: "Staging", branch: "stage", commit: "8 Components AST", status: "Ready", ping: "18ms" },
                        { domain: "https://preview-0918.orbital.app", env: "Preview", branch: "feat/hero", commit: "Hero glass effect", status: "Building", ping: "--" }
                      ].map((dep, i) => (
                        <div key={i} style={{ padding: "16px 20px", borderRadius: "12px", border: "1px solid rgba(255,255,255,.1)", background: "rgba(10,15,26,.8)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }} className="orb-card-hover">
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: dep.status === "Ready" ? "#4ade80" : "#facc15" }} />
                              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "14px", fontWeight: "600", color: "#f2f6ff" }}>{dep.domain}</span>
                              <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: "rgba(255,255,255,.08)", color: "rgba(233,235,242,.7)" }}>{dep.env}</span>
                            </div>
                            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10.5px", color: "rgba(233,235,242,.45)", marginTop: "4px" }}>
                              Branch: {dep.branch} · Commit: {dep.commit}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "11px", color: "#4ade80" }}>{dep.ping}</span>
                            <button
                              onClick={() => handleChatSubmit(`Inspected deployment ${dep.domain}`)}
                              style={{ padding: "6px 12px", borderRadius: "6px", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", color: "#fff", fontSize: "11px", cursor: "pointer" }}
                            >
                              Visit →
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* -------------------------------------------------------- */}
                {/* VIEW 7: EXPORTS (Code Downloader & Target Selector)      */}
                {/* -------------------------------------------------------- */}
                {activeTab === "Exports" && (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "18px" }}>
                    <div>
                      <h3 style={{ margin: "0", fontFamily: "'Space Grotesk',sans-serif", fontSize: "20px", color: "#f3f6ff" }}>Export Source Code</h3>
                      <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "rgba(233,235,242,.55)" }}>Pure standalone code with zero runtime dependencies or vendor lock-in</p>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
                      {[
                        { id: "nextjs", label: "Next.js 16 (App Router)", icon: "▲" },
                        { id: "react", label: "React 19 + Tailwind", icon: "⚛️" },
                        { id: "html", label: "HTML5 / Vanilla CSS", icon: "🌐" },
                        { id: "flutter", label: "Flutter / Dart", icon: "📱" }
                      ].map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setExportTarget(t.id as any)}
                          style={{ padding: "14px", borderRadius: "12px", border: exportTarget === t.id ? "1px solid rgba(124,230,255,.6)" : "1px solid rgba(255,255,255,.1)", background: exportTarget === t.id ? "rgba(124,230,255,.15)" : "rgba(255,255,255,.03)", color: exportTarget === t.id ? "#7ce6ff" : "rgba(233,235,242,.7)", textAlign: "center", cursor: "pointer" }}
                        >
                          <div style={{ fontSize: "22px", marginBottom: "6px" }}>{t.icon}</div>
                          <div style={{ fontSize: "11px", fontWeight: "600" }}>{t.label}</div>
                        </button>
                      ))}
                    </div>

                    <div style={{ padding: "18px", borderRadius: "14px", border: "1px solid rgba(255,255,255,.1)", background: "rgba(6,10,18,.9)", display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "11px", color: "#7ce6ff" }}>CLONE REPO OR DOWNLOAD BUNDLE</span>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", color: "rgba(233,235,242,.5)" }}>MIT LICENSE</span>
                      </div>
                      <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(0,0,0,.5)", border: "1px solid rgba(255,255,255,.08)", fontFamily: "'IBM Plex Mono',monospace", fontSize: "11.5px", color: "#a48bff" }}>
                        git clone https://github.com/aurora-labs/aurora-studio.git
                      </div>
                      <button
                        onClick={() => {
                          setExportedZip(true);
                          setTimeout(() => setExportedZip(false), 3000);
                          handleChatSubmit(`Exported source bundle for target: ${exportTarget}`);
                        }}
                        style={{ alignSelf: "flex-start", padding: "10px 20px", borderRadius: "8px", background: "linear-gradient(180deg,#cdf3ff,#7ad6ff)", color: "#04060c", border: "none", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}
                      >
                        {exportedZip ? "ZIP Downloaded! ✓" : "Download .ZIP Bundle"}
                      </button>
                    </div>
                  </div>
                )}

                {/* -------------------------------------------------------- */}
                {/* VIEW 8: HISTORY (Version Time-Travel & Rollbacks)        */}
                {/* -------------------------------------------------------- */}
                {activeTab === "History" && (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div>
                      <h3 style={{ margin: "0", fontFamily: "'Space Grotesk',sans-serif", fontSize: "20px", color: "#f3f6ff" }}>Revision Timeline</h3>
                      <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "rgba(233,235,242,.55)" }}>Every voice command, pen stroke and patch is versioned with instant rollback</p>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {[
                        { ver: "v2.4 (Current)", action: "Applied glass cards & deep space navy palette", trigger: "AI Voice Input", time: "2m ago", active: true },
                        { ver: "v2.3", action: "Adjusted hero section height to 85vh", trigger: "Chat Edit", time: "14m ago", active: false },
                        { ver: "v2.2", action: "Injected 3 architecture cards with pricing tags", trigger: "Reasoning Resolution", time: "1h ago", active: false },
                        { ver: "v2.1", action: "Initial scan from paper sketch #0918", trigger: "Live Camera OCR", time: "2h ago", active: false }
                      ].map((rev, i) => (
                        <div key={i} style={{ padding: "14px 18px", borderRadius: "12px", border: rev.active ? "1px solid rgba(124,230,255,.5)" : "1px solid rgba(255,255,255,.08)", background: rev.active ? "rgba(124,230,255,.1)" : "rgba(10,15,26,.8)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "11.5px", fontWeight: "600", color: rev.active ? "#7ce6ff" : "#f2f6ff" }}>{rev.ver}</span>
                              <span style={{ fontSize: "10px", color: "rgba(233,235,242,.5)" }}>· {rev.trigger}</span>
                            </div>
                            <div style={{ fontSize: "12.5px", color: "rgba(233,235,242,.8)", marginTop: "4px" }}>{rev.action}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span style={{ fontSize: "11px", color: "rgba(233,235,242,.4)" }}>{rev.time}</span>
                            {!rev.active && (
                              <button
                                onClick={() => handleChatSubmit(`Rolled back to revision ${rev.ver}`)}
                                style={{ padding: "5px 10px", borderRadius: "6px", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", color: "#fff", fontSize: "10.5px", cursor: "pointer" }}
                              >
                                Restore
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* -------------------------------------------------------- */}
                {/* VIEW 9: SETTINGS (Project, Supabase, Team Access)        */}
                {/* -------------------------------------------------------- */}
                {activeTab === "Settings" && (
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div>
                      <h3 style={{ margin: "0", fontFamily: "'Space Grotesk',sans-serif", fontSize: "20px", color: "#f3f6ff" }}>Project Settings</h3>
                      <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "rgba(233,235,242,.55)" }}>Custom domain, Supabase database, and team permissions</p>
                    </div>

                    <div style={{ padding: "18px", borderRadius: "14px", border: "1px solid rgba(255,255,255,.1)", background: "rgba(8,14,24,.8)", display: "flex", flexDirection: "column", gap: "14px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "12px", alignItems: "center" }}>
                        <span style={{ fontSize: "12.5px", color: "rgba(233,235,242,.6)" }}>Project Name</span>
                        <input defaultValue="Aurora Labs" style={{ padding: "8px 12px", borderRadius: "8px", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", color: "#fff", fontSize: "12.5px" }} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "12px", alignItems: "center" }}>
                        <span style={{ fontSize: "12.5px", color: "rgba(233,235,242,.6)" }}>Custom Domain</span>
                        <input defaultValue="aurora.studio" style={{ padding: "8px 12px", borderRadius: "8px", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", color: "#7ce6ff", fontSize: "12.5px" }} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "12px", alignItems: "center" }}>
                        <span style={{ fontSize: "12.5px", color: "rgba(233,235,242,.6)" }}>Database</span>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "11.5px", color: "#4ade80" }}>● Supabase Postgres (Connected)</span>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Bottom Interactive Tool Dock */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", padding: "14px 18px", borderTop: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.025)" }}>
                {v.dock.map((dk, i0) => {
                  const isSelectedTool = activeTool === dk.t;
                  return (
                    <button
                      key={i0}
                      onClick={() => handleDockToolClick(dk.t)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 14px",
                        borderRadius: "10px",
                        border: isSelectedTool ? "1px solid rgba(124,230,255,.5)" : "1px solid rgba(255,255,255,.1)",
                        background: isSelectedTool ? "rgba(124,230,255,.15)" : "rgba(255,255,255,.04)",
                        fontSize: "12.5px",
                        color: isSelectedTool ? "#cdeaff" : "rgba(233,235,242,.75)",
                        cursor: "pointer",
                        transition: "all .2s ease"
                      }}
                      className="orb-card-hover"
                    >
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: dk.dot, boxShadow: isSelectedTool ? `0 0 8px ${dk.dot}` : "none" }} />
                      {dk.t}
                    </button>
                  );
                })}

                <span style={{ flex: "1" }} />

                {/* Deploy Button */}
                <button
                  onClick={handleDeploy}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "9px 16px",
                    borderRadius: "10px",
                    background: deploySuccess ? "#22c55e" : isDeploying ? "rgba(124,230,255,.2)" : "linear-gradient(180deg,#cdf3ff,#7ad6ff)",
                    border: "none",
                    fontFamily: "'IBM Plex Mono',monospace",
                    fontSize: "11px",
                    fontWeight: "600",
                    color: deploySuccess ? "#fff" : "#04060c",
                    cursor: "pointer",
                    boxShadow: "0 4px 18px rgba(122,214,255,.3)",
                    transition: "all .3s ease"
                  }}
                >
                  {isDeploying ? "DEPLOYING..." : deploySuccess ? "DEPLOYED ✓" : "DEPLOY ⌘⏎"}
                </button>
              </div>

              {/* Tool Feedback Toast */}
              {toolFeedback && (
                <div style={{ background: "rgba(124,230,255,.15)", borderTop: "1px solid rgba(124,230,255,.3)", padding: "6px 18px", fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", color: "#cdeaff", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#7ce6ff" }} />
                  {toolFeedback}
                </div>
              )}
            </div>

            {/* ============================================================ */}
            {/* 3. RIGHT AI ENGINEER PANEL (Interactive Chat & Real Inputs) */}
            {/* ============================================================ */}
            <aside style={{ borderLeft: "1px solid rgba(255,255,255,.08)", display: "flex", flexDirection: "column", background: "rgba(255,255,255,.015)" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", gap: "9px" }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#7ce6ff", boxShadow: "0 0 12px rgba(124,230,255,.8)" }} />
                <span style={{ fontSize: "13px", fontWeight: "600", color: "#f2f6ff" }}>
                  {"AI engineer"}
                </span>
                <span style={{ flex: "1" }} />
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "9.5px", color: "rgba(124,230,255,.8)", background: "rgba(124,230,255,.1)", padding: "2px 6px", borderRadius: "4px" }}>
                  {"LIVE AST"}
                </span>
              </div>

              {/* Chat & Reasoning Events Stream */}
              <div style={{ flex: "1", padding: "14px", display: "flex", flexDirection: "column", gap: "10px", overflowY: "auto", maxHeight: "450px" }}>
                {v.wsEvents.map((we, i0) => (
                  <div key={i0} style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", lineHeight: "1.4", color: we.color }}>
                    <span style={{ color: "rgba(124,230,255,.8)" }}>{we.mark}</span>
                    <span>{we.t}</span>
                  </div>
                ))}

                <div style={{ marginTop: "8px", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,.08)", display: "flex", flexDirection: "column", gap: "9px" }}>
                  {chatMessages.map((ch, i0) => (
                    <div
                      key={i0}
                      style={{
                        alignSelf: ch.align,
                        maxWidth: "90%",
                        padding: "10px 13px",
                        borderRadius: "12px",
                        border: `1px solid ${ch.border}`,
                        background: ch.bg,
                        fontSize: "12.5px",
                        lineHeight: "1.45",
                        color: ch.color,
                        boxShadow: "0 4px 14px rgba(0,0,0,.25)"
                      }}
                    >
                      {ch.t}
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Suggestion Pills */}
              <div style={{ padding: "8px 12px", display: "flex", flexWrap: "wrap", gap: "5px", borderTop: "1px solid rgba(255,255,255,.06)" }}>
                {[
                  "Make background darker",
                  "Add glass cards",
                  "Make hero taller"
                ].map((sug) => (
                  <button
                    key={sug}
                    onClick={() => handleChatSubmit(sug)}
                    style={{
                      padding: "3px 8px",
                      borderRadius: "6px",
                      border: "1px solid rgba(255,255,255,.1)",
                      background: "rgba(255,255,255,.04)",
                      color: "rgba(196,236,255,.85)",
                      fontSize: "10px",
                      fontFamily: "'IBM Plex Mono',monospace",
                      cursor: "pointer"
                    }}
                  >
                    + {sug}
                  </button>
                ))}
              </div>

              {/* Real Interactive Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleChatSubmit();
                }}
                style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,.08)" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "10px", border: "1px solid rgba(124,230,255,.3)", background: "rgba(10,16,28,.8)" }}>
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Speak or type an edit…"
                    style={{ flex: "1", background: "transparent", border: "none", outline: "none", color: "#f2f6ff", fontSize: "12.5px", fontFamily: "'IBM Plex Sans',sans-serif" }}
                  />
                  <button
                    type="submit"
                    style={{ padding: "4px 8px", borderRadius: "6px", background: "rgba(124,230,255,.15)", border: "1px solid rgba(124,230,255,.4)", color: "#7ce6ff", fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", fontWeight: "600", cursor: "pointer" }}
                  >
                    ↵ Send
                  </button>
                </div>
              </form>
            </aside>

          </div>
        </div>
      </div>
    </section>
  );
}
