"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  asArtifactId,
  asGenerationId,
  asProjectId,
  type GenerationJob,
  type InputArtifact,
  type InputKind,
} from "@/lib/domain";
import { ForbiddenError, NotFoundError, ValidationError, isNotConfigured } from "@/lib/errors";
import { getContainer } from "@/lib/server/container";
import {
  getGeneration,
  getProject,
  requireSession,
  reviseProject,
  startGeneration,
} from "@/lib/services";

export type GenerateState = {
  error: string | null;
  jobId: string | null;
};

function present(error: unknown): string {
  if (
    error instanceof ValidationError ||
    error instanceof ForbiddenError ||
    error instanceof NotFoundError
  ) {
    return error.message;
  }
  if (isNotConfigured(error)) return error.message;
  console.error("[generation] unexpected failure", error);
  return "Something went wrong. Please try again.";
}

/** Mints an upload target. The key is generated server-side, so the client
 *  never chooses where its bytes land. */
export async function prepareUploadAction(input: {
  kind: Exclude<InputKind, "text">;
  mimeType: string;
  byteSize: number;
}): Promise<{ uploadUrl: string; storageKey: string } | { error: string }> {
  try {
    await requireSession();
    return await getContainer().storage.createUploadUrl(input);
  } catch (error) {
    return { error: present(error) };
  }
}

export async function startGenerationAction(
  _prev: GenerateState,
  formData: FormData
): Promise<GenerateState> {
  let job: GenerationJob;
  try {
    const session = await requireSession();
    const projectId = asProjectId(String(formData.get("projectId") ?? ""));
    const project = await getProject(session, projectId);

    const brief = String(formData.get("brief") ?? "").trim();
    const inputs: InputArtifact[] = [];

    if (brief) {
      inputs.push({
        id: asArtifactId(randomUUID()),
        kind: "text",
        text: brief,
        createdAt: new Date().toISOString(),
      });
    }

    // Files were uploaded by the client before submitting; only their metadata
    // travels here.
    const uploads = formData.getAll("upload").map(String).filter(Boolean);
    for (const raw of uploads) {
      const parsed = JSON.parse(raw) as {
        kind: Exclude<InputKind, "text">;
        storageKey: string;
        mimeType: string;
        byteSize: number;
      };
      inputs.push({
        id: asArtifactId(randomUUID()),
        kind: parsed.kind,
        storageKey: parsed.storageKey,
        mimeType: parsed.mimeType,
        byteSize: parsed.byteSize,
        extractedText: null,
        createdAt: new Date().toISOString(),
      });
    }

    // A project that already has a revision is being edited, not built. The
    // product's premise is that an instruction patches the existing tree
    // rather than regenerating from scratch, so the base revision has to be
    // part of the request — that is what threads the revision chain together.
    // Validation lives in the service and raises ValidationError, which is
    // surfaced verbatim because it is written for users.
    job = project.currentRevisionId
      ? await reviseProject(session, projectId, project.currentRevisionId, inputs)
      : await startGeneration(session, projectId, inputs);
  } catch (error) {
    return { error: present(error), jobId: null };
  }

  revalidatePath(`/projects/${job.projectId}`);
  return { error: null, jobId: job.id };
}

/** Polled by the client while a job runs. Returns a plain object so it
 *  serialises cleanly across the action boundary. */
export async function pollGenerationAction(jobId: string): Promise<{
  status: string;
  events: { status: string; message: string }[];
  revisionId: string | null;
  error: string | null;
} | null> {
  try {
    await requireSession();
    const job = await getGeneration(asGenerationId(jobId));
    if (!job) return null;
    return {
      status: job.status,
      events: job.events.map((e) => ({ status: e.status, message: e.message })),
      revisionId: job.producedRevisionId,
      error: job.error,
    };
  } catch {
    return null;
  }
}
