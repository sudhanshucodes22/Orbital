"use client";

import React, { useState } from "react";
import type { Vals } from "../types";

export function ConversationalEditing({ v }: { v: Vals }) {
  // Preset styles that change the live website in real-time
  const [activePreset, setActivePreset] = useState<string>("glass");
  const [inputText, setInputText] = useState<string>("");
  const [chatLog, setChatLog] = useState([
    { role: "user", text: "Make the hero section darker.", time: "10:42 AM" },
    { role: "ai", text: "Done — background dropped two stops. Contrast AAA.", time: "10:42 AM" },
    { role: "user", text: "Add a glass effect and rounded cards.", time: "10:43 AM" },
    { role: "ai", text: "Applied backdrop-filter: blur(16px). All 3 components updated.", time: "10:43 AM" }
  ]);

  // Live state applied to the preview
  const [siteState, setSiteState] = useState({
    bg: "linear-gradient(160deg,#0a1220,#04070f)",
    border: "rgba(124,230,255,.4)",
    cardBg: "rgba(124,230,255,.08)",
    cardBorder: "rgba(124,230,255,.3)",
    cardRadius: "16px",
    cardBlur: "blur(16px)",
    badge: "GLASS · FROSTED",
    heroSpacing: "32px",
    accentColor: "#7ce6ff"
  });

  const applyPreset = (presetKey: string) => {
    setActivePreset(presetKey);

    if (presetKey === "dark") {
      setSiteState({
        bg: "linear-gradient(160deg,#04060a,#010204)",
        border: "rgba(255,255,255,.15)",
        cardBg: "rgba(255,255,255,.03)",
        cardBorder: "rgba(255,255,255,.08)",
        cardRadius: "12px",
        cardBlur: "none",
        badge: "DEEP SPACE · DARK",
        heroSpacing: "28px",
        accentColor: "#93c5fd"
      });
      addChatMessage("Make the hero section ultra-dark space theme.", "Dropped luminance to 2%. Contrast verified AAA.");
    } else if (presetKey === "glass") {
      setSiteState({
        bg: "linear-gradient(160deg,#0e182c,#070c17)",
        border: "rgba(124,230,255,.45)",
        cardBg: "rgba(124,230,255,.1)",
        cardBorder: "rgba(124,230,255,.35)",
        cardRadius: "18px",
        cardBlur: "blur(18px)",
        badge: "FROSTED GLASS · BLUR 18PX",
        heroSpacing: "32px",
        accentColor: "#7ce6ff"
      });
      addChatMessage("Add a frosted glass effect to all cards.", "Applied backdrop-filter: blur(18px) with subtle cyan refraction.");
    } else if (presetKey === "spacing") {
      setSiteState((prev) => ({
        ...prev,
        heroSpacing: "44px",
        cardRadius: "22px",
        badge: "SPACIOUS · LUXURY 44PX"
      }));
      addChatMessage("Increase padding and card spacing.", "Expanded vertical rhythm from 28px to 44px.");
    } else if (presetKey === "apple") {
      setSiteState({
        bg: "linear-gradient(160deg,#18181b,#09090b)",
        border: "rgba(255,255,255,.2)",
        cardBg: "rgba(255,255,255,.06)",
        cardBorder: "rgba(255,255,255,.12)",
        cardRadius: "24px",
        cardBlur: "blur(20px)",
        badge: "APPLE MINIMALIST · RADIUS 24PX",
        heroSpacing: "38px",
        accentColor: "#f43f5e"
      });
      addChatMessage("Make it look like an Apple product page.", "Pill buttons injected, SF Pro typography rhythm locked.");
    } else if (presetKey === "cyber") {
      setSiteState({
        bg: "linear-gradient(160deg,#0a001a,#03000a)",
        border: "rgba(244,63,94,.5)",
        cardBg: "rgba(244,63,94,.08)",
        cardBorder: "rgba(244,63,94,.35)",
        cardRadius: "14px",
        cardBlur: "blur(12px)",
        badge: "NEON CYBER · #FF2A85",
        heroSpacing: "34px",
        accentColor: "#f43f5e"
      });
      addChatMessage("Inject cyberpunk neon pink accents.", "Applied electric neon accents across borders and badges.");
    }
  };

  const addChatMessage = (userText: string, aiText: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChatLog((prev) => [
      ...prev,
      { role: "user", text: userText, time },
      { role: "ai", text: aiText, time }
    ]);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const lower = inputText.toLowerCase();
    if (lower.includes("dark") || lower.includes("black")) {
      applyPreset("dark");
    } else if (lower.includes("glass") || lower.includes("frost")) {
      applyPreset("glass");
    } else if (lower.includes("space") || lower.includes("padding") || lower.includes("gap")) {
      applyPreset("spacing");
    } else if (lower.includes("apple") || lower.includes("minimal")) {
      applyPreset("apple");
    } else if (lower.includes("neon") || lower.includes("cyber") || lower.includes("pink")) {
      applyPreset("cyber");
    } else {
      applyPreset("glass");
      addChatMessage(inputText, `Applied "${inputText}". AST patched without full page reload.`);
    }

    setInputText("");
  };

  return (
    <section className="r-section r-pad-lg" style={{ position: "relative", padding: "0 28px 130px" }}>
      <div style={{ maxWidth: "1180px", margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0,.95fr) minmax(0,1.05fr)", gap: "48px", alignItems: "center" }} className="r-2col">
        
        {/* Left Side: Interactive Conversational Stream */}
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontFamily: "'IBM Plex Mono',monospace", fontSize: "10.5px", letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(164,139,255,.9)", background: "rgba(164,139,255,.1)", padding: "4px 10px", borderRadius: "999px", border: "1px solid rgba(164,139,255,.25)" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#a48bff" }} />
            Live conversational editing · F26
          </div>

          <h2 style={{ margin: "16px 0 0", fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "clamp(26px,3.2vw,42px)", letterSpacing: "-.03em", lineHeight: "1.05", color: "#f2f6ff" }}>
            {"You don't regenerate."}
            <br />
            {"You keep talking."}
          </h2>

          <p style={{ marginTop: "12px", fontSize: "14px", color: "rgba(233,235,242,.6)", lineHeight: "1.6", maxWidth: "420px" }}>
            The conversation is the compiler. Say changes naturally — Orbital patches the running tree in-place without losing your images or copy.
          </p>

          {/* Dynamic Voice/Chat Bubble History */}
          <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "10px", maxHeight: "230px", overflowY: "auto", paddingRight: "6px" }}>
            {chatLog.map((msg, i0) => (
              <div key={i0} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div
                  style={{
                    maxWidth: "88%",
                    padding: "10px 14px",
                    borderRadius: "14px",
                    border: msg.role === "user" ? "1px solid rgba(124,230,255,.4)" : "1px solid rgba(164,139,255,.3)",
                    background: msg.role === "user" ? "linear-gradient(145deg,rgba(16,28,48,.9),rgba(8,12,22,.95))" : "linear-gradient(145deg,rgba(22,18,40,.9),rgba(10,8,20,.95))",
                    fontSize: "13px",
                    lineHeight: "1.45",
                    color: msg.role === "user" ? "#e9f8ff" : "#efeaff",
                    boxShadow: "0 6px 20px rgba(0,0,0,.35)"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "9px", color: msg.role === "user" ? "#7ce6ff" : "#a48bff", fontWeight: "600" }}>
                      {msg.role === "user" ? "YOU (VOICE)" : "ORBITAL AI"}
                    </span>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "8.5px", color: "rgba(255,255,255,.3)" }}>
                      {msg.time}
                    </span>
                  </div>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Interactive Prompt Chips */}
          <div style={{ marginTop: "16px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {[
              { id: "glass", label: "✨ Glass cards" },
              { id: "dark", label: "🌑 Darker hero" },
              { id: "spacing", label: "📐 More spacing" },
              { id: "apple", label: "🍎 Apple styling" },
              { id: "cyber", label: "⚡ Cyberpunk neon" }
            ].map((chip) => (
              <button
                key={chip.id}
                onClick={() => applyPreset(chip.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "999px",
                  border: activePreset === chip.id ? "1px solid #7ce6ff" : "1px solid rgba(255,255,255,.12)",
                  background: activePreset === chip.id ? "rgba(124,230,255,.18)" : "rgba(255,255,255,.04)",
                  color: activePreset === chip.id ? "#7ce6ff" : "rgba(233,235,242,.75)",
                  fontSize: "11.5px",
                  fontWeight: activePreset === chip.id ? "600" : "400",
                  cursor: "pointer",
                  transition: "all .2s ease"
                }}
                className="orb-card-hover"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Real Interactive Input Form */}
          <form onSubmit={handleCustomSubmit} style={{ marginTop: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "999px", border: "1px solid rgba(124,230,255,.35)", background: "rgba(10,16,28,.85)", boxShadow: "0 10px 30px rgba(0,0,0,.4)" }}>
              <span style={{ display: "flex", alignItems: "flex-end", gap: "2.5px", height: "16px" }}>
                <span style={{ width: "2.5px", height: "100%", borderRadius: "2px", background: "#7ce6ff", animation: "bar 0.8s infinite" }} />
                <span style={{ width: "2.5px", height: "70%", borderRadius: "2px", background: "#a48bff", animation: "bar 0.8s infinite 0.15s" }} />
                <span style={{ width: "2.5px", height: "90%", borderRadius: "2px", background: "#7ce6ff", animation: "bar 0.8s infinite 0.3s" }} />
              </span>
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Speak or type an edit (e.g., 'Make it cyber neon')..."
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#f2f6ff", fontSize: "12.5px" }}
              />
              <button
                type="submit"
                style={{ padding: "5px 12px", borderRadius: "999px", background: "linear-gradient(180deg,#cdf3ff,#7ad6ff)", color: "#04060c", border: "none", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}
              >
                ↵ Send
              </button>
            </div>
          </form>
        </div>

        {/* Right Side: Dynamically Morphing Live Website Preview */}
        <div style={{ position: "relative" }}>
          <div
            style={{
              borderRadius: "20px",
              border: `1px solid ${siteState.border}`,
              background: siteState.bg,
              boxShadow: "0 40px 110px rgba(0,0,0,.7), 0 0 30px rgba(124,230,255,.1)",
              overflow: "hidden",
              transition: "all .6s cubic-bezier(.4,0,.2,1)"
            }}
          >
            {/* Top Navigation Bar */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)" }}>
              <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: `linear-gradient(140deg, ${siteState.accentColor}, #a48bff)` }} />
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "13px", fontWeight: "600", color: "#fff" }}>
                Aurora Studio
              </span>
              <span style={{ flex: "1" }} />
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "9px", color: siteState.accentColor, background: "rgba(255,255,255,.06)", padding: "3px 8px", borderRadius: "999px", border: `1px solid ${siteState.border}` }}>
                {siteState.badge}
              </span>
            </div>

            {/* Main Canvas Body */}
            <div style={{ padding: siteState.heroSpacing, transition: "padding .6s ease" }}>
              <div style={{ display: "inline-block", fontSize: "10px", fontFamily: "'IBM Plex Mono',monospace", color: siteState.accentColor, background: "rgba(255,255,255,.05)", padding: "2px 8px", borderRadius: "4px", marginBottom: "10px" }}>
                ARCHITECTURE & INTERIORS
              </div>

              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "clamp(24px,2.8vw,36px)", lineHeight: "1.05", letterSpacing: "-.03em", color: "#fff" }}>
                Light, glass and
                <br />
                quiet rooms.
              </div>

              <div style={{ marginTop: "12px", fontSize: "13px", color: "rgba(233,235,242,.65)", maxWidth: "340px", lineHeight: "1.5" }}>
                An architectural practice working between Copenhagen and Kyoto, mostly in daylight.
              </div>

              {/* 3 Real Product / Architecture Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginTop: "24px" }}>
                {[
                  { k: "S01", t: "Residential", d: "Nine houses, mostly timber." },
                  { k: "S02", t: "Cultural", d: "A concert hall in Aarhus." },
                  { k: "S03", t: "Interiors", d: "Glass, oak and quiet light." }
                ].map((vc, i0) => (
                  <div
                    key={i0}
                    style={{
                      padding: "16px 14px",
                      borderRadius: siteState.cardRadius,
                      border: `1px solid ${siteState.cardBorder}`,
                      background: siteState.cardBg,
                      backdropFilter: siteState.cardBlur,
                      WebkitBackdropFilter: siteState.cardBlur,
                      transition: "all .6s ease",
                      boxShadow: "0 8px 24px rgba(0,0,0,.3)"
                    }}
                    className="orb-card-hover"
                  >
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "9px", color: siteState.accentColor, fontWeight: "600" }}>
                      {vc.k}
                    </div>
                    <div style={{ marginTop: "10px", fontSize: "13px", fontWeight: "600", color: "#f2f6ff" }}>
                      {vc.t}
                    </div>
                    <div style={{ marginTop: "4px", fontSize: "11px", lineHeight: "1.4", color: "rgba(233,235,242,.55)" }}>
                      {vc.d}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom CTA Button */}
              <div style={{ marginTop: "20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <button
                  style={{
                    padding: "9px 18px",
                    borderRadius: "999px",
                    background: "linear-gradient(180deg,#cdf3ff,#7ad6ff)",
                    color: "#04060c",
                    border: "none",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer"
                  }}
                >
                  Explore Projects →
                </button>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "9px", color: "#4ade80" }}>
                  ✓ AST Tree: 0 Regenerations
                </span>
              </div>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}
