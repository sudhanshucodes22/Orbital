#!/usr/bin/env node
/** Development worker.
 *
 * Polls the worker trigger so queued generations drain without anyone having
 * a browser tab open. In production this loop is a scheduler — Vercel Cron, a
 * CronJob, a queue consumer — hitting the same endpoint; this script exists so
 * the same path is exercised locally rather than only in deployment.
 *
 *   npm run worker                 # every 2s against localhost:3000
 *   npm run worker -- --once       # single pass, useful in scripts
 *   ORBITAL_URL=… npm run worker   # point at another origin
 *
 * Reads WORKER_SECRET from the environment or .env.local, so the secret is
 * never a command-line argument (arguments are visible in `ps`).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const ORIGIN = process.env.ORBITAL_URL ?? "http://localhost:3000";
const ONCE = process.argv.includes("--once");
const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 2000);

async function loadSecret() {
  if (process.env.WORKER_SECRET) return process.env.WORKER_SECRET;
  try {
    const raw = await readFile(path.join(process.cwd(), ".env.local"), "utf8");
    const line = raw.split("\n").find((l) => l.trim().startsWith("WORKER_SECRET="));
    if (line) return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  } catch {
    // No .env.local — fall through to the message below.
  }
  return null;
}

async function tick(secret) {
  const response = await fetch(`${ORIGIN}/api/worker/tick`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`[worker] ${response.status}`, body.error ?? "");
    return false;
  }
  // Silent when there is nothing to do, so a 2s loop does not fill the
  // terminal with noise.
  if (body.candidates > 0) {
    const parts = [
      `${body.claimed} claimed`,
      `${body.succeeded} succeeded`,
      `${body.failed} failed`,
    ];
    if (body.contended) parts.push(`${body.contended} contended`);
    console.log(`[worker] ${parts.join(" · ")}`);
    for (const run of body.runs) console.log(`         ${run.id} → ${run.status}`);
  }
  return true;
}

const secret = await loadSecret();
if (!secret) {
  console.error(
    "[worker] WORKER_SECRET is not set.\n" +
      "         Add it to .env.local (see .env.example) and restart the dev server."
  );
  process.exit(1);
}

if (ONCE) {
  process.exit((await tick(secret)) ? 0 : 1);
}

console.log(`[worker] polling ${ORIGIN} every ${INTERVAL_MS}ms — ctrl-c to stop`);
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
  console.log("\n[worker] stopped");
  process.exit(0);
});

while (!stopping) {
  try {
    await tick(secret);
  } catch (error) {
    // A dev server that is restarting should not kill the worker.
    console.error("[worker] unreachable:", error.message);
  }
  await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
}
