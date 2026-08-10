import { NextResponse } from "next/server";
import { MAX_UPLOAD_BYTES } from "@/lib/domain";
import { backendMode } from "@/lib/config/env";
import { writeArtifact } from "@/lib/server/demo";
import { getSession } from "@/lib/services";

/** Receives the bytes for a demo-mode upload.
 *
 * Stands in for the signed PUT that object storage would provide. The key was
 * minted server-side by ArtifactStorage.createUploadUrl, so it is not
 * attacker-chosen, and the handler is closed to anyone without a session.
 */
export const runtime = "nodejs";

export async function PUT(request: Request) {
  if (backendMode() !== "demo") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const key = new URL(request.url).searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Too large" }, { status: 413 });
  }

  await writeArtifact(key, bytes);
  return NextResponse.json({ ok: true, storageKey: key, byteSize: bytes.byteLength });
}

export const POST = PUT;
