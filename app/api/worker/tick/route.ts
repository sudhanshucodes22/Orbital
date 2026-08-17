import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/config/env";
import { DEFAULT_BATCH, runWorkerTick } from "@/lib/server/worker/worker";

/** The worker trigger.
 *
 * One pass over the queue per request, so any scheduler that can make an HTTP
 * call can drive generation: Vercel Cron, a Kubernetes CronJob, GitHub
 * Actions, an uptime pinger, or `npm run worker` in development. Nothing about
 * it assumes a browser, a session or an open connection.
 *
 * Authorisation is a shared secret rather than a user session, because there
 * is no user: the caller is a scheduler acting on the whole queue. Without
 * WORKER_SECRET configured the route refuses every request, so an
 * unconfigured deployment fails closed rather than exposing a way to drive
 * other people's generations.
 */
export const runtime = "nodejs";
/** Never cached, and never prerendered — it has side effects. */
export const dynamic = "force-dynamic";

const MAX_BATCH = 25;

/** Constant-time-ish comparison. Length first, so the loop below cannot be
 *  used to learn the secret's length, then a full pass rather than an
 *  early-exit ===. */
function matches(presented: string, secret: string): boolean {
  if (presented.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) {
    diff |= presented.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

function authorise(request: Request): string | null {
  const { workerSecret, cronSecret } = serverEnv();
  const accepted = [workerSecret, cronSecret].filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );
  // Fails closed: with neither secret configured there is no way to authorise,
  // so the trigger refuses everything rather than standing open.
  if (accepted.length === 0) return "Worker trigger is not configured.";

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";

  // Every candidate is compared, without short-circuiting, so the number of
  // comparisons does not depend on which secret matched.
  let ok = false;
  for (const secret of accepted) ok = matches(presented, secret) || ok;
  return ok ? null : "Unauthorised.";
}

/** GET, because that is what platform cron schedulers send.
 *
 * Vercel Cron issues a GET with `Authorization: Bearer $CRON_SECRET` and has
 * no way to send a POST body, so a POST-only trigger simply cannot be
 * scheduled by it. The authorisation check is identical, and the handler is
 * shared — this is not a read endpoint that happens to have effects, it is the
 * same trigger reachable by the verb the scheduler uses. */
export async function GET(request: Request) {
  return tick(request);
}

export async function POST(request: Request) {
  return tick(request);
}

async function tick(request: Request) {
  const rejection = authorise(request);
  if (rejection) {
    // 401 for both cases on purpose: whether the secret is unset or wrong is
    // not something an unauthenticated caller should be able to distinguish.
    return NextResponse.json({ error: rejection }, { status: 401 });
  }

  const requested = Number(new URL(request.url).searchParams.get("limit"));
  const limit =
    Number.isFinite(requested) && requested > 0
      ? Math.min(Math.floor(requested), MAX_BATCH)
      : DEFAULT_BATCH;

  try {
    const result = await runWorkerTick(limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    // The tick itself failed — the store is unreachable, say. Individual run
    // failures are recorded on their own rows and reported as `failed`.
    console.error("[worker] tick failed", error);
    return NextResponse.json({ ok: false, error: "Worker tick failed." }, { status: 500 });
  }
}
