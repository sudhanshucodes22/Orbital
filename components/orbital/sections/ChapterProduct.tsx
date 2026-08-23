"use client";

import React, { useState } from "react";
import type { Vals } from "../types";

export function ChapterProduct({ v }: { v: Vals }) {
  const [selectedColor, setSelectedColor] = useState<string>("Midnight Titanium");
  const [cartCount, setCartCount] = useState<number>(0);
  const [activeWatchAngle, setActiveWatchAngle] = useState<number>(0);
  const [addedToast, setAddedToast] = useState<boolean>(false);

  const colors = [
    { name: "Midnight Titanium", hex: "#1e293b", ring: "#38bdf8", price: "$1,280" },
    { name: "Space Navy", hex: "#0f172a", ring: "#7ce6ff", price: "$1,280" },
    { name: "Rose Gold", hex: "#4c1d24", ring: "#fb7185", price: "$1,450" },
    { name: "Raw Ceramic", hex: "#334155", ring: "#e2e8f0", price: "$1,320" }
  ];

  const handleAddToCart = () => {
    setCartCount((c) => c + 1);
    setAddedToast(true);
    setTimeout(() => setAddedToast(false), 2500);
  };

  return (
    <section className="r-section r-pad-lg" style={{ position: "relative", padding: "0 28px 130px" }}>
      <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
        {/* Section Header */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "18px", marginBottom: "34px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "11px", letterSpacing: ".18em", color: "rgba(124,230,255,.9)", background: "rgba(124,230,255,.1)", padding: "4px 10px", borderRadius: "999px", border: "1px solid rgba(124,230,255,.3)" }}>
            {"CHAPTER 04 · PRODUCT"}
          </span>
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(26px,3.2vw,40px)", fontWeight: "600", letterSpacing: "-.03em", color: "#f2f6ff" }}>
            {"Product Intelligence & Storefronts"}
          </span>
          <span style={{ flex: "1", height: "1px", background: "linear-gradient(90deg,rgba(255,255,255,.16),transparent)", minWidth: "40px" }} />
          <span style={{ fontSize: "13.5px", color: "rgba(233,235,242,.6)", maxWidth: "340px", lineHeight: "1.5" }}>
            {"Turns product images into real, interactive 3D e-commerce stores."}
          </span>
        </div>

        {/* Main Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12,1fr)", gap: "20px" }} className="r-product">
          
          {/* ============================================================ */}
          {/* 1. REALISTIC LUXURY STOREFRONT (Watch Showcase + 3D Viewer)  */}
          {/* ============================================================ */}
          <div style={{ gridColumn: "span 7", minWidth: "0", padding: "28px", borderRadius: "24px", border: "1px solid rgba(124,230,255,.35)", background: "linear-gradient(160deg,rgba(16,26,44,.95),rgba(6,10,18,.98))", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "0 30px 80px rgba(0,0,0,.7)", display: "flex", flexDirection: "column", gap: "20px" }} className="r-span orb-card-hover">
            
            {/* Top Bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#7ce6ff", boxShadow: "0 0 10px #7ce6ff" }} />
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "11px", letterSpacing: ".1em", color: "#7ce6ff", fontWeight: "600" }}>
                  F20 · F21 PRODUCT INTELLIGENCE + 3D
                </span>
              </div>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", color: "#4ade80", background: "rgba(74,222,128,.12)", padding: "3px 8px", borderRadius: "6px", border: "1px solid rgba(74,222,128,.3)" }}>
                LIVE STORE ENGINE
              </span>
            </div>

            <div>
              <h3 style={{ margin: "0", fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "28px", letterSpacing: "-.025em", color: "#fff", lineHeight: "1.15" }}>
                A photo of a watch isn't an image. It's a storefront.
              </h3>
              <p style={{ margin: "6px 0 0", fontSize: "13.5px", color: "rgba(233,235,242,.65)" }}>
                Drop an image of any physical product. Orbital synthesizes a 3D orbit model, specifications table, and a high-converting checkout button.
              </p>
            </div>

            {/* Realistic Product Storefront Showcase Box */}
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "16px", background: "rgba(3,6,12,.7)", borderRadius: "18px", border: "1px solid rgba(255,255,255,.1)", padding: "18px", position: "relative" }}>
              
              {/* Product Visual & 3D Interactive Dial */}
              <div style={{ borderRadius: "14px", background: "radial-gradient(circle at 50% 40%, rgba(124,230,255,.18), rgba(6,10,18,.95) 75%)", border: "1px solid rgba(124,230,255,.3)", padding: "16px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", minHeight: "220px", overflow: "hidden" }}>
                
                {/* 3D Luxury Watch Illustration */}
                <div
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left - rect.width / 2;
                    setActiveWatchAngle(x * 0.2);
                  }}
                  onMouseLeave={() => setActiveWatchAngle(0)}
                  style={{
                    position: "relative",
                    width: "120px",
                    height: "120px",
                    cursor: "grab",
                    transform: `rotateY(${activeWatchAngle}deg) rotateZ(-6deg)`,
                    transition: "transform .15s ease-out",
                    perspective: "500px"
                  }}
                >
                  {/* Watch Case Bezel */}
                  <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "conic-gradient(from 180deg, #334155, #64748b, #1e293b, #94a3b8, #334155)", padding: "5px", boxShadow: "0 20px 40px rgba(0,0,0,.8), 0 0 20px rgba(124,230,255,.3)" }}>
                    {/* Dial Face */}
                    <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "radial-gradient(circle, #0a0f1d 40%, #03060c 90%)", border: "1.5px solid rgba(124,230,255,.5)", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      
                      {/* Hour markers */}
                      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
                        <span
                          key={deg}
                          style={{
                            position: "absolute",
                            width: "2px",
                            height: deg % 90 === 0 ? "8px" : "4px",
                            background: deg % 90 === 0 ? "#7ce6ff" : "rgba(255,255,255,.4)",
                            top: "4px",
                            transformOrigin: "50% 51px",
                            transform: `rotate(${deg}deg)`
                          }}
                        />
                      ))}

                      {/* Brand & Automatic label */}
                      <div style={{ position: "absolute", top: "26px", textAlign: "center" }}>
                        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "7px", fontWeight: "700", letterSpacing: ".15em", color: "#f2f6ff" }}>ORBITAL</div>
                        <div style={{ fontSize: "5px", color: "#7ce6ff", letterSpacing: ".1em" }}>CHRONO · 42MM</div>
                      </div>

                      {/* Sub-dials */}
                      <div style={{ position: "absolute", bottom: "24px", width: "24px", height: "24px", borderRadius: "50%", border: "1px solid rgba(124,230,255,.4)", background: "rgba(0,0,0,.5)" }} />

                      {/* Watch Hands */}
                      <span style={{ position: "absolute", width: "3px", height: "36px", background: "linear-gradient(180deg,#7ce6ff,#fff)", top: "19px", transformOrigin: "50% 36px", transform: "rotate(45deg)", borderRadius: "2px", boxShadow: "0 0 6px #7ce6ff" }} />
                      <span style={{ position: "absolute", width: "2px", height: "42px", background: "#f43f5e", top: "13px", transformOrigin: "50% 42px", transform: "rotate(190deg)", borderRadius: "1px" }} />
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff", zIndex: 10, boxShadow: "0 0 6px #fff" }} />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: "14px", fontFamily: "'IBM Plex Mono',monospace", fontSize: "9px", color: "#7ce6ff", background: "rgba(124,230,255,.12)", padding: "3px 8px", borderRadius: "999px", border: "1px solid rgba(124,230,255,.3)" }}>
                  🖱️ 360° Interactive 3D Model
                </div>
              </div>

              {/* Real E-Commerce Product Metadata & Buy Controls */}
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <span style={{ color: "#facc15", fontSize: "11px" }}>★★★★★</span>
                    <span style={{ fontSize: "10px", color: "rgba(233,235,242,.6)" }}>4.9 (128 reviews)</span>
                  </div>
                  <h4 style={{ margin: "0", fontFamily: "'Space Grotesk',sans-serif", fontSize: "18px", fontWeight: "600", color: "#f2f6ff" }}>
                    Zenith Chronomaster Titanium
                  </h4>
                  <div style={{ marginTop: "4px", fontSize: "11px", color: "rgba(233,235,242,.6)", lineHeight: "1.4" }}>
                    Grade 5 brushed titanium case, sapphire crystal, 100m water resistance.
                  </div>
                </div>

                {/* Color Swatch Picker */}
                <div>
                  <div style={{ fontSize: "10.5px", color: "rgba(233,235,242,.7)", marginBottom: "6px" }}>
                    Color: <strong style={{ color: "#7ce6ff" }}>{selectedColor}</strong>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {colors.map((c) => (
                      <button
                        key={c.name}
                        onClick={() => setSelectedColor(c.name)}
                        style={{
                          width: "22px",
                          height: "22px",
                          borderRadius: "50%",
                          background: c.hex,
                          border: selectedColor === c.name ? `2px solid ${c.ring}` : "1px solid rgba(255,255,255,.2)",
                          boxShadow: selectedColor === c.name ? `0 0 10px ${c.ring}` : "none",
                          cursor: "pointer",
                          padding: 0
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Price & Action Button */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
                  <div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "20px", fontWeight: "700", color: "#fff" }}>
                      $1,280
                    </div>
                    <div style={{ fontSize: "9px", color: "#4ade80" }}>✓ In Stock · Ships 24h</div>
                  </div>

                  <button
                    onClick={handleAddToCart}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "999px",
                      background: "linear-gradient(180deg,#cdf3ff,#7ad6ff)",
                      color: "#04060c",
                      border: "none",
                      fontSize: "11.5px",
                      fontWeight: "700",
                      cursor: "pointer",
                      boxShadow: "0 4px 16px rgba(122,214,255,.3)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                  >
                    <span>Add to Cart</span>
                    {cartCount > 0 && <span style={{ background: "#04060c", color: "#7ce6ff", fontSize: "9px", padding: "1px 5px", borderRadius: "999px" }}>{cartCount}</span>}
                  </button>
                </div>
              </div>
            </div>

            {/* Feature Pills */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {["Interactive 3D viewer", "Product gallery", "Specifications table", "Buy button", "Colour variants", "Customer reviews"].map((feat, idx) => (
                <span
                  key={idx}
                  style={{ padding: "6px 12px", borderRadius: "999px", border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)", fontSize: "11px", color: "rgba(233,235,242,.75)" }}
                  className="orb-card-hover"
                >
                  ✓ {feat}
                </span>
              ))}
            </div>

            {/* Added Toast */}
            {addedToast && (
              <div style={{ position: "absolute", top: "20px", right: "20px", background: "#22c55e", color: "#fff", padding: "6px 14px", borderRadius: "8px", fontSize: "11px", fontWeight: "600", boxShadow: "0 10px 25px rgba(34,197,94,.4)" }}>
                Added to cart! ✓
              </div>
            )}
          </div>

          {/* ============================================================ */}
          {/* 2. REALISTIC PRE-LAUNCH SIMULATOR (Heatmaps & Analytics)    */}
          {/* ============================================================ */}
          <div style={{ gridColumn: "span 5", minWidth: "0", padding: "28px", borderRadius: "24px", border: "1px solid rgba(255,255,255,.12)", background: "rgba(8,12,22,.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "0 30px 80px rgba(0,0,0,.7)", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "18px" }} className="r-span orb-card-hover">
            <div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10.5px", letterSpacing: ".14em", color: "rgba(164,139,255,.9)", fontWeight: "500" }}>
                F23 · F24 · F25 SIMULATE, AUDIT, RANK
              </div>
              <h3 style={{ margin: "14px 0 0", fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "22px", letterSpacing: "-.02em", color: "#f3f6ff" }}>
                Simulated users before real ones.
              </h3>
              <p style={{ margin: "6px 0 0", fontSize: "12.5px", color: "rgba(233,235,242,.6)" }}>
                Synthetic visitors test attention heatmaps and conversion flow before you launch.
              </p>
            </div>

            {/* Conversion Metrics with Colored Gauges */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {[
                { label: "Attention on primary CTA", val: "78%", color: "#7ce6ff", w: "78%" },
                { label: "Scroll depth (median)", val: "64%", color: "#a48bff", w: "64%" },
                { label: "Predicted conversion", val: "+4.9%", color: "#4ade80", w: "82%" },
                { label: "Accessibility score", val: "97 / 100", color: "#38bdf8", w: "97%" },
                { label: "Predicted bounce", val: "31%", color: "#f472b6", w: "31%" }
              ].map((m, i) => (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "rgba(233,235,242,.8)" }}>
                    <span>{m.label}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: m.color, fontWeight: "600" }}>
                      {m.val}
                    </span>
                  </div>
                  <div style={{ marginTop: "6px", height: "4px", borderRadius: "2px", background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: m.w, background: `linear-gradient(90deg, ${m.color}, #7ce6ff)` }} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: "12px 14px", borderRadius: "12px", background: "rgba(164,139,255,.08)", border: "1px solid rgba(164,139,255,.25)", fontSize: "12px", color: "rgba(233,235,242,.7)", lineHeight: "1.5" }}>
              ✓ WCAG AA passing · Dead-click audit clear · OpenGraph schema generated
            </div>
          </div>

          {/* ============================================================ */}
          {/* 3. FOUR BOTTOM CAPABILITY CARDS (F14, F15, F16, F22)         */}
          {/* ============================================================ */}
          {[
            {
              n: "F14",
              t: "One-click deployment",
              d: "Vercel, Netlify, Cloudflare Pages or GitHub Pages. Live in one click.",
              icon: "🚀",
              status: "● Global Edge CDN"
            },
            {
              n: "F15",
              t: "Export anywhere",
              d: "Next.js 16, React 19, Tailwind, Flutter or HTML. Pure clean code.",
              icon: "📦",
              status: "● 9 Framework Targets"
            },
            {
              n: "F16",
              t: "Project memory",
              d: "Come back in a week and continue your design mid-sentence with full context.",
              icon: "🧠",
              status: "● Zero Context Loss"
            },
            {
              n: "F22",
              t: "Collaborative canvas",
              d: "Founder, designer, PM and engineer working in real-time on one unified live build.",
              icon: "👥",
              status: "● Live Multiplayer"
            }
          ].map((cp, i0) => (
            <div
              key={i0}
              style={{
                gridColumn: "span 3",
                minWidth: "0",
                padding: "22px 20px",
                borderRadius: "20px",
                border: "1px solid rgba(255,255,255,.1)",
                background: "rgba(8,12,22,.8)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: "190px",
                boxShadow: "0 14px 35px rgba(0,0,0,.45)",
                transition: "all .25s ease"
              }}
              className="orb-card-hover r-span"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10.5px", color: "#7ce6ff", fontWeight: "600" }}>
                  {cp.n}
                </span>
                <span style={{ fontSize: "20px" }}>{cp.icon}</span>
              </div>

              <div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "17px", fontWeight: "600", letterSpacing: "-.02em", color: "#f3f6ff" }}>
                  {cp.t}
                </div>
                <div style={{ marginTop: "6px", fontSize: "12.5px", lineHeight: "1.5", color: "rgba(233,235,242,.6)" }}>
                  {cp.d}
                </div>
              </div>

              <div style={{ paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,.06)", fontFamily: "'IBM Plex Mono',monospace", fontSize: "9px", color: "#4ade80" }}>
                {cp.status}
              </div>
            </div>
          ))}

        </div>
      </div>
    </section>
  );
}
