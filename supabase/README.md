# Supabase setup

Everything in the application is implemented. What is missing is a project to
point it at. These are the only steps that need a human.

## 1. Create a project

<https://supabase.com/dashboard> → New project. Note the region; keep it near
your users.

## 2. Apply the migrations

Either paste the two files into **SQL Editor** in order, or use the CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

| File | Creates |
|------|---------|
| `migrations/0001_initial_schema.sql` | `workspaces`, `workspace_members`, `projects`, the sign-up trigger, the `updated_at` trigger, and all RLS policies |
| `migrations/0002_storage.sql` | the private `orbital-artifacts` bucket with a 25 MB limit and a MIME allow-list |

Both are idempotent, so re-running is safe.

## 3. Collect four values

**Settings → API**

| Value | Goes to |
|-------|---------|
| Project URL | `SUPABASE_URL` |
| `anon` / publishable key | `SUPABASE_ANON_KEY` |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` |
| (fixed) | `STORAGE_BUCKET=orbital-artifacts` |

Put them in `.env.local`, which is gitignored. The `service_role` key bypasses
Row Level Security — treat it like a root password and never expose it to a
browser.

## 4. Decide on email confirmation

**Authentication → Providers → Email.** With confirmation on (the default),
sign-up returns no session and the form says to check the inbox. Turning it
off makes sign-up log the user straight in, which is easier while developing.

## 5. Check it worked

```bash
npm run build && npm run start
curl -s localhost:3000/api/health
```

`auth`, `database` and `storage` should all report `true`. Then sign up — a
personal workspace is created by the trigger — and `/projects` becomes a real,
working screen.

## Security model

Row Level Security is the boundary, not the service layer. Services check
roles so errors are useful; the policies are what hold if a service is ever
bypassed.

- A user reads only their own `workspace_members` rows.
- A workspace is visible only to its members.
- A project is readable, writable and deletable **only by its owner**. The
  insert policy pins `owner_id` to `auth.uid()`, so a forged owner in the
  request body is rejected by the database rather than trusted, and the update
  policy repeats the check so ownership cannot be reassigned.
- Another user's project is indistinguishable from one that does not exist:
  RLS returns no row, the service raises `NotFound`, and the route renders
  404. No existence oracle.
- The storage bucket is private with **no** policies for authenticated users,
  so only the service role can reach it. Uploads and reads both go through
  short-lived signed URLs minted server-side after the request has been
  authorised.

## Not verified locally

The SQL has never been executed — this machine has neither `psql` nor the
Supabase CLI. It is written against documented Postgres and Supabase
behaviour, but the first `db push` is also its first real test. The RLS
isolation claims above are likewise by construction, not by observation;
verify them with two accounts once the project exists.
