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
        background: accent
          ? "linear-gradient(160deg,rgba(124,230,255,.08),rgba(255,255,255,.015))"
          : tokens.panel,
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
