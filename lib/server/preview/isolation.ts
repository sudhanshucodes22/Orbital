/** What isolation this host can actually provide. SERVER ONLY.
 *
 * The honest answer varies by machine, and the product must not claim more
 * than it has. This module detects what is available, builds the strongest
 * confinement it can, and reports the result as a value the UI can show —
 * rather than letting "sandboxed" be an assumption nobody checked.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

/** How well a preview is contained, strongest first.
 *
 * `container` is not implemented — no container runtime exists on this host to
 * develop or verify against, and shipping an unverifiable Docker adapter would
 * be exactly the "claiming security without evidence" this is meant to avoid.
 * The value exists because the selection logic and the UI should already
 * understand a stronger tier, so adding one is an adapter plus a branch.
 */
export type IsolationMode = "container" | "sandboxed" | "process" | "in-process";

export interface IsolationCapability {
  mode: IsolationMode;
  /** One line, for operators and for the workspace's status line. */
  summary: string;
  /** What is genuinely enforced, and by what. */
  guarantees: readonly string[];
  /** What is *not* enforced. Shown in docs and diagnostics so the gap is never
   *  implicit. */
  limitations: readonly string[];
}

/** macOS Seatbelt. Deprecated by Apple but present and functional, and it is
 *  what this host has. */
const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

let cached: IsolationCapability | null = null;

/** Whether Seatbelt can actually run a process, not merely whether the binary
 *  exists.
 *
 * Probed by running something trivial under the real policy: a profile that
 * parses but kills the process is worse than no profile, because the failure
 * would appear as "previews never start" rather than "sandboxing unavailable".
 */
function seatbeltWorks(): boolean {
  if (process.platform !== "darwin" || !existsSync(/*turbopackIgnore: true*/ SANDBOX_EXEC)) return false;
  try {
    const output = execFileSync(
      SANDBOX_EXEC,
      ["-p", seatbeltProfile("/tmp"), process.execPath, "-e", "process.stdout.write('ok')"],
      { timeout: 5_000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    return output.trim() === "ok";
  } catch {
    return false;
  }
}

/** The Seatbelt policy applied to a preview process.
 *
 * Written as allow-default with targeted denials rather than deny-default.
 * That is a deliberate, and weaker, choice: a deny-default profile that lets
 * Node start needs a long list of mach services and dyld paths, and every
 * omission shows up as a preview that silently fails to boot. What this profile
 * does enforce, it enforces completely — and both denials were verified
 * empirically on this host before being relied on:
 *
 *   - no filesystem writes anywhere
 *   - no outbound network, including DNS
 *
 * Read confinement is *not* enforced here, because Node must read its own
 * binary, the dyld cache and system libraries. Reads are confined in the
 * server's own code instead, by resolving every path and rejecting anything
 * outside the preview root. Two different mechanisms, and the weaker one is
 * named rather than implied.
 */
export function seatbeltProfile(root: string): string {
  // The root is a path this process constructed from a UUID, not user input.
  // Quotes are escaped anyway because it is being embedded in a policy
  // language, and "it cannot contain a quote" is a claim that ages badly.
  const safeRoot = root.replace(/["\\]/g, "\\$&");
  return [
    "(version 1)",
    "(allow default)",
    // The preview writes nothing. It serves files the parent already wrote.
    "(deny file-write*)",
    // Except the standard streams, which the handshake needs.
    '(allow file-write-data (literal "/dev/null") (literal "/dev/stdout") (literal "/dev/stderr"))',
    // No egress. A generated page is self-contained by contract, so nothing
    // legitimate is lost — and a page that tries to phone home cannot.
    "(deny network-outbound)",
    "(allow network-outbound (local ip))",
    // It still has to be a server.
    "(allow network-bind (local ip))",
    "(allow network-inbound (local ip))",
    `; preview root: ${safeRoot}`,
  ].join("\n");
}

/** What this host can do, detected once.
 *
 * Cached because the probe spawns a process, and the answer cannot change
 * while the application is running.
 */
export function detectIsolation(): IsolationCapability {
  if (cached) return cached;

  // Deliberately not attempted: see the note on `IsolationMode`.
  if (seatbeltWorks()) {
    cached = {
      mode: "sandboxed",
      summary: "Previews run in a separate process under an OS sandbox.",
      guarantees: [
        "Separate OS process: a crash cannot take the application down",
        "Environment built from an allowlist: no application secrets are present",
        "OS sandbox denies all filesystem writes",
        "OS sandbox denies outbound network, including DNS",
        "Reads confined to the preview root by path resolution in the server",
        "Deterministic shutdown by signal, with a hard lifetime ceiling",
      ],
      limitations: [
        "No CPU or memory cgroup limits; memory is bounded by a V8 heap cap only",
        "No kernel-level user or namespace separation",
        "Filesystem reads are confined by application code, not by the OS profile",
        "Single host: previews cannot outlive or migrate between app instances",
      ],
    };
    return cached;
  }

  cached = {
    mode: "process",
    summary: "Previews run in a separate process, without an OS sandbox.",
    guarantees: [
      "Separate OS process: a crash cannot take the application down",
      "Environment built from an allowlist: no application secrets are present",
      "Reads confined to the preview root by path resolution in the server",
      "Deterministic shutdown by signal, with a hard lifetime ceiling",
    ],
    limitations: [
      "No OS-level sandbox on this host: the process may write files and reach the network",
      "No CPU or memory cgroup limits",
      "Single host: previews cannot outlive or migrate between app instances",
    ],
  };
  return cached;
}

/** Test seam. Lets a suite exercise both tiers without depending on what the
 *  machine running the tests happens to support. */
export function __setIsolation(next: IsolationCapability | null): void {
  cached = next;
}

/** The command that starts a preview server, wrapped in whatever confinement
 *  this host supports.
 *
 * Returns argv rather than a shell string: nothing here is ever passed through
 * a shell, so a path with a space — or anything else — cannot become a second
 * command.
 */
export function previewCommand(args: {
  mode: IsolationMode;
  script: string;
  root: string;
  config: string;
  maxOldSpaceMb: number;
}): { command: string; argv: string[] } {
  const nodeArgs = [
    // A V8 heap ceiling. Not a cgroup, but it does stop a runaway preview
    // taking the machine's memory, and it is what is available without one.
    `--max-old-space-size=${args.maxOldSpaceMb}`,
    args.script,
    args.config,
  ];

  if (args.mode === "sandboxed") {
    return {
      command: SANDBOX_EXEC,
      argv: ["-p", seatbeltProfile(args.root), process.execPath, ...nodeArgs],
    };
  }

  return { command: process.execPath, argv: nodeArgs };
}

/** The environment a preview process is given.
 *
 * Built from nothing rather than filtered from `process.env`. That direction
 * matters: a denylist has to be updated every time a secret is added, and the
 * one time it is forgotten is the one that leaks. This way a new variable is
 * absent by default and has to be named here to be present.
 *
 * Nothing in this list is a credential. `PATH` is included because the sandbox
 * wrapper resolves a binary; `TMPDIR` because Node expects one.
 */
export function previewEnvironment(): NodeJS.ProcessEnv {
  return {
    PATH: `/usr/bin:/bin:${dirname(process.execPath)}`,
    // A preview is not the application and must not behave like it.
    NODE_ENV: "production",
    TMPDIR: "/tmp",
    // Explicitly blank rather than absent, so a library that reads it gets a
    // definite answer instead of the host user's home directory.
    HOME: "",
  };
}
