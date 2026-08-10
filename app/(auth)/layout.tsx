import type { ReactNode } from "react";
import { tokens } from "@/components/ui/tokens";

/** Auth screens are a single centred column — no product chrome, and none of
 *  the landing page's canvas layers. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "48px 20px",
        background: tokens.bg,
        color: tokens.text,
      }}
    >
      <div style={{ width: "100%", maxWidth: 460 }}>{children}</div>
    </div>
  );
}
