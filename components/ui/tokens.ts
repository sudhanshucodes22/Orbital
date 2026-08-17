/** Design tokens lifted from the approved landing page.
 *
 * The landing page states these inline, hundreds of times, because it came out
 * of a design tool. New surfaces should not copy that: they reference these so
 * the product area stays in the same visual language without duplicating
 * magic numbers, and so a future theme change has one place to happen.
 *
 * The second block (gradients, glows, motion) is the Orbital 2.0 layer. It
 * extends the palette rather than replacing it — every original value below is
 * unchanged, so nothing that already referenced a token moved.
 */
export const tokens = {
  bg: "#030408",
  panel: "rgba(255,255,255,.025)",
  panelStrong: "rgba(8,10,16,.72)",
  border: "rgba(255,255,255,.09)",
  borderSoft: "rgba(255,255,255,.06)",
  borderAccent: "rgba(124,230,255,.4)",
  text: "#e9ebf2",
  textMuted: "rgba(233,235,242,.55)",
  textFaint: "rgba(233,235,242,.36)",
  accent: "#7ce6ff",
  accentSoft: "rgba(124,230,255,.12)",
  violet: "#a48bff",
  display: "'Space Grotesk',sans-serif",
  body: "'IBM Plex Sans',system-ui,sans-serif",
  mono: "'IBM Plex Mono',monospace",

  /* ---- Orbital 2.0 ---------------------------------------------------- */

  /* A third hue, used sparingly. Cyan carries the product, violet carries
   * depth, and magenta appears only at the far end of a gradient — never on
   * its own — so the palette reads as one light source rather than three. */
  magenta: "#ff8fd8",
  violetSoft: "rgba(164,139,255,.12)",

  /* Primary action. Cyan into violet across a short distance, so it reads as
   * a single luminous surface rather than a two-colour band. */
  gradientAction: "linear-gradient(135deg,#a8ecff 0%,#7ad6ff 45%,#9db4ff 100%)",
  /* For text and hairlines that need the same family without the weight. */
  gradientEdge:
    "linear-gradient(135deg,rgba(124,230,255,.55),rgba(164,139,255,.35) 55%,rgba(255,143,216,.18))",

  /* Elevation is expressed as light, not shadow — a drop shadow over a
   * starfield reads as a smudge. These are glows the card casts. */
  glowAccent: "0 0 0 1px rgba(124,230,255,.18), 0 18px 50px -18px rgba(124,230,255,.42)",
  glowViolet: "0 0 0 1px rgba(164,139,255,.16), 0 18px 50px -18px rgba(164,139,255,.38)",
  shadowLift: "0 22px 60px -26px rgba(0,0,0,.9)",

  /* One scale, so a hover, a focus ring and a section entrance all move at
   * related speeds. Fast enough to feel immediate; the spec asks for
   * 150–250ms on interactive feedback. */
  ease: "cubic-bezier(.2,.6,.2,1)",
  fast: "160ms",
  normal: "220ms",
} as const;

/** Per-status accent. Kept beside the palette because status colour is a
 *  design decision, and scattering it across pages is how two surfaces end up
 *  disagreeing about what "ready" looks like. */
export const STATUS_TONE: Readonly<
  Record<string, { label: string; dot: string; text: string; border: string; bg: string }>
> = {
  ready: {
    label: "Ready",
    dot: "#7ce6ff",
    text: "rgba(196,236,255,.95)",
    border: "rgba(124,230,255,.38)",
    bg: "rgba(124,230,255,.10)",
  },
  generating: {
    label: "Building",
    dot: "#a48bff",
    text: "rgba(214,204,255,.95)",
    border: "rgba(164,139,255,.38)",
    bg: "rgba(164,139,255,.10)",
  },
  draft: {
    label: "Draft",
    dot: "rgba(233,235,242,.45)",
    text: "rgba(233,235,242,.62)",
    border: "rgba(255,255,255,.10)",
    bg: "rgba(255,255,255,.03)",
  },
  failed: {
    label: "Failed",
    dot: "#ff9b8f",
    text: "rgba(255,196,190,.95)",
    border: "rgba(255,150,140,.34)",
    bg: "rgba(255,150,140,.08)",
  },
};

export function statusTone(status: string) {
  return STATUS_TONE[status] ?? STATUS_TONE.draft;
}
