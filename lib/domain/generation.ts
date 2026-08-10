import type { GenerationId, ProjectId, RevisionId, Timestamp } from "./ids";
import type { InputArtifact } from "./input";

export type GenerationStatus =
  | "queued"
  | "reading"
  | "understanding"
  | "building"
  | "succeeded"
  | "failed"
  | "cancelled";

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
