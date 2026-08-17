"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  asArtifactId,
  asGenerationId,
  asProjectId,
  asRevisionId,
  changedOnly,
  RUN_STATES,
  toRunSummary,
  type GenerationJob,
  type GenerationStatus,
  type InputArtifact,
  type InputKind,
  type RunSummary,
} from "@/lib/domain";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError, isNotConfigured } from "@/lib/errors";
import { getContainer } from "@/lib/server/container";
import type { ProjectFormState } from "../actions";
import {
  compareRevisions,
  getGeneration,
  getProject,
  listRuns,
  retryRun,
  requireSession,
  restoreRevision,
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
    // "one generation at a time" is a message written for a user, so it
    // passes through rather than becoming "something went wrong".
    error instanceof ConflictError ||
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

/** Retries a failed generation.
 *
 * Every check lives in the service: that the caller owns the project, that the
 * run actually failed, that no other generation is in flight. This action only
 * translates the result into something a form can render. */
export async function retryRunAction(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  let projectId: string;
  try {
    const session = await requireSession();
    projectId = String(formData.get("projectId") ?? "");
    const runId = String(formData.get("runId") ?? "");
    if (!projectId || !runId) return { error: "Missing project or run." };

    await retryRun(session, runId);
  } catch (error) {
    return { error: present(error) };
  }
  revalidatePath(`/projects/${projectId}`);
  return { error: null };
}

/** One page of history, for the "load more" control.
 *
 * The page is fetched on demand rather than rendered up front, which is the
 * point of the cursor: a project with three hundred runs must not ship three
 * hundred rows to the browser to show ten. */
export async function loadRunPageAction(input: {
  projectId: string;
  cursor: string | null;
  status: string | null;
}): Promise<{ runs: RunSummary[]; nextCursor: string | null; hasMore: boolean } | { error: string }> {
  try {
    const session = await requireSession();
    const page = await listRuns(session, asProjectId(input.projectId), {
      cursor: input.cursor ?? undefined,
      // Only the states the filter offers. An unrecognised value is ignored
      // rather than passed through to the query.
      statuses:
        input.status && RUN_STATES.includes(input.status as GenerationStatus)
          ? [input.status as GenerationStatus]
          : undefined,
    });
    return {
      // Projected deliberately: a GenerationRun carries every operation, and an
      // operation carries the full text of the file it wrote. None of that
      // belongs in a list row, and sending it would be both wasteful and a
      // wider surface than the view needs.
      runs: page.runs.map(toRunSummary),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  } catch (error) {
    return { error: present(error) };
  }
}

/** What changed between two revisions.
 *
 * Both ids are checked against the project inside the service, so this cannot
 * be used to read a revision belonging to someone else by pairing it with one
 * of your own. */
export async function compareRevisionsAction(input: {
  projectId: string;
  fromRevisionId: string;
  toRevisionId: string;
}): Promise<
  | {
      changes: { path: string; status: string; linesAdded: number; linesRemoved: number }[];
      added: number;
      modified: number;
      deleted: number;
      identical: boolean;
    }
  | { error: string }
> {
  try {
    const session = await requireSession();
    const diff = await compareRevisions(
      session,
      asProjectId(input.projectId),
      asRevisionId(input.fromRevisionId),
      asRevisionId(input.toRevisionId)
    );
    return {
      changes: changedOnly(diff).map((c) => ({
        path: c.path,
        status: c.status,
        linesAdded: c.linesAdded,
        linesRemoved: c.linesRemoved,
      })),
      added: diff.added,
      modified: diff.modified,
      deleted: diff.deleted,
      identical: diff.identical,
    };
  } catch (error) {
    return { error: present(error) };
  }
}

/** Restores a project to an earlier revision.
 *
 * The capability has existed since Milestone 3; this is the route to it. It is
 * not destructive — the service records the restore as a *new* revision, so
 * history stays append-only and the restore is itself undoable.
 */
export async function restoreRevisionAction(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  let projectId: string;
  try {
    const session = await requireSession();
    projectId = String(formData.get("projectId") ?? "");
    const revisionId = String(formData.get("revisionId") ?? "");
    if (!projectId || !revisionId) return { error: "Missing project or revision." };

    await restoreRevision(session, asProjectId(projectId), asRevisionId(revisionId));
  } catch (error) {
    return { error: present(error) };
  }
  revalidatePath(`/projects/${projectId}`);
  return { error: null };
}
