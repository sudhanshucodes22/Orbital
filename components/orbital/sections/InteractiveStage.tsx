"use client";

import React, { useEffect, useRef, useState } from "react";

interface InteractiveStageProps {
  stepIndex: number;
  stageTitle: string;
  stageMeta: string;
  stageLog: string;
}

export function InteractiveStage({ stepIndex, stageTitle, stageMeta, stageLog }: InteractiveStageProps) {
  // Step 0: Draw state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [drawColor, setDrawColor] = useState("#7ce6ff");

  // Step 2: Voice state
  const [voiceActive, setVoiceActive] = useState(true);
  const [voiceTextIndex, setVoiceTextIndex] = useState(0);
  const voicePrompts = [
    "Make the navbar frosted glass and add pricing cards.",
    "Darken the background to deep space navy.",
    "Make the hero card interactive with 3D rotation.",
    "Increase padding and make it look like Apple design."
  ];

  // Step 3: Understand state
  const [activeAnalysisNode, setActiveAnalysisNode] = useState(1);

  // Step 4: Build state
  const [buildTab, setBuildTab] = useState<"code" | "preview">("preview");
  const [buildProgress, setBuildProgress] = useState(100);

  // Step 5: Ship state
  const [copied, setCopied] = useState(false);
  const [deployStep, setDeployStep] = useState(4);

  // Draw initial wireframe on Step 0 canvas
  const drawWireframeTemplate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#7ce6ff";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(124,230,255,0.4)";
    ctx.shadowBlur = 4;

    // Navbar outline
    ctx.strokeRect(20, 16, canvas.width - 40, 22);
    ctx.fillStyle = "rgba(124,230,255,0.15)";
    ctx.fillRect(20, 16, canvas.width - 40, 22);
    
    // Logo & links
    ctx.beginPath();
    ctx.arc(32, 27, 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeRect(canvas.width - 65, 20, 35, 14);

    // Hero box
    ctx.strokeRect(20, 48, canvas.width - 40, 68);
    ctx.fillStyle = "rgba(124,230,255,0.08)";
    ctx.fillRect(20, 48, canvas.width - 40, 68);

    // Headline lines
    ctx.beginPath();
    ctx.moveTo(35, 66);
    ctx.lineTo(160, 66);
    ctx.moveTo(35, 78);
    ctx.lineTo(120, 78);
    ctx.stroke();

    // Hero button
    ctx.strokeRect(35, 90, 48, 16);

    // 3 Cards
    const cardW = (canvas.width - 60) / 3;
    for (let i = 0; i < 3; i++) {
      const cx = 20 + i * (cardW + 10);
      ctx.strokeRect(cx, 126, cardW, 58);
      ctx.fillStyle = "rgba(164,139,255,0.08)";
      ctx.fillRect(cx, 126, cardW, 58);

      ctx.beginPath();
      ctx.moveTo(cx + 8, 140);
      ctx.lineTo(cx + cardW - 8, 140);
      ctx.moveTo(cx + 8, 150);
      ctx.lineTo(cx + cardW - 20, 150);
      ctx.stroke();
    }

    setHasDrawn(true);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  useEffect(() => {
    if (stepIndex === 0) {
      const canvas = canvasRef.current;
      if (canvas) {
        // Set canvas resolution to match client display
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width || 380;
        canvas.height = rect.height || 210;
        drawWireframeTemplate();
      }
    }
  }, [stepIndex]);

  // Voice text rotation
  useEffect(() => {
    if (stepIndex === 2 && voiceActive) {
      const interval = setInterval(() => {
        setVoiceTextIndex((prev) => (prev + 1) % voicePrompts.length);
      }, 3600);
      return () => clearInterval(interval);
    }
  }, [stepIndex, voiceActive]);

  // Canvas mouse handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    isDrawing.current = true;
    lastPos.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !lastPos.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    ctx.strokeStyle = drawColor;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = drawColor;
    ctx.shadowBlur = 6;

    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(currentX, currentY);
    ctx.stroke();

    lastPos.current = { x: currentX, y: currentY };
    setHasDrawn(true);
  };

  const handlePointerUp = () => {
    isDrawing.current = false;
    lastPos.current = null;
  };

  return (
    <div style={{ position: "relative", borderRadius: "20px", border: "1px solid rgba(255,255,255,.14)", background: "linear-gradient(170deg,rgba(14,20,34,.94),rgba(6,9,16,.96))", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "0 40px 120px rgba(0,0,0,.7)", overflow: "hidden", minHeight: "460px", display: "flex", flexDirection: "column" }}>
      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)", fontFamily: "'IBM Plex Mono',monospace", fontSize: "10.5px", letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(233,235,242,.65)" }}>
        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#7ce6ff", boxShadow: "0 0 8px #7ce6ff" }} />
        <span style={{ fontWeight: "600", color: "#f2f6ff" }}>{stageTitle}</span>
        <span style={{ flex: "1" }} />
        <span style={{ color: "rgba(124,230,255,.9)", background: "rgba(124,230,255,.1)", padding: "3px 8px", borderRadius: "6px", border: "1px solid rgba(124,230,255,.25)" }}>
          {stageMeta}
        </span>
      </div>

      {/* Main Interactive Stage Body */}
      <div style={{ flex: "1", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: "440px", display: "flex", flexDirection: "column", gap: "14px" }}>
          
          {/* STAGE CONTAINER */}
          <div style={{ aspectRatio: "16/10.5", borderRadius: "14px", border: "1px solid rgba(255,255,255,.14)", background: "rgba(6,10,18,.85)", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 10px 30px rgba(0,0,0,.5) inset" }}>
            
            {/* ============================================================ */}
            {/* STEP 0: DRAW (Interactive Canvas with live sketch tools)     */}
            {/* ============================================================ */}
            {stepIndex === 0 && (
              <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
                {/* Background grid */}
                <div style={{ position: "absolute", inset: "0", backgroundImage: "radial-gradient(rgba(124,230,255,.12) 1px, transparent 1px)", backgroundSize: "16px 16px", pointerEvents: "none" }} />
                
                {/* Canvas Drawing Area */}
                <canvas
                  ref={canvasRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  style={{ width: "100%", height: "100%", touchAction: "none", cursor: "crosshair", position: "relative", zIndex: 2 }}
                />

                {/* Floating Canvas Controls */}
                <div style={{ position: "absolute", bottom: "10px", left: "12px", right: "12px", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", pointerEvents: "auto" }}>
                  <div style={{ display: "flex", gap: "6px", background: "rgba(8,12,22,.85)", padding: "4px 8px", borderRadius: "8px", border: "1px solid rgba(255,255,255,.12)", backdropFilter: "blur(8px)" }}>
                    {["#7ce6ff", "#a48bff", "#ffffff", "#ff8f8f"].map((c) => (
                      <button
                        key={c}
                        onClick={() => setDrawColor(c)}
                        style={{ width: "14px", height: "14px", borderRadius: "50%", background: c, border: drawColor === c ? "2px solid #fff" : "1px solid rgba(255,255,255,.3)", cursor: "pointer", padding: 0 }}
                        title={`Color ${c}`}
                      />
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={clearCanvas}
                      style={{ padding: "4px 9px", borderRadius: "6px", border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.08)", color: "rgba(233,235,242,.8)", fontSize: "10px", fontFamily: "'IBM Plex Mono',monospace", cursor: "pointer" }}
                    >
                      Clear
                    </button>
                    <button
                      onClick={drawWireframeTemplate}
                      style={{ padding: "4px 9px", borderRadius: "6px", border: "1px solid rgba(124,230,255,.4)", background: "rgba(124,230,255,.15)", color: "#cdeaff", fontSize: "10px", fontFamily: "'IBM Plex Mono',monospace", cursor: "pointer", fontWeight: "500" }}
                    >
                      Reset Wireframe
                    </button>
                  </div>
                </div>

                {/* Instruction banner */}
                <div style={{ position: "absolute", top: "10px", left: "12px", zIndex: 10, background: "rgba(8,12,22,.8)", padding: "3px 8px", borderRadius: "6px", border: "1px solid rgba(124,230,255,.25)", fontFamily: "'IBM Plex Mono',monospace", fontSize: "9px", color: "rgba(124,230,255,.9)", display: "flex", alignItems: "center", gap: "5px" }}>
                  <span>✏️</span>
                  <span>Draw anywhere with mouse/touch</span>
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* STEP 1: SHOW (Futuristic Camera Scanner & OCR Radar)         */}
            {/* ============================================================ */}
            {stepIndex === 1 && (
              <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* Optical Grid & Viewfinder */}
                <div style={{ position: "absolute", inset: "0", backgroundImage: "linear-gradient(rgba(124,230,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(124,230,255,.05) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
                
                {/* Corner reticles */}
                <div style={{ position: "absolute", top: "12px", left: "12px", width: "16px", height: "16px", borderTop: "2px solid #7ce6ff", borderLeft: "2px solid #7ce6ff" }} />
                <div style={{ position: "absolute", top: "12px", right: "12px", width: "16px", height: "16px", borderTop: "2px solid #7ce6ff", borderRight: "2px solid #7ce6ff" }} />
                <div style={{ position: "absolute", bottom: "12px", left: "12px", width: "16px", height: "16px", borderBottom: "2px solid #7ce6ff", borderLeft: "2px solid #7ce6ff" }} />
                <div style={{ position: "absolute", bottom: "12px", right: "12px", width: "16px", height: "16px", borderBottom: "2px solid #7ce6ff", borderRight: "2px solid #7ce6ff" }} />

                {/* Laser scan beam */}
                <div style={{ position: "absolute", left: "0", right: "0", height: "35%", background: "linear-gradient(180deg, transparent, rgba(124,230,255,.28))", borderBottom: "2px solid #7ce6ff", boxShadow: "0 0 20px rgba(124,230,255,.8)", animation: "scanY 2.4s ease-in-out infinite", pointerEvents: "none", zIndex: 5 }} />

                {/* Simulated Wireframe with AI Bounding Boxes */}
                <div style={{ width: "84%", height: "78%", border: "1px dashed rgba(255,255,255,.2)", borderRadius: "8px", padding: "10px", display: "flex", flexDirection: "column", gap: "8px", position: "relative" }}>
                  {/* Bounding box 1: Navbar */}
                  <div style={{ height: "18px", borderRadius: "4px", border: "1px solid rgba(124,230,255,.8)", background: "rgba(124,230,255,.12)", position: "relative", display: "flex", alignItems: "center", padding: "0 6px" }}>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8px", color: "#7ce6ff", letterSpacing: ".06em" }}>[NAVBAR · 99%]</span>
                  </div>

                  {/* Bounding box 2: Hero */}
                  <div style={{ height: "54px", borderRadius: "6px", border: "1px solid rgba(164,139,255,.8)", background: "rgba(164,139,255,.12)", position: "relative", padding: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8px", color: "#c9a7ff" }}>[HERO_TITLE · 97%]</span>
                    <span style={{ width: "65%", height: "6px", background: "rgba(255,255,255,.3)", borderRadius: "2px" }} />
                    <span style={{ width: "40%", height: "6px", background: "rgba(255,255,255,.2)", borderRadius: "2px" }} />
                  </div>

                  {/* Bounding box 3: Cards */}
                  <div style={{ flex: "1", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
                    {[1, 2, 3].map((i) => (
                      <div key={i} style={{ borderRadius: "4px", border: "1px solid rgba(124,230,255,.6)", background: "rgba(124,230,255,.08)", padding: "4px", display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "7px", color: "#7ce6ff" }}>CARD_0{i}</span>
                        <span style={{ width: "80%", height: "4px", background: "rgba(255,255,255,.2)", borderRadius: "2px" }} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Radar Status Badge */}
                <div style={{ position: "absolute", top: "10px", right: "14px", background: "rgba(6,12,22,.85)", border: "1px solid rgba(124,230,255,.4)", borderRadius: "6px", padding: "3px 7px", fontFamily: "'IBM Plex Mono',monospace", fontSize: "8.5px", color: "#7ce6ff", display: "flex", alignItems: "center", gap: "5px" }}>
                  <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#7ce6ff", animation: "pulseRing 1.8s infinite" }} />
                  AI VISION · 4K OCR
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* STEP 2: SPEAK (Siri/Gemini Live Style Voice Visualizer)     */}
            {/* ============================================================ */}
            {stepIndex === 2 && (
              <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px" }}>
                {/* Dynamic Glowing Orb / Audio Reactive Waves */}
                <div style={{ position: "relative", width: "70px", height: "70px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "14px" }}>
                  {/* Outer pulse glow rings */}
                  <div style={{ position: "absolute", inset: "-12px", borderRadius: "50%", background: "radial-gradient(circle, rgba(124,230,255,.35), transparent 70%)", animation: "pulseRing 2.4s ease-out infinite" }} />
                  <div style={{ position: "absolute", inset: "-4px", borderRadius: "50%", background: "radial-gradient(circle, rgba(164,139,255,.45), transparent 65%)", animation: "pulseRing 2.4s ease-out infinite 0.6s" }} />
                  
                  {/* Central glowing sphere */}
                  <div style={{ position: "relative", width: "54px", height: "54px", borderRadius: "50%", background: "linear-gradient(135deg,#7ce6ff,#a48bff,#f472b6)", boxShadow: "0 0 28px rgba(124,230,255,.8), 0 0 14px rgba(164,139,255,.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: "20px" }}>🎙️</span>
                  </div>
                </div>

                {/* Multichannel Sound Spectrogram */}
                <div style={{ display: "flex", alignItems: "center", gap: "3.5px", height: "30px", marginBottom: "14px" }}>
                  {[18, 28, 14, 32, 24, 30, 16, 26, 32, 20, 14].map((h, idx) => (
                    <span
                      key={idx}
                      style={{
                        width: "3px",
                        height: `${h}px`,
                        borderRadius: "3px",
                        background: idx % 2 === 0 ? "linear-gradient(180deg,#7ce6ff,#38bdf8)" : "linear-gradient(180deg,#c084fc,#a48bff)",
                        animation: `bar ${0.6 + (idx % 4) * 0.2}s ease-in-out infinite ${idx * 0.08}s`,
                      }}
                    />
                  ))}
                </div>

                {/* Live Transcript Typing Bubble */}
                <div style={{ padding: "8px 14px", borderRadius: "12px", border: "1px solid rgba(124,230,255,.3)", background: "rgba(10,18,32,.85)", maxWidth: "340px", textAlign: "center" }}>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "12.5px", color: "#f0f7ff", fontWeight: "500", lineHeight: "1.4" }}>
                    "{voicePrompts[voiceTextIndex]}"
                  </div>
                  <div style={{ marginTop: "4px", fontFamily: "'IBM Plex Mono',monospace", fontSize: "9px", color: "rgba(124,230,255,.8)" }}>
                    ✓ 99.4% intent match · 0 regenerations
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* STEP 3: UNDERSTAND (Neural Reasoning & Semantic Graph)       */}
            {/* ============================================================ */}
            {stepIndex === 3 && (
              <div style={{ position: "relative", width: "100%", height: "100%", padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                {/* Node Graph Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "9.5px", color: "rgba(164,139,255,.9)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#a48bff", boxShadow: "0 0 6px #a48bff" }} />
                    NEURAL INTENT DECOMPOSITION
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "9px", color: "rgba(233,235,242,.45)" }}>AST PARSER</span>
                </div>

                {/* Interactive Semantic Graph Nodes */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", margin: "10px 0" }}>
                  {[
                    { title: "Wireframe", desc: "3x Cards Detected", conf: "99.1%" },
                    { title: "Context", desc: "Pricing Intent", conf: "98.4%" },
                    { title: "Constraint", desc: "WCAG AAA 14:1", conf: "100%" }
                  ].map((node, i) => (
                    <div
                      key={i}
                      onClick={() => setActiveAnalysisNode(i)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "10px",
                        border: activeAnalysisNode === i ? "1px solid rgba(124,230,255,.6)" : "1px solid rgba(255,255,255,.1)",
                        background: activeAnalysisNode === i ? "rgba(124,230,255,.12)" : "rgba(255,255,255,.03)",
                        cursor: "pointer",
                        transition: "all .2s ease"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "11px", fontWeight: "600", color: "#f2f6ff" }}>{node.title}</span>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8px", color: "#7ce6ff" }}>{node.conf}</span>
                      </div>
                      <div style={{ marginTop: "4px", fontSize: "9.5px", color: "rgba(233,235,242,.55)" }}>{node.desc}</div>
                    </div>
                  ))}
                </div>

                {/* Ambiguity Resolution Box */}
                <div style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(164,139,255,.35)", background: "rgba(164,139,255,.1)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                  <div style={{ fontSize: "11px", color: "#e8e5ff" }}>
                    <strong style={{ color: "#7ce6ff" }}>Decision committed:</strong> Pricing cards with monthly toggle
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "9px", padding: "2px 6px", borderRadius: "4px", background: "rgba(124,230,255,.2)", color: "#cdeaff" }}>
                    RESOLVED
                  </span>
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* STEP 4: BUILD (Live React/Tailwind Code & UI Assembly Engine) */}
            {/* ============================================================ */}
            {stepIndex === 4 && (
              <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
                {/* Build Tab Switcher */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)" }}>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={() => setBuildTab("preview")}
                      style={{ padding: "3px 8px", borderRadius: "6px", border: buildTab === "preview" ? "1px solid rgba(124,230,255,.5)" : "1px solid transparent", background: buildTab === "preview" ? "rgba(124,230,255,.15)" : "transparent", color: buildTab === "preview" ? "#7ce6ff" : "rgba(233,235,242,.5)", fontFamily: "'IBM Plex Mono',monospace", fontSize: "9.5px", cursor: "pointer" }}
                    >
                      UI Preview
                    </button>
                    <button
                      onClick={() => setBuildTab("code")}
                      style={{ padding: "3px 8px", borderRadius: "6px", border: buildTab === "code" ? "1px solid rgba(124,230,255,.5)" : "1px solid transparent", background: buildTab === "code" ? "rgba(124,230,255,.15)" : "transparent", color: buildTab === "code" ? "#7ce6ff" : "rgba(233,235,242,.5)", fontFamily: "'IBM Plex Mono',monospace", fontSize: "9.5px", cursor: "pointer" }}
                    >
                      Generated TSX
                    </button>
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "9px", color: "#4ade80" }}>✓ 8/8 COMPONENTS MOUNTED</span>
                </div>

                {/* Tab Content */}
                <div style={{ flex: "1", padding: "12px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  {buildTab === "preview" ? (
                    <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "8px", justifyContent: "center" }}>
                      {/* Assembled Mini Component */}
                      <div style={{ borderRadius: "10px", border: "1px solid rgba(124,230,255,.3)", background: "linear-gradient(168deg,#121b2d,#090d16)", padding: "10px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "12px", fontWeight: "600", color: "#fff" }}>Aurora Pro Suite</span>
                          <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "999px", background: "linear-gradient(180deg,#cdf3ff,#7ad6ff)", color: "#04060c", fontWeight: "500" }}>$29/mo</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
                          {["TypeScript", "Tailwind", "Responsive"].map((feat) => (
                            <div key={feat} style={{ padding: "4px 6px", borderRadius: "5px", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", fontSize: "9px", color: "rgba(233,235,242,.8)", textAlign: "center" }}>
                              {feat}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ flex: "1", fontFamily: "'IBM Plex Mono',monospace", fontSize: "9.5px", lineHeight: "1.6", color: "rgba(196,236,255,.9)", background: "rgba(3,6,12,.7)", padding: "8px 10px", borderRadius: "8px", overflow: "auto" }}>
                      <span style={{ color: "#f472b6" }}>export function</span> <span style={{ color: "#60a5fa" }}>PricingCard</span>({"{ plan }"}) {"{\n"}
                      {"  "}<span style={{ color: "#f472b6" }}>return</span> ({"\n"}
                      {"    "}&lt;<span style={{ color: "#38bdf8" }}>div</span> className=<span style={{ color: "#34d399" }}>"glass-card p-4 rounded-xl"</span>&gt;{"\n"}
                      {"      "}&lt;<span style={{ color: "#38bdf8" }}>h3</span>&gt;{'{plan.name}'}&lt;/<span style={{ color: "#38bdf8" }}>h3</span>&gt;{"\n"}
                      {"    "}&lt;/<span style={{ color: "#38bdf8" }}>div</span>&gt;{"\n"}
                      {"  "});{"\n"}
                      {"}"}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* STEP 5: SHIP (Global Cloud Edge Deployment & Live URL)       */}
            {/* ============================================================ */}
            {stepIndex === 5 && (
              <div style={{ position: "relative", width: "100%", height: "100%", padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                {/* Global Edge Node Broadcast status */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "9.5px", color: "#4ade80", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 8px #4ade80" }} />
                    GLOBAL EDGE DEPLOYMENT ACTIVE
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "9px", color: "rgba(124,230,255,.9)" }}>42ms</span>
                </div>

                {/* Edge Map Simulation Nodes */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px", margin: "6px 0" }}>
                  {[
                    { city: "SFO", ping: "12ms" },
                    { city: "LHR", ping: "18ms" },
                    { city: "HND", ping: "24ms" },
                    { city: "FRA", ping: "16ms" }
                  ].map((node) => (
                    <div key={node.city} style={{ padding: "6px 4px", borderRadius: "8px", background: "rgba(74,222,128,.08)", border: "1px solid rgba(74,222,128,.3)", textAlign: "center" }}>
                      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "9px", fontWeight: "600", color: "#fff" }}>{node.city}</div>
                      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8px", color: "#4ade80" }}>{node.ping}</div>
                    </div>
                  ))}
                </div>

                {/* Live URL Pill with Copy action */}
                <div style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid rgba(124,230,255,.4)", background: "rgba(10,18,32,.9)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "14px" }}>🚀</span>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "12px", color: "#cdeaff", fontWeight: "500" }}>https://aurora.studio</span>
                  </div>
                  <button
                    onClick={() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    style={{ padding: "4px 10px", borderRadius: "999px", background: "linear-gradient(180deg,#cdf3ff,#7ad6ff)", color: "#04060c", border: "none", fontSize: "10px", fontWeight: "600", cursor: "pointer" }}
                  >
                    {copied ? "Copied! ✓" : "Visit Live"}
                  </button>
                </div>

                {/* Lighthouse 100 Badges */}
                <div style={{ display: "flex", justifyContent: "space-around", paddingTop: "4px" }}>
                  {["Performance 100", "A11y 100", "Best Practices 100", "SEO 100"].map((score) => (
                    <span key={score} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8px", color: "#4ade80", background: "rgba(74,222,128,.12)", padding: "2px 6px", borderRadius: "4px", border: "1px solid rgba(74,222,128,.3)" }}>
                      ✓ {score}
                    </span>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Dynamic Console / Stage Log */}
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "11px", lineHeight: "1.7", color: "rgba(196,236,255,.9)", minHeight: "68px", padding: "12px 14px", borderRadius: "10px", background: "rgba(6,10,18,.6)", border: "1px solid rgba(255,255,255,.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "rgba(124,230,255,.8)", marginBottom: "4px", fontSize: "9.5px", letterSpacing: ".1em", textTransform: "uppercase" }}>
              <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#7ce6ff" }} />
              Telemetry Console
            </div>
            {stageLog}
          </div>

        </div>
      </div>
    </div>
  );
}
