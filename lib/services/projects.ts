/** Project business logic.
 *
 * The rules here are real and enforced before any port is touched: name
 * validation, workspace membership, and the role a given action needs. They
 * hold whichever backend is plugged in later, which is the point of keeping
 * them out of the adapters.
 */
import type {
  CreateProjectInput,
  Project,
  ProjectId,
  Session,
  UpdateProjectInput,
  WorkspaceId,
  WorkspaceRole,
} from "../domain";
import { roleAtLeast } from "../domain";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { getContainer } from "../server/container";

export const PROJECT_NAME_MIN = 1;
export const PROJECT_NAME_MAX = 60;

export function validateProjectName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < PROJECT_NAME_MIN) {
    throw new ValidationError("A project needs a name.", "name");
  }
  if (trimmed.length > PROJECT_NAME_MAX) {
    throw new ValidationError(
      `Keep the name under ${PROJECT_NAME_MAX} characters.`,
      "name"
    );
  }
  return trimmed;
}

async function requireRole(
  session: Session,
  workspaceId: WorkspaceId,
  required: WorkspaceRole
): Promise<void> {
  const membership = await getContainer().workspaces.membership(
    workspaceId,
    session.user.id
  );
  if (!membership) throw new ForbiddenError("Not a member of this workspace.");
  if (!roleAtLeast(membership.role, required)) {
    throw new ForbiddenError(`This action requires the ${required} role.`);
  }
}

export async function listProjects(session: Session): Promise<Project[]> {
  await requireRole(session, session.activeWorkspaceId, "viewer");
  const projects = await getContainer().projects.list(session.activeWorkspaceId);
  // Most recently touched first — the editor is the destination, so the list
  // is a resume point rather than an archive.
  return [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(session: Session, id: ProjectId): Promise<Project> {
  const project = await getContainer().projects.get(id);
  if (!project) throw new NotFoundError("Project");
  await requireRole(session, project.workspaceId, "viewer");
  return project;
}

export const PROJECT_DESCRIPTION_MAX = 280;

export function validateProjectDescription(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > PROJECT_DESCRIPTION_MAX) {
    throw new ValidationError(
      `Keep the description under ${PROJECT_DESCRIPTION_MAX} characters.`,
      "description"
    );
  }
  return trimmed;
}

export async function createProject(
  session: Session,
  input: Omit<CreateProjectInput, "workspaceId">
): Promise<Project> {
  const name = validateProjectName(input.name);
  const description = validateProjectDescription(input.description);
  await requireRole(session, session.activeWorkspaceId, "member");
  return getContainer().projects.create(
    { workspaceId: session.activeWorkspaceId, name, description },
    session.user.id
  );
}

export async function renameProject(
  session: Session,
  id: ProjectId,
  patch: UpdateProjectInput
): Promise<Project> {
  const project = await getProject(session, id);
  await requireRole(session, project.workspaceId, "member");
  const next: UpdateProjectInput = {};
  if (patch.name !== undefined) next.name = validateProjectName(patch.name);
  if (patch.description !== undefined) {
    next.description = validateProjectDescription(patch.description);
  }
  return getContainer().projects.update(id, next);
}

export async function deleteProject(session: Session, id: ProjectId): Promise<void> {
  const project = await getProject(session, id);
  // Deletion is destructive and unrecoverable, so it sits a rung above editing.
  await requireRole(session, project.workspaceId, "admin");
  await getContainer().projects.delete(id);
}
