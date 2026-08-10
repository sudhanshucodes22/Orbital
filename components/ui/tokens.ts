/** Design tokens lifted from the approved landing page.
 *
 * The landing page states these inline, hundreds of times, because it came out
 * of a design tool. New surfaces should not copy that: they reference these so
 * the product area stays in the same visual language without duplicating
 * magic numbers, and so a future theme change has one place to happen.
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
} as const;
