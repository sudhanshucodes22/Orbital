/** GenerationEngine for demo mode. SERVER ONLY.
 *
 * IMPORTANT: this is not AI. It is a deterministic stub that exercises the
 * real pipeline — job, status transitions, event stream, revision chain,
 * project status — so the product flow can be demonstrated and the wiring
 * proven end to end. Every surface that shows its output says so.
 *
 * Progress is derived from elapsed time rather than driven by a timer, so it
 * survives a server restart and needs no background process: get() works out
 * which stage the job should be in and persists the transition.
 */
import { randomUUID } from "node:crypto";
import {
  asGenerationId,
  asProjectId,
  asRevisionId,
  type GenerationId,
  type GenerationIntent,
  type GenerationJob,
  type GenerationStatus,
  type GeneratedSite,
  type InputArtifact,
  type ProjectId,
  type SitePage,
} from "../../domain";
import { NotFoundError } from "../../errors";
import type { GenerationEngine } from "../../ports";
import { mutate, nowIso, read, type DemoJob } from "./store";

/** Stage boundaries in milliseconds from submission. */
const STAGES: readonly { at: number; status: GenerationStatus; message: string }[] = [
  { at: 0, status: "queued", message: "queued" },
  { at: 700, status: "reading", message: "reading inputs · geometry and hierarchy" },
  { at: 1600, status: "understanding", message: "resolving intent · components lifted" },
  { at: 2600, status: "building", message: "assembling typed components · responsive rules" },
  { at: 3800, status: "succeeded", message: "build complete" },
];

function stageAt(elapsedMs: number) {
  let current = STAGES[0];
  for (const s of STAGES) if (elapsedMs >= s.at) current = s;
  return current;
}

function describeInputs(inputs: readonly InputArtifact[]): string {
  if (inputs.length === 0) return "no inputs";
  return inputs
    .map((i) => (i.kind === "text" ? `text (${i.text.length} chars)` : i.kind))
    .join(", ");
}

/** Builds a small, real, static site from the project name and the inputs.
 *  Deterministic and clearly labelled — no invented metrics, no fake AI
 *  commentary. */
function buildSite(projectName: string, inputs: readonly InputArtifact[]): GeneratedSite {
  const brief =
    inputs.find((i): i is Extract<InputArtifact, { kind: "text" }> => i.kind === "text")?.text ??
    "";
  const safe = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

  const shell = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safe(title)}</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#06080e;color:#e9ebf2;font:16px/1.6 system-ui,sans-serif}
.wrap{max-width:820px;margin:0 auto;padding:64px 24px}
nav{display:flex;gap:20px;font-size:14px;opacity:.7;margin-bottom:56px}
h1{font-size:clamp(30px,5vw,52px);line-height:1.04;letter-spacing:-.03em;margin:0 0 18px}
p{color:rgba(233,235,242,.68);max-width:60ch}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:44px}
.card{border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:20px}
.note{margin-top:56px;padding:14px 16px;border:1px solid rgba(124,230,255,.35);
      border-radius:10px;font-size:13px;color:rgba(196,236,255,.9)}
</style></head><body><div class="wrap">
<nav><a href="/">Home</a><a href="/pricing">Pricing</a><a href="/contact">Contact</a></nav>
${body}
<div class="note">Generated locally by Orbital's demo engine. Deterministic sample output, not AI.</div>
</div></body></html>`;

  const pages: SitePage[] = [
    {
      path: "/",
      title: projectName,
      source: shell(
        projectName,
        `<h1>${safe(projectName)}</h1>
<p>${safe(brief || "A starting point generated from your inputs.")}</p>
<div class="cards">
  <div class="card"><h3>Built from</h3><p>${safe(describeInputs(inputs))}</p></div>
  <div class="card"><h3>Responsive</h3><p>Single fluid column on small screens.</p></div>
  <div class="card"><h3>Editable</h3><p>Each revision is kept, so nothing is lost.</p></div>
</div>`
      ),
    },
    {
      path: "/pricing",
      title: `${projectName} — Pricing`,
      source: shell(
        `${projectName} — Pricing`,
        `<h1>Pricing</h1><p>Three tiers, generated as a second page to show multi-page output.</p>
<div class="cards">
  <div class="card"><h3>Starter</h3><p>$0</p></div>
  <div class="card"><h3>Studio</h3><p>$29 / month</p></div>
  <div class="card"><h3>Team</h3><p>$89 / seat</p></div>
</div>`
      ),
    },
    {
      path: "/contact",
      title: `${projectName} — Contact`,
      source: shell(`${projectName} — Contact`, `<h1>Contact</h1><p>hello@example.com</p>`),
    },
  ];

  return {
    pages,
    assets: [],
    tokens: {
      "color-bg": "#06080e",
      "color-text": "#e9ebf2",
      "font-body": "system-ui, sans-serif",
      "radius-card": "14px",
    },
    generatedAt: nowIso(),
  };
}

function toJob(row: DemoJob): GenerationJob {
  return {
    id: asGenerationId(row.id),
    projectId: asProjectId(row.projectId),
    intent: row.intent as GenerationIntent,
    status: row.status as GenerationStatus,
    events: row.events.map((e) => ({
      at: e.at,
      status: e.status as GenerationStatus,
      message: e.message,
    })),
    producedRevisionId: row.producedRevisionId ? asRevisionId(row.producedRevisionId) : null,
    error: row.error,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

export const demoGeneration: GenerationEngine = {
  async submit(projectId: ProjectId, intent: GenerationIntent): Promise<GenerationJob> {
    return mutate((db) => {
      const project = db.projects.find((p) => p.id === projectId);
      if (!project) throw new NotFoundError("Project");

      const row: DemoJob = {
        id: randomUUID(),
        projectId,
        intent,
        status: "queued",
        events: [{ at: nowIso(), status: "queued", message: "queued" }],
        producedRevisionId: null,
        error: null,
        createdAt: nowIso(),
        completedAt: null,
      };
      db.jobs.push(row);

      project.status = "generating";
      project.updatedAt = nowIso();
      return toJob(row);
    });
  },

  async get(id: GenerationId): Promise<GenerationJob | null> {
    return mutate((db) => {
      const row = db.jobs.find((j) => j.id === id);
      if (!row) return null;
      if (row.status === "succeeded" || row.status === "failed" || row.status === "cancelled") {
        return toJob(row);
      }

      const elapsed = Date.now() - new Date(row.createdAt).getTime();
      const stage = stageAt(elapsed);
      if (stage.status === row.status) return toJob(row);

      // Record every stage crossed since the last read, so the event list is
      // complete even if the UI polled slowly.
      for (const s of STAGES) {
        if (s.at <= elapsed && !row.events.some((e) => e.status === s.status)) {
          row.events.push({ at: nowIso(), status: s.status, message: s.message });
        }
      }
      row.status = stage.status;

      if (stage.status === "succeeded") {
        const project = db.projects.find((p) => p.id === row.projectId);
        if (!project) return toJob(row);

        const intent = row.intent as GenerationIntent;
        const inputs = intent.inputs ?? [];
        const revisionId = randomUUID();

        db.revisions.push({
          id: revisionId,
          projectId: row.projectId,
          parentId: intent.type === "revise" ? intent.baseRevisionId : project.currentRevisionId,
          generationId: row.id,
          summary:
            intent.type === "create"
              ? `Initial build from ${describeInputs(inputs)}`
              : `Revision from ${describeInputs(inputs)}`,
          site: buildSite(project.name, inputs),
          createdAt: nowIso(),
        });

        project.currentRevisionId = revisionId;
        project.status = "ready";
        project.updatedAt = nowIso();

        row.producedRevisionId = revisionId;
        row.completedAt = nowIso();
      }

      return toJob(row);
    });
  },

  async cancel(id: GenerationId): Promise<void> {
    await mutate((db) => {
      const row = db.jobs.find((j) => j.id === id);
      if (!row || row.status === "succeeded") return;
      row.status = "cancelled";
      row.completedAt = nowIso();
      row.events.push({ at: nowIso(), status: "cancelled", message: "cancelled" });
      const project = db.projects.find((p) => p.id === row.projectId);
      if (project && project.status === "generating") {
        project.status = project.currentRevisionId ? "ready" : "draft";
        project.updatedAt = nowIso();
      }
    });
  },
};

export const demoPublisher = {
  async publish(revisionId: string): Promise<{ url: string }> {
    // Nothing is deployed anywhere; the local preview route is the honest
    // answer to "where can I see this".
    const found = await read((db) => db.revisions.some((r) => r.id === revisionId));
    if (!found) throw new NotFoundError("Revision");
    return { url: `/api/demo/preview/${revisionId}` };
  },
};
