/** Wipes local demo state so a presentation starts from zero.
 *
 *   npm run demo:reset
 *
 * Removes accounts, projects, revisions, uploads and the session key. The
 * key is regenerated on next boot, which also invalidates any cookie still
 * sitting in a browser — so a stale session cannot survive the reset and make
 * the demo look half-cleared.
 */
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".orbital-demo");

const existed = await stat(dir).then(() => true).catch(() => false);
await rm(dir, { recursive: true, force: true });

console.log(
  existed
    ? "Demo state cleared. Sign up again at http://localhost:3000/sign-up"
    : "Nothing to clear — demo state is already empty."
);
