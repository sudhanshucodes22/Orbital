"use client";

import { useActionState } from "react";
import type { AuthFormState } from "@/app/(auth)/actions";
import { tokens } from "./tokens";

const field: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${tokens.border}`,
  background: "rgba(255,255,255,.03)",
  color: tokens.text,
  fontFamily: tokens.body,
  fontSize: 14.5,
};

const label: React.CSSProperties = {
  display: "block",
  marginBottom: 7,
  fontFamily: tokens.mono,
  fontSize: 10,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: tokens.textFaint,
};

export function AuthForm({
  action,
  submitLabel,
  includeName = false,
}: {
  action: (prev: AuthFormState, data: FormData) => Promise<AuthFormState>;
  submitLabel: string;
  includeName?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form action={formAction} style={{ display: "grid", gap: 16, marginTop: 26 }}>
      {includeName && (
        <div>
          <label style={label} htmlFor="displayName">
            Name <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span>
          </label>
          <input id="displayName" name="displayName" type="text" autoComplete="name" style={field} />
        </div>
      )}
      <div>
        <label style={label} htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required style={field} />
      </div>
      <div>
        <label style={label} htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={includeName ? "new-password" : "current-password"}
          required
          style={field}
        />
      </div>

      {state.error && (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: "11px 13px",
            borderRadius: 10,
            border: "1px solid rgba(255,150,140,.35)",
            background: "rgba(255,150,140,.08)",
            color: "rgba(255,196,190,.95)",
            fontSize: 13.5,
            lineHeight: 1.5,
          }}
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        style={{
          marginTop: 4,
          padding: "13px 22px",
          borderRadius: 999,
          border: "none",
          fontFamily: tokens.body,
          fontSize: 15,
          fontWeight: 500,
          color: "#04060c",
          background: "linear-gradient(180deg,#cdf3ff,#7ad6ff)",
          cursor: pending ? "progress" : "pointer",
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? "Working…" : submitLabel}
      </button>
    </form>
  );
}
