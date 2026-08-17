import { STARTERS } from "@/lib/content/starters";
import { Eyebrow, Heading } from "./Panel";
import { tokens } from "./tokens";

/** The starter picker.
 *
 * Each card is its own form posting to a server action, so the whole thing
 * works with JavaScript disabled and needs no client bundle. Submitting
 * creates the project and lands on the editor with the brief loaded — the
 * point is to remove the blank page, not to decorate it.
 */
export function StarterGrid({
  action,
  heading,
  subheading,
}: {
  action: (formData: FormData) => Promise<void>;
  heading: string;
  subheading: string;
}) {
  return (
    <div>
      <Eyebrow>Start from a brief</Eyebrow>
      <Heading size="md" style={{ marginTop: 14 }}>
        {heading}
      </Heading>
      <p
        style={{
          margin: "10px 0 0",
          fontSize: 14,
          lineHeight: 1.6,
          color: tokens.textMuted,
          maxWidth: 560,
        }}
      >
        {subheading}
      </p>

      <div
        className="r-starters"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0,1fr))",
          gap: 12,
          marginTop: 22,
        }}
      >
        {STARTERS.map((starter) => (
          <form key={starter.id} action={action} style={{ display: "flex" }}>
            <input type="hidden" name="starterId" value={starter.id} />
            <button
              type="submit"
              /* Without this the accessible name is the whole card — heading,
                 blurb, both tags and "Use this" run together. */
              aria-label={`Start a project from the ${starter.label} brief`}
              className="o-starter o-lift"
            >
              <span
                style={{
                  display: "block",
                  fontFamily: tokens.display,
                  fontWeight: 500,
                  fontSize: 16,
                  letterSpacing: "-.015em",
                  color: tokens.text,
                }}
              >
                {starter.label}
              </span>
              <span
                style={{
                  display: "block",
                  margin: "8px 0 0",
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: tokens.textMuted,
                }}
              >
                {starter.blurb}
              </span>
              <span
                style={{
                  display: "flex",
                  gap: 7,
                  flexWrap: "wrap",
                  marginTop: 15,
                  alignItems: "center",
                }}
              >
                {starter.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontFamily: tokens.mono,
                      fontSize: 9,
                      letterSpacing: ".12em",
                      padding: "4px 9px",
                      borderRadius: 999,
                      border: `1px solid ${tokens.borderSoft}`,
                      color: tokens.textFaint,
                    }}
                  >
                    {tag}
                  </span>
                ))}
                <span style={{ flex: 1 }} />
                <span
                  className="o-starter__go"
                  style={{ fontSize: 12.5, color: tokens.accent, whiteSpace: "nowrap" }}
                >
                  Use this →
                </span>
              </span>
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
