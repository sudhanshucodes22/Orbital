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

export const metadata: Metadata = { title: "Create account" };

/** The workspace claim holds either way — it is service behaviour, not
 *  backend behaviour. The other two differ, so they are not stated as facts
 *  about a backend that may not be the one running. */
const SHARED_POINT: AuthPoint = {
  title: "A workspace, immediately",
  body: "A personal workspace is created with the account. Projects belong to it, and role checks run against it on every read and write.",
};

const DEMO_POINTS: readonly AuthPoint[] = [
  SHARED_POINT,
  {
    title: "No confirmation step",
    body: "Any valid email shape works and you land straight in the product. Nothing is sent to the address.",
  },
  {
    title: "Real credentials, even locally",
    body: "Passwords are scrypt-hashed with a per-user salt and the session is a signed, http-only cookie. The local backend does not cut that corner.",
  },
];

const SUPABASE_POINTS: readonly AuthPoint[] = [
  SHARED_POINT,
  {
    title: "Confirmation may be required",
    body: "If the Supabase project asks for email confirmation, you will be told to check your inbox before signing in.",
  },
  {
    title: "Rows you own, enforced twice",
    body: "Workspace roles are checked in the service and again by row-level security, so a project cannot be read by another account.",
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
        gridTemplateColumns: "minmax(0,1fr) minmax(0,360px)",
        gap: 18,
        alignItems: "start",
      }}
    >
      <Panel accent lit style={{ padding: "28px 26px 30px" }}>
        <Eyebrow>Get started</Eyebrow>
        <Heading as="h1" size="lg" style={{ marginTop: 14 }}>
          Create your account
        </Heading>
        <p style={{ margin: "11px 0 0", fontSize: 14, lineHeight: 1.6, color: tokens.textMuted }}>
          A personal workspace is created with your account.
        </p>
        <AuthForm
          action={signUpAction}
          submitLabel="Create account"
          includeName
          passwordMinLength={PASSWORD_MIN}
          passwordHint={
            demo
              ? `At least ${PASSWORD_MIN} characters. Stored as a scrypt hash — never in plain text.`
              : `At least ${PASSWORD_MIN} characters.`
          }
        />
        <p style={{ margin: "20px 0 0", fontSize: 13.5, color: tokens.textMuted }}>
          Already have one?{" "}
          <Link href="/sign-in" style={{ color: tokens.accent }}>
            Sign in
          </Link>
        </p>
      </Panel>

      <AuthAside
        eyebrow="What happens next"
        heading="Three things this does the moment you submit."
        points={demo ? DEMO_POINTS : SUPABASE_POINTS}
        footnote={
          demo
            ? "Running on the local backend: accounts and projects are stored on this machine and nothing leaves it. npm run demo:reset clears them."
            : undefined
        }
      />
    </div>
  );
}
