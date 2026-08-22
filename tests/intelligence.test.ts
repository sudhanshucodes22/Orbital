/** Intent classification, reference checking, and the bounded repair loop.
 *
 * The through-line: Orbital should understand enough about a request and its
 * result to make a *precise* change and to refuse a broken one — and when it
 * refuses, it should be able to try again a bounded number of times without
 * ever putting invalid output in front of the user.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  byteLength,
  checkReferences,
  classifyIntent,
  describeRunEngine,
  hashContent,
  isQuestion,
  malformationOf,
  protectedReason,
  referencesIn,
  toPlanIntent,
  validateOperations,
  type FileOperation,
  type FileSnapshot,
} from "../lib/domain";
import { asArtifactId } from "../lib/domain/ids";
import type { GenerationIntent, InputArtifact } from "../lib/domain";
import { __setContainer } from "../lib/server/container";
import { MAX_REPAIR_ATTEMPTS, advance, createPipelineEngine } from "../lib/server/pipeline/pipeline";
import type { OperationProducer, ProducedChange } from "../lib/server/pipeline/types";
import { fakeContainer, PROJECT_ID, type FakeState } from "./support/fake-container";

function file(path: string, content: string): FileSnapshot {
  return {
    path,
    kind: "text",
    content,
    storageKey: null,
    hash: hashContent(content),
    byteSize: byteLength(content),
  };
}

/* ------------------------------------------------------------ intent ----- */

describe("intent classification", () => {
  it("recognises the categories that change how a request is planned", () => {
    const cases: [string, string][] = [
      ["Build me a site for a bakery", "create"],
      ["Remove the pricing section", "remove"],
      ["The navbar is broken on Safari", "fix"],
      ["Make it responsive", "responsive"],
      ["Add a testimonials section", "addFeature"],
      ["Make the hero a warmer colour", "style"],
      ["What does this page do?", "explain"],
    ];
    for (const [instruction, expected] of cases) {
      assert.equal(classifyIntent(instruction).intent, expected, instruction);
    }
  });

  it("says when it is guessing", () => {
    // The default must be distinguishable from a real classification, or a
    // caller cannot tell evidence from a fallback.
    assert.equal(classifyIntent("do the thing with the stuff").confident, false);
    assert.equal(classifyIntent("Make it responsive").confident, true);
  });

  it("prefers the more specific reading when two could match", () => {
    // Contains "section", which would otherwise read as addFeature.
    assert.equal(classifyIntent("Remove the testimonials section").intent, "remove");
    // Contains "ugly", a style word, but it is a fix.
    assert.equal(classifyIntent("The button is broken and ugly").intent, "fix");
  });

  it("extracts what the request is about, for context selection", () => {
    const { subjects } = classifyIntent("Make the hero CTA button cyan");
    assert.ok(subjects.includes("hero"));
    assert.ok(subjects.includes("cta"));
    assert.ok(subjects.includes("button"));
  });

  it("maps to the planner's narrower vocabulary", () => {
    assert.equal(toPlanIntent("style"), "restyle");
    assert.equal(toPlanIntent("responsive"), "restyle");
    assert.equal(toPlanIntent("addFeature"), "extend");
    assert.equal(toPlanIntent("remove"), "modify");
  });

  it("flags a question as something the pipeline cannot answer", () => {
    // The pipeline only produces file operations; there is nowhere for an
    // answer to go, and knowing that is better than generating an edit.
    assert.equal(isQuestion(classifyIntent("Why is the footer grey?").intent), true);
    assert.equal(isQuestion(classifyIntent("Make the footer grey").intent), false);
  });

  it("never throws on an empty or strange instruction", () => {
    for (const input of ["", "   ", "🙂", "a".repeat(5000)]) {
      assert.ok(classifyIntent(input).intent);
    }
  });
});

/* -------------------------------------------------------- references ----- */

describe("reference extraction", () => {
  it("finds links, stylesheets, scripts and images", () => {
    const found = referencesIn({
      path: "index.html",
      content: `<link rel="stylesheet" href="styles.css">
        <script src="app.js"></script>
        <img src="logo.png">
        <a href="/pricing">Pricing</a>`,
    });
    assert.deepEqual(
      found.map((r) => r.kind).sort(),
      ["image", "link", "script", "stylesheet"]
    );
  });

  it("ignores anything that is not a file reference", () => {
    const found = referencesIn({
      path: "index.html",
      content: `<a href="https://example.com">x</a>
        <a href="mailto:a@b.c">y</a>
        <a href="#section">z</a>
        <img src="data:image/png;base64,AAAA">`,
    });
    // Generated pages are told to embed images as data URIs, so treating one
    // as a missing file would flag the correct thing as broken.
    assert.deepEqual(found, []);
  });

  it("resolves relative paths against the referencing file", () => {
    const [reference] = referencesIn({
      path: "docs/guide.html",
      content: `<link rel="stylesheet" href="../styles.css">`,
    });
    assert.equal(reference.target, "styles.css");
  });
});

describe("reference checking", () => {
  const tree = [
    file("index.html", `<a href="/pricing">Pricing</a><link href="styles.css" rel="stylesheet">`),
    file("pricing.html", "<h1>Pricing</h1>"),
    file("styles.css", "body{}"),
  ];

  it("accepts references that resolve, including extensionless routes", () => {
    const { missing, broken } = checkReferences(tree);
    assert.deepEqual(missing, []);
    assert.deepEqual(broken, []);
  });

  it("reports a reference to a file nobody wrote", () => {
    const { missing } = checkReferences([
      file("index.html", `<a href="/about">About</a>`),
    ]);
    assert.equal(missing.length, 1);
    assert.equal(missing[0].raw, "/about");
  });

  it("distinguishes a link this change broke from one that was already dangling", () => {
    // pricing.html removed by this batch, and index.html still links to it.
    const after = tree.filter((f) => f.path !== "pricing.html");
    const { broken, missing } = checkReferences(after, ["pricing.html"]);

    // Breaking your own link inside one change is a contradiction; a
    // pre-existing gap is a judgement call.
    assert.equal(broken.length, 1);
    assert.equal(missing.length, 0);
  });
});

describe("malformation checks", () => {
  it("catches JSON that does not parse", () => {
    assert.ok(malformationOf("tokens.json", "{ not json"));
    assert.equal(malformationOf("tokens.json", '{"a":1}'), null);
  });

  it("catches an unclosed block in HTML", () => {
    // The characteristic shape of a truncated model response.
    assert.ok(malformationOf("index.html", "<html><head><style>body{}</head></html>"));
    assert.equal(
      malformationOf("index.html", "<html><head><style>body{}</style></head><body></body></html>"),
      null
    );
  });

  it("catches a file that ends inside a tag", () => {
    assert.ok(malformationOf("index.html", "<html><body><div class="));
  });

  it("says nothing about formats it does not understand", () => {
    assert.equal(malformationOf("notes.txt", "anything at all <<<"), null);
  });
});

describe("protected paths", () => {
  it("names why a path is refused rather than saying 'unsafe'", () => {
    assert.match(protectedReason(".env") ?? "", /credential/i);
    assert.match(protectedReason("node_modules/x/index.js") ?? "", /dependenc/i);
    assert.equal(protectedReason("index.html"), null);
  });
});

/* -------------------------------------------------------- validation ----- */

describe("validation of the resulting tree", () => {
  const existing = [file("index.html", "<html><body><h1>Hi</h1></body></html>")];

  it("rejects a malformed file rather than replacing a working one", () => {
    const operations: FileOperation[] = [
      { kind: "updateFile", path: "index.html", content: "<html><body><h1>Hi</body></html>" },
    ];
    // Unbalanced <html>/<body> counts are fine here; the truncation case is
    // what matters, so use one.
    const truncated: FileOperation[] = [
      { kind: "updateFile", path: "index.html", content: "<html><body><div class=" },
    ];
    void operations;

    const result = validateOperations(existing, truncated);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === "malformedFile"));
  });

  it("rejects invalid JSON", () => {
    const result = validateOperations(existing, [
      { kind: "createFile", path: "tokens.json", content: "{oops" },
    ]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === "malformedFile"));
  });

  it("errors when a change breaks a link it also creates", () => {
    const tree = [
      file("index.html", `<a href="/pricing">Pricing</a>`),
      file("pricing.html", "<h1>P</h1>"),
    ];
    const result = validateOperations(tree, [{ kind: "deleteFile", path: "pricing.html" }]);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === "brokenReference"));
  });

  it("only warns about a reference that was already dangling", () => {
    const result = validateOperations(existing, [
      { kind: "updateFile", path: "index.html", content: `<html><body><a href="/soon">Soon</a></body></html>` },
    ]);

    // A link to a page the user plans to add next is not a reason to refuse
    // the whole generation.
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.code === "missingReference"));
  });

  it("still accepts a well-formed change", () => {
    const result = validateOperations(existing, [
      { kind: "updateFile", path: "index.html", content: "<html><body><h1>Hello</h1></body></html>" },
    ]);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });
});

/* ------------------------------------------------------ repair loop ------ */

function intent(text: string): GenerationIntent {
  const inputs: InputArtifact[] = [
    { id: asArtifactId("a1"), kind: "text", text, createdAt: new Date().toISOString() },
  ];
  return { type: "create", inputs };
}

const PLAN = {
  intent: "modify" as const,
  summary: "change something",
  steps: [{ id: "s", title: "t", action: "update" as const, targets: ["index.html"], rationale: null }],
  isInitialBuild: false,
  dependencies: [],
  configChanges: [],
  validation: [],
  notes: null,
};

/** A producer whose attempts are scripted: the first is `attempts[0]`, each
 *  repair takes the next. */
function scripted(attempts: readonly string[], canRepair = true): OperationProducer & {
  calls: number;
} {
  const producer = {
    mode: "model" as const,
    calls: 0,
    async produce(): Promise<ProducedChange> {
      producer.calls++;
      return {
        operations: [{ kind: "updateFile", path: "index.html", content: attempts[0] }],
        plan: PLAN,
        model: null,
      };
    },
    ...(canRepair
      ? {
          async repair(ctx: { attempt: number }): Promise<ProducedChange> {
            producer.calls++;
            const content = attempts[Math.min(ctx.attempt, attempts.length - 1)];
            return {
              operations: [{ kind: "updateFile", path: "index.html", content }],
              plan: PLAN,
              model: null,
            };
          },
        }
      : {}),
  };
  return producer;
}

const BROKEN = "<html><body><div class=";
const GOOD = "<html><body><h1>Fixed</h1></body></html>";

let state: FakeState;

beforeEach(() => {
  const fake = fakeContainer();
  state = fake.state;
  __setContainer(fake.container);
  state.files.push({
    projectId: PROJECT_ID,
    path: "index.html",
    kind: "text",
    content: "<html><body><h1>Original</h1></body></html>",
    storageKey: null,
    hash: "h",
    byteSize: 40,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

async function runWith(producer: OperationProducer) {
  const engine = createPipelineEngine(producer, { autoStart: false });
  const job = await engine.submit(PROJECT_ID, intent("change it"));
  const runId = state.runs.find((r) => r.generationId === job.id)!.id;
  return advance(runId, producer);
}

describe("bounded repair loop", () => {
  it("repairs a rejected change and succeeds", async () => {
    const producer = scripted([BROKEN, GOOD]);
    const result = await runWith(producer);

    assert.equal(result.status, "succeeded");
    assert.ok(result.producedRevisionId);
    // One produce plus one repair.
    assert.equal(producer.calls, 2);
  });

  it("gives up after the bound rather than retrying forever", async () => {
    // Never produces anything valid.
    const producer = scripted([BROKEN, BROKEN, BROKEN, BROKEN, BROKEN]);
    const result = await runWith(producer);

    assert.equal(result.status, "failed");
    // The initial attempt plus exactly MAX_REPAIR_ATTEMPTS repairs — an
    // unbounded loop would be an agent spending money on a problem it cannot
    // solve.
    assert.equal(producer.calls, 1 + MAX_REPAIR_ATTEMPTS);
    assert.match(result.error ?? "", /repair attempt/i);
  });

  it("does not repair when the producer cannot use a diagnosis", async () => {
    const producer = scripted([BROKEN], false);
    const result = await runWith(producer);

    assert.equal(result.status, "failed");
    // Exactly one call: offering a repair that would return identical output
    // just burns a run.
    assert.equal(producer.calls, 1);
  });

  it("leaves the working project untouched when every attempt fails", async () => {
    const before = state.files.find((f) => f.path === "index.html")!.content;
    const head = state.project.currentRevisionId;

    await runWith(scripted([BROKEN, BROKEN, BROKEN]));

    assert.equal(state.files.find((f) => f.path === "index.html")!.content, before);
    assert.equal(state.project.currentRevisionId, head);
    assert.equal(state.revisions.length, 0, "no revision may be cut from invalid output");
  });

  it("keeps the failure and its reasons in history", async () => {
    const result = await runWith(scripted([BROKEN, BROKEN, BROKEN]));

    assert.equal(result.status, "failed");
    assert.equal(result.failure?.stage, "validation");
    // The validator's reasons are what make the failure actionable.
    assert.ok((result.failure?.validation?.errors.length ?? 0) > 0);
  });

  it("records the validator's verdict on a successful run, not just a failed one", async () => {
    const result = await runWith(scripted([GOOD]));

    assert.equal(result.status, "succeeded");
    // Warnings on an applied change are the validator's main output for a run
    // that worked. Discarding them would make the checks invisible exactly
    // when they are informative rather than fatal — and both persistence
    // adapters whitelist patch fields, so this is easy to drop silently.
    assert.ok(result.validation, "a successful run must carry its validation result");
    assert.equal(result.validation?.valid, true);
    assert.ok((result.validation?.checkedOperations ?? 0) > 0);
  });

  it("records the repair attempts as events", async () => {
    const result = await runWith(scripted([BROKEN, GOOD]));

    const messages = (result.events ?? []).map((e) => e.message).join(" | ");
    assert.match(messages, /repair attempt 1/i);
    assert.match(messages, /repaired after 1 attempt/i);
  });

  it("surfaces a repair that throws as a producer failure, not a validation one", async () => {
    const producer: OperationProducer = {
      mode: "model",
      async produce(): Promise<ProducedChange> {
        return {
          operations: [{ kind: "updateFile", path: "index.html", content: BROKEN }],
          plan: PLAN,
          model: null,
        };
      },
      async repair(): Promise<ProducedChange> {
        throw new Error("the provider died mid-repair");
      },
    };

    const result = await runWith(producer);
    assert.equal(result.status, "failed");
    assert.notEqual(result.failure?.stage, "validation");
    assert.match(result.error ?? "", /died mid-repair/);
  });
});

describe("engine attribution", () => {
  const run = (over: Partial<Parameters<typeof describeRunEngine>[0]>) =>
    describeRunEngine({ mode: "model", model: null, status: "queued", ...over });

  it("never calls a failed model run the template engine", () => {
    // The bug: history read `mode === "model" && model` and fell through to
    // "TEMPLATE ENGINE" whenever no model was recorded. A real Gemini run that
    // died before the provider answered was therefore reported as the work of
    // the demo engine — the one claim this system must never make, appearing
    // exactly when attribution matters most: while diagnosing a failure.
    const label = run({ status: "failed" });
    assert.doesNotMatch(label, /TEMPLATE/i, "a model run must never be labelled TEMPLATE");
    assert.match(label, /MODEL/);
  });

  it("distinguishes never answered from not answered yet", () => {
    // A queued run has no model for an innocent reason. Saying "no response"
    // there would be its own false claim.
    assert.match(run({ status: "failed" }), /NO RESPONSE/);
    assert.match(run({ status: "cancelled" }), /NO RESPONSE/);
    assert.match(run({ status: "running" }), /AWAITING/);
    assert.match(run({ status: "queued" }), /AWAITING/);
  });

  it("names the provider and model that actually answered", () => {
    assert.equal(
      run({
        status: "succeeded",
        model: { providerId: "google", modelId: "gemini-2.5-flash" },
      }),
      "google · gemini-2.5-flash"
    );
  });

  it("still calls the template engine the template engine", () => {
    // The demo path must stay honestly labelled; the fix must not overcorrect
    // into implying a model was involved when none was.
    assert.equal(run({ mode: "demo", status: "succeeded" }), "TEMPLATE ENGINE");
    assert.equal(run({ mode: "demo", status: "failed" }), "TEMPLATE ENGINE");
  });
});
