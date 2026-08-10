import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/ui/AuthForm";
import { NotConfigured } from "@/components/ui/NotConfigured";
import { Eyebrow, Panel } from "@/components/ui/Panel";
import { tokens } from "@/components/ui/tokens";
import { CAPABILITY_REQUIREMENTS, capabilities } from "@/lib/config/env";
import { signUpAction } from "../actions";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  if (!capabilities().auth) {
    return (
      <NotConfigured
        capability="Account creation"
        requires={CAPABILITY_REQUIREMENTS.auth}
        what="Registration shares the identity provider with sign-in. Configuring one enables both routes."
      />
    );
  }

  return (
    <Panel>
      <Eyebrow>Get started</Eyebrow>
      <h1
        style={{
          margin: "14px 0 0",
          fontFamily: tokens.display,
          fontWeight: 500,
          fontSize: 26,
          letterSpacing: "-.025em",
        }}
      >
        Create your account
      </h1>
      <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.6, color: tokens.textMuted }}>
        A personal workspace is created with your account.
      </p>
      <AuthForm action={signUpAction} submitLabel="Create account" includeName />
      <p style={{ margin: "20px 0 0", fontSize: 13.5, color: tokens.textMuted }}>
        Already have one?{" "}
        <Link href="/sign-in" style={{ color: tokens.accent }}>
          Sign in
        </Link>
      </p>
    </Panel>
  );
}
