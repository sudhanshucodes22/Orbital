import type { Metadata } from "next";
import Link from "next/link";
import { AuthAside, type AuthPoint } from "@/components/ui/AuthAside";
import { AuthForm } from "@/components/ui/AuthForm";
import { NotConfigured } from "@/components/ui/NotConfigured";
import { Eyebrow, Heading, Panel } from "@/components/ui/Panel";
import { tokens } from "@/components/ui/tokens";
import { CAPABILITY_REQUIREMENTS, capabilities } from "@/lib/config/env";
import { signInAction } from "../actions";

export const metadata: Metadata = { title: "Sign in · Orbital" };

const POINTS: readonly AuthPoint[] = [
  {
    title: "Your projects, where you left them",
    body: "Every revision is preserved. The site you generated is immediately available along with the multimodal history that produced it.",
  },
  {
    title: "Editing resumes, never restarts",
    body: "A change is applied directly to the active AST revision. You are never asked to describe your entire application again.",
  },
  {
    title: "Zero-token session persistence",
    body: "The session cookie is signed and unreadable to scripts. Signing out instantly invalidates it server-side.",
  },
];

export default function SignInPage() {
  const caps = capabilities();

  if (!caps.auth) {
    return (
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <NotConfigured
          capability="Authentication"
          requires={CAPABILITY_REQUIREMENTS.auth}
          what="Sign-in is implemented and routed. Point it at a Supabase project and this page becomes the real form."
        />
      </div>
    );
  }

  return (
    <div
      className="r-auth"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) minmax(0,370px)",
        gap: 24,
        alignItems: "start",
      }}
    >
      <Panel
        accent
        lit
        style={{
          padding: "32px 30px 34px",
          borderRadius: 22,
          border: "1px solid rgba(124,230,255,.3)",
          background: "linear-gradient(160deg, rgba(16,26,44,.88), rgba(8,12,22,.94))",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 30px 90px rgba(0,0,0,.7), 0 0 30px rgba(124,230,255,.1)",
        }}
      >
        <Eyebrow>WELCOME BACK</Eyebrow>
        <Heading as="h1" size="lg" style={{ marginTop: 14, fontSize: 28, letterSpacing: "-.025em" }}>
          Sign in to Orbital
        </Heading>
        <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "rgba(233,235,242,.65)" }}>
          Pick up your workspace right where you stopped.
        </p>

        <AuthForm action={signInAction} submitLabel="Sign in" />

        <div style={{ marginTop: "22px", paddingTop: "18px", borderTop: "1px solid rgba(255,255,255,.08)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, color: "rgba(233,235,242,.65)" }}>
          <span>No account yet?</span>
          <Link
            href="/sign-up"
            style={{
              color: "#7ce6ff",
              fontWeight: 600,
              textDecoration: "none",
              background: "rgba(124,230,255,.1)",
              padding: "4px 12px",
              borderRadius: "999px",
              border: "1px solid rgba(124,230,255,.25)",
            }}
          >
            Create one →
          </Link>
        </div>
      </Panel>

      <AuthAside
        eyebrow="WORKSPACE ACCESS"
        heading="Everything stays where you left it."
        points={POINTS}
        footnote={
          caps.mode === "demo"
            ? "Running on the local backend. If you have just run npm run demo:reset, every account was cleared — create a new one."
            : undefined
        }
      />
    </div>
  );
}
