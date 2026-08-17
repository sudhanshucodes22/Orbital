import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/ui/AppShell";
import { CreateProjectForm } from "@/components/ui/CreateProjectForm";
import { NotConfigured } from "@/components/ui/NotConfigured";
import { Eyebrow, Heading, Panel } from "@/components/ui/Panel";
import { ProjectCard } from "@/components/ui/ProjectCard";
import { StarterGrid } from "@/components/ui/StarterGrid";
import { tokens } from "@/components/ui/tokens";
import { WorkspaceHeader } from "@/components/ui/WorkspaceHeader";
import { CAPABILITY_REQUIREMENTS, capabilities } from "@/lib/config/env";
import {
  getSession,
  listProjects,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
} from "@/lib/services";
import { createFromStarterAction, createProjectAction, deleteProjectAction } from "./actions";

export const metadata: Metadata = { title: "Projects" };

// Session state must not be cached across requests.
export const dynamic = "force-dynamic";

/** What happens after a brief is submitted. Shown only on the empty state,
 *  where the question "and then what?" is actually being asked. */
const STEPS: readonly { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: "Describe or show",
    body: "A sentence, a screenshot, a sketch or a PDF. Attachments and text can be combined in one brief.",
  },
  {
    n: "02",
    title: "Watch it build",
    body: "The engine reports what it is doing — reading, understanding, building — as a status stream, not a reasoning trace.",
  },
  {
    n: "03",
    title: "Keep talking to it",
    body: "Describe a change and it patches the existing site. Every revision is kept, so nothing is overwritten.",
  },
];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
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
  const { error } = await searchParams;
  const empty = projects.length === 0;

  // The email local part is a poor name, so it is only used when there is no
  // display name at all — and never with an "@" in it.
  const greetingName =
    session.user.displayName?.trim() || session.user.email.split("@")[0] || null;

  return (
    <AppShell title="Projects" signedIn>
      <div style={{ display: "grid", gap: 30 }}>
        <div className="o-enter">
          <WorkspaceHeader projects={projects} name={greetingName} />
        </div>

        {error && (
          <Panel style={{ padding: "15px 20px", borderColor: "rgba(255,150,140,.35)" }}>
            <p role="alert" style={{ margin: 0, fontSize: 13.5, color: "rgba(255,196,190,.95)" }}>
              {error}
            </p>
          </Panel>
        )}

        {/* The focal point of the page. Accent + edge lighting mark it as the
            primary action, and it is the only card on the list that gets
            either treatment. */}
        <Panel accent lit enter delay={70} style={{ padding: "24px 24px 26px" }}>
          <Eyebrow>New project</Eyebrow>
          <Heading size="md" style={{ marginTop: 14 }}>
            {empty ? "Start your first site" : "Start something new"}
          </Heading>
          <div style={{ marginTop: 18 }}>
            <CreateProjectForm
              action={createProjectAction}
              nameMax={PROJECT_NAME_MAX}
              descriptionMax={PROJECT_DESCRIPTION_MAX}
            />
          </div>
        </Panel>

        {empty ? (
          <>
            <Panel enter delay={140}>
              <StarterGrid
                action={createFromStarterAction}
                heading="Or take one of these"
                subheading="Each one is a real brief, not a placeholder. Picking it creates the project and opens the editor with the brief already written — you can edit it before generating, or replace it entirely."
              />
            </Panel>

            <Panel enter delay={210}>
              <Eyebrow tone="muted">How it works</Eyebrow>
              <ol
                className="r-steps"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0,1fr))",
                  gap: 24,
                  margin: "22px 0 0",
                  padding: 0,
                  listStyle: "none",
                }}
              >
                {STEPS.map((step) => (
                  <li key={step.n}>
                    <div
                      style={{
                        fontFamily: tokens.mono,
                        fontSize: 10.5,
                        letterSpacing: ".14em",
                        color: "rgba(124,230,255,.7)",
                      }}
                    >
                      {step.n}
                    </div>
                    <Heading size="sm" as="h3" style={{ marginTop: 11 }}>
                      {step.title}
                    </Heading>
                    <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.6, color: tokens.textMuted }}>
                      {step.body}
                    </p>
                  </li>
                ))}
              </ol>
            </Panel>
          </>
        ) : (
          <>
            <section>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
                <Eyebrow>Your projects</Eyebrow>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: tokens.mono, fontSize: 10, letterSpacing: ".12em", color: tokens.textFaint }}>
                  {projects.length} TOTAL
                </span>
              </div>

              <ul
                className="r-projects"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0,1fr))",
                  gap: 14,
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                }}
              >
                {projects.map((project, i) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    deleteAction={deleteProjectAction}
                    /* Capped so a long list does not end with a card that
                       arrives a full second after the first. */
                    delay={Math.min(i, 6) * 45}
                  />
                ))}
              </ul>
            </section>

            <Panel>
              <StarterGrid
                action={createFromStarterAction}
                heading="Start another from a brief"
                subheading="Creates a new project and opens it with the brief loaded."
              />
            </Panel>
          </>
        )}
      </div>
    </AppShell>
  );
}
