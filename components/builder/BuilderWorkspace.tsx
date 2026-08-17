"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  getBuilderStateAction,
  readFileAction,
  restartPreviewAction,
  retryTurnAction,
  sendPromptAction,
  BuilderState,
} from "@/app/(product)/projects/[projectId]/builder/actions";
import type { ProjectFormState } from "@/app/(product)/projects/actions";
import { allFolderPaths, type Revision } from "@/lib/domain";
import { BuilderHeader } from "./BuilderHeader";
import { ChatPanel } from "./ChatPanel";
import { FileTree } from "./FileTree";
import { FileViewer } from "./FileViewer";
import { HistoryDrawer } from "./HistoryDrawer";
import { PreviewPane } from "./PreviewPane";
import type { DiffResult } from "../ui/RevisionDiff";
import type { RunPageResult } from "../ui/RunHistory";
import { tokens } from "../ui/tokens";

/** The workspace.
 *
 * ## What this component owns
 *
 * One piece of state — `BuilderState` — refreshed from the server, plus the
 * local view state that has no business on the server (which file is open,
 * which drawer is showing). It owns no generation logic. Sending a prompt is a
 * server action; the pipeline does the rest, and this polls to find out.
 *
 * ## Why polling
 *
 * Because the run row is the truth, and it can be advanced by three different
 * things — the submitting request, a status poll, or the worker. Streaming
 * from the request that submitted would mean the workspace only knew about
 * work *it* started; close the tab and reopen it, and the build would appear
 * to have vanished. Re-reading the persisted state has no such gap, and it is
 * why a reload mid-generation loses nothing.
 *
 * Polling runs only while something is in flight. An idle workspace makes no
 * requests at all.
 */

/** Fast enough that a stage change feels immediate, slow enough that a long
 *  build does not make hundreds of requests. */
const POLL_MS = 1500;

type Actions = {
  getState: typeof getBuilderStateAction;
  readFile: typeof readFileAction;
  send: typeof sendPromptAction;
  retry: typeof retryTurnAction;
  restartPreview: typeof restartPreviewAction;
};

interface OpenFile {
  path: string;
  content: string | null;
  byteSize: number;
  kind: string;
  truncated: boolean;
  loading: boolean;
  error: string | null;
}

export function BuilderWorkspace({
  projectId,
  initialState,
  engineLabel,
  revisions,
  initialRuns,
  actions,
  loadPage,
  onRetryForm,
  restoreAction,
  compareAction,
}: {
  projectId: string;
  /** Rendered on the server, so the workspace is complete on first paint
   *  rather than assembling itself after hydration. */
  initialState: BuilderState;
  engineLabel: string;
  revisions: Revision[];
  initialRuns: RunPageResult;
  actions: Actions;
  loadPage: (input: {
    projectId: string;
    cursor: string | null;
    status: string | null;
  }) => Promise<RunPageResult | { error: string }>;
  onRetryForm: (prev: ProjectFormState, data: FormData) => Promise<ProjectFormState>;
  restoreAction: (prev: ProjectFormState, data: FormData) => Promise<ProjectFormState>;
  compareAction: (input: {
    projectId: string;
    fromRevisionId: string;
    toRevisionId: string;
  }) => Promise<DiffResult | { error: string }>;
}) {
  const [state, setState] = useState<BuilderState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [retryingRunId, setRetryingRunId] = useState<string | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewToken, setPreviewToken] = useState(0);
  const [restarting, setRestarting] = useState(false);

  // What the frame is currently showing, as the runtime describes it. The
  // preview's own version covers more than the revision does: a restart at the
  // same revision is also a reason to reload.
  const shownPreview = useRef<string | null>(
    initialState.preview.kind === "runtime" ? initialState.preview.version : null
  );

  const refresh = useCallback(async () => {
    const next = await actions.getState(projectId);
    if ("error" in next) {
      setError(next.error);
      return;
    }
    setError(null);
    setState(next);

    // Reload the frame exactly when the served content changed. Reloading on
    // every poll would flicker; never reloading would leave someone looking at
    // the version before their change.
    const version = next.preview.kind === "runtime" ? next.preview.version : null;
    if (version !== shownPreview.current) {
      shownPreview.current = version;
      setPreviewToken((n) => n + 1);
    }
  }, [actions, projectId]);

  // Poll only while work is in flight. `busy` comes from the persisted active
  // run, so this restarts correctly after a reload too.
  useEffect(() => {
    if (!state.busy) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [state.busy, refresh]);

  const send = async (prompt: string) => {
    setError(null);
    // Optimistically enter the busy state so the input locks immediately;
    // the next poll replaces this with the real run.
    setState((s) => ({ ...s, busy: true }));

    const result = await actions.send(projectId, prompt);
    if ("error" in result) {
      setError(result.error);
      setState((s) => ({ ...s, busy: false }));
      return;
    }
    // Read the real state straight away rather than waiting a full interval —
    // the turn should appear the moment it is submitted.
    await refresh();
  };

  const retry = async (runId: string) => {
    setRetryingRunId(runId);
    setError(null);
    const result = await actions.retry(projectId, runId);
    setRetryingRunId(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    await refresh();
  };

  const restartPreview = async () => {
    setRestarting(true);
    setError(null);
    const result = await actions.restartPreview(projectId);
    setRestarting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    // Read the new session immediately; the version change reloads the frame.
    await refresh();
  };

  const openPath = async (path: string) => {
    setOpenFile({
      path,
      content: null,
      byteSize: 0,
      kind: "text",
      truncated: false,
      loading: true,
      error: null,
    });
    const result = await actions.readFile(projectId, path);
    setOpenFile((current) => {
      // A second file may have been clicked while this one loaded; the later
      // click wins, and this response is stale.
      if (!current || current.path !== path) return current;
      if ("error" in result) {
        return { ...current, loading: false, error: result.error };
      }
      return {
        path: result.path,
        content: result.content,
        byteSize: result.byteSize,
        kind: result.kind,
        truncated: result.truncated,
        loading: false,
        error: null,
      };
    });
  };

  // Files the most recent successful turn wrote, for the tree's markers.
  const lastSuccess = [...state.conversation]
    .reverse()
    .find((t) => t.reply.kind === "success");
  const changedPaths = lastSuccess?.reply.changedPaths ?? [];

  const active = state.conversation.find((t) => t.reply.kind === "pending");
  const statusLabel = active ? active.reply.headline.replace(/…$/, "") : state.projectStatus;

  const revisionLabel = state.currentRevisionId
    ? `REV ${state.currentRevisionId.slice(0, 8)}`
    : "NO REVISION";

  return (
    <div className="b-shell">
      <BuilderHeader
        projectId={projectId}
        projectName={state.projectName}
        busy={state.busy}
        statusLabel={statusLabel}
        revisionLabel={revisionLabel}
        onToggleFiles={() => setFilesOpen((v) => !v)}
        onToggleChat={() => setChatOpen((v) => !v)}
        onOpenHistory={() => setHistoryOpen(true)}
        filesOpen={filesOpen}
        chatOpen={chatOpen}
      />

      <div className="b-body">
        {/* ---- files ------------------------------------------------- */}
        <aside
          className={`b-panel b-panel--files${filesOpen ? " b-open" : ""}`}
          aria-label="Project files"
        >
          <div className="b-panel-head">
            <span
              style={{
                fontFamily: tokens.mono,
                fontSize: 9.5,
                letterSpacing: ".14em",
                color: tokens.textFaint,
              }}
            >
              FILES
            </span>
            <span style={{ flex: 1 }} />
            <span
              style={{
                fontFamily: tokens.mono,
                fontSize: 9.5,
                letterSpacing: ".1em",
                color: tokens.textFaint,
              }}
            >
              {state.fileCount}
            </span>
          </div>
          <div className="b-scroll">
            <FileTree
              tree={state.tree}
              selected={openFile?.path ?? null}
              onSelect={(path) => {
                void openPath(path);
                setFilesOpen(false);
              }}
              changedPaths={changedPaths}
              initialExpanded={allFolderPaths(initialState.tree)}
            />
          </div>
        </aside>

        {/* ---- preview ----------------------------------------------- */}
        <main className="b-panel" style={{ position: "relative" }} aria-label="Live preview">
          <PreviewPane
            target={state.preview}
            refreshToken={previewToken}
            onRefresh={() => setPreviewToken((n) => n + 1)}
            onRestart={restartPreview}
            restarting={restarting}
          />
          {/* The file viewer covers the preview rather than replacing it, so
              closing returns to exactly the page that was showing. */}
          {openFile && (
            <FileViewer
              path={openFile.path}
              content={openFile.content}
              byteSize={openFile.byteSize}
              kind={openFile.kind}
              truncated={openFile.truncated}
              loading={openFile.loading}
              error={openFile.error}
              onClose={() => setOpenFile(null)}
            />
          )}
        </main>

        {/* ---- Orbital ----------------------------------------------- */}
        <aside
          className={`b-panel b-panel--chat${chatOpen ? " b-open" : ""}`}
          aria-label="Orbital"
        >
          <ChatPanel
            turns={state.conversation}
            busy={state.busy}
            error={error}
            onSend={send}
            onRetry={retry}
            onOpenChanges={() => setHistoryOpen(true)}
            retryingRunId={retryingRunId}
            hasMoreHistory={state.hasMoreHistory}
            onOpenHistory={() => setHistoryOpen(true)}
            engineLabel={engineLabel}
          />
        </aside>
      </div>

      {/* Closes whichever drawer is open on a narrow viewport. */}
      {(filesOpen || chatOpen) && (
        <div
          className="b-scrim"
          onClick={() => {
            setFilesOpen(false);
            setChatOpen(false);
          }}
          aria-hidden
        />
      )}

      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        projectId={projectId}
        // From the polled state, not the initial prop: a revision created in
        // this session has to be restorable without a reload.
        revisions={state.revisions ?? revisions}
        currentRevisionId={state.currentRevisionId}
        initialRuns={initialRuns}
        loadPage={loadPage}
        onRetry={onRetryForm}
        restoreAction={restoreAction}
        compareAction={compareAction}
      />
    </div>
  );
}
