"use client";

import { useActionState } from "react";
import type { ProjectFormState } from "@/app/(product)/projects/actions";
import { Button } from "./Button";

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
      <Button
        type="submit"
        variant="danger"
        size="sm"
        busy={pending}
        disabled={pending}
        aria-label={`Delete ${projectName}`}
      >
        {pending ? "Deleting…" : "Delete"}
      </Button>
      {state.error && (
        <span role="alert" style={{ marginLeft: 10, fontSize: 12, color: "rgba(255,196,190,.95)" }}>
          {state.error}
        </span>
      )}
    </form>
  );
}
