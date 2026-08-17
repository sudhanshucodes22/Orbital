"use client";

import { useActionState } from "react";
import type { AuthFormState } from "@/app/(auth)/actions";
import { Button } from "./Button";
import { tokens } from "./tokens";

/* Fields carry `.o-field`, which owns the hover and focus states. The focus
 * ring there is deliberately louder than the global :focus-visible outline it
 * replaces — a form is where focus matters most. */
const label: React.CSSProperties = {
  display: "block",
  marginBottom: 8,
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
  passwordMinLength,
  passwordHint,
}: {
  action: (prev: AuthFormState, data: FormData) => Promise<AuthFormState>;
  submitLabel: string;
  includeName?: boolean;
  /** Mirrors the server's rule so the browser can say so before a round trip.
   *  The server still enforces it — this only moves the message earlier. */
  passwordMinLength?: number;
  passwordHint?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form action={formAction} style={{ display: "grid", gap: 15, marginTop: 24 }}>
      {includeName && (
        <div>
          <label style={label} htmlFor="displayName">
            Name <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span>
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="name"
            className="o-field"
          />
        </div>
      )}
      <div>
        <label style={label} htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="o-field"
        />
      </div>
      <div>
        <label style={label} htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={includeName ? "new-password" : "current-password"}
          required
          minLength={passwordMinLength}
          aria-describedby={passwordHint ? "password-hint" : undefined}
          className="o-field"
        />
        {passwordHint && (
          <p
            id="password-hint"
            style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.5, color: tokens.textFaint }}
          >
            {passwordHint}
          </p>
        )}
      </div>

      {state.error && (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: "11px 13px",
            borderRadius: 11,
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

      <Button
        type="submit"
        variant="primary"
        busy={pending}
        disabled={pending}
        style={{ marginTop: 5, width: "100%", padding: "14px 22px", fontSize: 15 }}
      >
        {pending ? "Working…" : submitLabel}
        {!pending && <span aria-hidden>→</span>}
      </Button>
    </form>
  );
}
