import type { FileSnapshot } from "./file";
import type { GenerationId, ProjectId, RevisionId, Timestamp } from "./ids";
import type { GeneratedSite } from "./site";

/** Version history is a chain, not a list: every revision names its parent, so
 *  branching later does not need a schema change. */
export interface Revision {
  id: RevisionId;
  projectId: ProjectId;
  parentId: RevisionId | null;
  /** The generation that produced it, if any. Manual edits have none. */
  generationId: GenerationId | null;
  /** Plain-language description of what changed. */
  summary: string;
  site: GeneratedSite;
  createdAt: Timestamp;
  /** The working tree as it stood when this revision was cut.
   *
   * Optional because revisions written before the builder core existed have
   * none, and a migration that invented one would be inventing history. A
   * revision without a tree can be shown but not restored. */
  tree?: readonly FileSnapshot[];
}

export interface CreateRevisionInput {
  projectId: ProjectId;
  parentId: RevisionId | null;
  generationId: GenerationId | null;
  summary: string;
  site: GeneratedSite;
  tree: readonly FileSnapshot[];
}
