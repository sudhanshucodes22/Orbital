# Architecture

The landing page is the canonical frontend and is treated as finished. Every
addition here sits beside it; nothing in `components/orbital/**` was modified
to accommodate the product area, and the pixel baselines prove it.

## Layers

Dependencies point one way only, from top to bottom.

```
app/            Routes. Thin: read params, call a service, render a component.
                No business logic, no direct port access.
components/     UI.
  orbital/        The landing page. Hand-maintained, guarded by baselines.
  ui/             Shared primitives for new surfaces, built on tokens.ts.
lib/services/   Business logic. Validation, authorisation, orchestration.
                Depends on ports, never on a vendor SDK.
lib/ports/      Interfaces a backend must satisfy. No runtime imports at all.
lib/domain/     Data models. Pure types and small pure helpers. Zero I/O.
lib/server/     Adapters that implement ports. SERVER ONLY.
  supabase/       Supabase-backed adapters: auth, repositories, storage.
  demo/           Local file-backed backend. The default when Supabase is
                  absent, so a fresh clone runs end to end.
  unconfigured.ts Fallbacks that throw NotConfiguredError.
lib/ai/         The model boundary. Vendor-neutral types only, no SDK, no I/O.
lib/config/     Typed environment access.
```

## Builder core

The product is moving from "a generation returns a finished site" to "a
generation returns operations against a file tree". The models for that landed
in Milestone 1:

```
domain/file.ts       ProjectFile, FileSnapshot, path validation, content hash
domain/operation.ts  FileOperation union, OperationResult, ApplyReport
domain/run.ts        GenerationRun, BuildPlan, PlanStep
domain/context.ts    ProjectContext, ContextSlice, ContextBudget
services/files.ts    applies operations; the trust boundary for model output
services/context.ts  budgeted retrieval — what the model is allowed to see
ai/types.ts          ModelProvider, ModelRequest, ModelResponse
server/ai/registry   maps configuration to a provider; no adapter yet
```

Two rules hold this together:

> A generation never returns a project. It returns operations, and every one
> of them is recorded with its outcome.

> Operations arriving from a model are input, not instructions.
> `services/files.ts` re-validates every path and size regardless of origin,
> and refuses `runCommand`, `installDependency` and `updateConfig` outright
> because no execution environment exists to run them safely.

The demo engine still produces `GeneratedSite`, which is what the preview route
and the project page read. It now *also* writes the same output into the file
tree and records a run, so the new model carries real data before a real model
exists. Nothing above the adapter reads the tree yet.

`lib/domain` is the only layer everything may import. `lib/server` is the only
layer that may talk to the outside world, and nothing may import it from a
client component.

## The service boundary

This is what the Builder Workspace will be built against. Every function takes
a `Session` and checks it; nothing above this layer touches a repository, and
no component reaches a database.

| Need | Call | Notes |
|---|---|---|
| Start a build | `services/generation.ts` → `startGeneration` / `reviseProject` | Returns a job; the work is durable and continues without the caller |
| Watch one | `services/runs.ts` → `getRun`, `getActiveRun` | `getActiveRun` reads the persisted run, so a reload mid-build still shows it |
| Read the tree | `services/files.ts` → `listFiles`, `getFile` | |
| Read history | `services/runs.ts` → `listRuns` | Paged, filterable, newest first. There is no unpaginated variant |
| Compare revisions | `services/runs.ts` → `compareRevisions` | Pure `domain/diff.ts` over two frozen trees |
| Restore | `services/files.ts` → `restoreRevision` | Appends a new revision; never destructive |
| Retry a failure | `services/runs.ts` → `retryRun` | New run linked to the old one; the failure stays in history |

One authorisation rule covers all of it, and it is worth stating once:

> A run, a revision and a file are all reached **through their project**, and
> `getProject` decides whether the caller may see it. An id from someone else's
> project is not a way in — the project check fails before anything is read.

`getProject` reports a project the caller may not see as **missing**, not as
forbidden. "You are not a member of this workspace" confirms the project
exists, and with ids in URLs, confirming existence is the whole of the
disclosure. The write paths differ deliberately: once a caller has proven they
may *see* a project, "you need the admin role" is useful rather than leaky.

For the UI, `RunSummary` (`domain/run.ts`) is the shape history renders. It
exists because `GenerationRun.operations` carries the full text of every file a
run wrote — passing runs straight to a component ships entire generated sites
to the browser to draw a row showing a count.

## The Builder Workspace

`/projects/[projectId]/builder` — three panels over the existing backend. It
adds **no generation logic**. Everything it does is an existing service called
from a server action:

```
files          → services/files.ts      listFiles / getFile
preview        → services/preview.ts    getPreviewTarget
conversation   → services/runs.ts       listRuns  → conversationFrom()
send a prompt  → services/generation.ts reviseProject / startGeneration
live status    → services/runs.ts       getActiveRun
retry          → services/runs.ts       retryRun
history + diff → the project page's own actions, unchanged
```

### Three decisions worth knowing

**The conversation is the run history.** There is no `messages` table. A run
already holds the instruction verbatim, what was planned, what changed and
whether it worked; `conversationFrom` projects it. A second store would be a
second record of the same events, and the moment a run was retried or recovered
by the worker the two would disagree with no way to say which was right.

A consequence: every turn is a generation. There is no small talk, because
nothing in the system can answer small talk, and a panel that appeared to hold
a conversation it cannot have would misrepresent the product.

**The workspace polls; it does not stream.** A run can be advanced by three
different things — the submitting request, a status poll, or the worker — so
streaming from the request that submitted would mean the workspace only knew
about work *it* started. Close the tab mid-build and the generation would
appear to have vanished. Re-reading the persisted run has no such gap, which is
why a reload loses nothing. Polling runs only while something is in flight; an
idle workspace makes no requests.

**One read, not five.** `getBuilderStateAction` returns files, conversation,
preview and status together, because the pieces have to agree: a file tree from
after a generation paired with a preview from before it is a workspace showing
two different moments.

### The preview engine — MVP local preview runtime

```
Project → PreviewService → PreviewRuntime → a real HTTP origin
```

The service (`services/preview.ts`) owns authorisation and which revision gets
shown. The runtime (`server/preview/`) owns execution. The workspace consumes
only what the service returns and **never builds a preview URL**, which is what
stops it bypassing the checks.

**What the runtime does.** Materialises the revision's frozen tree into an
isolated directory, binds a real HTTP server to an OS-allocated port on
127.0.0.1, and serves the files.

**What it deliberately does not do.** No `npm install`, no dev server, no build
step. Orbital's generated projects are static, self-contained HTML and CSS —
not incidentally, but by contract: `ai/prompts.ts` tells the model *"There is
no build step, no package installer and no shell… Generated output is served as
static files"*, and every page must render on its own with no external
stylesheets, scripts, fonts or images. Spawning a Node dev server would be
building for a project format Orbital does not produce.

**Why its own port rather than a route in this app.** Origin isolation, and it
is the main security gain over the previous preview. Served from
`/api/demo/preview/...` a generated page shared this application's origin, and
the iframe `sandbox` attribute was the only thing between model-authored HTML
and the app's cookies. On its own origin the same-origin policy applies too —
two independent defences instead of one.

The cost, worth knowing because it is a trap: `frame-ancestors 'self'` is then
**wrong**. "self" means the *runtime's* origin, so it forbids the application
from embedding the preview and the panel renders blank with no error. The
runtime names the app's origin explicitly, derived from `NEXT_PUBLIC_SITE_URL`,
never a wildcard.

#### Lifecycle

`starting → ready`, `ready → restarting → ready`, `→ stopped`, `→ failed`.
Every value is a state the runtime genuinely occupies; none is inferred by the
UI, and there is no progress percentage because the runtime knows what it is
doing and not how far through it is.

- `start` is **idempotent for the same revision** — a workspace that opens
  twice, or a poll that races the first start, must not cycle the server.
- A **different** revision is a restart: new directory contents, new port.
- The workspace reloads the frame when the preview's `version` changes, which
  covers both a new revision and a restart at the same one.
- Idle previews are reaped after ten minutes. Reading status refreshes the
  deadline, so an open workspace holds its preview by polling.

#### Security boundaries

| Concern | What is enforced |
|---|---|
| Filesystem root | Files are written under one per-project directory in the OS temp dir. Every path is re-normalised through the domain validator **and** re-checked to resolve inside the root — the second check is the one that holds |
| Execution | None. The runtime reads bytes and writes them to a socket. Nothing generated is ever executed |
| Network | Binds `127.0.0.1` only, never `0.0.0.0` — a preview is not published to the local network |
| Secrets | The runtime receives no environment variables, no credentials and no storage access. Binary files (which need storage) are skipped rather than resolved |
| Leakage | Failure `detail` carries a stage code or an error code, never a host path. Asserted by a test that greps the real temp path out of every message |
| Response headers | `default-src 'none'`, no-store, `nosniff`, `no-referrer`, and an explicit `frame-ancestors`. Unknown extensions are served as `application/octet-stream` rather than guessed |
| Resources | Capped at 500 files / 32 MB per preview; socket timeouts; idle reaping |

#### The sandboxed runtime — CURRENTLY IMPLEMENTED

Previews no longer run inside the application. `createSandboxedPreviewRuntime`
spawns `tools/preview-server.mjs` as a **separate OS process**, confined by
whatever the host supports. The `PreviewRuntime` port is unchanged: the
workspace cannot tell which runtime is behind it.

| Property | How it is enforced |
|---|---|
| Crash isolation | Separate process. A preview fault cannot reach the application — verified by `SIGKILL` on a live child while the app stayed healthy |
| Secret isolation | The child's environment is **built from an allowlist**, not filtered. `GENERATION_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are not removed — they were never there. The child imports none of the app's code, so it has no client to read them with |
| No filesystem writes | macOS Seatbelt `(deny file-write*)` — verified: `EPERM` |
| No network egress | Seatbelt `(deny network-outbound)` with a loopback exception — verified: `ENOTFOUND`, DNS included |
| Read confinement | Path resolution in the server, checked **after** resolution. Not enforced by the OS profile — see limitations |
| Deterministic shutdown | `SIGTERM`, then `SIGKILL` after a grace period. A child that ignores the signal still dies |
| Memory | `--max-old-space-size=128`. A V8 heap ceiling, not a cgroup |
| Lifetime | The child enforces its own 1-hour ceiling, so it cannot outlive a parent that died without cleaning up |
| Concurrency | 8 previews process-wide, checked *before* spawning |
| Ports | Kernel-allocated (`listen(0)`), loopback only, released on stop |

**The isolation tier is reported, never assumed.** `detectIsolation()` probes
Seatbelt by actually running a process under the real policy — a profile that
parses but kills the process would otherwise show up as "previews never start".
The result appears on `PreviewSession.isolation`, in `/api/health`, and as a
badge in the workspace. `in-process` renders as **NO SANDBOX** in amber.

#### Honest limitations of the current sandbox

- **The Seatbelt profile is allow-default with targeted denials**, not
  deny-default. A deny-default profile that still lets Node boot needs a long
  list of mach services and dyld paths, and every omission is a preview that
  silently fails to start. What it does deny, it denies completely — both
  denials were verified empirically before being relied on.
- **Filesystem *reads* are confined by application code, not by the OS.** Node
  must read its own binary and the dyld cache, so a read-confining profile
  kills it. Two mechanisms, and the weaker one is named rather than implied.
- No CPU or memory cgroups; no kernel-level user or namespace separation.
- Single host: previews cannot outlive or migrate between app instances.
- macOS only. On other platforms the runtime reports `process` — still separate
  and secret-free, but with no OS sandbox.
- `sandbox-exec` is deprecated by Apple, though still functional.

#### FUTURE WORK — container runtime

`IsolationMode` already includes `container`, and nothing implements it. That
is deliberate: **no container runtime exists on this host** to develop or
verify against, and shipping an unverifiable Docker adapter would be exactly
the unevidenced security claim this design avoids.

Adding one is an adapter plus a branch in `preview/index.ts`. It would supply
what the current tier cannot: kernel-level isolation, CPU and memory cgroups,
real egress control, and previews that outlive a single app instance.

#### Choosing a runtime

Sandboxed by default. `ORBITAL_PREVIEW_RUNTIME=in-process` selects the old
in-process runtime as an **explicit** development fallback — it logs a warning
and reports `isolation: "in-process"`, so it can never be mistaken for
sandboxing.

#### Local development

Nothing to configure. Open a project's Builder and the runtime starts on
demand; `NEXT_PUBLIC_SITE_URL` only matters if the app is not on
`http://localhost:3000`, since it determines who may frame a preview.

#### Snapshot vs live preview

The project detail page still embeds the revision's frozen HTML same-origin and
is labelled **Snapshot**. The Builder's is the **live preview** from the
runtime. They are not the same thing and the UI does not call both "live".

### Iterative editing — CURRENTLY IMPLEMENTED

The loop:

```
instruction → context → planner → targeted operations → validation
           → revision → sandbox restart → preview reload
```

Every turn edits the project the previous turn produced. Nothing regenerates
from scratch.

**Context.** `services/context.ts` builds a budgeted window: the file map,
relevant file slices, and recent turns as `prompt → outcome`. Including the
outcome is what makes "now make the CTA brighter" resolvable — "the CTA" refers
to the thing the previous turn changed, not to an idea in the abstract. The
model never receives the whole project; retrieval is scored and capped.

**Targeted operations.** The model path is instructed to prefer editing an
existing file and not to touch files the plan did not name. The template path
enforces the same shape deterministically through `demo/edits.ts`: keyword
rules that each declare which files they apply to, return `null` when the
structure they expect is absent, and emit an operation **only for files whose
bytes actually change**. Asking for a navbar no longer rewrites the hero.

The template producer reads files through the repository rather than from the
context slices, because slices are *budgeted and truncatable* — right for a
model, and catastrophic for a patcher, which would write a truncated slice back
over a whole file.

**Concurrency.** Unchanged from Milestone 3: one active run per project,
enforced by a database partial unique index with the service check as the
readable error. A second request while one is running is refused with a
sentence, not queued.

**Failure.** Validation runs before any revision is cut. An invalid change
produces no revision, so the preview stays on the last working one, and the
turn offers Retry. The working project is never replaced by output that did not
pass.

**Rollback.** Restore appends a new revision reproducing an old tree; history
is never destroyed. A subsequent edit continues from the restored state —
verified end to end in the browser: hero edit kept, CTA edit rolled back, a new
responsive edit applied on top.

**Demo vs real.** The template engine is deterministic keyword matching, not
language understanding. Runs record `mode: "demo"` and the panel says TEMPLATE,
so its output cannot be mistaken for a model's. Its purpose is to make the loop
real and testable without an API key.

### Editing intelligence — IMPLEMENTED, VERIFIED IN DEMO MODE

**Intent classification** (`domain/intent.ts`) runs before any model call, in
microseconds, for free. It hints at the request's kind — create, fix, style,
responsive, addFeature, remove, explain — and extracts the page parts it names
("hero", "cta"). A model call to decide whether something is a style change
would double the cost and latency of every edit to answer a question keywords
answer adequately. It reports `confident: false` when it falls back, so a
caller can tell a finding from a guess, and the planner may disagree.

**Context selection** uses those subjects to score retrieval, so "change the
hero CTA colour" pulls the page containing the hero ahead of one that merely
shares vocabulary. The classification is rendered into the prompt as a *hint*
with its confidence attached, never as fact.

**Validation** (`domain/references.ts`) now checks the tree a batch would
produce, not just operations in isolation:

| Check | Severity | Why |
|---|---|---|
| Malformed HTML/JSON | error | A truncated response is the characteristic model failure; applying it replaces something that worked |
| Protected path | error | Names *why* (`.env` holds credentials) rather than "unsafe path" |
| Link to a file this batch deletes | error | A contradiction inside one change |
| Link to a file that never existed | **warning** | May be a page the user plans to add next; refusing the generation over a regex's opinion would be worse |

Reference parsing is regex over HTML and CSS — adequate for the self-contained
static files Orbital generates, and explicitly not semantic correctness.

**The repair loop.** A rejected change goes back to the producer with the
validator's exact complaints, at most `MAX_REPAIR_ATTEMPTS` (2) times. Bounded
because every attempt is a real model call, and a producer that cannot fix its
output given a precise diagnosis in two tries is unlikely to in five. A
producer that cannot use a diagnosis — the template engine, which would return
identical output — omits `repair()` and is not retried.

Nothing is applied until validation passes, so an exhausted repair loop leaves
the project exactly as it was: last working revision still the head, failure
and its reasons still in history, retry still available.

**Validation is recorded on success too**, in `GenerationRun.validation`
(migration 0007). It was previously kept only on failure, which meant warnings
on an applied change were computed and discarded — invisible exactly when they
were informative rather than fatal.

### Providers — two adapters, one contract

Adding Gemini required **no architectural change**: a file under
`server/ai/providers` and one line in the registry's `ADAPTERS` map. `ProviderId`
already included `google`. That was the property the abstraction existed to
protect, and it held.

| | Anthropic | Gemini |
|---|---|---|
| Transport | `@anthropic-ai/sdk` | `fetch` — no dependency added |
| Endpoint | Messages API | Interactions API (GA; the one Google recommends for new work) |
| Structured output | `format: json_schema` | `response_format` with schema |
| Key | `GENERATION_API_KEY` | `GEMINI_API_KEY`, falling back to `GENERATION_API_KEY` |

`ModelCallError` moved to `providers/errors.ts` when the second adapter
arrived — two adapters each defining their own would mean the pipeline
catching two things that meant the same. Anthropic re-exports it, so existing
imports are unchanged.

The Gemini adapter parses responses defensively and falls back to the older
`generateContent` shape, because it was written from documentation without a
live call to check against. A shape it does not recognise raises a clear error
rather than returning an empty string the planner would blame on the model.

### Real provider — IMPLEMENTED, NOT VERIFIED

The provider path is complete: `ModelProvider` abstraction, Anthropic adapter
with errors translated at its boundary, planner and code generator as separate
calls, strict schemas, repair.

**No live call has ever been made.** No `GENERATION_API_KEY` is configured on
this machine. What *is* verified is the contract, by 23 tests driving the real
producer, prompts, parsers, validator, pipeline and revision creation with only
the network hop faked — using the exact `ModelCallError` shapes the adapter
emits. Invalid key, timeout, rate limiting, malformed and non-JSON output,
unsafe paths and empty batches all produce: no revision, working tree
untouched, head unmoved, failure in history, retry available.

Unverified: that a live call succeeds, that the SDK wiring is correct, and that
the prompts elicit good output.

### Supabase — IMPLEMENTED, NOT VERIFIED

Migrations 0001–0007 and both adapters are complete. **Nothing has been
executed against a live Postgres** — no credentials, no `psql`, no CLI.

`npm run verify` performs the whole live check (tables, adapter columns, status
constraint, indexes, lifecycle, one-active-run enforcement, retry lineage, RLS,
cleanup) and **refuses to run without credentials** rather than reporting a
partial pass. `tests/schema.test.ts` statically cross-checks migrations against
the adapter meanwhile.

### FUTURE — semantic indexing

Context selection is lexical: term overlap, subject keywords, recency. The
`ContextBuilder` interface takes a scored candidate list, so an embedding index
would replace `scoreFile` and nothing above it. That is the natural next step
when projects grow past what keyword scoring can rank.

### Deliberately not in this slice

- **No code editor.** Files are read-only. A text area that looked editable but
  discarded what you typed would be worse than none, and real editing means
  conflict handling against a generation in flight.
- **No hot reload.** The preview reloads when the revision id changes, which is
  exact but not instant.
- **No file operations from the UI** — no create, rename, delete. Orbital writes
  the files; the tree reads them.
- **No deployment, GitHub, or sandboxed execution.** Unchanged from earlier
  milestones: there is no execution environment, which is why `runCommand`,
  `installDependency` and `updateConfig` are still refused outright.
- **No cancel button.** `cancelGeneration` exists in the service layer but the
  workspace does not surface it yet.

## Why ports

`lib/services/projects.ts` contains the real rules — name limits, workspace
membership, which role may delete — and calls `ProjectRepository`. Swapping
Supabase for Postgres, or Postgres for anything else, is a new file in
`lib/server` plus one line in `container.ts`. Services and pages do not change.

## Two backends, one set of ports

`lib/server/container.ts` picks a backend from configuration:

| Condition | Backend |
|-----------|---------|
| `SUPABASE_URL` and `SUPABASE_ANON_KEY` present | Supabase |
| otherwise | local demo, file-backed under `.orbital-demo/` |

Demo mode is the default rather than an opt-in flag, because a project that
only works after someone pastes credentials is a project that does not run.
Both implement the same ports, so no service, page or component knows which is
active — the only difference visible above the adapter layer is what
`GET /api/health` reports.

The demo backend is real code, not stubs: scrypt-hashed passwords, signed
http-only session cookies, ownership filtering on every read, atomic
write-then-rename persistence, and a promise mutex so concurrent requests
cannot clobber each other. The one exception is the generation engine, which
is a deterministic sample generator and is labelled as such on every surface
that shows its output.

## Authentication

Auth runs entirely through Server Actions, so no Supabase client is ever
constructed in the browser and the anon key stays out of the client bundle.
That is stricter than the usual Next.js setup, which publishes the anon key as
`NEXT_PUBLIC_`. The key is designed to be publishable and RLS is what protects
the data, but nothing in the browser needs it, so it is not shipped. Verified:
a production build made with every secret present contains none of them.

`middleware.ts` does two jobs. Supabase access tokens are short-lived and only
middleware can write the refreshed cookie back — a Server Component cannot set
cookies. And it gates `/projects`, so an unauthenticated request is redirected
before any page code runs, with the intended path preserved in `?next=`.

Middleware reads `process.env` directly rather than going through
`lib/config/env.ts`, because it runs on the Edge runtime where that module's
Node assumptions do not hold. It is the one deliberate exception to the
single-entry rule.

`getSession()` calls Supabase's `getUser()`, which revalidates the JWT against
the auth server. `getSession()` on the Supabase client would be cheaper but
returns whatever is in the cookie, which a client can tamper with — never
trust it for authorisation.

## Honesty rule

No fake data. Every unimplemented adapter in `lib/server/unconfigured.ts`
throws `NotConfiguredError` naming the capability and the environment
variables that would enable it, and the UI renders that as a notice. A screen
that renders is a screen that genuinely works.

The one exception is `AuthPort.getSession()`, which resolves to `null` rather
than throwing — signed-out is a legitimate state, not a failure, and modelling
it as one would mean the product routes could not exercise their real redirect
logic.

## Server/client boundary

`server-only` is not installed; it was not worth a dependency for a rule that
is easy to state and check in review:

> Nothing under `lib/server` or `lib/config/env.ts#serverEnv` may be imported,
> directly or transitively, by a file carrying `"use client"`.

`serverEnv()` throws if it is ever evaluated in a browser, so a violation
fails loudly at runtime rather than leaking quietly into the bundle.

## Routes

| Route | State |
|-------|-------|
| `/` | The landing page. Complete. |
| `/sign-in`, `/sign-up` | Laid out; awaiting an identity provider. |
| `/projects` | Workspace project list; awaiting auth and a repository. |
| `/projects/[projectId]` | Editor, preview and history; awaiting a generation engine. |
| `/api/health` | Live. Reports capability booleans, never values. |
| 404 | Branded. |

Route groups `(auth)` and `(product)` exist to give those areas their own
layouts without adding a URL segment, and without touching `app/page.tsx`.

## What is deliberately absent

No state manager, data-fetching library, component library, ORM or auth SDK.
Each is a real decision that should be made when the first concrete
requirement arrives, not pre-emptively. The ports mean none of them are
difficult to add later.
