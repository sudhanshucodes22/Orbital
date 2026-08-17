import { NextResponse } from "next/server";
import { backendMode } from "@/lib/config/env";
import type { GeneratedSite } from "@/lib/domain";
import { asRevisionId } from "@/lib/domain";
import { getContainer } from "@/lib/server/container";
import { getProject, getSession } from "@/lib/services";

/** Serves a generated page from a revision, so the preview is the real
 *  artefact rather than a screenshot of one.
 *
 * Ownership is re-checked here: this route returns project content, so it
 * cannot rely on the caller having gone through the project page first.
 */
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ revisionId: string }> }
) {
  if (backendMode() !== "demo") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { revisionId } = await params;
  const revision = await getContainer().revisions.get(asRevisionId(revisionId));
  if (!revision) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Throws NotFound if the project is not the caller's, which is the check
  // that matters — a revision id must not be a way around project ownership.
  // Answered as 404 rather than letting the throw become a 500: a revision
  // belonging to someone else has to be indistinguishable from one that does
  // not exist, and a distinctive error page is a way to tell them apart.
  try {
    await getProject(session, revision.projectId);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const site = revision.site as GeneratedSite;
  const wanted = new URL(request.url).searchParams.get("path") ?? "/";
  const page = site.pages.find((p) => p.path === wanted) ?? site.pages[0];
  if (!page) return NextResponse.json({ error: "Empty revision" }, { status: 404 });

  return new NextResponse(page.source, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Generated content rendered in an iframe: deny scripts and framing by
      // anything other than this origin.
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
    },
  });
}
