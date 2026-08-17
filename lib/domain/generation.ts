import type { GenerationId, ProjectId, RevisionId, Timestamp } from "./ids";
import type { InputArtifact } from "./input";

/** Every state a generation can be in.
 *
 * Two groups, one union. The lifecycle states — queued, running, validating
 * and the three terminals — are what the durable pipeline stores and what a
 * worker transitions between. The three in the middle (reading, understanding,
 * building) are progress markers the engine emits as *events* while it is
 * running; they exist because the UI shows them and because splitting them
 * into a second enum would mean two vocabularies for one process.
 */
export type GenerationStatus =
  | "queued"
  | "running"
  | "reading"
  | "understanding"
  | "building"
  | "validating"
  | "succeeded"
  | "failed"
  | "cancelled";

/** The lifecycle states a run may be persisted in. */
export const RUN_STATES: readonly GenerationStatus[] = [
  "queued",
  "running",
  "validating",
  "succeeded",
  "failed",
  "cancelled",
];

export const TERMINAL_RUN_STATES: readonly GenerationStatus[] = [
  "succeeded",
  "failed",
  "cancelled",
];

/** A run that is still ours to finish. Used for the one-active-run-per-project
 *  rule and for deciding whether a poll should advance the work. */
export function isActiveState(status: GenerationStatus): boolean {
  return !TERMINAL_RUN_STATES.includes(status);
}

/** A single step the engine reports. The landing page calls these "events, not
 *  chain-of-thought" — a status line, not a reasoning trace. */
export interface GenerationEvent {
  at: Timestamp;
  status: GenerationStatus;
  message: string;
}

/** Two shapes of request: the first build of a project, and a follow-up
 *  instruction applied to an existing revision. Modelling them together keeps
 *  the engine port to a single method. */
export type GenerationIntent =
  | { type: "create"; inputs: InputArtifact[] }
  | { type: "revise"; baseRevisionId: RevisionId; inputs: InputArtifact[] };

export interface GenerationJob {
  id: GenerationId;
  projectId: ProjectId;
  intent: GenerationIntent;
  status: GenerationStatus;
  events: GenerationEvent[];
  /** Set once the job succeeds. */
  producedRevisionId: RevisionId | null;
  error: string | null;
  createdAt: Timestamp;
  completedAt: Timestamp | null;
}

export const TERMINAL_STATUSES: readonly GenerationStatus[] = [
  "succeeded",
  "failed",
  "cancelled",
];

export const isTerminal = (s: GenerationStatus) => TERMINAL_STATUSES.includes(s);
