/** Applying structured operations to a project's working tree.
 *
 * The decision logic lives in `lib/domain/apply.ts` as a pure function, shared
 * with the generation engine. This layer adds what the engine does not need:
 * authorisation and persistence. Keeping the rules in one place matters more
 * than usual here, because they are the security rules.
 */
import type {
  ApplyReport,
  FileOperation,
  FileSnapshot,
  ProjectFile,
  ProjectId,
  Revision,
  RevisionId,
  Session,
} from "../domain";
import { applyOperationsToTree, normalizeFilePath } from "../domain";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { getContainer } from "../server/container";
import { getProject } from "./projects";

export { MAX_OPERATIONS_PER_BATCH } from "../domain";

export async function listFiles(session: Session, projectId: ProjectId): Promise<ProjectFile[]> {
  // Authorisation lives on the project, not the file: a caller who may read
  // the project may read its tree.
  await getProject(session, projectId);
  return getContainer().files.list(projectId);
}

export async function getFile(
  session: Session,
  projectId: ProjectId,
  path: string
): Promise<ProjectFile | null> {
  await getProject(session, projectId);
  const verdict = normalizeFilePath(path);
  if (!verdict.ok) return null;
  return getContainer().files.get(projectId, verdict.path);
}

/** Applies a batch and returns exactly what happened.
 *
 * Requires the `member` role, matching project creation: changing a project's
 * contents is at least as significant as creating one.
 */
export async function applyOperations(
  session: Session,
  projectId: ProjectId,
  operations: readonly FileOperation[]
): Promise<ApplyReport> {
  const project = await getProject(session, projectId);
  const membership = await getContainer().workspaces.membership(
    project.workspaceId,
    session.user.id
  );
  if (!membership || membership.role === "viewer") {
    throw new ForbiddenError("This action requires the member role.");
  }

  const existing = await snapshotOf(projectId);
  const result = applyOperationsToTree(existing, operations);

  if (result.writes.length > 0 || result.deletes.length > 0) {
    await getContainer().files.applyBatch(projectId, result.writes, result.deletes);
  }
  return result.report;
}

/** The tree as a snapshot list, for freezing into a revision. */
export async function snapshotTree(
  session: Session,
  projectId: ProjectId
): Promise<FileSnapshot[]> {
  await getProject(session, projectId);
  return snapshotOf(projectId);
}

/** Restores a project to a previous revision.
 *
 * A restore is a jump, not a replay: the revision carries its whole frozen
 * tree, so the project is set to exactly that state in one step regardless of
 * how many revisions came after it. Replaying history would make restore cost
 * grow with project age and would break the moment one revision in the middle
 * was unreplayable.
 *
 * It is recorded as a *new* revision rather than by moving a pointer
 * backwards. History stays append-only, so restoring is itself undoable and
 * the record of what happened is not rewritten.
 */
export async function restoreRevision(
  session: Session,
  projectId: ProjectId,
  revisionId: RevisionId
): Promise<Revision> {
  const project = await getProject(session, projectId);
  const membership = await getContainer().workspaces.membership(
    project.workspaceId,
    session.user.id
  );
  if (!membership || membership.role === "viewer") {
    throw new ForbiddenError("This action requires the member role.");
  }

  const revision = await getContainer().revisions.get(revisionId);
  // A revision id from another project must not be a way into this one.
  if (!revision || revision.projectId !== projectId) {
    throw new NotFoundError("Revision");
  }
  if (!revision.tree) {
    throw new ValidationError(
      "This revision predates tree snapshots and cannot be restored."
    );
  }

  const tree = revision.tree;
  await getContainer().files.replaceAll(projectId, tree);

  const restored = await getContainer().revisions.create({
    projectId,
    parentId: project.currentRevisionId,
    generationId: null,
    summary: `Restored revision ${revisionId}`,
    site: revision.site,
    tree,
  });

  await getContainer().projects.update(projectId, {
    status: "ready",
    currentRevisionId: restored.id,
  });

  return restored;
}

/** Unauthorised read of the tree. Internal: every exported caller above has
 *  already checked the project. */
async function snapshotOf(projectId: ProjectId): Promise<FileSnapshot[]> {
  const files = await getContainer().files.list(projectId);
  return files.map((f) => ({
    path: f.path,
    kind: f.kind,
    content: f.content,
    storageKey: f.storageKey,
    hash: f.hash,
    byteSize: f.byteSize,
  }));
}
