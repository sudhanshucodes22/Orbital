/** One real Gemini generation, persisted through the Supabase adapters.
 *
 *   npm run live:supabase
 *
 * This closes the last untested seam. Every generation so far ran against the
 * file-backed store; the adapter swap is where persistence semantics, error
 * shapes and RLS all change at once, so "it works in demo mode" says little
 * about it.
 *
 * It uses the service-role repositories — the same ones the worker uses —
 * because a CLI has no cookie scope to build a user-scoped client from. That
 * exercises the real Supabase adapter for files, revisions and runs, which is
 * the part in question. It does not exercise RLS; `npm run verify` does that
 * with two real JWTs.
 *
 * Everything it creates is removed in the `finally`, including the auth user.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { asArtifactId, asProjectId, type GenerationIntent } from "../../lib/domain";

function loadEnv() {
  for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const log = (k: string, v: unknown = "") => console.log(`  ${k.padEnd(30)} ${v}`);

function intent(text: string, baseRevisionId?: string): GenerationIntent {
  const inputs = [
    { id: asArtifactId(`a-${Math.random()}`), kind: "text" as const, text, createdAt: new Date().toISOString() },
  ];
  return baseRevisionId
    ? { type: "revise", baseRevisionId: baseRevisionId as never, inputs }
    : { type: "create", inputs };
}

async function main() {
  const URL_ = process.env.SUPABASE_URL!.replace(/\/$/, "");
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json" };

  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  const { workerRepositories } = await import("../../lib/server/supabase/builder");
  const { workerProjectRepositories } = await import("../../lib/server/supabase/repositories");
  const { __setContainer, getContainer } = await import("../../lib/server/container");
  const { resolveModelConfig } = await import("../../lib/server/ai/registry");
  const { modelProducer } = await import("../../lib/server/pipeline/producers/model");
  const { advance, createPipelineEngine } = await import("../../lib/server/pipeline/pipeline");

  const config = resolveModelConfig();
  assert.ok(config, "no model provider configured");
  assert.equal(config!.providerId, "google", "this script is for the Gemini path");
  log("provider · model", `${config!.providerId} · ${config!.modelId}`);

  const marker = `live-gemini-${Date.now()}`;
  let userId: string | null = null;
  let workspaceId: string | null = null;
  let projectId: string | null = null;

  try {
    /* ---- a real user, workspace and project, in Supabase -------------- */
    const created = await fetch(`${URL_}/auth/v1/admin/users`, {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ email: `${marker}@example.com`, password: `Pw-${marker}`, email_confirm: true }),
    });
    // Read the body once: a template literal in the assert message is
    // evaluated eagerly, which consumed the stream before .json() could.
    const createdBody = await created.text();
    assert.ok(created.ok, `create user: ${createdBody.slice(0, 120)}`);
    userId = JSON.parse(createdBody).id;

    const { data: ws } = await db.from("workspaces").insert({ name: marker, slug: marker }).select().single();
    workspaceId = ws!.id;
    await db.from("workspace_members").insert({ workspace_id: workspaceId, user_id: userId, role: "owner" });

    const { data: project, error: pErr } = await db
      .from("projects")
      .insert({ workspace_id: workspaceId, owner_id: userId, name: marker, status: "draft" })
      .select()
      .single();
    assert.ok(!pErr, `project: ${pErr?.message}`);
    projectId = project!.id;
    log("project in Supabase", projectId);

    /* ---- drive the real pipeline against the Supabase adapters -------- */
    // `submit` runs under the request container, which a CLI cannot build a
    // cookie client for, so it gets the service-role repositories. `advance`
    // resolves the worker container itself and needs nothing from here — that
    // is the seam this script exists to check.
    const base = getContainer();
    __setContainer({
      ...base,
      projects: workerProjectRepositories.projects,
      workspaces: workerProjectRepositories.workspaces,
      files: workerRepositories.files,
      revisions: workerRepositories.revisions,
      runs: workerRepositories.runs,
    } as never);

    const engine = createPipelineEngine(modelProducer, { autoStart: false });

    async function generate(label: string, text: string, baseRev?: string) {
      const started = Date.now();
      const job = await engine.submit(asProjectId(projectId!), intent(text, baseRev));
      const runId = (await getContainer().runs.getByGenerationId(job.id))!.id;
      const run = await advance(runId, modelProducer);
      console.log(`\n  ${label}`);
      log("  status", `${run.status} · mode ${run.mode}`);
      log("  model recorded", run.model ? `${run.model.providerId} · ${run.model.modelId}` : "(none)");
      log("  duration", `${((Date.now() - started) / 1000).toFixed(1)}s`);
      if (run.status !== "succeeded") {
        log("  error", run.error);
        log("  stage", run.failure?.stage);
      } else {
        log("  operations", run.operations.map((o) => ("path" in o ? o.path : o.kind)).join(", "));
        log("  validation", `${run.validation?.checkedOperations} checked, ${run.validation?.errors.length} errors`);
        log("  revision", run.producedRevisionId);
      }
      return run;
    }

    const first = await generate(
      "GENERATION 1 — initial build",
      "Create a clean landing page for a small coffee roastery with a hero, a short story section and one primary CTA."
    );
    if (first.status !== "succeeded") return;

    /* ---- prove it is in Supabase, not memory ------------------------- */
    console.log("\n  PERSISTED IN SUPABASE (queried directly)");
    const { data: files } = await db.from("project_files").select("path,byte_size").eq("project_id", projectId);
    log("  project_files rows", (files ?? []).map((f) => `${f.path} (${f.byte_size}b)`).join(", "));
    const { data: revs } = await db.from("project_revisions").select("id,summary").eq("project_id", projectId);
    log("  project_revisions rows", (revs ?? []).length);
    const { data: runs } = await db.from("generation_runs").select("id,status,mode,model").eq("project_id", projectId);
    log("  generation_runs rows", (runs ?? []).length);
    log("  run mode in DB", (runs ?? [])[0]?.mode);
    log("  model in DB", JSON.stringify((runs ?? [])[0]?.model));

    /* ---- contextual edit --------------------------------------------- */
    const second = await generate(
      "GENERATION 2 — contextual edit",
      "Make the hero warmer and change the primary CTA to a deep amber.",
      first.producedRevisionId!
    );

    if (second.status === "succeeded") {
      console.log("\n  EDIT VERIFICATION (from Supabase)");
      const { data: after } = await db.from("project_revisions").select("id").eq("project_id", projectId);
      log("  revisions now", (after ?? []).length);
      log("  based on first revision", second.baseRevisionId === first.producedRevisionId ? "yes ✓" : "NO");
      const { data: f2 } = await db.from("project_files").select("path").eq("project_id", projectId);
      log("  files now", (f2 ?? []).map((f) => f.path).join(", "));

      /* ---- secrets must not be in what was persisted ----------------- */
      const key = process.env.GEMINI_API_KEY ?? "";
      const { data: raw } = await db.from("project_files").select("content").eq("project_id", projectId);
      const inFiles = (raw ?? []).some((r) => key && String(r.content).includes(key));
      const inRuns = JSON.stringify(runs ?? []).includes(key);
      console.log("\n  SECRET ISOLATION (in Supabase)");
      log("  key in project_files", inFiles ? "LEAKED" : "no ✓");
      log("  key in generation_runs", inRuns ? "LEAKED" : "no ✓");
    }

    console.log("\n  Real Gemini generation persisted through Supabase.\n");
  } finally {
    if (projectId) await db.from("projects").delete().eq("id", projectId);
    if (workspaceId) await db.from("workspaces").delete().eq("id", workspaceId);
    if (userId) {
      await fetch(`${URL_}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: admin }).catch(() => {});
    }
    console.log("  Cleaned up the throwaway project, workspace and user.");
  }
}

main().catch((e) => {
  console.error("\n  FAILED:", e instanceof Error ? e.message : e, "\n");
  process.exit(1);
});
