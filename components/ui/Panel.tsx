import type { CSSProperties, ReactNode } from "react";
import { tokens } from "./tokens";

export function Panel({
  children,
  style,
  accent = false,
}: {
  children: ReactNode;
  style?: CSSProperties;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        padding: "26px 24px 28px",
        borderRadius: 18,
        border: `1px solid ${accent ? tokens.borderAccent : tokens.border}`,
        /* Glass rather than the near-transparent wash the panels used before.
         * Over flat black, rgba(255,255,255,.025) read as a subtle lift; over
         * the starfield the stars punched straight through and the cards
         * stopped reading as surfaces. This is the same treatment as the
         * landing page's nav pill, so it belongs to the same language. */
        background: accent
          ? "linear-gradient(160deg,rgba(124,230,255,.10),rgba(9,12,19,.66))"
          : "rgba(9,12,19,.62)",
        backdropFilter: "blur(18px) saturate(1.2)",
        WebkitBackdropFilter: "blur(18px) saturate(1.2)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: tokens.mono,
        fontSize: 10.5,
        letterSpacing: ".16em",
        textTransform: "uppercase",
        color: "rgba(124,230,255,.75)",
      }}
    >
      {children}
    </div>
  );
}
