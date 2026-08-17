#!/usr/bin/env node
/** What is configured, without ever printing a value.
 *
 * The question is "can Orbital do the real thing yet?", and the honest answers
 * are present / missing / invalid. Shape checks catch a truncated paste or a
 * swapped value; no value is ever echoed.
 *
 * It also reports **which files it read and where they are**. That is the
 * diagnostic that actually matters: when a value looks missing, the usual
 * cause is not a wrong value but a file in the wrong place — saved as `.env`
 * instead of `.env.local`, or in a sibling directory. A preflight that only
 * said "missing" would send you looking in the wrong direction.
 */
import { loadProjectEnv } from "./env.mjs";

const env = loadProjectEnv();

/** Shape checks only — enough to catch a paste error, never a value. */
const GROUPS = [
  {
    name: "Real AI generation",
    unlocks: "runs recorded as mode:model, naming the provider and model that answered",
    vars: [
      [
        "GENERATION_API_KEY",
        true,
        (v) =>
          v.length < 20
            ? "implausibly short — looks truncated"
            : /\s/.test(v)
              ? "contains whitespace — check for a line break in the paste"
              : null,
      ],
      [
        "GENERATION_PROVIDER",
        true,
        (v) => (v === "anthropic" ? null : `unrecognised provider "${v}" (expected: anthropic)`),
      ],
      ["GENERATION_MODEL", true, (v) => (v.length > 3 ? null : "implausibly short")],
    ],
  },
  {
    name: "Live Supabase",
    unlocks: "real database, Row Level Security, multiple users",
    vars: [
      [
        "SUPABASE_URL",
        true,
        (v) =>
          /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/.test(v)
            ? null
            : "not a Supabase project URL (expected https://<ref>.supabase.co)",
      ],
      [
        "SUPABASE_ANON_KEY",
        true,
        (v) =>
          v.length < 40
            ? "implausibly short"
            : /^https?:/.test(v)
              ? "looks like a URL — the URL and key may be swapped"
              : null,
      ],
      [
        "SUPABASE_SERVICE_ROLE_KEY",
        true,
        (v) => (v.length < 40 ? "implausibly short" : null),
      ],
      // Required for uploads; the app has a documented default, so a missing
      // value is a warning rather than a blocker.
      ["STORAGE_BUCKET", false, () => null],
    ],
  },
  {
    name: "Worker trigger",
    unlocks: "generation that completes without a browser open",
    vars: [
      ["WORKER_SECRET", true, (v) => (v.length >= 16 ? null : "should be at least 16 characters")],
    ],
  },
];

console.log("\n  Orbital preflight — values are never printed\n");

/* ---- where the configuration is being read from ----------------------- */

console.log(`  Project: ${env.root}`);
for (const source of env.sources) {
  if (!source.exists) {
    console.log(`    · ${source.name.padEnd(12)} not present`);
    continue;
  }
  const when = source.modified.toISOString().replace("T", " ").slice(0, 16);
  console.log(`    ✓ ${source.name.padEnd(12)} ${source.keys} key(s), modified ${when}`);
}
console.log();

/* ---- capability groups ------------------------------------------------ */

let blocked = 0;
let invalid = 0;

for (const group of GROUPS) {
  const states = group.vars.map(([key, required, check]) => {
    const value = env.value(key);
    if (value === undefined || value === "") {
      return { key, required, state: required ? "missing" : "not set (optional)" };
    }
    const problem = check(value);
    if (problem) return { key, required, state: `INVALID — ${problem}` };
    return { key, required, state: `present (${env.origin(key)})` };
  });

  const ready = states.every((s) => !s.required || s.state.startsWith("present"));
  if (!ready) blocked++;
  invalid += states.filter((s) => s.state.startsWith("INVALID")).length;

  console.log(`  ${ready ? "✓" : "·"} ${group.name}${ready ? "" : "  (not available)"}`);
  console.log(`      ${group.unlocks}`);
  for (const { key, state } of states) {
    const mark = state.startsWith("present") ? "✓" : state.startsWith("INVALID") ? "!" : "—";
    console.log(`      ${mark} ${key.padEnd(28)} ${state}`);
  }
  console.log();
}

/* ---- what to do next -------------------------------------------------- */

if (blocked === 0) {
  console.log("  Everything required is configured.");
  console.log("  Next: `npm run verify` checks Supabase against the real database.\n");
  process.exit(0);
}

console.log(`  ${blocked} capability group(s) unconfigured.`);
if (invalid > 0) {
  console.log(`  ${invalid} value(s) are present but do not look right — see the ! lines above.`);
}
console.log(`
  Configuration is read from:
    ${env.sources[env.sources.length - 1].path}

  Note the two spaces in "PROJECTS  BY" — quote the path in any shell command.
  If you edited a file and this still says missing, it is almost certainly a
  different file: check for .env (not .env.local), or a copy in another
  directory. See SETUP.md.

  Orbital runs fully in demo mode with none of this configured.
`);
process.exit(1);
