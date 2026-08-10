/** File-backed store for local demo mode. SERVER ONLY.
 *
 * Writes JSON to .orbital-demo/db.json so state survives a page refresh, a dev
 * server restart and a rebuild. In-memory would have been less code but would
 * lose everything on the next hot reload, which is exactly what "persist demo
 * data locally" rules out.
 *
 * Not a database and not pretending to be one: whole-file read/write under a
 * promise mutex. That is correct for a single-user demo and would be wrong for
 * anything else, which is why Supabase remains the production path.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface DemoUser {
  id: string;
  email: string;
  displayName: string | null;
  /** scrypt, stored as salt:hash. Never plaintext, even in a demo. */
  passwordHash: string;
  createdAt: string;
}

export interface DemoWorkspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface DemoMember {
  workspaceId: string;
  userId: string;
  role: "owner" | "admin" | "member" | "viewer";
  joinedAt: string;
}

export interface DemoProject {
  id: string;
  workspaceId: string;
  ownerId: string;
  name: string;
  description: string | null;
  status: "draft" | "generating" | "ready" | "failed";
  currentRevisionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DemoRevision {
  id: string;
  projectId: string;
  parentId: string | null;
  generationId: string | null;
  summary: string;
  site: unknown;
  createdAt: string;
}

export interface DemoJob {
  id: string;
  projectId: string;
  intent: unknown;
  status: string;
  events: { at: string; status: string; message: string }[];
  producedRevisionId: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface DemoDb {
  version: 1;
  users: DemoUser[];
  workspaces: DemoWorkspace[];
  members: DemoMember[];
  projects: DemoProject[];
  revisions: DemoRevision[];
  jobs: DemoJob[];
}

const EMPTY: DemoDb = {
  version: 1,
  users: [],
  workspaces: [],
  members: [],
  projects: [],
  revisions: [],
  jobs: [],
};

export const DEMO_DIR = path.join(process.cwd(), ".orbital-demo");
const DB_PATH = path.join(DEMO_DIR, "db.json");

/** Serialises every read-modify-write so two concurrent requests cannot
 *  clobber each other's changes. */
let queue: Promise<unknown> = Promise.resolve();

async function ensureDir() {
  await mkdir(DEMO_DIR, { recursive: true });
}

async function readDb(): Promise<DemoDb> {
  try {
    const raw = await readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as DemoDb;
    // Tolerate a file written by an older shape rather than crashing the app.
    return { ...EMPTY, ...parsed };
  } catch {
    return { ...EMPTY };
  }
}

async function writeDb(db: DemoDb): Promise<void> {
  await ensureDir();
  // Write-then-rename so a crash mid-write cannot leave a truncated file that
  // would read back as an empty database.
  const tmp = `${DB_PATH}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await rename(tmp, DB_PATH);
}

/** Read-only snapshot. */
export function read<T>(fn: (db: DemoDb) => T): Promise<T> {
  const next = queue.then(async () => fn(await readDb()));
  queue = next.catch(() => undefined);
  return next;
}

/** Read, mutate, persist. The callback receives a mutable draft. */
export function mutate<T>(fn: (db: DemoDb) => T): Promise<T> {
  const next = queue.then(async () => {
    const db = await readDb();
    const result = fn(db);
    await writeDb(db);
    return result;
  });
  queue = next.catch(() => undefined);
  return next;
}

export const nowIso = () => new Date().toISOString();
