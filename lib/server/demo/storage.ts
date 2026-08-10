/** ArtifactStorage for demo mode. SERVER ONLY.
 *
 * Files land in .orbital-demo/artifacts. There is no object store to sign
 * against, so createUploadUrl points at a local route that accepts the bytes
 * instead — same contract, so the caller cannot tell the difference.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ACCEPTED_MIME, MAX_UPLOAD_BYTES, type InputKind } from "../../domain";
import { ValidationError } from "../../errors";
import type { ArtifactStorage } from "../../ports";
import { DEMO_DIR } from "./store";

const ARTIFACT_DIR = path.join(DEMO_DIR, "artifacts");

/** Keys are `<kind>/<uuid>`; this flattens them to a single safe filename and
 *  rejects anything that tries to climb out of the directory. */
export function artifactPath(storageKey: string): string {
  const safe = storageKey.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!safe || safe.includes("..")) throw new ValidationError("Invalid storage key.");
  return path.join(ARTIFACT_DIR, safe);
}

export async function writeArtifact(storageKey: string, bytes: Buffer): Promise<void> {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await writeFile(artifactPath(storageKey), bytes);
}

export async function readArtifact(storageKey: string): Promise<Buffer> {
  return readFile(artifactPath(storageKey));
}

export const demoStorage: ArtifactStorage = {
  async createUploadUrl({ kind, mimeType, byteSize }) {
    const accepted = ACCEPTED_MIME[kind as Exclude<InputKind, "text">];
    if (!accepted?.includes(mimeType)) {
      throw new ValidationError(`${mimeType} is not accepted for ${kind}.`);
    }
    if (byteSize > MAX_UPLOAD_BYTES) {
      throw new ValidationError(
        `Upload exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit.`
      );
    }
    // Random key, never the user's filename: no traversal, no collisions.
    const storageKey = `${kind}-${randomUUID()}`;
    return { uploadUrl: `/api/demo/upload?key=${encodeURIComponent(storageKey)}`, storageKey };
  },

  async createReadUrl(storageKey: string) {
    return `/api/demo/artifact/${encodeURIComponent(storageKey)}`;
  },

  async delete(storageKey: string) {
    await unlink(artifactPath(storageKey)).catch(() => undefined);
  },
};
