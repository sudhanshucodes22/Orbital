import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BuilderWorkspace } from "@/components/builder/BuilderWorkspace";
import { asProjectId, toRunSummary } from "@/lib/domain";
import { NotFoundError } from "@/lib/errors";
import { hasModelProvider, resolveModelConfig } from "@/lib/server/ai/registry";
import { getContainer } from "@/lib/server/container";
import { getProject, getSession, listRuns } from "@/lib/services";
import {
  compareRevisionsAction,
  loadRunPageAction,
  restoreRevisionAction,
  retryRunAction,
} from "../actions";
import {
  getBuilderStateAction,
  readFileAction,
  restartPreviewAction,
  retryTurnAction,
  sendPromptAction,
} from "./actions";

/** The Builder Workspace.
 *
 * A server component that authorises, loads the first state, and hands it to
 * the client shell. Every subsequent read goes back through
 * `getBuilderStateAction`, which repeats the same authorisation — so a session
 * that expires mid-session stops working rather than continuing on a stale
 * render.
 *
 * The initial state is rendered here rather than fetched after mount because a
 * workspace that assembles itself in front of you reads as slow even when it
 * is not.
 */
export const metadata: Metadata = { title: "Builder" };
export const dynamic = "force-dynamic";

export default async function BuilderPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  // The layout redirects unauthenticated visitors, but this checks again: a
  // page that returns project data must not depend on a parent for its
  // authorisation.
  const session = await getSession();
  if (!session) notFound();

  try {
    // Establishes that this project is the caller's before anything is loaded.
    // Another user's project is indistinguishable from one that does not
    // exist — `getProject` reports it as missing, not forbidden.
    await getProject(session, asProjectId(projectId));
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const initialState = await getBuilderStateAction(projectId);
  // The only way this errors after the check above is an outage. There is no
  // useful workspace to render without state, so it reads as not-found rather
  // than as a broken shell.
  if ("error" in initialState) notFound();

  const [revisions, runPage] = await Promise.all([
    getContainer().revisions.listForProject(asProjectId(projectId)),
    listRuns(session, asProjectId(projectId)),
  ]);

  // Resolved on the server: the registry is server-only, and the panel must
  // never be able to claim a model was involved when none was.
  const modelConfig = resolveModelConfig();
  const engineLabel =
    hasModelProvider() && modelConfig ? modelConfig.modelId : "template engine";

  return (
    <BuilderWorkspace
      projectId={projectId}
      initialState={initialState}
      engineLabel={engineLabel}
      revisions={revisions}
      initialRuns={{
        runs: runPage.runs.map(toRunSummary),
        nextCursor: runPage.nextCursor,
        hasMore: runPage.hasMore,
      }}
      actions={{
        getState: getBuilderStateAction,
        readFile: readFileAction,
        send: sendPromptAction,
        retry: retryTurnAction,
        restartPreview: restartPreviewAction,
      }}
      loadPage={loadRunPageAction}
      onRetryForm={retryRunAction}
      restoreAction={restoreRevisionAction}
      compareAction={compareRevisionsAction}
    />
  );
}
