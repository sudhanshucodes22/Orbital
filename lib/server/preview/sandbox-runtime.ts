/** The sandboxed preview runtime. SERVER ONLY.
 *
 * Same `PreviewRuntime` contract as before, different execution: instead of
 * serving from inside the application's process, it spawns a separate one
 * running `tools/preview-server.mjs`, confined by whatever this host supports.
 *
 * What that buys, concretely:
 *
 *   - **Crash isolation.** A preview that dies takes nothing with it. In the
 *     previous runtime an unhandled error in the request path was an error
 *     inside Orbital.
 *   - **Structural secret isolation.** The child's environment is *built*, not
 *     inherited. `GENERATION_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are not
 *     filtered out — they were never there. The child also imports none of the
 *     application's code, so it has no client, no config module and no way to
 *     read them.
 *   - **OS confinement**, where available: no filesystem writes, no egress.
 *   - **Deterministic shutdown.** SIGTERM, then SIGKILL if it will not go.
 *
 * The port still comes from the kernel, announced by the child on stdout,
 * because a parent that chose the port would have to scan for a free one and
 * could lose a race to another process.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PREVIEW_IDLE_MS,
  PREVIEW_START_TIMEOUT_MS,
  type FileSnapshot,
  type PreviewFailure,
  type PreviewSession,
  type ProjectId,
  type RevisionId,
} from "../../domain";
import type { PreviewRuntime } from "../../ports";
import { MaterializeError, materializeTree, previewRootFor } from "./materialize";
import {
  detectIsolation,
  previewCommand,
  previewEnvironment,
  type IsolationCapability,
} from "./isolation";

const PREVIEW_BASE = join(tmpdir(), "orbital-preview");

/** Conservative defaults. A generated static site needs almost nothing; these
 *  exist so a pathological one cannot take the machine with it. */
export const PREVIEW_LIMITS = {
  /** V8 heap ceiling for a preview process, in MB. */
  maxOldSpaceMb: 128,
  /** Hard ceiling on a preview's lifetime, enforced by the child itself so it
   *  holds even if this process dies without cleaning up. */
  maxLifetimeMs: 60 * 60 * 1000,
  /** How many previews may run at once, across all projects. A preview is a
   *  process and a port; without a cap, opening enough workspaces exhausts
   *  both. */
  maxConcurrent: 8,
  /** How long to wait for a polite shutdown before killing. */
  terminateGraceMs: 3_000,
} as const;

interface Live {
  session: PreviewSession;
  child: ChildProcess | null;
  root: string;
  timer: NodeJS.Timeout | null;
}

type TreeLoader = (
  projectId: ProjectId,
  revisionId: RevisionId
) => Promise<readonly FileSnapshot[]>;

export interface SandboxRuntimeOptions {
  base?: string;
  embedderOrigins?: readonly string[];
  /** Overridden in tests so both isolation tiers can be exercised regardless
   *  of what the machine running them supports. */
  isolation?: IsolationCapability;
  loadTree: TreeLoader;
  /** Path to the child script. Resolved by the caller because the layout
   *  differs between source, build output and test build. */
  serverScript?: string;
}

export type SandboxedPreviewRuntime = PreviewRuntime & {
  /** Stops everything. Process shutdown and tests both need it — a leaked
   *  child holds a port and a process slot until the machine reboots. */
  shutdown(): Promise<void>;
  /** What isolation this runtime is actually providing. Surfaced so the UI can
   *  say so rather than implying a guarantee. */
  capability(): IsolationCapability;
};

/** Where the child script lives.
 *
 * `process.cwd()` rather than a path relative to this module: under Next's
 * bundler this file's location is not stable, and the script is a real file in
 * the repository that must be spawned from disk.
 */
function defaultServerScript(): string {
  return join(process.cwd(), "tools", "preview-server.mjs");
}

export function createSandboxedPreviewRuntime(
  options: SandboxRuntimeOptions
): SandboxedPreviewRuntime {
  const base = options.base ?? PREVIEW_BASE;
  const isolation = options.isolation ?? detectIsolation();
  const script = options.serverScript ?? defaultServerScript();
  const embedders =
    options.embedderOrigins && options.embedderOrigins.length > 0
      ? [...options.embedderOrigins]
      : ["http://localhost:3000", "http://127.0.0.1:3000"];
  const frameAncestors = embedders.join(" ");
  const loadTree = options.loadTree;

  const live = new Map<string, Live>();
  const now = () => new Date().toISOString();

  function touch(entry: Live): void {
    if (entry.timer) clearTimeout(entry.timer);
    entry.session.expiresAt = new Date(Date.now() + PREVIEW_IDLE_MS).toISOString();
    entry.timer = setTimeout(() => {
      void teardown(entry.session.projectId, "stopped");
    }, PREVIEW_IDLE_MS);
    // A reaper must not hold the process open, or the test suite waits ten
    // minutes for a timer nobody will observe.
    entry.timer.unref?.();
  }

  /** Ends a child process for certain.
   *
   * SIGTERM first so it can close its sockets, SIGKILL if it does not go. A
   * preview that ignores SIGTERM would otherwise hold its port forever, and
   * "usually exits" is not a lifecycle. */
  function stopChild(child: ChildProcess | null): Promise<void> {
    if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();

    return new Promise<void>((done) => {
      const kill = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Already gone.
        }
      }, PREVIEW_LIMITS.terminateGraceMs);
      kill.unref?.();

      child.once("exit", () => {
        clearTimeout(kill);
        done();
      });

      try {
        child.kill("SIGTERM");
      } catch {
        clearTimeout(kill);
        done();
      }
    });
  }

  async function teardown(projectId: string, state: "stopped" | "failed"): Promise<void> {
    const entry = live.get(projectId);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    await stopChild(entry.child);
    entry.child = null;
    entry.session = { ...entry.session, state, origin: null };
    if (state === "stopped") live.delete(projectId);
  }

  /** Spawns the child and waits for it to announce a port.
   *
   * Resolves on the handshake, rejects on a startup error, an early exit, or a
   * timeout — all three are real ways a preview fails to come up, and each
   * gets a distinct stage so the UI can say which.
   */
  function launch(root: string): Promise<{ child: ChildProcess; port: number }> {
    return new Promise((ok, fail) => {
      if (!existsSync(script)) {
        fail(
          new MaterializeError({
            stage: "startup",
            message: "The preview runtime is not installed correctly.",
            detail: "preview server script missing",
          })
        );
        return;
      }

      const config = JSON.stringify({
        root,
        frameAncestors,
        maxLifetimeMs: PREVIEW_LIMITS.maxLifetimeMs,
      });

      const { command, argv } = previewCommand({
        mode: isolation.mode,
        script,
        root,
        config,
        maxOldSpaceMb: PREVIEW_LIMITS.maxOldSpaceMb,
      });

      const child = spawn(command, argv, {
        // Built, not inherited. This is the line that makes secret isolation
        // structural rather than a filter someone has to maintain.
        env: previewEnvironment(),
        // Never a shell: argv goes to execve directly, so a path with a space
        // or a quote cannot become a second command.
        shell: false,
        // Its own working directory, so a relative path inside the child
        // cannot reach the repository.
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
        // Its own process group, so killing the parent's group does not take
        // previews with it and vice versa.
        detached: false,
      });

      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      const timer = setTimeout(() => {
        finish(() => {
          void stopChild(child);
          fail(
            new MaterializeError({
              stage: "timeout",
              message: "The preview did not start in time.",
              detail: `no handshake within ${PREVIEW_START_TIMEOUT_MS}ms`,
            })
          );
        });
      }, PREVIEW_START_TIMEOUT_MS);
      timer.unref?.();

      let buffered = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        buffered += chunk.toString("utf8");
        // Bounded: a child that floods stdout must not grow the parent's
        // memory while the parent waits for one line.
        if (buffered.length > 8192) buffered = buffered.slice(-8192);

        const newline = buffered.indexOf("\n");
        if (newline === -1) return;
        const line = buffered.slice(0, newline);

        try {
          const message = JSON.parse(line) as { ready?: boolean; port?: number; error?: string };
          if (message.ready && typeof message.port === "number") {
            finish(() => ok({ child, port: message.port! }));
          } else if (message.error) {
            finish(() => {
              void stopChild(child);
              fail(
                new MaterializeError({
                  stage: message.error === "EADDRINUSE" ? "portAllocation" : "startup",
                  message: "The preview could not claim a port on this machine.",
                  detail: message.error ?? null,
                })
              );
            });
          }
        } catch {
          // Not the handshake. Ignored rather than treated as an error: the
          // child is not supposed to print anything else, but a stray line
          // must not prevent it starting.
        }
      });

      // Captured but never surfaced verbatim: child stderr can contain host
      // paths, and this string would reach a browser.
      child.stderr?.on("data", (chunk: Buffer) => {
        console.error("[preview:child]", chunk.toString("utf8").slice(0, 2000));
      });

      child.once("error", (error: NodeJS.ErrnoException) => {
        finish(() =>
          fail(
            new MaterializeError({
              stage: "startup",
              message: "The preview process could not be started.",
              detail: error.code ?? "spawn failed",
            })
          )
        );
      });

      child.once("exit", (code, signal) => {
        finish(() =>
          fail(
            new MaterializeError({
              stage: "startup",
              message: "The preview process stopped before it was ready.",
              detail: signal ? `killed by ${signal}` : `exit code ${code}`,
            })
          )
        );
        // Exiting *after* it was ready is a crash, not a startup failure.
        const entry = live.get(String(projectOf(child)));
        if (entry && entry.child === child && entry.session.state === "ready") {
          entry.session = {
            ...entry.session,
            state: "failed",
            origin: null,
            failure: {
              stage: "crashed",
              message: "The preview stopped unexpectedly.",
              detail: signal ? `killed by ${signal}` : `exit code ${code}`,
            },
          };
        }
      });
    });
  }

  /** Which project a child belongs to. Tracked on the side because the exit
   *  handler needs it and a ChildProcess carries no user data. */
  const owners = new WeakMap<ChildProcess, string>();
  const projectOf = (child: ChildProcess) => owners.get(child);

  function failureOf(error: unknown): PreviewFailure {
    if (error instanceof MaterializeError) return error.failure;
    console.error("[preview] unexpected runtime failure", error);
    return { stage: "unknown", message: "The preview could not be started.", detail: null };
  }

  async function boot(
    projectId: ProjectId,
    revisionId: RevisionId,
    previous: Live | null
  ): Promise<PreviewSession> {
    const root = previewRootFor(base, projectId);

    const transitional: PreviewSession = {
      projectId,
      revisionId,
      state: previous ? "restarting" : "starting",
      origin: null,
      entries: previous?.session.entries ?? [],
      failure: null,
      startedAt: now(),
      version: (previous?.session.version ?? 0) + 1,
      expiresAt: new Date(Date.now() + PREVIEW_IDLE_MS).toISOString(),
      isolation: isolation.mode,
    };

    const entry: Live = previous ?? { session: transitional, child: null, root, timer: null };
    entry.session = transitional;
    entry.root = root;
    live.set(projectId, entry);

    // The old child goes first, or every revision leaks a process and a port.
    await stopChild(entry.child);
    entry.child = null;

    try {
      // Enforced before spawning: a cap that only applies once a process
      // exists is not a cap.
      const running = [...live.values()].filter((e) => e.child !== null).length;
      if (running >= PREVIEW_LIMITS.maxConcurrent) {
        throw new MaterializeError({
          stage: "startup",
          message: "Too many previews are running. Close one and try again.",
          detail: `limit ${PREVIEW_LIMITS.maxConcurrent}`,
        });
      }

      // Loaded inside the try: a deleted revision or a store outage is a
      // failure with a reason, not an exception that escapes as "something
      // went wrong".
      const tree = await loadTree(projectId, revisionId);
      const { entries } = await materializeTree(root, tree);
      const { child, port } = await launch(root);
      owners.set(child, projectId);

      entry.child = child;
      entry.session = {
        ...transitional,
        state: "ready",
        origin: `http://127.0.0.1:${port}`,
        entries,
        failure: null,
      };
      touch(entry);
      return entry.session;
    } catch (error) {
      entry.session = {
        ...transitional,
        state: "failed",
        origin: null,
        failure: failureOf(error),
      };
      entry.child = null;
      // Kept rather than deleted: the failure is the answer to "why is there
      // no preview", and dropping it leaves an empty panel with no reason.
      touch(entry);
      return entry.session;
    }
  }

  return {
    async start(projectId, revisionId) {
      const existing = live.get(projectId);

      if (
        existing &&
        existing.session.revisionId === revisionId &&
        existing.session.state === "ready" &&
        existing.child &&
        existing.child.exitCode === null
      ) {
        touch(existing);
        return existing.session;
      }

      return boot(projectId, revisionId, existing ?? null);
    },

    async status(projectId) {
      const entry = live.get(projectId);
      if (!entry) return null;

      // A child that exited without the exit handler running — killed by the
      // OS, say — must not leave the session claiming to be ready.
      if (entry.session.state === "ready" && entry.child && entry.child.exitCode !== null) {
        entry.session = {
          ...entry.session,
          state: "failed",
          origin: null,
          failure: {
            stage: "crashed",
            message: "The preview stopped unexpectedly.",
            detail: `exit code ${entry.child.exitCode}`,
          },
        };
        entry.child = null;
      }

      if (entry.session.state === "ready") touch(entry);
      return entry.session;
    },

    async stop(projectId) {
      await teardown(projectId, "stopped");
    },

    async restart(projectId) {
      const entry = live.get(projectId);
      if (!entry) {
        throw new MaterializeError({
          stage: "unknown",
          message: "There is no preview to restart.",
          detail: null,
        });
      }
      const { projectId: id, revisionId } = entry.session;
      return boot(id, revisionId, entry);
    },

    async shutdown() {
      await Promise.all([...live.keys()].map((id) => teardown(id, "stopped")));
      live.clear();
    },

    capability() {
      return isolation;
    },
  };
}
