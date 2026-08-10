import { Eyebrow, Panel } from "./Panel";
import { tokens } from "./tokens";

/** Honest empty state for a capability with no backend yet.
 *
 * Deliberately not a mock dashboard. It names the capability, lists the exact
 * environment variables that would enable it, and says what happens once they
 * exist — which is more useful to whoever picks this up than invented rows in
 * a table would be.
 */
export function NotConfigured({
  capability,
  requires,
  what,
}: {
  capability: string;
  requires: readonly string[];
  what: string;
}) {
  return (
    <Panel>
      <Eyebrow>Not configured</Eyebrow>
      <h2
        style={{
          margin: "14px 0 0",
          fontFamily: tokens.display,
          fontWeight: 500,
          fontSize: 24,
          letterSpacing: "-.025em",
        }}
      >
        {capability} has no backend yet.
      </h2>
      <p
        style={{
          margin: "12px 0 0",
          fontSize: 14.5,
          lineHeight: 1.65,
          color: tokens.textMuted,
          maxWidth: 560,
        }}
      >
        {what}
      </p>

      {requires.length > 0 && (
        <>
          <div
            style={{
              marginTop: 22,
              paddingTop: 16,
              borderTop: `1px solid ${tokens.borderSoft}`,
              fontFamily: tokens.mono,
              fontSize: 10,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: tokens.textFaint,
            }}
          >
            Requires
          </div>
          <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {requires.map((r) => (
              <li
                key={r}
                style={{
                  fontFamily: tokens.mono,
                  fontSize: 12,
                  color: "rgba(196,236,255,.9)",
                  padding: "7px 11px",
                  borderRadius: 8,
                  border: `1px solid ${tokens.borderSoft}`,
                  background: "rgba(255,255,255,.02)",
                }}
              >
                {r}
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
