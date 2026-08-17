/** One env loader for every tool. Never prints a value.
 *
 * The preflight and the Supabase verifier each had their own `.env.local`
 * parser. Two parsers is two chances to disagree with each other and with
 * Next, and a tool that reports "missing" for a value the application can see
 * is worse than no tool — it sends you looking in the wrong place.
 *
 * This matches Next's precedence deliberately:
 *
 *   1. a real environment variable wins over anything in a file
 *   2. `.env.local` overrides `.env`
 *   3. neither overrides something already exported
 *
 * It also reports *which files it actually read*. That is the diagnostic that
 * matters when a value appears missing: nine times out of ten the file exists
 * but is not the one being loaded.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

/** Files Next loads, in increasing precedence. */
const FILES = [".env", ".env.local"];

/** Parses one env file.
 *
 * Handles the forms people actually write: `export FOO=bar`, quoted values,
 * `#` comments, blank lines, and values containing `=`. Deliberately does not
 * do variable interpolation — Next does, but a preflight that resolved
 * `${OTHER}` could report a value as present when the application would see an
 * empty string.
 */
function parse(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf("=");
    if (eq === -1) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = withoutExport.slice(eq + 1).trim();
    // Strip one matching pair of quotes, and only a matching pair — an unpaired
    // quote is part of the value, and silently trimming it would change a
    // secret before it is checked.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Loads the environment the application would see.
 *
 * Returns the merged values plus a description of where they came from, so a
 * caller can show the path without showing a value.
 */
export function loadProjectEnv(root = process.cwd()) {
  const sources = [];
  const fromFiles = {};

  for (const name of FILES) {
    const path = join(root, name);
    if (!existsSync(path)) {
      sources.push({ name, path, exists: false, keys: 0 });
      continue;
    }
    const parsed = parse(readFileSync(path, "utf8"));
    // Later files win, matching Next: .env.local overrides .env.
    Object.assign(fromFiles, parsed);
    sources.push({
      name,
      path,
      exists: true,
      keys: Object.keys(parsed).length,
      modified: statSync(path).mtime,
    });
  }

  // A real environment variable beats a file, as it does for the app.
  const merged = { ...fromFiles };
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && value !== "") merged[key] = value;
  }

  return {
    value: (key) => merged[key],
    /** Where a value came from, for diagnostics. Never the value itself. */
    origin: (key) =>
      process.env[key] ? "environment" : fromFiles[key] !== undefined ? ".env.local / .env" : null,
    sources,
    root,
  };
}

/** The variables the application actually reads, as declared in
 *  `lib/config/env.ts`. Kept here so the preflight cannot drift from the app:
 *  a variable added there and forgotten here is a gap in the check. */
export const APP_VARIABLES = [
  "GENERATION_API_KEY",
  "GENERATION_PROVIDER",
  "GENERATION_MODEL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STORAGE_BUCKET",
  "WORKER_SECRET",
  "CRON_SECRET",
  "NEXT_PUBLIC_SITE_URL",
  "ORBITAL_PREVIEW_RUNTIME",
];
