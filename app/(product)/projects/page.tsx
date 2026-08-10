import type { Metadata } from "next";
import { AppShell } from "@/components/ui/AppShell";
import { NotConfigured } from "@/components/ui/NotConfigured";
import { CAPABILITY_REQUIREMENTS } from "@/lib/config/env";
import { isNotConfigured } from "@/lib/errors";
import { getSession, listProjects } from "@/lib/services";
import type { Project } from "@/lib/domain";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const session = await getSession();

  let projects: Project[] | null = null;
  let blocked: { capability: string; requires: readonly string[] } | null = null;

  if (session) {
    try {
      projects = await listProjects(session);
    } catch (error) {
      // A missing backend is an expected state right now; anything else is a
      // real fault and should surface rather than be swallowed into an
      // empty list.
      if (!isNotConfigured(error)) throw error;
      blocked = { capability: "Projects", requires: error.requires };
    }
  }

  return (
    <AppShell title="Projects">
      {!session ? (
        <NotConfigured
          capability="Projects"
          requires={CAPABILITY_REQUIREMENTS.auth}
          what="This is the workspace project list. It needs a signed-in user before it can show anything, and identity is not configured yet."
        />
      ) : blocked ? (
        <NotConfigured
          capability={blocked.capability}
          requires={blocked.requires}
          what="Listing, creating and deleting projects is implemented in lib/services/projects.ts, including name validation and workspace role checks. It needs a repository to read from."
        />
      ) : (
        <ul>
          {projects?.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
