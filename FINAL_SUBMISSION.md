# Orbital

**A multimodal AI website engineer: show it a sketch, a screenshot, a PDF or a
sentence, and it returns a working multi-page site you keep editing by
describing changes rather than regenerating.**

## Core features

| | |
|---|---|
| **Landing page** | Live WebGL Earth, canvas starfield and comet, scroll-driven sketch→site morph, six interactive sections. Ported from the approved design and guarded by 29 pixel baselines. |
| **Authentication** | Real accounts: scrypt-hashed passwords with per-user salts, signed http-only session cookies, protected routes. |
| **Workspaces** | A personal workspace is provisioned on sign-up; roles are modelled for teams. |
| **Projects** | Create, list, open, delete — with loading, empty and error states. |
| **Multimodal input** | Text brief plus image, PDF and audio uploads, validated on MIME type and size. |
| **Generation pipeline** | Job → status transitions → event stream → revision → preview, polled live. |
| **Live preview** | Real generated HTML, three linked pages, sandboxed under a restrictive CSP. |
| **Revision history** | Every instruction appends a revision; nothing is overwritten. |
| **Responsive** | 320–1440px verified, hamburger navigation, 44px touch targets, `prefers-reduced-motion` respected. |

## Run it

```bash
npm install
npm run dev
```

**<http://localhost:3000>**

No `.env`, no external services, no credentials. The app detects that Supabase
is unconfigured and runs its local backend.

Reset before presenting: `npm run demo:reset`

## Credentials

None supplied — **create an account** at `/sign-up`. Any email shape
(`judge@example.com`), password 8+ characters, no confirmation step.

## Demo flow

1. `/` — scroll the landing page: Earth, starfield, hero morph, interactive steps.
2. **Start building** → `/sign-up`.
3. Create an account. A personal workspace is provisioned.
4. Name a project, press **Open →**.
5. Type a brief, optionally attach a file, press **Generate site**. Watch the
   event stream move through reading → understanding → building.
6. A three-page site appears in the preview. Click `/pricing` to open a real
   generated page in a new tab.
7. Type a change, press **Apply change** — a *second* revision joins the
   history.
8. Refresh, sign out, sign back in: everything persists.

## Architecture

Dependencies point one way. Nothing above the adapter layer knows which
backend is running.

```
app/            routes, thin: read params → call a service → render
components/
  orbital/        the landing page, guarded by pixel baselines
  ui/             product surfaces built on shared tokens
lib/services/   business logic: validation, authorisation, orchestration
lib/ports/      interfaces a backend must satisfy; no runtime imports
lib/domain/     data models; pure types, zero I/O
lib/server/
  demo/           local file-backed backend (default)
  supabase/       production backend (activates when credentials exist)
lib/config/     typed environment access, single entry point
```

`lib/server/container.ts` selects the backend from configuration alone.
`GET /api/health` reports which one is live.

**Routes:** `/`, `/sign-up`, `/sign-in`, `/projects`, `/projects/[id]`,
`/api/health`, `/api/demo/preview/[revisionId]`, `/api/demo/upload`,
`/api/demo/artifact/[key]`, branded 404.

## Implemented vs future production integration

**Implemented and working now:** the landing page, authentication, sessions and
route protection, workspaces, projects CRUD, upload handling and storage,
generation pipeline, revision chain, live preview, all UI states, responsive
behaviour, accessibility, metadata and OG image.

**Written but awaiting external services:** the Supabase adapters, SQL schema
and row-level-security policies. They are complete and switch on automatically
when `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set, but the SQL has never been
executed against a live project.

**Future:** a real generation model in place of the deterministic engine
(one interface, one line in the container), a job queue for long-running
generation, and a deploy target for publishing.

## Known non-blocking limitations

- **The generation engine is deterministic, not AI.** It produces a real
  three-page site from your brief and drives the genuine job, event, revision
  and preview pipeline. Swapping in a model means implementing
  `GenerationEngine` and changing one line in `lib/server/container.ts`.
- **Demo storage is a JSON file** under a mutex — correct for one presenter,
  which is why the Supabase path exists alongside it.
- **A foreign project renders the 404 page with HTTP 200.** Isolation is
  verified with two accounts and content is never exposed; only the status code
  is wrong, because Next streams before `notFound()` fires.
- **Publishing** returns a local preview URL; nothing deploys.
- **Uploads are stored and listed as inputs** but the demo engine reads only
  the text brief.
- Not tested on physical devices.

## Verification

All green on a production build from a clean state:

| Check | Result |
|-------|--------|
| typecheck / lint / build | clean, 12 routes |
| End-to-end journey, two users | 25/25 |
| Landing-page pixel parity | 29/29, zero differing pixels |
| Behaviour (a11y, reduced motion, metadata, responsive) | 32/32 |
| Horizontal overflow, 320–1440px | 0 at 10 widths |
| Full QA sweep (links, forms, states, mobile) | 36/36 |
| Console errors | none |

```bash
npm run typecheck && npm run lint && npm run build
npm run verify
cd tools/baseline && node capture.mjs --check --target=next && node verify.mjs && node widths.mjs
```
