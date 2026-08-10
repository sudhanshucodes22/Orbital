import { AppShell } from "@/components/ui/AppShell";
import { Panel } from "@/components/ui/Panel";
import { tokens } from "@/components/ui/tokens";

/** Skeleton shown while the project query runs. Three neutral rows rather
 *  than placeholder names — invented content, even briefly, is still fake. */
export default function Loading() {
  return (
    <AppShell title="Projects">
      <div style={{ display: "grid", gap: 12 }} aria-busy="true" aria-live="polite">
        <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
          Loading projects
        </span>
        {[0, 1, 2].map((i) => (
          <Panel key={i} style={{ padding: "18px 20px" }}>
            <div
              style={{
                height: 17,
                width: `${42 - i * 8}%`,
                borderRadius: 6,
                background: "rgba(255,255,255,.06)",
              }}
            />
            <div
              style={{
                marginTop: 10,
                height: 10,
                width: "26%",
                borderRadius: 5,
                background: "rgba(255,255,255,.04)",
              }}
            />
          </Panel>
        ))}
      </div>
      <p style={{ marginTop: 18, fontFamily: tokens.mono, fontSize: 10.5, letterSpacing: ".14em", color: tokens.textFaint }}>
        LOADING
      </p>
    </AppShell>
  );
}
