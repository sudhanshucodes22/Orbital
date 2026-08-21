#!/usr/bin/env node
/** Secret-isolation canaries, added and removed safely.
 *
 *   node tools/canary.mjs add     — append a marked canary block
 *   node tools/canary.mjs remove  — remove exactly that block
 *   node tools/canary.mjs status  — say whether one is present
 *
 * ## Why this exists as a tool
 *
 * The previous canary cleanup was an ad-hoc script that removed lines by
 * *variable name* — including `GENERATION_PROVIDER` and `GENERATION_MODEL`
 * unconditionally. That is destructive: it cannot tell a canary it created
 * from a real credential someone configured, so running it after a user set
 * those variables would delete their configuration.
 *
 * This writes a delimited block and removes only that block. Everything
 * outside the markers is never touched, whatever it is called. If the markers
 * are absent, `remove` does nothing rather than guessing.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BEGIN = "# >>> orbital canary (temporary — created by tools/canary.mjs)";
const END = "# <<< orbital canary";

/** Recognisable in a bundle grep and obviously not a real credential, so it
 *  cannot be mistaken for one if it somehow survives. */
const CANARIES = {
  GENERATION_API_KEY: "sk-ant-ORBITALCANARY-must-never-reach-the-browser",
  // The Gemini path prefers GEMINI_API_KEY and only falls back to
  // GENERATION_API_KEY, so overriding the latter alone left the real key in
  // charge — the canary silently tested nothing. Every variable a provider
  // might read has to be covered or the isolation check has a hole in it.
  GEMINI_API_KEY: "AIzaORBITALCANARY-must-never-reach-the-browser",
  SUPABASE_SERVICE_ROLE_KEY: "eyJORBITALCANARYserviceroleMUSTNEVERREACHTHEBROWSERxxxx",
  SUPABASE_ANON_KEY: "eyJORBITALCANARYanonkeyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
};

const path = join(process.cwd(), ".env.local");
const command = process.argv[2];

function read() {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/** Everything outside the canary block, preserved exactly.
 *
 * Splitting rather than filtering by name is the whole point: a real
 * credential that happens to share a variable name with a canary is outside
 * the markers and survives untouched. */
function withoutBlock(text) {
  const begin = text.indexOf(BEGIN);
  if (begin === -1) return { body: text, hadBlock: false };

  const endMarker = text.indexOf(END, begin);
  if (endMarker === -1) {
    // A truncated block. Refuse rather than guess where it ended — deleting
    // to end-of-file could take real values with it.
    console.error(
      "  .env.local has a canary start marker with no matching end marker.\n" +
        "  Refusing to guess where it ends. Remove it by hand."
    );
    process.exit(1);
  }

  const after = text.slice(endMarker + END.length);
  return { body: text.slice(0, begin) + after.replace(/^\n/, ""), hadBlock: true };
}

if (command === "add") {
  const { body, hadBlock } = withoutBlock(read());
  if (hadBlock) console.log("  Replacing an existing canary block.");

  // Any real value the user configured is in `body` and is preserved. The
  // canary block is appended, and appended last so it wins for the duration
  // of the test.
  const block = [
    BEGIN,
    ...Object.entries(CANARIES).map(([k, v]) => `${k}=${v}`),
    END,
    "",
  ].join("\n");

  const next = body.endsWith("\n") || body === "" ? body : `${body}\n`;
  writeFileSync(path, `${next}${block}`, "utf8");

  const overridden = Object.keys(CANARIES).filter((k) => new RegExp(`^${k}=`, "m").test(body));
  console.log(`  Canary block added (${Object.keys(CANARIES).length} variables).`);
  if (overridden.length > 0) {
    console.log(`  Temporarily overriding your real: ${overridden.join(", ")}`);
    console.log("  Your values are preserved above the block and restored by `remove`.");
  }
} else if (command === "remove") {
  const { body, hadBlock } = withoutBlock(read());
  if (!hadBlock) {
    console.log("  No canary block present. Nothing removed.");
    process.exit(0);
  }
  writeFileSync(path, body, "utf8");
  console.log("  Canary block removed. Everything outside it is untouched.");
} else if (command === "status") {
  const text = read();
  console.log(text.includes(BEGIN) ? "  A canary block is present." : "  No canary block.");
} else {
  console.error("  usage: node tools/canary.mjs add|remove|status");
  process.exit(2);
}
