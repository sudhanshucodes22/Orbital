# The generation worker

Generation is durable. Submitting a build writes a `generation_runs` row and
returns; the work happens afterwards, driven by whoever gets there first. The
run row *is* the job — there is no queue service — and a lease is what stops two
processes doing the same work.

Three things can advance a run, and they are the same code path:

| Trigger | When it runs | Why it exists |
|---|---|---|
| The submitting request | Immediately, fire-and-forget | Fastest start in a single-node deployment |
| A status poll | While the project page is open | "A poll is also a worker" — takes over work a dead request left behind |
| `POST/GET /api/worker/tick` | Whenever a scheduler calls it | The only one that does not depend on a browser |

The first two are optimisations. **The tick is the guarantee.** Without it, a
run submitted by a request that dies, in a tab that is then closed, waits for
someone to reopen the project. With it, the run completes on its own.

## Configure the secret

The tick is not session-authenticated — its caller is a scheduler acting on the
whole queue, so there is no user to check. It uses a shared secret instead:

```bash
# .env.local — gitignored. Generate a fresh one; do not reuse another secret.
WORKER_SECRET=$(openssl rand -hex 32)
```

Either `WORKER_SECRET` or `CRON_SECRET` authorises the route. With **neither**
set, the route refuses every request — an unconfigured deployment fails closed
rather than leaving a way to drive other people's generations. A wrong secret
and an unset secret both return 401, so an unauthenticated caller cannot tell
which it is.

The secret is only ever read from the environment. It is never a CLI argument
(argv is visible to every process on the machine), never logged, and never sent
to the browser.

## Run it in development

```bash
npm run worker          # loop, every few seconds
npm run worker -- --once  # a single pass, for scripts and CI
```

`tools/worker.mjs` reads `WORKER_SECRET` from the environment or `.env.local`.
Point it elsewhere with `ORBITAL_URL=https://staging.example.com npm run worker`.

You usually will not notice it locally, because the submitting request's own
kick beats it. To see the worker actually do the work, submit a build and kill
the dev server before it finishes; the next tick picks the run up.

## Deploy it

### Vercel

`vercel.json` already declares the cron:

```json
{ "crons": [{ "path": "/api/worker/tick", "schedule": "* * * * *" }] }
```

Vercel sends a **GET** with `Authorization: Bearer $CRON_SECRET`, which is why
the route accepts GET as well as POST and accepts `CRON_SECRET`. Set
`CRON_SECRET` in the project's environment variables and the cron authorises
itself with no further wiring.

> On Hobby plans Vercel runs crons **once a day**, which is not often enough for
> this to feel live. Either upgrade, or use one of the options below — the route
> does not care who calls it.

### Anything else

Any scheduler that can make an authenticated HTTP call works. A Kubernetes
CronJob, a GitHub Actions schedule, a systemd timer, or:

```bash
* * * * * curl -fsS -X POST \
  -H "Authorization: Bearer $WORKER_SECRET" \
  https://your-app.example.com/api/worker/tick
```

One pass per request. `?limit=N` sets the batch size, capped at 25.

## What a tick does

1. Ask for claimable runs — queued, or running with a lapsed lease.
2. Try to claim each one. The claim is atomic, so a run that another worker
   took is skipped rather than duplicated.
3. Advance each claimed run under the executor it was queued with, so a run
   submitted against the model provider does not silently finish as a template.

The response reports what happened:

```json
{ "ok": true, "candidates": 3, "claimed": 2, "succeeded": 2, "failed": 0, "contended": 1 }
```

`contended` is not an error — it means another worker got there first, which is
the concurrency control working.

## Recovery

A worker that dies mid-run leaves the row in `running` with a lease that then
expires. Nothing else is required: the run becomes claimable again, the next
tick reclaims it, and the project page says so rather than showing a spinner
that has quietly stopped.

This is why a run cannot be permanently stuck in `running` — provided the tick
is actually scheduled. **If you deploy without a scheduler, that guarantee does
not hold**, and recovery falls back to someone reopening the project page.

Known bound: a run that kills its worker process *every* time would be
reclaimed indefinitely. Failures raised inside the pipeline are recorded on the
run and terminal, so this only applies to a crash that takes the process with
it. There is no reclaim cap yet.

## Concurrency

One active generation per project, enforced in two places:

- **The service** checks `findActive` and returns a message a user can read.
- **The database** has a partial unique index (`generation_runs_one_active_per_project`,
  migration 0005) that rejects the second insert outright.

The service check races — two simultaneous submits can both pass it. The index
is what actually holds. In demo mode the file store's mutex plays the same role.

Duplicate submissions are separately handled by an idempotency key derived from
the project, base revision, instruction and attempt number: resending the same
request rejoins the original run instead of cutting a second revision. A
deliberate retry increments the attempt, so it gets a key of its own and starts
real work.
