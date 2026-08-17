import { AppShell } from "@/components/ui/AppShell";
import { Panel } from "@/components/ui/Panel";
import { tokens } from "@/components/ui/tokens";

/** Skeleton shown while the project query runs.
 *
 * Neutral bars rather than placeholder names — invented content, even
 * briefly, is still fake. The shape matches the real grid, so the page does
 * not visibly re-lay-out when the data lands.
 */
export default function Loading() {
  return (
    <AppShell title="Projects">
      <div aria-busy="true" aria-live="polite">
        <span
          style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
        >
          Loading projects
        </span>

        <div style={{ display: "grid", gap: 14, maxWidth: 460 }}>
          <div className="o-skeleton" style={{ height: 34, width: "72%", borderRadius: 10 }} />
          <div className="o-skeleton" style={{ height: 13, width: "94%" }} />
        </div>

        <ul
          className="r-projects"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0,1fr))",
            gap: 14,
            margin: "34px 0 0",
            padding: 0,
            listStyle: "none",
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <li key={i}>
              <Panel style={{ padding: "19px 21px 18px" }}>
                <div className="o-skeleton" style={{ height: 18, width: 74, borderRadius: 999 }} />
                <div
                  className="o-skeleton"
                  style={{ height: 19, width: `${64 - i * 7}%`, marginTop: 14, borderRadius: 7 }}
                />
                <div className="o-skeleton" style={{ height: 12, width: "88%", marginTop: 11 }} />
                <div
                  className="o-skeleton"
                  style={{ height: 10, width: "42%", marginTop: 24 }}
                />
              </Panel>
            </li>
          ))}
        </ul>

        <p
          style={{
            marginTop: 22,
            fontFamily: tokens.mono,
            fontSize: 10,
            letterSpacing: ".14em",
            color: tokens.textFaint,
          }}
        >
          LOADING
        </p>
      </div>
    </AppShell>
  );
}
