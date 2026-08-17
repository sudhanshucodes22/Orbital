/** Iterative editing.
 *
 * The property that separates an editor from a generator: a second
 * instruction changes the project the first one produced, rather than
 * replacing it. These tests pin that at the level where it is decided — which
 * files an instruction touches, and whether the rest survive.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planTargetedEdit, requestedColour, EDIT_RULES } from "../lib/server/demo/edits";

/** A project shaped like the template's output, with the declarations the
 *  rules anchor on. */
function project(overrides: Record<string, string> = {}) {
  const page = (title: string) =>
    `<!doctype html><html><head><title>${title}</title><style>
:root{color-scheme:dark}
body{margin:0;background:#04060b;color:#e9ebf2}
.eyebrow{color:rgba(124,230,255,.8)}
h1{margin:20px 0 0;font-size:clamp(34px,6vw,60px);line-height:1.02}
h1 em{font-style:italic;font-weight:400;color:#a9e4ff}
nav{display:flex;align-items:center;gap:26px;padding:26px 0 0;font-size:14px}
section{padding:76px 0}
.btn{padding:12px 22px;border-radius:999px;font-size:14.5px}
.btn.solid{background:linear-gradient(135deg,#a9e4ff,#7ce6ff)}
</style></head><body>
<nav><a>Home</a></nav>
<p class="lede">The original brief.</p>
</body></html>`;

  const files = [
    { path: "index.html", content: page("Home") },
    { path: "pricing.html", content: page("Pricing") },
    { path: "contact.html", content: page("Contact") },
    {
      path: "design-tokens.json",
      content: `${JSON.stringify(
        {
          "color-bg": "#04060b",
          "color-text": "#e9ebf2",
          "color-accent": "#7ce6ff",
          "font-body": "system-ui, sans-serif",
        },
        null,
        2
      )}\n`,
    },
  ];

  return files.map((f) => (overrides[f.path] ? { ...f, content: overrides[f.path] } : f));
}

describe("targeted editing", () => {
  it("changes only the hero page when the hero is named", () => {
    const { updates } = planTargetedEdit(project(), "Make the hero section more premium.");

    // The heart of iterative editing: one file, not the whole project.
    assert.deepEqual([...updates.keys()], ["index.html"]);
    assert.match(updates.get("index.html")!, /Make the hero section more premium\./);
  });

  it("leaves every other file byte-identical", () => {
    const before = project();
    const { updates } = planTargetedEdit(before, "Make the hero section more premium.");

    for (const file of before) {
      if (file.path === "index.html") continue;
      assert.equal(updates.has(file.path), false, `${file.path} should not have been touched`);
    }
  });

  it("touches every page when the change is site-wide", () => {
    const { updates } = planTargetedEdit(project(), "Add a glassmorphic navbar.");

    // A navbar is on every page, so every page is legitimately in scope —
    // but the token file is not.
    assert.deepEqual([...updates.keys()].sort(), ["contact.html", "index.html", "pricing.html"]);
    assert.match(updates.get("index.html")!, /backdrop-filter/);
  });

  it("recolours the palette in the token file and the pages together", () => {
    const { updates } = planTargetedEdit(project(), "Use a warmer palette throughout.");

    assert.ok(updates.has("design-tokens.json"), "the palette lives in the tokens");
    const tokens = JSON.parse(updates.get("design-tokens.json")!);
    assert.equal(tokens["color-accent"], "#ffc76a");
    // And the pages follow, or the tokens would describe a site that does not
    // look like them.
    assert.match(updates.get("index.html")!, /#ffc76a/);
  });

  it("scopes a CTA colour to the button rather than the whole page", () => {
    const { updates, rule } = planTargetedEdit(project(), "Make the CTA cyan.");

    assert.equal(rule?.id, "cta");
    // The token file is a palette-wide concern; a CTA request must not rewrite
    // the project's accent.
    assert.equal(updates.has("design-tokens.json"), false);
    assert.match(updates.get("index.html")!, /\.btn\{padding:14px 26px/);
  });

  it("produces nothing when the instruction changes nothing", () => {
    // Asking for the breakpoint twice: the second time it is already there.
    const first = planTargetedEdit(project(), "Make it responsive.");
    const applied = Object.fromEntries(first.updates);
    const second = planTargetedEdit(project(applied), "Make it responsive.");

    assert.ok(first.updates.size > 0);
    assert.equal(second.updates.size, 0, "a no-op edit must produce no operations");
  });

  it("never reports a file it did not change", () => {
    const before = project();
    const { updates } = planTargetedEdit(before, "Open up the spacing.");

    for (const [path, content] of updates) {
      const original = before.find((f) => f.path === path)!.content;
      assert.notEqual(content, original, `${path} was reported changed but is identical`);
    }
  });

  it("falls back to the hero rather than guessing wildly", () => {
    const { updates, rule } = planTargetedEdit(project(), "Something entirely unrelated.");

    // One file, and the one the template puts the brief in.
    assert.equal(rule?.id, "hero");
    assert.deepEqual([...updates.keys()], ["index.html"]);
  });

  it("escapes the instruction before putting it in the page", () => {
    const { updates } = planTargetedEdit(
      project(),
      'Make the hero say <script>alert("x")</script>'
    );
    const html = updates.get("index.html")!;

    // The instruction is user input being written into HTML. It must not
    // become markup.
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;/);
  });
});

describe("editing continuity", () => {
  it("applies a sequence of edits cumulatively", () => {
    // The sequence from the brief: each turn builds on the last.
    let files = project();
    const touched: string[][] = [];

    for (const instruction of [
      "Make the hero section more premium.",
      "Add a glassmorphic navbar.",
      "Make the CTA cyan.",
      "Make it responsive.",
    ]) {
      const { updates } = planTargetedEdit(files, instruction);
      touched.push([...updates.keys()].sort());
      files = files.map((f) => (updates.has(f.path) ? { ...f, content: updates.get(f.path)! } : f));
    }

    const home = files.find((f) => f.path === "index.html")!.content;

    // Every change survives the ones after it. This is the property that makes
    // it an editing loop: nothing regenerated the page from scratch.
    assert.match(home, /Make the hero section more premium\./, "hero edit lost");
    assert.match(home, /backdrop-filter/, "navbar edit lost");
    assert.match(home, /\.btn\{padding:14px 26px/, "CTA edit lost");
    assert.match(home, /max-width:820px/, "responsive edit lost");

    // And no turn rewrote the whole project.
    for (const paths of touched) {
      assert.ok(paths.length <= 3, `a turn touched ${paths.length} files`);
    }
  });

  it("keeps unrelated pages stable across a hero-only sequence", () => {
    let files = project();
    const pricingBefore = files.find((f) => f.path === "pricing.html")!.content;

    for (const instruction of ["Make the hero bolder.", "Rewrite the hero copy."]) {
      const { updates } = planTargetedEdit(files, instruction);
      files = files.map((f) => (updates.has(f.path) ? { ...f, content: updates.get(f.path)! } : f));
    }

    assert.equal(
      files.find((f) => f.path === "pricing.html")!.content,
      pricingBefore,
      "a hero edit must not disturb another page"
    );
  });
});

describe("colour vocabulary", () => {
  it("only claims colours it can actually apply", () => {
    assert.ok(requestedColour("make it cyan"));
    assert.ok(requestedColour("a warmer feel"));
    // A colour the engine does not know returns null rather than a guess: a
    // wrong hex would produce a diff that does not match the request.
    assert.equal(requestedColour("make it chartreuse"), null);
    assert.equal(requestedColour("no colour mentioned"), null);
  });
});

describe("edit rules", () => {
  it("gives every rule a trigger and a description", () => {
    for (const rule of EDIT_RULES) {
      assert.ok(rule.triggers.length > 0, `${rule.id} has no trigger`);
      assert.ok(rule.describe("test").length > 0, `${rule.id} has no description`);
    }
  });

  it("returns null rather than mangling a file it does not recognise", () => {
    // A page that is not the template's output. Every rule should decline.
    const foreign = [{ path: "index.html", content: "<html><body>hand written</body></html>" }];
    for (const rule of EDIT_RULES) {
      const result = rule.apply("index.html", foreign[0].content, "make the navbar glassy");
      assert.equal(result, null, `${rule.id} altered a file it should not recognise`);
    }
  });
});
