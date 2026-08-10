/** ArtifactStorage backed by Supabase Storage. SERVER ONLY.
 *
 * Uploads are signed rather than proxied: the browser PUTs straight to
 * storage, so a 25 MB PDF never passes through the application server. The
 * signing itself needs the service-role key, which is why storage reports
 * unconfigured without it.
 */
import { randomUUID } from "node:crypto";
import { ACCEPTED_MIME, MAX_UPLOAD_BYTES, type InputKind } from "../../domain";
import { NotConfiguredError, ValidationError } from "../../errors";
import { CAPABILITY_REQUIREMENTS, serverEnv } from "../../config/env";
import type { ArtifactStorage } from "../../ports";
import { getSupabaseAdminClient } from "./client";

function bucket(): string {
  const name = serverEnv().storageBucket;
  if (!name) throw new NotConfiguredError("storage", CAPABILITY_REQUIREMENTS.storage);
  return name;
}

export const supabaseStorage: ArtifactStorage = {
  async createUploadUrl({ kind, mimeType, byteSize }) {
    // Validated here as well as in the service: this mints a credential, and
    // anything that hands out credentials should check its own preconditions
    // rather than assume a caller did.
    const accepted = ACCEPTED_MIME[kind as Exclude<InputKind, "text">];
    if (!accepted?.includes(mimeType)) {
      throw new ValidationError(`${mimeType} is not accepted for ${kind}.`);
    }
    if (byteSize > MAX_UPLOAD_BYTES) {
      throw new ValidationError(
        `Upload exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit.`
      );
    }

    // Random key, never a user-supplied filename: no traversal, no collisions,
    // and nothing about the original file leaks through the path.
    const storageKey = `${kind}/${randomUUID()}`;
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.storage
      .from(bucket())
      .createSignedUploadUrl(storageKey);
    if (error || !data) {
      throw new Error(`Failed to create upload URL: ${error?.message ?? "unknown"}`);
    }
    return { uploadUrl: data.signedUrl, storageKey };
  },

  async createReadUrl(storageKey: string, ttlSeconds = 300) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.storage
      .from(bucket())
      .createSignedUrl(storageKey, ttlSeconds);
    if (error || !data) {
      throw new Error(`Failed to create read URL: ${error?.message ?? "unknown"}`);
    }
    return data.signedUrl;
  },

  async delete(storageKey: string) {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.storage.from(bucket()).remove([storageKey]);
    if (error) throw new Error(`Failed to delete artifact: ${error.message}`);
  },
};
