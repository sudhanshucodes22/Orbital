import Link from "next/link";
import { tokens } from "@/components/ui/tokens";

/** Branded 404. The default Next.js page is white and unstyled, which would be
 *  a jarring exit from a very dark site. */
export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "48px 20px",
        background: tokens.bg,
        color: tokens.text,
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 460 }}>
        <div
          style={{
            fontFamily: tokens.mono,
            fontSize: 10.5,
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: "rgba(124,230,255,.75)",
          }}
        >
          404 · off orbit
        </div>
        <h1
          style={{
            margin: "18px 0 0",
            fontFamily: tokens.display,
            fontWeight: 500,
            fontSize: 34,
            letterSpacing: "-.03em",
            lineHeight: 1.05,
          }}
        >
          Nothing at this address.
        </h1>
        <p style={{ margin: "14px 0 28px", fontSize: 15, lineHeight: 1.6, color: tokens.textMuted }}>
          The page you asked for either moved or never existed.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "13px 22px",
            borderRadius: 999,
            fontSize: 15,
            fontWeight: 500,
            color: "#04060c",
            background: "linear-gradient(180deg,#cdf3ff,#7ad6ff)",
          }}
        >
          Back to Orbital
        </Link>
      </div>
    </div>
  );
}
