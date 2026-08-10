import type { Metadata } from "next";
import { NotConfigured } from "@/components/ui/NotConfigured";
import { CAPABILITY_REQUIREMENTS } from "@/lib/config/env";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <NotConfigured
      capability="Account creation"
      requires={CAPABILITY_REQUIREMENTS.auth}
      what="Registration shares the identity provider with sign-in. Configuring one enables both routes."
    />
  );
}
