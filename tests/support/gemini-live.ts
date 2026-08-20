/** One real Gemini generation, through the real pipeline. Not part of the suite.
 *
 *   npm run live:gemini
 *
 * Every layer is production: the container, the context builder, the planner,
 * the Gemini adapter, the validator, revision creation and the preview runtime.
 * Nothing is mocked and demo mode is not involved — the run is recorded with
 * `mode: "model"`, which is what makes its output attributable.
 *
 * It creates its own project and deletes it afterwards, so it can be run
 * against a store with real data in it. The API key is read from the
 * environment and never printed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  asArtifactId,
  asProjectId,
  asUserId,
  asWorkspaceId,
  type GenerationIntent,
  type Session,
} from "../../lib/domain";

/** Loads .env.local before any application module reads process.env. */
function loadEnv() {
  const path = join(process.cwd(), ".env.local");
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line.trim());
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}
loadEnv();

const log = (step: string, detail = "") => console.log(`  ${step.padEnd(34)} ${detail}`);

function intent(text: string, baseRevisionId?: string): GenerationIntent {
  const inputs = [
    { id: asArtifactId(`a-${Math.random()}`), kind: "text" as const, text, createdAt: new Date().toISOString() },
  ];
  return baseRevisionId
    ? { type: "revise", baseRevisionId: baseRevisionId as never, inputs }
    : { type: "create", inputs };
}

async function main() {
  // Imported after the environment is loaded, so the registry resolves the
  // configured provider rather than falling back to unconfigured.
  const { getContainer } = await import("../../lib/server/container");
  const { resolveModelConfig, hasModelProvider } = await import("../../lib/server/ai/registry");
  const { createProject, deleteProject } = await import("../../lib/services/projects");
  const { getPreviewTarget, stopPreview } = await import("../../lib/services/preview");
  const { modelProducer } = await import("../../lib/server/pipeline/producers/model");
  const { advance, createPipelineEngine } = await import("../../lib/server/pipeline/pipeline");

  const config = resolveModelConfig();
  assert.ok(config, "no model provider configured");
  assert.equal(hasModelProvider(), true, "provider not available");
  // Provider and model are not secrets; the key is never touched here.
  log("provider", config!.providerId);
  log("model", config!.modelId);
  assert.equal(config!.providerId, "google", "this script is for the Gemini path");

  const container = getContainer();

  // A throwaway account, so nothing touches existing projects.
  const email = `gemini-live-${Date.now()}@example.test`;
  try {
    await container.auth.signUp({ email, password: "GeminiLive123!" });
  } catch (error) {
    // signUp sets a cookie, which needs a request scope this script lacks.
    if (!/cookies|request scope/i.test(String(error))) throw error;
  }
  const db = JSON.parse(readFileSync(join(process.cwd(), ".orbital-demo", "db.json"), "utf8"));
  const user = db.users.find((u: { email: string }) => u.email === email.toLowerCase());
  const membership = db.members.find((m: { userId: string }) => m.userId === user.id);
  const session: Session = {
    user: {
      id: asUserId(user.id),
      email: user.email,
      displayName: null,
      avatarUrl: null,
      createdAt: user.createdAt,
    },
    activeWorkspaceId: asWorkspaceId(membership.workspaceId),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };

  const project = await createProject(session, { name: "Gemini Live", description: null });
  log("project", project.id);

  const engine = createPipelineEngine(modelProducer, { autoStart: false });

  /** Submits one instruction and drives it to a terminal state. */
  async function generate(label: string, text: string, base?: string) {
    const started = Date.now();
    const job = await engine.submit(project.id, intent(text, base));
    const runId = (await container.runs.getByGenerationId(job.id))!.id;
    const run = await advance(runId, modelProducer);
    const ms = Date.now() - started;

    console.log(`\n  ${label}`);
    log("  prompt", JSON.stringify(text.slice(0, 60)) + "…");
    log("  status", run.status);
    log("  duration", `${(ms / 1000).toFixed(1)}s`);

    if (run.status !== "succeeded") {
      log("  error", run.error ?? "(none)");
      log("  failure stage", run.failure?.stage ?? "(none)");
      if (run.failure?.validation) {
        for (const issue of run.failure.validation.errors.slice(0, 5)) {
          log("    validation", `${issue.code}: ${issue.message}`);
        }
      }
      return run;
    }

    log("  model recorded", `${run.model?.providerId} · ${run.model?.modelId}`);
    log("  tokens", `${run.model?.inputTokens ?? "?"} in / ${run.model?.outputTokens ?? "?"} out`);
    log("  plan", run.plan?.summary ?? "(none)");
    log("  operations", String(run.operations.length));
    log("  files changed", (run.report?.changedPaths ?? []).join(", "));
    log(
      "  validation",
      run.validation
        ? `${run.validation.checkedOperations} checked, ${run.validation.errors.length} errors, ${run.validation.warnings.length} warnings`
        : "(not recorded)"
    );
    log("  revision", run.producedRevisionId ?? "(none)");
    return run;
  }

  try {
    /* ---- 1. first real generation ---------------------------------- */
    const first = await generate(
      "GENERATION 1 — initial build",
      "Create a simple modern portfolio landing page for a software engineer. " +
        "Include a premium hero section, a short description, skills, and one primary CTA."
    );
    if (first.status !== "succeeded") {
      console.log("\n  First generation failed — stopping before the edit.\n");
      return;
    }

    // The run must be attributable: a real model answered, and it is recorded.
    assert.equal(first.mode, "model", "run must be recorded as model, not demo");
    assert.equal(first.model?.providerId, "google");

    const filesAfterFirst = await container.files.list(project.id);
    log("\n  tree after build", filesAfterFirst.map((f) => f.path).join(", "));

    /* ---- 2. real contextual edit ------------------------------------ */
    const second = await generate(
      "GENERATION 2 — contextual edit",
      "Make the hero section more premium and change the primary CTA to cyan.",
      first.producedRevisionId!
    );
    if (second.status !== "succeeded") {
      console.log("\n  Edit failed. The first revision remains the project head.\n");
      const head = (await container.projects.get(project.id))!.currentRevisionId;
      assert.equal(head, first.producedRevisionId, "a failed edit must not move the head");
      log("head preserved", head ?? "(none)");
      return;
    }

    /* ---- 3. was it an edit, or a regeneration? ----------------------- */
    console.log("\n  EDIT VERIFICATION");
    const before = new Map(filesAfterFirst.map((f) => [f.path, f.content]));
    const after = await container.files.list(project.id);
    const changed = after.filter((f) => before.get(f.path) !== f.content).map((f) => f.path);
    const untouched = after.filter((f) => before.get(f.path) === f.content).map((f) => f.path);

    log("  changed", changed.join(", ") || "(none)");
    log("  left identical", untouched.join(", ") || "(none)");
    log(
      "  base revision",
      second.baseRevisionId === first.producedRevisionId
        ? "the first revision ✓ (an edit, not a fresh build)"
        : `UNEXPECTED: ${second.baseRevisionId}`
    );
    log("  plan intent", second.plan?.intent ?? "(none)");

    /* ---- 4. preview -------------------------------------------------- */
    console.log("\n  PREVIEW");
    const preview = await getPreviewTarget(session, project.id);
    if (preview.kind === "runtime") {
      log("  state", preview.state);
      log("  isolation", preview.isolation);
      log("  revision", preview.revisionId);
      log("  pages", preview.pages.map((p) => p.route).join(", "));
      if (preview.url) {
        const response = await fetch(preview.url);
        const html = await response.text();
        log("  served", `HTTP ${response.status}, ${html.length} bytes`);

        /* ---- 5. secret isolation in generated output ----------------- */
        const key = process.env.GEMINI_API_KEY ?? "";
        const leakedInPage = key && html.includes(key);
        const leakedInFiles = after.some((f) => key && f.content?.includes(key));
        const leakedInRun = key && JSON.stringify(second).includes(key);
        console.log("\n  SECRET ISOLATION");
        log("  key in served page", leakedInPage ? "LEAKED" : "no ✓");
        log("  key in project files", leakedInFiles ? "LEAKED" : "no ✓");
        log("  key in run record", leakedInRun ? "LEAKED" : "no ✓");
        assert.ok(!leakedInPage && !leakedInFiles && !leakedInRun, "API key leaked");
      }
    } else {
      log("  unavailable", preview.reason);
    }

    console.log("\n  Real Gemini end-to-end complete.\n");
  } finally {
    await stopPreview(session, asProjectId(project.id)).catch(() => {});
    await deleteProject(session, project.id).catch(() => {});
    // Remove the throwaway account, matching the walkthrough's cleanup.
    const path = join(process.cwd(), ".orbital-demo", "db.json");
    const store = JSON.parse(readFileSync(path, "utf8"));
    const doomed = new Set(
      store.users
        .filter((u: { email: string }) => /^gemini-live-\d+@example\.test$/.test(u.email))
        .map((u: { id: string }) => u.id)
    );
    if (doomed.size > 0) {
      const workspaces = new Set(
        store.members.filter((m: { userId: string }) => doomed.has(m.userId)).map((m: { workspaceId: string }) => m.workspaceId)
      );
      store.users = store.users.filter((u: { id: string }) => !doomed.has(u.id));
      store.members = store.members.filter((m: { userId: string }) => !doomed.has(m.userId));
      store.workspaces = store.workspaces.filter((w: { id: string }) => !workspaces.has(w.id));
      require("node:fs").writeFileSync(path, JSON.stringify(store, null, 2));
    }
  }
}

main().catch((error) => {
  // The message may name a variable but never a value; adapters translate at
  // their boundary precisely so this is safe to print.
  console.error("\n  FAILED:", error instanceof Error ? error.message : error, "\n");
  process.exit(1);
});
