# Orbital — demo

## What it is

A multimodal AI website engineer. You give it an idea — a sentence, a sketch,
a screenshot, a PDF — and it returns a working, multi-page website you can
keep editing by describing changes rather than regenerating from scratch.

This repository contains the marketing site and the product foundation:
authentication, workspaces, projects, uploads, a generation pipeline, revision
history and live preview, all running locally with no configuration.

## Start it

```bash
npm install
npm run dev
```

**<http://localhost:3000>**

No `.env` file, no accounts elsewhere, no credentials. The app detects that
Supabase is not configured and runs its local backend instead.

## Credentials

None supplied — **create an account** at
<http://localhost:3000/sign-up>. Any email shape works (`you@example.com`),
password 8+ characters, no confirmation step.

The accounts are real: scrypt-hashed passwords with per-user salts and signed
http-only session cookies.

## Reset before presenting

```bash
npm run demo:reset
```

Clears every account, project, revision and upload. Also rotates the session
key, so a stale cookie in an open browser cannot survive and make the reset
look partial.

## Demo flow

1. **Landing page** — <http://localhost:3000>. Scroll: the Earth and starfield
   are live WebGL and canvas, the hero morphs as you scroll, the steps and
   capability sections respond to clicks.
2. **Start building** — the header button goes to sign-up.
3. **Create an account** — a personal workspace is created automatically.
4. **Create a project** — name it, then press **Open →**.
5. **Generate** — type a brief, for example *"An architecture studio in
   Copenhagen working in daylight, glass and oak."* Optionally attach an image
   or PDF. Press **Generate site** and watch the event stream move through
   reading, understanding and building.
6. **Live preview** — a three-page site appears in a sandboxed frame. The
   `/`, `/pricing` and `/contact` chips open each page in a new tab.
7. **Revise** — type a change and press **Apply change**. A *second* revision
   is added to the history; the first is not overwritten.
8. **Sign out and back in** — everything is still there.

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/sign-up`, `/sign-in` | Authentication |
| `/projects` | Project list — create, open, delete |
| `/projects/[id]` | Generate, preview, revision history |
| `/api/health` | Capability report, tells you which backend is live |
| `/api/demo/preview/[revisionId]` | Serves a generated page |
| `/api/demo/upload`, `/api/demo/artifact/[key]` | Upload and retrieval |

`/projects` requires a session; signed out it redirects to `/sign-in` with the
intended path preserved.

## Where the data lives

`.orbital-demo/` in the project root, gitignored: `db.json` (users,
workspaces, projects, revisions, jobs), `session.key`, and `artifacts/`.

## Known non-blocking limitations

- **The generation engine is not AI.** It is a deterministic template
  generator that produces a real three-page site from your brief. It exists to
  exercise the genuine pipeline — job, status transitions, event stream,
  revision chain, preview — and every screen showing its output says so.
  Swapping in a real engine means implementing one interface and changing one
  line in `lib/server/container.ts`.
- **Demo storage is a JSON file**, not a database: whole-file read/write under
  a mutex. Correct for one presenter, wrong for many users — which is why the
  Supabase path exists.
- **A foreign project returns the 404 page with HTTP 200.** Isolation itself is
  verified: content is never rendered, confirmed with two accounts. Next
  streams the response before `notFound()` fires, so only the status code is
  wrong.
- **Publishing** returns a local preview URL; nothing deploys anywhere.
- **Supabase is implemented but unexercised.** The adapters, schema and RLS
  policies are written and the code switches over automatically when
  credentials appear, but the SQL has never been run against a live project.
- Uploads are accepted and stored, but the demo engine only reads the text
  brief; attachments are listed as inputs rather than interpreted.

## Verification

```bash
npm run typecheck && npm run lint && npm run build
npm run verify                      # 25 end-to-end checks, needs the server running
cd tools/baseline && node capture.mjs --check --target=next   # landing page parity
```
