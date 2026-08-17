"use server";

/** The workspace's server boundary.
 *
 * Every function here is a thin translation layer: authorise, call an existing
 * service, project the result into something a client component can hold. No
 * generation logic lives in this file, and none should — the pipeline, the
 * planner, validation, revisions and retry all already exist, and a second
 * copy of any of them would be the thing that eventually disagrees with the
 * first.
 *
 * The projections are not incidental. A `GenerationRun` carries every
 * operation, and an operation carries the full text of the file it wrote;
 * `ProjectFile` carries file contents. Returning those raw would ship an
 * entire generated site to the browser to render a sidebar. So the tree
 * carries no contents, history carries no operations, and file bodies are
 * fetched one at a time, when a file is actually opened.
 */
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  asArtifactId,
  asProjectId,
  buildFileTree,
  conversationFrom,
  toRunSummary,
  type ConversationTurn,
  type InputArtifact,
  type Revision,
  type TreeNode,
} from "@/lib/domain";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  isNotConfigured,
} from "@/lib/errors";
import {
  getActiveRun,
  getFile,
  getPreviewTarget,
  getProject,
  restartPreview,
  listFiles,
  listRevisions,
  listRuns,
  requireSession,
  retryRun,
  reviseProject,
  startGeneration,
  type PreviewTarget,
} from "@/lib/services";

/** How many turns the panel opens with. More arrive through the history
 *  drawer, which is already paginated — the conversation does not need its own
 *  paging mechanism. */
const CONVERSATION_TURNS = 12;

function present(error: unknown): string {
  if (
    error instanceof ValidationError ||
    error instanceof ConflictError ||
    error instanceof ForbiddenError ||
    error instanceof NotFoundError
  ) {
    return error.message;
  }
  if (isNotConfigured(error)) return error.message;
  // Anything else is a bug or an outage. It is logged server-side and reduced
  // to a sentence here: an unexpected error's message can carry internals, and
  // this string goes to a browser.
  console.error("[builder] unexpected failure", error);
  return "Something went wrong. Please try again.";
}

/** Everything the workspace renders, in one authorised read.
 *
 * One call rather than five because the pieces have to agree with each other:
 * a file tree from after a generation, paired with a preview from before it,
 * is a workspace showing two different moments. Reading them together makes
 * that impossible.
 */
export interface BuilderState {
  projectName: string;
  projectStatus: string;
  tree: TreeNode[];
  fileCount: number;
  conversation: ConversationTurn[];
  preview: PreviewTarget;
  currentRevisionId: string | null;
  revisionCount: number;
  /** The project's revisions, newest first.
   *
   * Part of the polled state rather than only the initial render: a revision
   * created during this session has to become restorable without a reload, and
   * before this the History drawer kept showing the list as it was when the
   * page loaded. */
  revisions: Revision[];
  /** True while a generation is in flight, which is also the poll condition. */
  busy: boolean;
  /** More history exists than the conversation shows. */
  hasMoreHistory: boolean;
}

export async function getBuilderStateAction(
  projectId: string
): Promise<BuilderState | { error: string }> {
  try {
    const session = await requireSession();
    const id = asProjectId(projectId);

    // getProject is the authorisation gate; everything below is reached
    // through it, so an id belonging to someone else fails here.
    const project = await getProject(session, id);

    const [files, runPage, preview, active, revisions] = await Promise.all([
      listFiles(session, id),
      listRuns(session, id, { limit: CONVERSATION_TURNS }),
      getPreviewTarget(session, id),
      getActiveRun(session, id),
      listRevisions(session, id),
    ]);

    const tree = buildFileTree(files);

    return {
      projectName: project.name,
      projectStatus: project.status,
      tree,
      fileCount: files.length,
      conversation: conversationFrom(runPage.runs.map(toRunSummary)),
      preview,
      currentRevisionId: project.currentRevisionId,
      revisionCount: revisions.length,
      revisions,
      // From the persisted run, not from anything this request started — so a
      // reload mid-build, or a second tab, sees the same thing.
      busy: active !== null,
      hasMoreHistory: runPage.hasMore,
    };
  } catch (error) {
    return { error: present(error) };
  }
}

/** One file's contents, fetched when it is opened.
 *
 * Separate from the tree on purpose: a project's files can be megabytes, and
 * the sidebar needs none of it to draw a list of names.
 */
export async function readFileAction(
  projectId: string,
  path: string
): Promise<
  | { path: string; content: string | null; kind: string; byteSize: number; truncated: boolean }
  | { error: string }
> {
  try {
    const session = await requireSession();
    // getFile authorises through the project and re-validates the path, so a
    // traversal attempt ("../../.env") is refused by the service rather than
    // trusted because it arrived from our own UI.
    const file = await getFile(session, asProjectId(projectId), path);
    if (!file) return { error: "That file is no longer in this project." };

    // Bounded. The viewer is a viewer, not an editor, and nobody reads 400KB
    // in a side panel — but sending it would still cost the bandwidth.
    const LIMIT = 80_000;
    const content = file.content;
    const truncated = content !== null && content.length > LIMIT;

    return {
      path: file.path,
      content: truncated ? content!.slice(0, LIMIT) : content,
      kind: file.kind,
      byteSize: file.byteSize,
      truncated,
    };
  } catch (error) {
    return { error: present(error) };
  }
}

/** Sends an instruction into the real generation pipeline.
 *
 * This is the whole point of the workspace, and it is four lines, because the
 * pipeline already exists. A project with a revision is *revised* — the
 * instruction patches the current tree rather than regenerating from scratch,
 * which is the product's premise and the reason the base revision is part of
 * the request.
 */
export async function sendPromptAction(
  projectId: string,
  prompt: string
): Promise<{ ok: true; jobId: string } | { error: string }> {
  try {
    const session = await requireSession();
    const id = asProjectId(projectId);
    const project = await getProject(session, id);

    const trimmed = prompt.trim();
    if (!trimmed) return { error: "Describe the change you want first." };

    const inputs: InputArtifact[] = [
      {
        id: asArtifactId(randomUUID()),
        kind: "text",
        text: trimmed,
        createdAt: new Date().toISOString(),
      },
    ];

    const job = project.currentRevisionId
      ? await reviseProject(session, id, project.currentRevisionId, inputs)
      : await startGeneration(session, id, inputs);

    return { ok: true, jobId: job.id };
  } catch (error) {
    return { error: present(error) };
  }
}

/** Tears the preview runtime down and starts it again.
 *
 * Distinct from reloading the iframe, which re-fetches from a server that may
 * itself be the problem. This rebuilds the materialised files and binds a new
 * port.
 */
export async function restartPreviewAction(
  projectId: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const session = await requireSession();
    await restartPreview(session, asProjectId(projectId));
    return { ok: true };
  } catch (error) {
    return { error: present(error) };
  }
}

/** Retries a failed turn.
 *
 * `retryRun` does the real work — it checks ownership, refuses anything that
 * did not fail, links the new run to the original and leaves the failure in
 * history. This exists so the panel has something to call.
 */
export async function retryTurnAction(
  projectId: string,
  runId: string
): Promise<{ ok: true; runId: string } | { error: string }> {
  try {
    const session = await requireSession();
    const retry = await retryRun(session, runId);
    // The project page shows history too; keep it from serving a stale render
    // to someone who navigates back.
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, runId: retry.id };
  } catch (error) {
    return { error: present(error) };
  }
}
