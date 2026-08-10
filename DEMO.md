# Running the demo

```bash
npm install
npm run dev
```

Open **<http://localhost:3000>**.

No configuration, no accounts to create elsewhere, no credentials. The app
detects that Supabase is not configured and runs its local backend instead.

## Signing in

There is no seeded login — **create your own account** on
<http://localhost:3000/sign-up>. Any email shape works (`you@example.com`) and
the only rule is a password of 8 characters or more. There is no email
confirmation in demo mode, so sign-up logs you straight in.

Accounts are real: passwords are scrypt-hashed with a per-user salt and the
session is a signed, http-only cookie.

## What to try

1. Sign up — a personal workspace is created for you automatically.
2. Create a project from `/projects`.
3. Open it, type a brief (optionally attach an image or PDF), and press
   **Generate site**.
4. Watch the event stream, then the live preview appears with three pages.
5. Type a change and press **Apply change** — a second revision is added to
   the history rather than replacing the first.
6. Sign out and back in; everything is still there.

## Where the data lives

`.orbital-demo/` in the project root, gitignored:

| Path | Contents |
|------|----------|
| `db.json` | users, workspaces, projects, revisions, jobs |
| `session.key` | HMAC key for session cookies, generated on first run |
| `artifacts/` | uploaded files |

Delete the folder to reset everything.

## What the generation engine actually is

**It is not AI.** It is a deterministic stub that produces a small, real,
three-page site from the project name and your brief. It exists to exercise
the genuine pipeline — job, status transitions, event stream, revision chain,
project status, preview — so the product flow can be demonstrated and the
wiring proven. Every screen that shows its output says so.

Swapping in a real engine means implementing `GenerationEngine` in
`lib/ports/index.ts` and changing one line in `lib/server/container.ts`.

## Switching to Supabase

Demo mode is the fallback, not a mode flag. Put `SUPABASE_URL` and
`SUPABASE_ANON_KEY` in `.env.local` and every capability switches over on the
next start — see `supabase/README.md`. `GET /api/health` reports which backend
is live.
