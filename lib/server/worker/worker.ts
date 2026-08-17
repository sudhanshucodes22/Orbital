/** The worker. SERVER ONLY.
 *
 * Milestone 3 made a run durable — the row survives the request that created
 * it — but execution still depended on someone being around to poll. This is
 * the missing half: a trigger that drains queued work with no browser, no
 * session and no open connection.
 *
 * It is deliberately a plain function rather than a daemon. `runWorkerTick()`
 * does one pass and returns, which is the shape every scheduler already knows
 * how to call:
 *
 *   cron / Vercel Cron   → POST /api/worker/tick every minute
 *   queue consumer       → call runWorkerTick() on message
 *   managed background   → same, on a timer
 *   local development    → `npm run worker`
 *
 * Nothing here assumes a queue platform, and nothing needs one: the claim is
 * atomic, so running several ticks at once is safe and is how this scales
 * before a real queue is worth adding.
 */
import type { GenerationMode, GenerationRun } from "../../domain";
import { __setContainer, getContainer, getWorkerContainer } from "../container";
import { advance, LEASE_MS } from "../pipeline/pipeline";
import { modelProducer } from "../pipeline/producers/model";
import { templateProducer } from "../pipeline/producers/template";
import type { OperationProducer } from "../pipeline/types";

/** How many runs one tick will attempt. Bounded so a tick has a predictable
 *  worst-case duration and a scheduler's timeout is meaningful. */
export const DEFAULT_BATCH = 5;

export interface WorkerTickResult {
  /** Runs that looked claimable at the start of the pass. */
  candidates: number;
  /** Runs this worker actually took the lease on. */
  claimed: number;
  succeeded: number;
  failed: number;
  /** Claimable, but another worker got there first. Not an error — it is the
   *  lease doing its job, and worth reporting so a scheduler can see whether
   *  it is over-provisioned. */
  contended: number;
  runs: { id: string; status: string }[];
}

/** A run records which executor produced it, so the worker can resume work it
 *  did not start. Without this the mode would have to be inferred from
 *  configuration at execution time, and a run queued under one configuration
 *  could finish under another. */
function producerFor(mode: GenerationMode): OperationProducer {
  return mode === "model" ? modelProducer : templateProducer;
}

/** Drains up to `limit` claimable runs. Safe to call concurrently. */
export async function runWorkerTick(limit: number = DEFAULT_BATCH): Promise<WorkerTickResult> {
  // The pipeline reads the container itself, so the worker's identity has to
  // be installed for the duration of the tick rather than threaded through
  // every call. Restored afterwards so a request handler that happens to share
  // the process is unaffected.
  const previous = getContainer();
  const worker = getWorkerContainer();
  const scoped = worker !== previous;
  if (scoped) __setContainer(worker);

  try {
    return await drain(worker, limit);
  } finally {
    if (scoped) __setContainer(previous);
  }
}

async function drain(
  container: ReturnType<typeof getWorkerContainer>,
  limit: number
): Promise<WorkerTickResult> {
  const candidates = await container.runs.listClaimable(limit);

  const result: WorkerTickResult = {
    candidates: candidates.length,
    claimed: 0,
    succeeded: 0,
    failed: 0,
    contended: 0,
    runs: [],
  };

  for (const candidate of candidates) {
    // `advance` claims first and returns the run untouched when the lease is
    // held elsewhere, so contention costs one query rather than duplicated
    // work. Comparing the status before and after is how we tell the two
    // apart without reaching into the pipeline.
    let finished: GenerationRun;
    try {
      finished = await advance(candidate.id, producerFor(candidate.mode));
    } catch (error) {
      // advance() records its own failure on the run; anything thrown past it
      // is the store being unavailable, which is not this run's fault and must
      // not stop the rest of the batch.
      result.failed++;
      result.runs.push({
        id: candidate.id,
        status: `error: ${error instanceof Error ? error.message : "unknown"}`,
      });
      continue;
    }

    if (finished.status === "succeeded") {
      result.claimed++;
      result.succeeded++;
    } else if (finished.status === "failed" || finished.status === "cancelled") {
      result.claimed++;
      result.failed++;
    } else {
      // Still active and not ours: someone else holds the lease.
      result.contended++;
    }
    result.runs.push({ id: candidate.id, status: finished.status });
  }

  return result;
}

/** Recovers runs abandoned by a dead worker.
 *
 * Not a separate mechanism — `listClaimable` already treats an expired lease
 * as claimable, so recovery is just the next tick. This exists to make that
 * explicit and to give a scheduler something to report on. */
export async function countAbandoned(): Promise<number> {
  const container = getWorkerContainer();
  const claimable = await container.runs.listClaimable(100);
  return claimable.filter((r) => r.leaseExpiresAt !== null).length;
}

export { LEASE_MS };
