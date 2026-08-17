#!/usr/bin/env node
/** What is configured, without ever printing a value.
 *
 * The question this answers is "can Orbital do the real thing yet?", and the
 * honest answers are present / missing / present-but-implausible. It reads the
 * shape of a value to catch a paste error, and never echoes one — a preflight
 * tool that printed secrets would be a worse problem than the one it solves.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const local = {};
const path = join(process.cwd(), ".env.local");
if (existsSync(path)) {
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) local[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const value = (key) => process.env[key] ?? local[key];

/** Shape checks only. Enough to catch a truncated paste or a swapped value. */
const GROUPS = [
  {
    name: "Real AI generation",
    unlocks: "runs recorded as mode:model, naming the provider and model",
    vars: [
      ["GENERATION_API_KEY", (v) => (v.length > 20 ? null : "implausibly short")],
      ["GENERATION_PROVIDER", (v) => (v === "anthropic" ? null : `unrecognised provider "${v}"`)],
      ["GENERATION_MODEL", (v) => (v.length > 3 ? null : "implausibly short")],
    ],
  },
  {
    name: "Live Supabase",
    unlocks: "real database, Row Level Security, multi-user",
    vars: [
      [
        "SUPABASE_URL",
        (v) => (/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/.test(v) ? null : "not a Supabase project URL"),
      ],
      ["SUPABASE_ANON_KEY", (v) => (v.length > 40 ? null : "implausibly short")],
      ["SUPABASE_SERVICE_ROLE_KEY", (v) => (v.length > 40 ? null : "implausibly short")],
    ],
  },
  {
    name: "Worker trigger",
    unlocks: "generation that completes without a browser open",
    vars: [["WORKER_SECRET", (v) => (v.length >= 16 ? null : "should be at least 16 characters")]],
  },
];

console.log("\n  Orbital preflight — values are never printed\n");

let blocked = 0;
for (const group of GROUPS) {
  const states = group.vars.map(([key, check]) => {
    const v = value(key);
    if (v === undefined || v === "") return { key, state: "missing" };
    const problem = check(v);
    return { key, state: problem ? `invalid — ${problem}` : "present" };
  });

  const ready = states.every((s) => s.state === "present");
  if (!ready) blocked++;

  console.log(`  ${ready ? "✓" : "·"} ${group.name}${ready ? "" : "  (not available)"}`);
  console.log(`      ${group.unlocks}`);
  for (const { key, state } of states) {
    const mark = state === "present" ? "✓" : state === "missing" ? "—" : "!";
    console.log(`      ${mark} ${key.padEnd(28)} ${state}`);
  }
  console.log();
}

console.log(
  blocked === 0
    ? "  Everything is configured. Run `npm run verify` to check Supabase for real.\n"
    : `  ${blocked} capability group(s) unconfigured — see SETUP.md.\n` +
        "  Orbital still runs fully in demo mode with no configuration at all.\n"
);
