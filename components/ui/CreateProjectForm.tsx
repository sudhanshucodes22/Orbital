"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ProjectFormState } from "@/app/(product)/projects/actions";
import { Button } from "./Button";
import { tokens } from "./tokens";

export function CreateProjectForm({
  action,
  nameMax,
  descriptionMax,
}: {
  action: (prev: ProjectFormState, data: FormData) => Promise<ProjectFormState>;
  /** Limits come from the service rather than being restated here, so the
   *  field and the validation that rejects it can never disagree. They are
   *  passed as props because lib/services reaches the container, and importing
   *  it from a client component would pull server code into the bundle. */
  nameMax: number;
  descriptionMax: number;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const formRef = useRef<HTMLFormElement>(null);
  /* Only the length is tracked, not the text: the textarea stays uncontrolled
   * so form.reset() clears it natively, and the counter rides along on the
   * reset event rather than a second setState in the effect. */
  const [descriptionLength, setDescriptionLength] = useState(0);

  // Clear the fields once the server confirms the write, so the next project
  // does not start from the last one's text.
  useEffect(() => {
    if (!pending && !state.error) formRef.current?.reset();
  }, [pending, state.error]);

  const remaining = descriptionMax - descriptionLength;

  return (
    <form
      ref={formRef}
      action={formAction}
      onReset={() => setDescriptionLength(0)}
      style={{ display: "grid", gap: 12 }}
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <input
          name="name"
          type="text"
          required
          maxLength={nameMax}
          placeholder="Name your next site…"
          aria-label="New project name"
          className="o-field"
          style={{ flex: "1 1 240px", width: "auto", minWidth: 0, fontSize: 15 }}
        />
        <Button type="submit" variant="primary" busy={pending} disabled={pending}>
          {pending ? "Creating…" : "Create project"}
          {!pending && <span aria-hidden>→</span>}
        </Button>
      </div>

      <div>
        <textarea
          name="description"
          rows={2}
          maxLength={descriptionMax}
          onChange={(e) => setDescriptionLength(e.target.value.length)}
          placeholder="What is it for? (optional)"
          aria-label="Project description (optional)"
          className="o-field"
          style={{ fontSize: 13.5, lineHeight: 1.55, resize: "vertical" }}
        />
        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 7,
            fontFamily: tokens.mono,
            fontSize: 10,
            letterSpacing: ".12em",
            color: tokens.textFaint,
          }}
        >
          <span>SHOWN ON THE PROJECT CARD</span>
          <span style={{ flex: 1 }} />
          {/* Only worth a number once it is close enough to matter. */}
          {remaining <= 60 && <span aria-live="polite">{remaining} LEFT</span>}
        </div>
      </div>

      {state.error && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: "rgba(255,196,190,.95)" }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
