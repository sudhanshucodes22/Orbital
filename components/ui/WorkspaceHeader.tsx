import type { Project } from "@/lib/domain";
import { formatRelative } from "./format";
import { Eyebrow, Heading } from "./Panel";
import { tokens } from "./tokens";

/** Counts derived from the project list the page already loaded.
 *
 * Deliberately computed from that array rather than queried: a per-project
 * count of revisions would be one round trip per row, which is a real cost
 * against Supabase and buys a number nobody is reading. Everything here is a
 * fact the list already knows.
 */
function summarise(projects: Project[]) {
  let ready = 0;
  let draft = 0;
  let generating = 0;
  let failed = 0;
  for (const p of projects) {
    if (p.status === "ready") ready++;
    else if (p.status === "generating") generating++;
    else if (p.status === "failed") failed++;
    else draft++;
  }
  // Sorted newest-first by the service, so the head is the last thing touched.
  const lastTouched = projects[0]?.updatedAt ?? null;
  return { ready, draft, generating, failed, lastTouched };
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "accent" | "violet" }) {
  const colour =
    tone === "accent" ? "rgba(196,236,255,.95)" : tone === "violet" ? "rgba(214,204,255,.95)" : tokens.text;

  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontFamily: tokens.display,
          fontWeight: 500,
          fontSize: 26,
          lineHeight: 1,
          letterSpacing: "-.025em",
          color: colour,
          /* Numbers in a row of stats must not jitter as they change width. */
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 7,
          fontFamily: tokens.mono,
          fontSize: 9.5,
          letterSpacing: ".14em",
          color: tokens.textFaint,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </div>
    </div>
  );
}

/** The workspace header: who you are, what is in here, and what changed last.
 *
 * This is the page's first impression, so it carries the display type rather
 * than opening on a form. The stat rail is folded into the same block instead
 * of sitting in its own card — two stacked cards before any content is what
 * made the old page read as a dashboard.
 */
export function WorkspaceHeader({
  projects,
  name,
}: {
  projects: Project[];
  name: string | null;
}) {
  const { ready, draft, generating, failed, lastTouched } = summarise(projects);
  const empty = projects.length === 0;

  // The third cell reports whatever is actually happening. A fixed "drafts"
  // cell would hide a failure or a running build behind a number that did not
  // move, which is the one moment the rail needs to say something.
  const third =
    generating > 0
      ? { label: "BUILDING NOW", value: String(generating), tone: "violet" as const }
      : failed > 0
        ? { label: "NEEDS ATTENTION", value: String(failed), tone: undefined }
        : { label: "AWAITING A BRIEF", value: String(draft), tone: undefined };

  return (
    <header style={{ position: "relative" }}>
      <Eyebrow>Workspace</Eyebrow>

      <Heading as="h1" size="xl" style={{ marginTop: 16, maxWidth: 720 }}>
        {empty ? (
          <>
            Let&rsquo;s build{" "}
            <span
              style={{
                /* The one place a gradient touches type. It lands on two words
                 * in the largest heading on the page and nowhere else, which
                 * is what keeps it from reading as decoration. */
                background: tokens.gradientAction,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              something
            </span>
            .
          </>
        ) : (
          <>
            {name ? `Welcome back, ${name}.` : "Your workspace."}
          </>
        )}
      </Heading>

      <p
        style={{
          margin: "13px 0 0",
          fontSize: 15,
          lineHeight: 1.6,
          color: tokens.textMuted,
          maxWidth: 560,
        }}
      >
        {empty
          ? "Describe a site, show it a sketch, or start from one of the briefs below. Orbital reads intent and hands back something you can keep editing."
          : "Every project keeps its full revision history, so nothing you generate is ever overwritten."}
      </p>

      {!empty && (
        <div
          className="r-stats"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0,1fr))",
            gap: 20,
            marginTop: 30,
            paddingTop: 24,
            borderTop: `1px solid ${tokens.borderSoft}`,
          }}
        >
          <Stat label="PROJECTS" value={String(projects.length)} />
          <Stat label="SITES GENERATED" value={String(ready)} tone={ready > 0 ? "accent" : undefined} />
          <Stat label={third.label} value={third.value} tone={third.tone} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: tokens.display,
                fontWeight: 500,
                fontSize: 16,
                lineHeight: 1.5,
                letterSpacing: "-.01em",
                color: tokens.text,
              }}
            >
              {lastTouched ? formatRelative(lastTouched) : "—"}
            </div>
            <div
              style={{
                marginTop: 7,
                fontFamily: tokens.mono,
                fontSize: 9.5,
                letterSpacing: ".14em",
                color: tokens.textFaint,
              }}
            >
              LAST ACTIVITY
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
