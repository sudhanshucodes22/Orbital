import type { Metadata } from "next";
import { AppShell } from "@/components/ui/AppShell";
import { NotConfigured } from "@/components/ui/NotConfigured";
import { CAPABILITY_REQUIREMENTS } from "@/lib/config/env";

export const metadata: Metadata = { title: "Project" };

/** The editor: live preview, the conversational edit surface, and version
 *  history. All three depend on a generation engine, so the route exists and
 *  is typed but renders its real state. */
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <AppShell title={`Project ${projectId}`}>
      <NotConfigured
        capability="The project editor"
        requires={[
          ...CAPABILITY_REQUIREMENTS.database,
          ...CAPABILITY_REQUIREMENTS.generation,
        ]}
        what="Live preview, natural-language editing and version history read from a revision chain produced by the generation engine. The domain model and orchestration exist in lib/domain and lib/services; neither a repository nor an engine is connected."
      />
    </AppShell>
  );
}
