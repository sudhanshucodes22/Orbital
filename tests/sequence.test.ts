/** The ordering guard behind the workspace's polling.
 *
 * The bug being pinned: after a generation finished, the Builder kept showing
 * "generating" and the previous revision until a manual refresh, while the
 * store held the correct state all along. The cause was not a slow request but
 * an unordered one — several polls in flight at once, the last to *resolve*
 * winning regardless of how old it was.
 *
 * These tests drive that shape directly: responses that finish out of order,
 * and a burst released together, which is exactly what happens when Next
 * serialises polls behind a long-running Server Action.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSequencer, poll, withRefresh } from "../components/builder/sequence";

/** A promise resolvable from the outside, so a test controls the ordering. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("out-of-order responses", () => {
  it("keeps the newest result when an older response resolves last", async () => {
    const sequencer = createSequencer<string>();
    const applied: string[] = [];

    const first = deferred<string>();
    const second = deferred<string>();

    // Issued in order: first, then second.
    const a = sequencer.run(() => first.promise, (v) => applied.push(v));
    const b = sequencer.run(() => second.promise, (v) => applied.push(v));

    // Resolved out of order: the newer one lands first.
    second.resolve("new");
    await tick();
    first.resolve("old");
    await Promise.all([a, b]);

    // This is the whole bug. Without the guard, "old" would be applied last
    // and the UI would travel backwards to the pre-generation state.
    assert.deepEqual(applied, ["new"]);
  });

  it("applies results that do arrive in order", async () => {
    const sequencer = createSequencer<number>();
    const applied: number[] = [];

    await sequencer.run(async () => 1, (v) => applied.push(v));
    await sequencer.run(async () => 2, (v) => applied.push(v));
    await sequencer.run(async () => 3, (v) => applied.push(v));

    assert.deepEqual(applied, [1, 2, 3]);
  });

  it("settles on the newest of a burst released together", async () => {
    // The observed failure: six polls queued behind a 27-second generation,
    // then released within five milliseconds.
    const sequencer = createSequencer<number>();
    const gates = Array.from({ length: 6 }, () => deferred<number>());
    const applied: number[] = [];

    const runs = gates.map((gate) => sequencer.run(() => gate.promise, (v) => applied.push(v)));

    // Released in a deliberately unhelpful order — newest first, oldest last.
    for (let i = gates.length - 1; i >= 0; i--) {
      gates[i].resolve(i);
      await tick();
    }
    await Promise.all(runs);

    // Only the newest ticket applies, whatever order they finished in.
    assert.deepEqual(applied, [5]);
    assert.equal(applied[applied.length - 1], 5, "the final state must be the newest");
  });

  it("reports whether a request is in flight, so a tick can be skipped", async () => {
    const sequencer = createSequencer<string>();
    const gate = deferred<string>();

    assert.equal(sequencer.busy, false);
    const run = sequencer.run(() => gate.promise, () => {});
    assert.equal(sequencer.busy, true, "an outstanding request must be visible");

    gate.resolve("done");
    await run;
    assert.equal(sequencer.busy, false);
  });

  it("survives a StrictMode mount/unmount/mount cycle", async () => {
    // The regression test for a bug this file's own first version caused.
    // React StrictMode runs effects twice in development: mount, unmount,
    // mount. The unmount cleanup cancels. If cancel is one-way, the sequencer
    // is dead before the component has finished mounting, every poll result is
    // discarded, and the workspace sits on "Building…" forever while the store
    // holds the finished state.
    const sequencer = createSequencer<string>();
    const applied: string[] = [];

    sequencer.cancel(); // StrictMode's first cleanup
    sequencer.resume(); // the real mount

    await sequencer.run(async () => "fresh state", (v) => applied.push(v));

    assert.deepEqual(applied, ["fresh state"], "results must apply after a remount");
  });

  it("applies nothing after cancel", async () => {
    const sequencer = createSequencer<string>();
    const applied: string[] = [];
    const gate = deferred<string>();

    const run = sequencer.run(() => gate.promise, (v) => applied.push(v));
    sequencer.cancel();
    gate.resolve("too late");
    await run;

    // Unmounted: a response landing afterwards must not touch React state.
    assert.deepEqual(applied, []);
  });

  it("does not let a failed request block later ones", async () => {
    const sequencer = createSequencer<string>();
    const applied: string[] = [];

    await assert.rejects(() =>
      sequencer.run(async () => {
        throw new Error("network");
      }, (v) => applied.push(v))
    );

    // The ticket counter must not be left in a state that swallows the next
    // result — a single failed poll stranding the UI is the original bug again.
    await sequencer.run(async () => "recovered", (v) => applied.push(v));
    assert.deepEqual(applied, ["recovered"]);
    assert.equal(sequencer.busy, false);
  });
});

describe("non-overlapping poll loop", () => {
  it("waits for a tick to finish before scheduling the next", async () => {
    let running = 0;
    let overlaps = 0;
    let completed = 0;

    const stop = poll(async () => {
      running++;
      if (running > 1) overlaps++;
      // Slower than the interval, which is what made setInterval stack.
      await new Promise((r) => setTimeout(r, 30));
      running--;
      completed++;
    }, 5);

    await new Promise((r) => setTimeout(r, 200));
    stop();

    assert.equal(overlaps, 0, "ticks must never overlap");
    assert.ok(completed >= 2, "the loop must actually run");
  });

  it("keeps going after a tick throws", async () => {
    let calls = 0;
    const stop = poll(async () => {
      calls++;
      throw new Error("poll failed");
    }, 5);

    await new Promise((r) => setTimeout(r, 60));
    stop();

    // Stopping on the first failure would strand the UI exactly as the
    // original bug did.
    assert.ok(calls > 1, `expected repeated attempts, got ${calls}`);
  });

  it("stops cleanly and schedules nothing further", async () => {
    let calls = 0;
    const stop = poll(async () => {
      calls++;
    }, 5);

    await new Promise((r) => setTimeout(r, 40));
    stop();
    const atStop = calls;

    await new Promise((r) => setTimeout(r, 40));
    assert.equal(calls, atStop, "no tick may run after stop");
  });
});

describe("restore and retry re-read shared state", () => {
  /** A form action of the shape `useActionState` expects. */
  const action = (result: { error: string | null }) => async () => result;

  it("refreshes after a successful restore", async () => {
    // The bug: restore moved the project's head on the server while the header
    // kept showing the previous revision until a manual reload, because the
    // form action had no connection back to the workspace's state read.
    let refreshes = 0;
    const wrapped = withRefresh(action({ error: null }), () => {
      refreshes++;
    });

    const result = await wrapped({ error: null }, new FormData());

    assert.equal(result.error, null);
    assert.equal(refreshes, 1, "a successful restore must trigger a state read");
  });

  it("refreshes after a successful retry", async () => {
    // Retry creates a queued run, so the read afterwards sees busy:true and
    // the existing poll loop takes over. Without this the panel would sit on
    // the stale failed turn.
    let refreshes = 0;
    const wrapped = withRefresh(action({ error: null }), () => {
      refreshes++;
    });

    await wrapped({ error: null }, new FormData());
    assert.equal(refreshes, 1);
  });

  it("does not refresh when the action failed", async () => {
    // Nothing changed server-side, and the form renders its own error. A read
    // here would be a request that can only return what is already on screen.
    let refreshes = 0;
    const wrapped = withRefresh(action({ error: "Only a failed run can be retried." }), () => {
      refreshes++;
    });

    const result = await wrapped({ error: null }, new FormData());

    assert.equal(result.error, "Only a failed run can be retried.");
    assert.equal(refreshes, 0);
  });

  it("returns the action's result unchanged", async () => {
    // The wrapper coordinates; it must not swallow or rewrite what the form
    // needs to render.
    const wrapped = withRefresh(action({ error: null }), () => {});
    assert.deepEqual(await wrapped({ error: null }, new FormData()), { error: null });
  });

  it("waits for the refresh before returning", async () => {
    // The form leaves its pending state when the action resolves. Returning
    // early would clear "Restoring…" while the new state was still in flight,
    // showing the old revision as though it were settled.
    const order: string[] = [];
    const wrapped = withRefresh(
      async () => {
        order.push("action");
        return { error: null };
      },
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push("refresh");
      }
    );

    await wrapped({ error: null }, new FormData());
    assert.deepEqual(order, ["action", "refresh"]);
  });
});
