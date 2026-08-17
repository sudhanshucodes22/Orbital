/** Date formatting shared by the product surfaces.
 *
 * Server-side only by convention: every caller is a Server Component on a
 * force-dynamic route, so "3 minutes ago" is computed per request and there is
 * no client render to disagree with it.
 */

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Coarse relative time. Deliberately vague past a week — an exact date is
 *  more useful than "23 days ago", and the list already shows one. */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const elapsed = now - new Date(iso).getTime();
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) {
    const m = Math.floor(elapsed / MINUTE);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (elapsed < DAY) {
    const h = Math.floor(elapsed / HOUR);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (elapsed < 7 * DAY) {
    const d = Math.floor(elapsed / DAY);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }
  return formatDate(iso);
}
