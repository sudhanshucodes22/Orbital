import { statusTone, tokens } from "./tokens";

/** Project status as a dot and a word.
 *
 * The dot pulses only while a build is running. Colour is never the sole
 * carrier of the state — the label is always present — so this stays readable
 * to anyone who cannot separate the cyan from the violet.
 */
export function StatusPill({
  status,
  size = "md",
}: {
  status: string;
  size?: "sm" | "md";
}) {
  const tone = statusTone(status);
  const live = status === "generating";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: size === "sm" ? "4px 9px" : "5px 11px",
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.text,
        fontFamily: tokens.mono,
        fontSize: size === "sm" ? 9.5 : 10,
        letterSpacing: ".12em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      <span
        className={`o-dot${live ? " o-dot--live" : ""}`}
        style={{ background: tone.dot, color: tone.dot }}
        aria-hidden
      />
      {tone.label}
    </span>
  );
}
