"use server";

import { redirect } from "next/navigation";
import { PASSWORD_MIN } from "@/lib/domain/auth";
import { isNotConfigured } from "@/lib/errors";
import { getContainer } from "@/lib/server/container";

/** Result of an auth attempt. Only serialisable data crosses back to the
 *  client, and never a provider error verbatim. */
export type AuthFormState = { error: string | null };

function readCredentials(formData: FormData): { email: string; password: string } | string {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email) return "Enter your email address.";
  if (!email.includes("@")) return "That does not look like an email address.";
  if (!password) return "Enter your password.";
  return { email, password };
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = readCredentials(formData);
  if (typeof parsed === "string") return { error: parsed };

  try {
    const result = await getContainer().auth.signIn(parsed.email, parsed.password);
    if (!result.ok) return { error: result.message };
  } catch (error) {
    if (isNotConfigured(error)) return { error: error.message };
    throw error;
  }

  // redirect() throws to unwind, so it must sit outside the try.
  redirect("/projects");
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = readCredentials(formData);
  if (typeof parsed === "string") return { error: parsed };
  if (parsed.password.length < PASSWORD_MIN) {
    return { error: `Use at least ${PASSWORD_MIN} characters for the password.` };
  }
  const displayName = String(formData.get("displayName") ?? "").trim();

  let needsConfirmation = false;
  try {
    const result = await getContainer().auth.signUp({
      email: parsed.email,
      password: parsed.password,
      displayName: displayName || undefined,
    });
    if (!result.ok) return { error: result.message };
    needsConfirmation = result.needsConfirmation === true;
  } catch (error) {
    if (isNotConfigured(error)) return { error: error.message };
    throw error;
  }

  if (needsConfirmation) {
    return { error: "Check your inbox to confirm the address, then sign in." };
  }
  redirect("/projects");
}

export async function signOutAction(): Promise<void> {
  await getContainer().auth.signOut();
  redirect("/");
}
