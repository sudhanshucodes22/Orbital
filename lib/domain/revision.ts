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
}
