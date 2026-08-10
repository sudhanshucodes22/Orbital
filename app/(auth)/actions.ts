"use server";

import { redirect } from "next/navigation";
import { isNotConfigured } from "@/lib/errors";
import { getSupabaseServerClient } from "@/lib/server/supabase/client";
import { getContainer } from "@/lib/server/container";

/** Result of an auth attempt. Only serialisable data crosses back to the
 *  client, and never the underlying provider error verbatim. */
export type AuthFormState = { error: string | null };

const PASSWORD_MIN = 8;

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
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword(parsed);
    if (error) {
      // Deliberately not distinguishing "no such account" from "wrong
      // password" — that difference is an account-enumeration oracle.
      return { error: "Those credentials did not work." };
    }
  } catch (error) {
    if (isNotConfigured(error)) return { error: error.message };
    throw error;
  }

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
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.email,
      password: parsed.password,
      options: displayName ? { data: { display_name: displayName } } : undefined,
    });
    if (error) return { error: error.message };
    // With email confirmation on, sign-up returns a user but no session.
    needsConfirmation = !data.session;
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
