/** What the model is allowed to see.
 *
 * The constraint that shapes every real builder: you cannot send the project
 * on every turn. "Make the login button blue" needs the component holding the
 * login button, the token file it reads colours from, and roughly nothing
 * else. Sending the tree instead is slow, expensive, and measurably worse —
 * relevant lines get buried.
 *
 * So context is a budgeted selection, and the selection is recorded on the run
 * so a bad answer can be traced to what the model was actually looking at.
 */
import type { IntentClassification } from "./intent";
import type { ProjectId, RevisionId, Timestamp } from "./ids";

/** Why a file made it into the window. Kept because when output is wrong, the
 *  first question is which rule pulled in the wrong file. */
export type SelectionReason =
  | "explicit"        // the user named it
  | "planTarget"      // a plan step declared it
  | "pathMatch"       // its path matched terms in the prompt
  | "contentMatch"    // its content matched terms in the prompt
  | "entrypoint"      // structural: a manifest, config or route root
  | "recentlyChanged" // touched by the previous run
  | "dependency";     // imported by an already-selected file

export interface ContextSlice {
  path: string;
  /** Whole file when it fits the budget, otherwise the relevant region. */
  content: string;
  /** True when `content` is a window rather than the whole file, so the
   *  prompt can say so and the model does not assume it saw everything. */
  truncated: boolean;
  reason: SelectionReason;
  /** Higher wins when the budget runs out. */
  score: number;
  byteSize: number;
}

/** A cheap map of the whole project, always included.
 *
 * Even when a file's content is excluded, the model needs to know it exists —
 * otherwise it invents a second Button.tsx beside the one it could not see.
 * Paths are small; content is not. */
export interface ProjectMap {
  paths: readonly string[];
  totalFiles: number;
  /** Paths omitted from `paths` when a project is very large. */
  omitted: number;
}

export interface ContextBudget {
  /** Ceiling on the bytes of file content in the window. Bytes rather than
   *  tokens because tokenisation is provider-specific and this layer is not
   *  allowed to know the provider. The provider adapter converts. */
  maxContentBytes: number;
  /** Ceiling on how many files may be opened, independent of size. */
  maxFiles: number;
  /** Per-file ceiling, so one large file cannot consume the whole window. */
  maxBytesPerFile: number;
}

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  maxContentBytes: 96 * 1024,
  maxFiles: 24,
  maxBytesPerFile: 24 * 1024,
};

export interface ContextRequest {
  projectId: ProjectId;
  /** The instruction being answered. Drives relevance scoring. */
  prompt: string;
  /** Paths the caller already knows are relevant — a plan step's targets, or
   *  the file open in the editor. Always admitted first. */
  focusPaths?: readonly string[];
  budget?: ContextBudget;
}

/** The assembled window, and the record of how it was assembled. */
export interface ProjectContext {
  /** What the request appears to be asking for, classified deterministically
   *  before any model call. A hint for the planner and the retrieval scorer —
   *  never an override, and `confident: false` marks a fallback rather than a
   *  finding. */
  intent?: IntentClassification;
  projectId: ProjectId;
  revisionId: RevisionId | null;
  map: ProjectMap;
  slices: readonly ContextSlice[];
  /** Prior instructions, oldest first. Conversation continuity: "make it
   *  darker" only means something with the turn before it. */
  history: readonly ContextTurn[];
  usedBytes: number;
  budget: ContextBudget;
  builtAt: Timestamp;
}

export interface ContextTurn {
  prompt: string;
  summary: string | null;
  at: Timestamp;
}
