import type { ReactNode } from "react";
import { SpaceBackground } from "@/components/ui/SpaceBackground";
import { tokens } from "@/components/ui/tokens";

/** Auth screens are a single centred column — no product chrome, and none of
 *  the landing page's canvas layers. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SpaceBackground glow="center" />
      <div
        className="space-content"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "48px 20px",
          // No background colour: body already paints the deep-space base, and
          // an opaque layer here would hide the environment behind it.
          color: tokens.text,
        }}
      >
        <div style={{ width: "100%", maxWidth: 460 }}>{children}</div>
      </div>
    </>
  );
}
