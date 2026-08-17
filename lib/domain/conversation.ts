/** Generation history as a conversation.
 *
 * ## Why there is no message store
 *
 * A builder needs a chat log, and the obvious move is a `messages` table. That
 * would be a second record of the same events — and the moment a run is
 * retried, or fails, or is recovered by a worker, the two would disagree, with
 * no way to say which is right.
 *
 * So there is no message store. A run already holds everything a turn needs:
 * the user's instruction verbatim, what Orbital planned, what it changed,
 * whether it worked, and when. The conversation is a *projection* of history,
 * derived here, and it cannot drift from the truth because it has no separate
 * copy to drift from.
 *
 * The consequence worth knowing: every turn is a generation. There is no
 * chit-chat, because nothing in the system can answer chit-chat — and a chat
 * panel that appeared to hold a conversation it cannot actually have would be
 * a lie about what the product does.
 */
import type { GenerationStatus } from "./generation";
import type { Timestamp } from "./ids";
import type { GenerationMode, RunSummary } from "./run";
import type { ValidationResult } from "./validate";

/** How Orbital's side of a turn should read. */
export type ReplyKind = "pending" | "success" | "failure" | "cancelled";

export interface ConversationReply {
  kind: ReplyKind;
  /** One line, written for a person: "Revision created" / "Orbital is building…" */
  headline: string;
  /** The plan's summary when there is one — what Orbital says it did. */
  detail: string | null;
  revisionId: string | null;
  /** Files actually written, from the apply report. Null before it exists. */
  filesChanged: number | null;
  operationCount: number;
  changedPaths: readonly string[];
  validation: ValidationResult | null;
  /** Present only on failure, and always a sentence a user can act on. */
  error: string | null;
  /** Whether this turn can be retried — a failure, and nothing else. */
  retryable: boolean;
}

export interface ConversationTurn {
  runId: string;
  /** What the user asked, kept verbatim. */
  prompt: string;
  at: Timestamp;
  status: GenerationStatus;
  mode: GenerationMode;
  attempt: number;
  isRetry: boolean;
  reply: ConversationReply;
}

/** Status → the line the panel shows.
 *
 * Deliberately no percentages. The pipeline knows which stage it is in, not
 * how far through it is, and a progress bar would be an invention. A stage
 * name is both honest and more informative. */
const PENDING_HEADLINE: Partial<Record<GenerationStatus, string>> = {
  queued: "Queued",
  running: "Orbital is building…",
  reading: "Reading your project…",
  understanding: "Working out what to change…",
  building: "Orbital is building…",
  validating: "Checking the changes…",
};

const PENDING_DETAIL: Partial<Record<GenerationStatus, string>> = {
  queued: "Preparing your project.",
  running: "Planning the change, then writing files.",
  reading: "Looking at the files this change touches.",
  understanding: "Turning your instruction into a plan.",
  building: "Writing the files.",
  validating: "Every change is checked before it is applied.",
};

function replyFor(run: RunSummary): ConversationReply {
  const common = {
    revisionId: run.producedRevisionId,
    filesChanged: run.applied,
    operationCount: run.operationCount,
    changedPaths: run.changedPaths,
    validation: run.validation,
  };

  if (run.status === "succeeded") {
    return {
      ...common,
      kind: "success",
      headline: "Changes applied",
      detail: run.plan?.summary ?? null,
      error: null,
      retryable: false,
    };
  }

  if (run.status === "failed") {
    return {
      ...common,
      kind: "failure",
      headline: "Generation failed",
      // The service writes these for users; a validation failure explains
      // itself through `validation` rather than through this line.
      detail: run.plan?.summary ?? null,
      error: run.error ?? "Something went wrong while building.",
      retryable: true,
    };
  }

  if (run.status === "cancelled") {
    return {
      ...common,
      kind: "cancelled",
      headline: "Cancelled",
      detail: null,
      error: null,
      // Not retryable: cancelling was a decision, and offering to undo it as
      // "retry" muddles it with recovering from a failure.
      retryable: false,
    };
  }

  return {
    ...common,
    kind: "pending",
    headline: PENDING_HEADLINE[run.status] ?? "Working…",
    detail: run.plan?.summary ?? PENDING_DETAIL[run.status] ?? null,
    error: null,
    retryable: false,
  };
}

/** Turns runs into conversation turns, oldest first.
 *
 * History arrives newest-first everywhere else in the product, because a list
 * is read from the top. A conversation is read from the bottom, so this is the
 * one place that reverses it.
 */
export function conversationFrom(runs: readonly RunSummary[]): ConversationTurn[] {
  return [...runs]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((run) => ({
      runId: run.id,
      prompt: run.prompt,
      at: run.createdAt,
      status: run.status,
      mode: run.mode,
      attempt: run.attempt,
      isRetry: run.isRetry,
      reply: replyFor(run),
    }));
}

/** Whether a turn is still in flight — the condition for polling. */
export function isPending(turn: ConversationTurn): boolean {
  return turn.reply.kind === "pending";
}
