/* Phase 1 placeholder.
 *
 * Deliberately not the Orbital design. Phase 2 ports the page from
 * reference/artifact-export/Orbital Launch.dc.html; until then this route
 * exists only to prove the scaffold builds, serves and type-checks.
 */

const rows: ReadonlyArray<[string, string]> = [
  ["Framework", "Next.js 16.3 · App Router · TypeScript"],
  ["Runtime", "Server (not output: 'export')"],
  ["Fonts", "next/font/google, self-hosted, 5 families"],
  ["three.js", "0.128.0, pinned exactly"],
  ["Design source", "reference/artifact-export/Orbital Launch.dc.html"],
  ["Baselines", "28 shots · tools/baseline"],
];

export default function Page() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "48px 24px",
        background: "#0a0a0a",
        color: "#e9ebf2",
        fontFamily: "var(--font-ibm-plex-sans), system-ui, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 560 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-space-grotesk), sans-serif",
            fontWeight: 500,
            fontSize: 28,
            letterSpacing: "-0.02em",
          }}
        >
          Orbital — scaffold
        </h1>
        <p
          style={{
            margin: "12px 0 32px",
            fontSize: 15,
            lineHeight: 1.6,
            color: "rgba(233,235,242,0.6)",
          }}
        >
          Phase 1 complete. The design has not been ported yet — that is Phase
          2, and it must reproduce the baselines exactly.
        </p>
        <dl
          style={{
            margin: 0,
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "10px 20px",
            fontSize: 13,
            fontFamily: "var(--font-ibm-plex-mono), monospace",
          }}
        >
          {rows.map(([label, value]) => (
            <div key={label} style={{ display: "contents" }}>
              <dt style={{ color: "rgba(233,235,242,0.4)" }}>{label}</dt>
              <dd style={{ margin: 0, color: "rgba(233,235,242,0.85)" }}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </main>
  );
}
