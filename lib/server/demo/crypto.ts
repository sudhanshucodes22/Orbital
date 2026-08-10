/** Password hashing and session tokens for demo mode. SERVER ONLY.
 *
 * Uses node:crypto rather than a dependency. Passwords are scrypt-hashed with
 * a per-user salt and compared in constant time — a demo is not a reason to
 * store plaintext, and getting this wrong here would teach the wrong shape for
 * the real thing.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEMO_DIR } from "./store";

const KEY_PATH = path.join(DEMO_DIR, "session.key");

/** Generated on first use and kept out of git, so sessions survive restarts
 *  without a secret ever being committed or asked for. */
function sessionKey(): string {
  if (existsSync(KEY_PATH)) return readFileSync(KEY_PATH, "utf8").trim();
  mkdirSync(DEMO_DIR, { recursive: true });
  const key = randomBytes(32).toString("hex");
  writeFileSync(KEY_PATH, key, { mode: 0o600 });
  return key;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/** `<userId>.<hmac>` — enough to prove the cookie was issued by this server. */
export function signSession(userId: string): string {
  const mac = createHmac("sha256", sessionKey()).update(userId).digest("hex");
  return `${userId}.${mac}`;
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const userId = token.slice(0, idx);
  const mac = token.slice(idx + 1);
  const expected = createHmac("sha256", sessionKey()).update(userId).digest("hex");
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? userId : null;
}

export const SESSION_COOKIE = "orbital_demo_session";
