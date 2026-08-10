import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/ui/AppShell";
import { CreateProjectForm } from "@/components/ui/CreateProjectForm";
import { DeleteProjectButton } from "@/components/ui/DeleteProjectButton";
import { NotConfigured } from "@/components/ui/NotConfigured";
import { Panel } from "@/components/ui/Panel";
import { tokens } from "@/components/ui/tokens";
import { CAPABILITY_REQUIREMENTS, capabilities } from "@/lib/config/env";
import { getSession, listProjects } from "@/lib/services";
import { createProjectAction, deleteProjectAction } from "./actions";

export const metadata: Metadata = { title: "Projects" };

// Session state must not be cached across requests.
export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ProjectsPage() {
  if (!capabilities().database) {
    return (
      <AppShell title="Projects">
        <NotConfigured
          capability="Projects"
          requires={CAPABILITY_REQUIREMENTS.database}
          what="Listing, creating and deleting projects is implemented end to end, including workspace role checks and row-level security. It needs a Supabase project to read from."
        />
      </AppShell>
    );
  }

  // Verified here rather than trusted from middleware: middleware only checks
  // that a session cookie is present, this checks that it is valid.
  const session = await getSession();
  if (!session) redirect("/sign-in?next=%2Fprojects");

  // Errors deliberately propagate to error.tsx rather than being flattened
  // into an empty list — "you have no projects" and "the query failed" must
  // not look the same.
  const projects = await listProjects(session);

  return (
    <AppShell title="Projects" signedIn>
      <div style={{ display: "grid", gap: 26 }}>
        <Panel>
          <CreateProjectForm action={createProjectAction} />
        </Panel>

        {projects.length === 0 ? (
          <Panel>
            <h2
              style={{
                margin: 0,
                fontFamily: tokens.display,
                fontWeight: 500,
                fontSize: 20,
                letterSpacing: "-.02em",
              }}
            >
              Nothing in orbit yet.
            </h2>
            <p style={{ margin: "10px 0 0", fontSize: 14.5, lineHeight: 1.6, color: tokens.textMuted, maxWidth: 460 }}>
              Create your first project above. Once the generation engine is
              connected, this is where a sketch, a screenshot or a sentence
              becomes a site.
            </p>
          </Panel>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
            {projects.map((project) => (
              <li key={project.id}>
                <Panel style={{ padding: "18px 20px" }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                      <Link
                        href={`/projects/${project.id}`}
                        style={{
                          fontFamily: tokens.display,
                          fontSize: 17,
                          letterSpacing: "-.02em",
                          color: tokens.text,
                        }}
                      >
                        {project.name}
                      </Link>
                      {project.description && (
                        <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.5, color: tokens.textMuted }}>
                          {project.description}
                        </p>
                      )}
                      <p
                        style={{
                          margin: "8px 0 0",
                          fontFamily: tokens.mono,
                          fontSize: 10.5,
                          letterSpacing: ".08em",
                          color: tokens.textFaint,
                        }}
                      >
                        {project.status.toUpperCase()} · UPDATED {formatDate(project.updatedAt)}
                      </p>
                    </div>
                    {/* The title is a link, but a bare title reads as static
                        text. An explicit control makes the row's primary
                        action obvious at a glance. */}
                    <Link
                      href={`/projects/${project.id}`}
                      style={{
                        padding: "7px 15px",
                        borderRadius: 999,
                        border: `1px solid ${tokens.borderAccent}`,
                        background: tokens.accentSoft,
                        color: "#cdf2ff",
                        fontSize: 12.5,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Open →
                    </Link>
                    <DeleteProjectButton
                      projectId={project.id}
                      projectName={project.name}
                      action={deleteProjectAction}
                    />
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
