import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/ui/AppShell";
import { GenerationPanel } from "@/components/ui/GenerationPanel";
import { Eyebrow, Panel } from "@/components/ui/Panel";
import { tokens } from "@/components/ui/tokens";
import { asProjectId, type GeneratedSite } from "@/lib/domain";
import { NotFoundError } from "@/lib/errors";
import { getContainer } from "@/lib/server/container";
import { getProject, getSession } from "@/lib/services";

export const metadata: Metadata = { title: "Project" };
export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  // Pages verify the session themselves; middleware is only a fast redirect.
  const session = await getSession();
  if (!session) notFound();

  // Another user's project is indistinguishable from one that does not exist.
  let project;
  try {
    project = await getProject(session, asProjectId(projectId));
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const revisions = await getContainer().revisions.listForProject(project.id);
  const current = project.currentRevisionId
    ? (revisions.find((r) => r.id === project.currentRevisionId) ?? revisions[0])
    : revisions[0];
  const site = current?.site as GeneratedSite | undefined;

  return (
    <AppShell title={project.name} signedIn>
      <div style={{ display: "grid", gap: 22 }}>
        <Panel>
          <div style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
            <h1
              style={{
                margin: 0,
                fontFamily: tokens.display,
                fontWeight: 500,
                fontSize: 26,
                letterSpacing: "-.025em",
              }}
            >
              {project.name}
            </h1>
            <span
              style={{
                fontFamily: tokens.mono,
                fontSize: 10,
                letterSpacing: ".12em",
                padding: "5px 10px",
                borderRadius: 999,
                border: `1px solid ${
                  project.status === "ready" ? tokens.borderAccent : tokens.borderSoft
                }`,
                color: project.status === "ready" ? "rgba(196,236,255,.95)" : tokens.textFaint,
              }}
            >
              {project.status.toUpperCase()}
            </span>
            <span style={{ flex: 1 }} />
            <Link href="/projects" style={{ fontSize: 13.5, color: tokens.accent }}>
              ← All projects
            </Link>
          </div>
          {project.description && (
            <p style={{ margin: "10px 0 0", fontSize: 14.5, lineHeight: 1.6, color: tokens.textMuted }}>
              {project.description}
            </p>
          )}
        </Panel>

        <GenerationPanel projectId={project.id} hasRevision={Boolean(current)} />

        {site && current && (
          <Panel>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <Eyebrow>Live preview</Eyebrow>
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: tokens.mono, fontSize: 10.5, color: tokens.textFaint }}>
                {site.pages.length} PAGE{site.pages.length === 1 ? "" : "S"}
              </span>
            </div>

            <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "14px 0 12px" }}>
              {site.pages.map((page) => (
                <a
                  key={page.path}
                  href={`/api/demo/preview/${current.id}?path=${encodeURIComponent(page.path)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontFamily: tokens.mono,
                    fontSize: 10.5,
                    padding: "6px 11px",
                    borderRadius: 999,
                    border: `1px solid ${tokens.borderSoft}`,
                    color: "rgba(196,236,255,.9)",
                  }}
                >
                  {page.path}
                </a>
              ))}
            </nav>

            {/* Sandboxed: generated markup is untrusted content, even when
                this build produced it. */}
            <iframe
              title="Generated site preview"
              src={`/api/demo/preview/${current.id}`}
              sandbox=""
              style={{
                width: "100%",
                height: 460,
                border: `1px solid ${tokens.border}`,
                borderRadius: 12,
                background: "#06080e",
              }}
            />
          </Panel>
        )}

        {revisions.length > 0 && (
          <Panel>
            <Eyebrow>History</Eyebrow>
            <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
              {revisions.map((revision) => (
                <li
                  key={revision.id}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "baseline",
                    flexWrap: "wrap",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: `1px solid ${
                      revision.id === current?.id ? tokens.borderAccent : tokens.borderSoft
                    }`,
                    background: revision.id === current?.id ? "rgba(124,230,255,.06)" : "transparent",
                  }}
                >
                  <span style={{ fontSize: 13.5 }}>{revision.summary}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontFamily: tokens.mono, fontSize: 10.5, color: tokens.textFaint }}>
                    {new Date(revision.createdAt).toLocaleTimeString()}
                    {revision.id === current?.id ? " · CURRENT" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
