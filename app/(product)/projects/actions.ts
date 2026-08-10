"use server";

import { revalidatePath } from "next/cache";
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
