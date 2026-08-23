import type { Metadata } from "next";
import Link from "next/link";
import { AuthAside, type AuthPoint } from "@/components/ui/AuthAside";
import { AuthForm } from "@/components/ui/AuthForm";
import { NotConfigured } from "@/components/ui/NotConfigured";
import { Eyebrow, Heading, Panel } from "@/components/ui/Panel";
import { tokens } from "@/components/ui/tokens";
import { CAPABILITY_REQUIREMENTS, capabilities } from "@/lib/config/env";
import { PASSWORD_MIN } from "@/lib/domain/auth";
import { signUpAction } from "../actions";

export const metadata: Metadata = { title: "Create account · Orbital" };

const SHARED_POINT: AuthPoint = {
  title: "Instant personal workspace",
  body: "A dedicated workspace is provisioned the moment you submit. Projects, revisions and custom design tokens belong directly to it.",
};

const DEMO_POINTS: readonly AuthPoint[] = [
  SHARED_POINT,
  {
    title: "Zero friction onboarding",
    body: "Any valid email format works and drops you straight into the interactive workspace. No confirmation wait required.",
  },
  {
    title: "Production-grade security",
    body: "Passwords are cryptographically hashed with scrypt and sessions use signed HTTP-only cookies with zero client-script exposure.",
  },
];

const SUPABASE_POINTS: readonly AuthPoint[] = [
  SHARED_POINT,
  {
    title: "Secure email verification",
    body: "If email confirmation is enabled on your instance, a secure magic link will be sent to verify your ownership.",
  },
  {
    title: "Dual row-level security",
    body: "Workspace roles and API tokens are enforced both at the service layer and via PostgreSQL row-level security policies.",
  },
];

export default function SignUpPage() {
  const caps = capabilities();

  if (!caps.auth) {
    return (
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <NotConfigured
          capability="Account creation"
          requires={CAPABILITY_REQUIREMENTS.auth}
          what="Registration shares the identity provider with sign-in. Configuring one enables both routes."
        />
      </div>
    );
  }

  const demo = caps.mode === "demo";

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
        <Eyebrow>GET STARTED</Eyebrow>
        <Heading as="h1" size="lg" style={{ marginTop: 14, fontSize: 28, letterSpacing: "-.025em" }}>
          Create your account
        </Heading>
        <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "rgba(233,235,242,.65)" }}>
          A dedicated personal workspace is created with your account.
        </p>
        
        <AuthForm
          action={signUpAction}
          submitLabel="Create account"
          includeName
          passwordMinLength={PASSWORD_MIN}
          passwordHint={
            demo
              ? `At least ${PASSWORD_MIN} characters. Stored securely as an scrypt hash.`
              : `At least ${PASSWORD_MIN} characters.`
          }
        />

        <div style={{ marginTop: "22px", paddingTop: "18px", borderTop: "1px solid rgba(255,255,255,.08)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, color: "rgba(233,235,242,.65)" }}>
          <span>Already have an account?</span>
          <Link
            href="/sign-in"
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
            Sign in →
          </Link>
        </div>
      </Panel>

      <AuthAside
        eyebrow="WORKSPACE PROVISIONING"
        heading="Three things this does the moment you submit."
        points={demo ? DEMO_POINTS : SUPABASE_POINTS}
        footnote={
          demo
            ? "Running on the local backend: accounts and projects are stored securely on this machine. npm run demo:reset clears them."
            : undefined
        }
      />
    </div>
  );
}
