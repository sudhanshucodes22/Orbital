import { Eyebrow, Heading, Panel } from "./Panel";
import { tokens } from "./tokens";

export interface AuthPoint {
  title: string;
  body: string;
}

/** The column beside an auth form.
 *
 * Auth screens are the one place a new visitor has nothing to look at and a
 * reason to hesitate, so this answers the two questions actually being asked:
 * what happens when I submit, and what is this going to cost me. Every claim
 * here is true of the running app — the workspace really is created on
 * sign-up, the password really is hashed, the demo backend really does need
 * no configuration.
 */
export function AuthAside({
  eyebrow,
  heading,
  points,
  footnote,
}: {
  eyebrow: string;
  heading: string;
  points: readonly AuthPoint[];
  footnote?: string;
}) {
  return (
    <Panel lit style={{ padding: "24px 22px 26px" }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Heading size="sm" style={{ marginTop: 14, fontSize: 18.5, lineHeight: 1.32 }}>
        {heading}
      </Heading>

      <ul style={{ margin: "20px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 15 }}>
        {points.map((point, i) => (
          <li key={point.title} style={{ display: "flex", gap: 12 }}>
            {/* A numbered node on a hairline rail rather than a bullet: it
                gives the column a spine, and reads as a sequence of things
                that happen instead of a list of features. */}
            <span
              aria-hidden
              style={{
                position: "relative",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                marginTop: 1,
                borderRadius: "50%",
                border: "1px solid rgba(124,230,255,.32)",
                background: "rgba(124,230,255,.07)",
                fontFamily: tokens.mono,
                fontSize: 9.5,
                color: "rgba(196,236,255,.9)",
              }}
            >
              {i + 1}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: tokens.text }}>
                {point.title}
              </div>
              <p style={{ margin: "5px 0 0", fontSize: 13, lineHeight: 1.55, color: tokens.textMuted }}>
                {point.body}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {footnote && (
        <p
          style={{
            margin: "20px 0 0",
            paddingTop: 16,
            borderTop: `1px solid ${tokens.borderSoft}`,
            fontSize: 12,
            lineHeight: 1.55,
            color: tokens.textFaint,
          }}
        >
          {footnote}
        </p>
      )}
    </Panel>
  );
}
