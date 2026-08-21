/** Keeping the newest answer, and only the newest.
 *
 * ## The bug this exists for
 *
 * The workspace polls for state while a generation runs. Polling was a plain
 * `setInterval` calling an async function, which has two defects that only
 * appear under load:
 *
 *   1. **Stacking.** The interval fires whether or not the previous request
 *      finished. Server Actions are serialised by Next, so while a 27-second
 *      generation is in flight every poll queues behind it — and then releases
 *      in a burst. Six requests landed within five milliseconds.
 *   2. **Out-of-order resolution.** With several requests in flight there is no
 *      guarantee they resolve in the order they were sent. The last one to
 *      resolve wins, and it may be carrying the oldest state.
 *
 * Together those left the UI showing "generating" and the previous revision
 * after the work had finished and been persisted correctly. The data was never
 * wrong; the screen was.
 *
 * The fix is ordering, not delay. Each request takes a ticket; a result is
 * applied only if no newer request has already been applied. A slow response
 * that arrives after a fast one is discarded rather than allowed to travel
 * backwards.
 *
 * ## Why this is kept, measured rather than assumed
 *
 * The guard was challenged on the grounds that it might be redundant. It is
 * not. Running the real shape — six polls issued during a long generation,
 * where the first five observe `busy: true` on the old revision and the sixth
 * observes the finished state, then released in an order nobody controls:
 *
 *     with the guard:     busy=false  rev=NEW
 *     without the guard:  busy=true   rev=old
 *
 * The unguarded result is precisely the reported bug — the workspace stuck on
 * "Building…" showing the previous revision while the store held the finished
 * run. So this is not defensive decoration; removing it reintroduces a
 * user-visible failure, and `tests/sequence.test.ts` pins that.
 */

export interface Sequencer<T> {
  /** Runs `task`, applying its result only if nothing newer has landed. */
  run(task: () => Promise<T>, apply: (value: T) => void): Promise<void>;
  /** Whether a request is in flight. Used to skip a tick rather than stack. */
  readonly busy: boolean;
  /** Discards anything still in flight. For unmount. */
  cancel(): void;
  /** Re-arms after a cancel, for a remount.
   *
   * React StrictMode runs effects mount → unmount → mount in development, so
   * a cleanup that cancelled permanently would kill the sequencer before the
   * component had finished mounting — and every later result would be silently
   * discarded. That is not hypothetical: it is exactly what happened, and it
   * left the workspace stuck on "Building…" while the store held the finished
   * state. A cancel has to be reversible for the same reason a cleanup has to
   * be idempotent. */
  resume(): void;
}

export function createSequencer<T>(): Sequencer<T> {
  let issued = 0;
  let applied = 0;
  let inFlight = 0;
  let cancelled = false;

  return {
    get busy() {
      return inFlight > 0;
    },

    cancel() {
      cancelled = true;
      // Everything currently in flight is now older than "cancelled", so
      // nothing outstanding can apply.
      applied = issued;
    },

    resume() {
      cancelled = false;
    },

    async run(task, apply) {
      const ticket = ++issued;
      inFlight++;
      try {
        const value = await task();
        // Strictly greater: a response that lost the race is dropped rather
        // than allowed to overwrite the newer state that beat it.
        if (!cancelled && ticket > applied) {
          applied = ticket;
          apply(value);
        }
      } finally {
        inFlight--;
      }
    },
  };
}

/** Schedules `tick` repeatedly, never overlapping.
 *
 * A self-rescheduling timeout rather than an interval: the next delay is
 * measured from when the previous tick *finished*, so a slow response cannot
 * cause a pile-up. Returns a function that stops the loop.
 */
export function poll(tick: () => Promise<void>, intervalMs: number): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(async () => {
      if (stopped) return;
      try {
        await tick();
      } catch {
        // A failed poll must not kill the loop — the next one may succeed,
        // and stopping would strand the UI exactly as the original bug did.
      }
      schedule();
    }, intervalMs);
  };

  schedule();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/** Wraps a form action so a successful result re-reads shared state.
 *
 * Restore and retry are `useActionState` form actions living several
 * components below the workspace, and they mutate the same project the
 * workspace is displaying. Nothing connected the two, so a restore moved the
 * project's head on the server while the header kept showing the previous
 * revision until a manual reload.
 *
 * This deliberately reuses the workspace's own `refresh` rather than giving
 * those components a data path of their own. A second polling mechanism would
 * be a second thing to keep correct, and the two could disagree — which is the
 * class of bug this whole module exists to close.
 *
 * The distinction between the two callers is worth stating, because it is why
 * one call is enough for both:
 *
 *   - **Restore** completes server-side before the action returns, so a single
 *     read afterwards sees the final state. No run is created, so nothing sets
 *     `busy` and no polling is needed or wanted.
 *   - **Retry** creates a queued run, so the read afterwards sees `busy: true`
 *     and the existing poll loop takes over from there.
 *
 * A failed action does not refresh: there is nothing new to read, and the
 * error is already being rendered by the form's own state.
 */
export function withRefresh<S extends { error: string | null }>(
  action: (previous: S, data: FormData) => Promise<S>,
  onSuccess: () => void | Promise<void>
): (previous: S, data: FormData) => Promise<S> {
  return async (previous, data) => {
    const result = await action(previous, data);
    if (!result.error) await onSuccess();
    return result;
  };
}
