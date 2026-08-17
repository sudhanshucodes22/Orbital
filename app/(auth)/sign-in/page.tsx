import type { Metadata } from "next";
import Link from "next/link";
import { AuthAside, type AuthPoint } from "@/components/ui/AuthAside";
import { AuthForm } from "@/components/ui/AuthForm";
import { NotConfigured } from "@/components/ui/NotConfigured";
import { Eyebrow, Heading, Panel } from "@/components/ui/Panel";
import { tokens } from "@/components/ui/tokens";
import { CAPABILITY_REQUIREMENTS, capabilities } from "@/lib/config/env";
import { signInAction } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

/** Signing in is a return trip, so this says what is waiting rather than what
 *  the product is — that argument was already made on the landing page. */
const POINTS: readonly AuthPoint[] = [
  {
    title: "Your projects, where you left them",
    body: "Every revision is kept, so the site you generated is still there along with the history that produced it.",
  },
  {
    title: "Editing resumes, not restarts",
    body: "A change is applied to the current revision. You are never asked to describe the whole site again.",
  },
  {
    title: "One session, http-only",
    body: "The session cookie is signed and unreadable to scripts. Signing out invalidates it server-side.",
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
        gridTemplateColumns: "minmax(0,1fr) minmax(0,360px)",
        gap: 18,
        alignItems: "start",
      }}
    >
      <Panel accent lit style={{ padding: "28px 26px 30px" }}>
        <Eyebrow>Welcome back</Eyebrow>
        <Heading as="h1" size="lg" style={{ marginTop: 14 }}>
          Sign in to Orbital
        </Heading>
        <p style={{ margin: "11px 0 0", fontSize: 14, lineHeight: 1.6, color: tokens.textMuted }}>
          Pick up wherever you stopped.
        </p>
        <AuthForm action={signInAction} submitLabel="Sign in" />
        <p style={{ margin: "20px 0 0", fontSize: 13.5, color: tokens.textMuted }}>
          No account yet?{" "}
          <Link href="/sign-up" style={{ color: tokens.accent }}>
            Create one
          </Link>
        </p>
      </Panel>

      <AuthAside
        eyebrow="Waiting for you"
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
