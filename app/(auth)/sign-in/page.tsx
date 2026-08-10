import type { Metadata } from "next";
import { NotConfigured } from "@/components/ui/NotConfigured";
import { CAPABILITY_REQUIREMENTS } from "@/lib/config/env";

export const metadata: Metadata = { title: "Sign in" };

/* A form with fields that do nothing would be fake functionality, so this
 * renders the real state instead. When an auth adapter exists, the form
 * replaces this component and nothing else on the route changes. */
export default function SignInPage() {
  return (
    <NotConfigured
      capability="Authentication"
      requires={CAPABILITY_REQUIREMENTS.auth}
      what="Sign-in is routed and laid out, but no identity provider is wired up. Once one is configured, this route renders the sign-in form and the product area becomes reachable."
    />
  );
}
