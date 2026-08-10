import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/ui/AppShell";
import { NotConfigured } from "@/components/ui/NotConfigured";
import { Panel } from "@/components/ui/Panel";
import { tokens } from "@/components/ui/tokens";
import { CAPABILITY_REQUIREMENTS, capabilities } from "@/lib/config/env";
import { asProjectId } from "@/lib/domain";
import { NotFoundError } from "@/lib/errors";
import { getProject, getSession } from "@/lib/services";

export const metadata: Metadata = { title: "Project" };
export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  if (!capabilities().database) {
    return (
      <AppShell title="Project">
        <NotConfigured
          capability="The project editor"
          requires={CAPABILITY_REQUIREMENTS.database}
          what="Opening a project needs a database. The route, ownership checks and domain model are in place."
        />
      </AppShell>
    );
  }

  const session = await getSession();
  if (!session) notFound();

  // Another user's project is indistinguishable from one that does not exist:
  // RLS returns no row, the service raises NotFound, and this renders 404. No
  // existence oracle.
  let project;
  try {
    project = await getProject(session, asProjectId(projectId));
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <AppShell title={project.name} signedIn>
      <div style={{ display: "grid", gap: 22 }}>
        <Panel>
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
          {project.description && (
            <p style={{ margin: "10px 0 0", fontSize: 14.5, lineHeight: 1.6, color: tokens.textMuted }}>
              {project.description}
            </p>
          )}
          <p
            style={{
              margin: "14px 0 0",
              fontFamily: tokens.mono,
              fontSize: 10.5,
              letterSpacing: ".1em",
              color: tokens.textFaint,
            }}
          >
            {project.status.toUpperCase()} · CREATED {new Date(project.createdAt).toLocaleDateString()}
          </p>
          <p style={{ margin: "18px 0 0", fontSize: 13.5 }}>
            <Link href="/projects" style={{ color: tokens.accent }}>
              ← All projects
            </Link>
          </p>
        </Panel>

        <NotConfigured
          capability="Live preview and editing"
          requires={CAPABILITY_REQUIREMENTS.generation}
          what="The project exists and is yours. Preview, natural-language editing and version history all read from a revision chain that the generation engine produces, and no engine is connected yet."
        />
      </div>
    </AppShell>
  );
}
