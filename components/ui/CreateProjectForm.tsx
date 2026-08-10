"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ProjectFormState } from "@/app/(product)/projects/actions";
import { tokens } from "./tokens";

export function CreateProjectForm({
  action,
}: {
  action: (prev: ProjectFormState, data: FormData) => Promise<ProjectFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the fields once the server confirms the write, so the next project
  // does not start from the last one's text.
  useEffect(() => {
    if (!pending && !state.error) formRef.current?.reset();
  }, [pending, state.error]);

  return (
    <form
      ref={formRef}
      action={formAction}
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "flex-start",
      }}
    >
      <input
        name="name"
        type="text"
        required
        maxLength={60}
        placeholder="New project name"
        aria-label="New project name"
        style={{
          flex: "1 1 220px",
          minWidth: 0,
          padding: "11px 14px",
          borderRadius: 10,
          border: `1px solid ${tokens.border}`,
          background: "rgba(255,255,255,.03)",
          color: tokens.text,
          fontFamily: tokens.body,
          fontSize: 14,
        }}
      />
      <button
        type="submit"
        disabled={pending}
        style={{
          padding: "11px 20px",
          borderRadius: 999,
          border: "none",
          fontFamily: tokens.body,
          fontSize: 14,
          fontWeight: 500,
          color: "#04060c",
          background: "linear-gradient(180deg,#cdf3ff,#7ad6ff)",
          cursor: pending ? "progress" : "pointer",
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? "Creating…" : "Create project"}
      </button>
      {state.error && (
        <p role="alert" style={{ flexBasis: "100%", margin: 0, fontSize: 13, color: "rgba(255,196,190,.95)" }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
