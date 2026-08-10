"use client";

import { useActionState } from "react";
import type { ProjectFormState } from "@/app/(product)/projects/actions";
import { tokens } from "./tokens";

export function DeleteProjectButton({
  projectId,
  projectName,
  action,
}: {
  projectId: string;
  projectName: string;
  action: (prev: ProjectFormState, data: FormData) => Promise<ProjectFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        // Deletion is unrecoverable and there is no undo, so it asks first.
        if (!confirm(`Delete "${projectName}"? This cannot be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Delete ${projectName}`}
        style={{
          padding: "7px 13px",
          borderRadius: 999,
          border: `1px solid ${tokens.borderSoft}`,
          background: "transparent",
          color: tokens.textFaint,
          fontFamily: tokens.body,
          fontSize: 12.5,
          cursor: pending ? "progress" : "pointer",
        }}
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {state.error && (
        <span role="alert" style={{ marginLeft: 10, fontSize: 12, color: "rgba(255,196,190,.95)" }}>
          {state.error}
        </span>
      )}
    </form>
  );
}
