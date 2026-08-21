# Setup

Orbital runs with **no configuration at all**: clone it, `npm install`,
`npm run dev`, and everything works against a local file-backed store and a
deterministic template engine. That path is fully verified.

Two capabilities need credentials, and until those are supplied they are
**built but unproven**. This file is what you need to change that.

Nothing here contains a secret value, and none should ever be added to it.

---

## What is configured, and what it unlocks

| Variable | Needed for | Without it |
|---|---|---|
| `GENERATION_API_KEY` | Real AI generation (either vendor) | Template engine, labelled `TEMPLATE` |
| `GEMINI_API_KEY` | Gemini specifically; preferred over the above when provider is `google` | As above |
| `GENERATION_PROVIDER` | Which vendor: `google` or `anthropic` | Defaults are not assumed — required alongside the key |
| `GENERATION_MODEL` | Which model | As above |
| `SUPABASE_URL` | Real database | Local file store in `.orbital-demo/` |
| `SUPABASE_ANON_KEY` | Real database, RLS | As above |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker, storage | Worker runs against the local store |
| `WORKER_SECRET` | Worker trigger | Trigger refuses every request (fails closed) |
| `NEXT_PUBLIC_SITE_URL` | Preview embedding | Assumes `http://localhost:3000` |

Check what is currently set, without printing any value:

```bash
npm run preflight
```

---

## Real AI provider

Two providers are supported. Pick one — the rest of the system does not care
which, and no code changes when you switch.

### Google Gemini (free tier)

Key from <https://aistudio.google.com/apikey>.

```bash
# .env.local
GEMINI_API_KEY=<your key>
GENERATION_PROVIDER=google
GENERATION_MODEL=gemini-2.5-flash
```

**VERIFIED** against the live API on 2026-08-18: real generation and a real
contextual edit both succeeded end to end, and the failure path was exercised
with an invalid key.

`gemini-2.5-flash` is free of charge, stable, and good at structured JSON.
`gemini-3.7-flash` is also free and Google describes it as built for coding
and agentic work — a reasonable upgrade once the basics are confirmed
working. Both were checked against Google's current model list and pricing.

> **Do not use `gemini-2.0-flash` or the 1.5 family** — Google has shut them
> down. This is exactly the kind of value worth checking rather than recalling.

The adapter targets Google's **Interactions API**, which their reference names
as generally available and recommended for new integrations. It uses `fetch`
directly, so no SDK dependency was added.

Two shapes are easy to get wrong here, and were — both written from
documentation, both rejected by the live endpoint, both now pinned by tests:

- `input` is a **step list**: `[{type:"text", text:"…"}]`. The turn list
  `generateContent` uses — `[{role:"user", parts:[{text:"…"}]}]` — is refused
  with *"use step_list input format instead of turn_list"*. A step carries no
  role, so multi-turn role fidelity is not available on this surface. Orbital
  sends a system instruction plus one user message, so nothing is lost.
- `response_format` **is** the JSON schema, not a wrapper around it. The
  OpenAI-style `{type:"json_schema", schema}` is refused: *"The value
  'json_schema' is not supported for 'type'."*

A third problem was not the adapter's. `OPERATIONS_SCHEMA` used to be one
object with every field optional and only `kind` required — a union described
loosely. Gemini honoured it literally and returned
`{"kind":"createFile","path":"index.html"}` with no content, which the parser
correctly refused. The schema now uses `anyOf`, one branch per operation kind,
so a `createFile` without content is not a shape the schema permits. That
change benefits every provider, not just Gemini.

### Anthropic

Key from <https://console.anthropic.com>.

```bash
# .env.local
GENERATION_API_KEY=<your key>
GENERATION_PROVIDER=anthropic
GENERATION_MODEL=claude-opus-4-8
```

### Either way

Put the key in `.env.local` — **never** in source, and never in a committed
file. `.env.local` is gitignored.

**Backups are sensitive too.** `.gitignore` covers every `.env` variant, not
just `.env.local`, because a copy like `.env.local.bak` or `.env.local.save`
holds exactly the same credentials as the original and a narrower rule would
leave it committable.

`GENERATION_API_KEY` works for both providers; `GEMINI_API_KEY` is checked
first when the provider is `google`, because that is the name Google's own
documentation uses.

Restart the dev server afterwards. `/api/health` will report
`capabilities.generation: true`.

**Confirming it is real:** generate something and open History. The run records
`mode: "model"` and names the provider and model that answered. A run the
template engine produced records `mode: "demo"` and `model: null`, and the
workspace labels it `TEMPLATE`.

**A configured provider always wins.** There is no fallback to the template
engine if a model call fails — a failure surfaces as a failure. Falling back
would hand back plausible output that no model produced, which is the one
outcome this system must not have.

### Testing a failure safely

Set a deliberately invalid key in `.env.local`, restart, and generate. Expected:
the run fails, no revision is created, the previous revision stays the project
head, the panel shows a readable message, and Retry is offered. Remove the
invalid key afterwards.

---

## Supabase

Full instructions are in [`supabase/README.md`](supabase/README.md). In short:

1. Create a project at <https://supabase.com/dashboard>.
2. Apply `supabase/migrations/0001` … `0007` **in order**, via the SQL Editor
   or `supabase db push`. Each is idempotent, so re-running after a partial
   failure is safe and is the intended recovery path.
3. Copy four values from **Settings → API** into `.env.local`:

   ```bash
   SUPABASE_URL=<project URL>
   SUPABASE_ANON_KEY=<anon / publishable key>
   SUPABASE_SERVICE_ROLE_KEY=<service_role key>
   STORAGE_BUCKET=orbital-artifacts
   ```

4. Verify it for real:

   ```bash
   npm run verify
   ```

   This connects, checks every table and every column the adapter selects,
   exercises a full lifecycle including the one-active-run constraint and retry
   lineage, checks RLS with an anonymous client, and cleans up after itself. It
   **refuses to run** without credentials rather than reporting a partial pass.

The `service_role` key bypasses Row Level Security. Treat it like a root
password: server-only, never in a browser, never in a preview.

---

## The worker

Generation is durable — a run survives the request that started it. In
development the submitting request usually finishes the work first, so you will
rarely see the worker act. To run it:

```bash
WORKER_SECRET=$(openssl rand -hex 32)   # add to .env.local
npm run worker
```

See [`WORKER.md`](WORKER.md) for deployment, including the Vercel cron entry.

---

## Demo mode is not going away

The template engine and file-backed store are kept deliberately, for offline
work, CI, and deterministic regression tests. The full suite runs against them with
no credentials and no network — including the Gemini adapter, whose transport
is mocked.

The distinction is structural, not cosmetic:

- every run records `mode`, and the template path records `model: null`
- the workspace labels a run `TEMPLATE` or names the model that answered
- a configured provider is never silently bypassed, and an unconfigured one
  fails loudly rather than pretending

---

## Known production limitations

- **Previews are sandboxed, not containerised.** Separate process, no secrets,
  no filesystem writes, no network egress — but no cgroups, no kernel-level
  namespace separation, and macOS only for the OS sandbox tier. See
  ARCHITECTURE.md.
- **Single host.** Previews are in-process children and cannot outlive or
  migrate between application instances.
- **No deployment, GitHub integration, or code editor.**
- **Generated projects are static HTML and CSS by design** — no build step and
  no package installation, which is the contract the model is given.
