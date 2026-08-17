"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { findStarter } from "@/lib/content/starters";
import { asProjectId } from "@/lib/domain";
import { ForbiddenError, NotFoundError, ValidationError, isNotConfigured } from "@/lib/errors";
import { createProject, deleteProject, requireSession } from "@/lib/services";

export type ProjectFormState = { error: string | null };

/** Turns a thrown domain error into something safe to render.
 *
 * Validation and permission messages are written for users and pass through.
 * Anything else is logged server-side and replaced, so a database message
 * never reaches the browser. */
function present(error: unknown): string {
  if (error instanceof ValidationError) return error.message;
  if (error instanceof ForbiddenError) return error.message;
  if (error instanceof NotFoundError) return error.message;
  if (isNotConfigured(error)) return error.message;
  console.error("[projects] unexpected failure", error);
  return "Something went wrong. Please try again.";
}

export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  try {
    const session = await requireSession();
    await createProject(session, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "") || null,
    });
  } catch (error) {
    return { error: present(error) };
  }
  revalidatePath("/projects");
  return { error: null };
}

/** Creates a project from a starter and opens it with the brief loaded.
 *
 * A plain form post rather than a client handler, so the empty state works
 * without JavaScript. It goes through `createProject` like the manual form —
 * same validation, same role check — because a shortcut that bypassed the
 * service would be a second way to write a project, and the two would drift.
 *
 * The brief travels in the query string rather than being written to the
 * project: it is a suggestion the user can still edit or discard, and nothing
 * should record it as an input until they press Generate.
 */
export async function createFromStarterAction(formData: FormData): Promise<void> {
  const starter = findStarter(String(formData.get("starterId") ?? ""));
  if (!starter) redirect("/projects");

  let projectId: string;
  try {
    const session = await requireSession();
    const project = await createProject(session, {
      name: starter.projectName,
      description: starter.description,
    });
    projectId = project.id;
  } catch (error) {
    // A void action has no state to return to, so the message rides back on
    // the URL and the list renders it.
    redirect(`/projects?error=${encodeURIComponent(present(error))}`);
  }

  revalidatePath("/projects");
  // redirect() throws to unwind, so it must sit outside the try.
  redirect(`/projects/${projectId}?brief=${encodeURIComponent(starter.brief)}`);
}

export async function deleteProjectAction(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  try {
    const session = await requireSession();
    const id = String(formData.get("projectId") ?? "");
    if (!id) return { error: "Missing project id." };
    // Authorisation lives in the service (owner/admin role) and again in the
    // RLS policy. Nothing here trusts the id beyond its shape.
    await deleteProject(session, asProjectId(id));
  } catch (error) {
    return { error: present(error) };
  }
  revalidatePath("/projects");
  return { error: null };
}
