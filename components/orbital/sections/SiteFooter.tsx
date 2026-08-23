import React from "react";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer style={{ position: "relative", padding: "0 28px 56px" }}>
      <div style={{ maxWidth: "1180px", margin: "0 auto", paddingTop: "34px", borderTop: "1px solid rgba(255,255,255,.08)", display: "flex", flexWrap: "wrap", gap: "26px", justifyContent: "space-between", alignItems: "center" }}>
        
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontFamily: "'Space Grotesk',sans-serif", fontSize: "14px", fontWeight: "600", color: "#f2f6ff" }}>
          <span style={{ position: "relative", display: "block", width: "16px", height: "16px", borderRadius: "50%", border: "1px solid rgba(160,225,255,.6)" }}>
            <span style={{ position: "absolute", left: "50%", top: "50%", width: "5px", height: "5px", margin: "-2.5px 0 0 -2.5px", borderRadius: "50%", background: "#bdf1ff" }} />
          </span>
          {"Orbital"}
        </div>

        {/* Links Navigation */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", fontSize: "13px", color: "rgba(233,235,242,.55)" }}>
          <a href="#how" style={{ color: "inherit", textDecoration: "none" }} className="orb-card-hover">
            {"How it works"}
          </a>
          <a href="#capabilities" style={{ color: "inherit", textDecoration: "none" }} className="orb-card-hover">
            {"Capabilities"}
          </a>
          <a href="#workspace" style={{ color: "inherit", textDecoration: "none" }} className="orb-card-hover">
            {"Workspace"}
          </a>
          <a href="#demo" style={{ color: "inherit", textDecoration: "none" }} className="orb-card-hover">
            {"Demo"}
          </a>
          <a href="#pricing" style={{ color: "inherit", textDecoration: "none" }} className="orb-card-hover">
            {"Pricing"}
          </a>
          <a href="#compare" style={{ color: "inherit", textDecoration: "none" }} className="orb-card-hover">
            {"Comparison"}
          </a>
          <Link href="/privacy" style={{ color: "inherit", textDecoration: "none" }} className="orb-card-hover">
            {"Privacy"}
          </Link>
          <Link href="/terms" style={{ color: "inherit", textDecoration: "none" }} className="orb-card-hover">
            {"Terms"}
          </Link>
          <a href="https://github.com/sudhanshucodes22/Orbital" target="_blank" rel="noopener noreferrer" style={{ color: "rgba(124,230,255,.8)", textDecoration: "none" }} className="orb-card-hover">
            {"GitHub ↗"}
          </a>
        </div>

        {/* Copyright */}
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10.5px", letterSpacing: ".08em", color: "rgba(233,235,242,.35)" }}>
          {"© 2026 ORBITAL ENGINEERING · BUILT FROM A NAPKIN"}
        </div>

      </div>
    </footer>
  );
}
