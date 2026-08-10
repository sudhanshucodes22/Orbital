import { NextResponse } from "next/server";
import { backendMode } from "@/lib/config/env";
import { readArtifact } from "@/lib/server/demo";
import { getSession } from "@/lib/services";

/** Serves a stored artifact back. Session-gated, and the key is normalised by
 *  artifactPath() so it cannot escape the artifact directory. */
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  if (backendMode() !== "demo") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { key } = await params;
  try {
    const bytes = await readArtifact(key);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        // Unknown type on purpose: the browser must not sniff and execute a
        // user-supplied file inline.
        "content-type": "application/octet-stream",
        "content-disposition": "inline",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
