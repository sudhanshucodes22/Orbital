/** Generation orchestration.
 *
 * Validation of the multimodal inputs happens here, before anything reaches
 * the engine: an oversized upload or an unsupported MIME type should fail
 * immediately and cheaply rather than after a round trip.
 */
import type {
  GenerationJob,
  GenerationId,
  GenerationIntent,
  InputArtifact,
  InputKind,
  ProjectId,
  RevisionId,
  Session,
} from "../domain";
import { ACCEPTED_MIME, MAX_UPLOAD_BYTES } from "../domain";
import { ValidationError } from "../errors";
import { getContainer } from "../server/container";
import { getProject } from "./projects";

export function validateInputs(inputs: readonly InputArtifact[]): void {
  if (inputs.length === 0) {
    throw new ValidationError("Add at least one input to build from.");
  }
  for (const input of inputs) {
    if (input.kind === "text") {
      if (!input.text.trim()) {
        throw new ValidationError("Text input cannot be empty.");
      }
      continue;
    }
    if (input.byteSize > MAX_UPLOAD_BYTES) {
      throw new ValidationError(
        `${input.kind} is ${(input.byteSize / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`
      );
    }
    const accepted = ACCEPTED_MIME[input.kind as Exclude<InputKind, "text">];
    if (!accepted.includes(input.mimeType)) {
      throw new ValidationError(
        `${input.mimeType} is not accepted for ${input.kind}. Accepted: ${accepted.join(", ")}.`
      );
    }
  }
}

/** First build of a project. */
export async function startGeneration(
  session: Session,
  projectId: ProjectId,
  inputs: InputArtifact[]
): Promise<GenerationJob> {
  await getProject(session, projectId);
  validateInputs(inputs);
  const intent: GenerationIntent = { type: "create", inputs };
  return getContainer().generation.submit(projectId, intent);
}

/** A follow-up instruction applied to an existing revision. The product's
 *  premise is that this patches the live tree rather than regenerating, so the
 *  base revision is part of the request, not implied. */
export async function reviseProject(
  session: Session,
  projectId: ProjectId,
  baseRevisionId: RevisionId,
  inputs: InputArtifact[]
): Promise<GenerationJob> {
  await getProject(session, projectId);
  validateInputs(inputs);
  const intent: GenerationIntent = { type: "revise", baseRevisionId, inputs };
  return getContainer().generation.submit(projectId, intent);
}

export async function getGeneration(id: GenerationId): Promise<GenerationJob | null> {
  return getContainer().generation.get(id);
}

export async function cancelGeneration(id: GenerationId): Promise<void> {
  await getContainer().generation.cancel(id);
}
