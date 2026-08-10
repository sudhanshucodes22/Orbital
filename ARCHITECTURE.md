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
lib/config/     Typed environment access.
```

`lib/domain` is the only layer everything may import. `lib/server` is the only
layer that may talk to the outside world, and nothing may import it from a
client component.

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
