import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/ui/AuthForm";
import { NotConfigured } from "@/components/ui/NotConfigured";
import { Eyebrow, Panel } from "@/components/ui/Panel";
import { tokens } from "@/components/ui/tokens";
import { CAPABILITY_REQUIREMENTS, capabilities } from "@/lib/config/env";
import { signInAction } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  if (!capabilities().auth) {
    return (
      <NotConfigured
        capability="Authentication"
        requires={CAPABILITY_REQUIREMENTS.auth}
        what="Sign-in is implemented and routed. Point it at a Supabase project and this page becomes the real form."
      />
    );
  }

  return (
    <Panel>
      <Eyebrow>Welcome back</Eyebrow>
      <h1
        style={{
          margin: "14px 0 0",
          fontFamily: tokens.display,
          fontWeight: 500,
          fontSize: 26,
          letterSpacing: "-.025em",
        }}
      >
        Sign in to Orbital
      </h1>
      <AuthForm action={signInAction} submitLabel="Sign in" />
      <p style={{ margin: "20px 0 0", fontSize: 13.5, color: tokens.textMuted }}>
        No account yet?{" "}
        <Link href="/sign-up" style={{ color: tokens.accent }}>
          Create one
        </Link>
      </p>
    </Panel>
  );
}
