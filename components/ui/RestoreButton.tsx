"use client";

import { useActionState } from "react";
import type { ProjectFormState } from "@/app/(product)/projects/actions";
import { Button } from "./Button";
import { tokens } from "./tokens";

/** Restores a project to an earlier revision.
 *
 * Confirms first — not because the action is destructive (it is not; the
 * service records a *new* revision and old ones are never touched) but because
 * it changes what the project currently is, and that is a surprise if it
 * happens on a stray click.
 */
export function RestoreButton({
  projectId,
  revisionId,
  label,
  action,
}: {
  projectId: string;
  revisionId: string;
  /** What the user is restoring to, for the confirmation prompt. */
  label: string;
  action: (prev: ProjectFormState, data: FormData) => Promise<ProjectFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !confirm(
            `Restore "${label}"?\n\nThe project returns to exactly this state. ` +
              `Nothing is deleted — this is recorded as a new revision, so you can undo it.`
          )
        ) {
          e.preventDefault();
        }
      }}
      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="revisionId" value={revisionId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        busy={pending}
        disabled={pending}
        aria-label={`Restore ${label}`}
      >
        {pending ? "Restoring…" : "Restore"}
      </Button>
      {state.error && (
        <span role="alert" style={{ fontSize: 12, color: "rgba(255,196,190,.95)" }}>
          {state.error}
        </span>
      )}
    </form>
  );
}

export { tokens };
