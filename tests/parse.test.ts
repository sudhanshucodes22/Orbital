/** Parsing model output.
 *
 * This is the boundary where untrusted text becomes instructions to write
 * files, so the tests are mostly about what must be *rejected*. A parser that
 * accepts a plausible-looking wrong shape is worse than no parser: it produces
 * a confident, invalid plan.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractJson, parseOperations, parsePlan } from "../lib/ai/parse";

const validPlan = {
  intent: "create",
  summary: "Build a landing page for a coffee shop.",
  isInitialBuild: true,
  steps: [
    { id: "s1", title: "Write the home page", action: "create", targets: ["index.html"], rationale: null },
  ],
  dependencies: [],
  configChanges: [],
  validation: ["index.html renders without external requests"],
  notes: null,
};

describe("extractJson", () => {
  it("parses bare JSON", () => {
    const r = extractJson('{"a":1}');
    assert.equal(r.ok, true);
    assert.deepEqual(r.ok && r.value, { a: 1 });
  });

  it("parses JSON inside a fenced block", () => {
    const r = extractJson('```json\n{"a":1}\n```');
    assert.equal(r.ok, true);
    assert.deepEqual(r.ok && r.value, { a: 1 });
  });

  it("parses JSON preceded by prose", () => {
    const r = extractJson('Here is the plan:\n{"a":1}');
    assert.equal(r.ok, true);
    assert.deepEqual(r.ok && r.value, { a: 1 });
  });

  it("rejects an empty response", () => {
    assert.equal(extractJson("   ").ok, false);
  });

  it("rejects text with no JSON in it", () => {
    assert.equal(extractJson("I cannot help with that.").ok, false);
  });

  it("rejects truncated JSON", () => {
    assert.equal(extractJson('{"a": [1, 2').ok, false);
  });
});

describe("parsePlan", () => {
  it("accepts a well-formed plan", () => {
    const r = parsePlan(validPlan);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.intent, "create");
    assert.equal(r.value.steps.length, 1);
    assert.equal(r.value.steps[0].action, "create");
  });

  it("rejects a non-object", () => {
    assert.equal(parsePlan("a plan").ok, false);
    assert.equal(parsePlan([]).ok, false);
    assert.equal(parsePlan(null).ok, false);
  });

  it("rejects an unknown intent", () => {
    const r = parsePlan({ ...validPlan, intent: "refactor" });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /intent must be one of/);
  });

  it("rejects an unknown step action", () => {
    const r = parsePlan({
      ...validPlan,
      steps: [{ ...validPlan.steps[0], action: "rewrite" }],
    });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /action must be one of/);
  });

  it("rejects a plan with no steps", () => {
    const r = parsePlan({ ...validPlan, steps: [] });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /at least one step/);
  });

  it("rejects a missing summary", () => {
    const withoutSummary: Record<string, unknown> = { ...validPlan };
    delete withoutSummary.summary;
    assert.equal(parsePlan(withoutSummary).ok, false);
  });

  it("rejects an empty summary", () => {
    assert.equal(parsePlan({ ...validPlan, summary: "   " }).ok, false);
  });

  it("does not coerce a string into a boolean", () => {
    const r = parsePlan({ ...validPlan, isInitialBuild: "true" });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /must be a boolean/);
  });

  it("does not coerce a string into an array", () => {
    assert.equal(parsePlan({ ...validPlan, validation: "check it" }).ok, false);
  });

  it("rejects targets that are not strings", () => {
    const r = parsePlan({
      ...validPlan,
      steps: [{ ...validPlan.steps[0], targets: [1, 2] }],
    });
    assert.equal(r.ok, false);
  });

  it("caps the number of steps", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({
      id: `s${i}`, title: "x", action: "create", targets: [], rationale: null,
    }));
    const r = parsePlan({ ...validPlan, steps: many });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /limit is/);
  });
});

describe("parseOperations", () => {
  it("accepts create, update, delete and move", () => {
    const r = parseOperations({
      operations: [
        { kind: "createFile", path: "index.html", content: "<p>hi</p>" },
        { kind: "updateFile", path: "a.css", content: "body{}" },
        { kind: "deleteFile", path: "old.html" },
        { kind: "moveFile", from: "a.html", to: "b.html" },
      ],
    });
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.value.length, 4);
  });

  it("accepts a bare array as well as a wrapped object", () => {
    const r = parseOperations([{ kind: "deleteFile", path: "x.html" }]);
    assert.equal(r.ok, true);
  });

  it("rejects an unknown operation kind", () => {
    const r = parseOperations({ operations: [{ kind: "chmod", path: "x" }] });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /kind must be one of/);
  });

  it("refuses runCommand outright rather than passing it on to be rejected later", () => {
    const r = parseOperations({ operations: [{ kind: "runCommand", command: "rm -rf /" }] });
    assert.equal(r.ok, false);
  });

  it("refuses installDependency and updateConfig at the parse boundary", () => {
    assert.equal(
      parseOperations({ operations: [{ kind: "installDependency", name: "x", version: "1" }] }).ok,
      false
    );
    assert.equal(
      parseOperations({ operations: [{ kind: "updateConfig", path: "p", key: "k", value: "v" }] }).ok,
      false
    );
  });

  it("rejects createFile without content", () => {
    assert.equal(parseOperations({ operations: [{ kind: "createFile", path: "a.html" }] }).ok, false);
  });

  it("rejects moveFile without a destination", () => {
    assert.equal(parseOperations({ operations: [{ kind: "moveFile", from: "a" }] }).ok, false);
  });

  it("rejects a non-array operations field", () => {
    assert.equal(parseOperations({ operations: "none" }).ok, false);
  });

  it("preserves reason when present and omits it when absent", () => {
    const r = parseOperations({
      operations: [
        { kind: "deleteFile", path: "a.html", reason: "superseded" },
        { kind: "deleteFile", path: "b.html" },
      ],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value[0].reason, "superseded");
    assert.equal("reason" in r.value[1], false);
  });
});
