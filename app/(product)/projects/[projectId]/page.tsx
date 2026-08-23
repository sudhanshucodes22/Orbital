import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActiveRunBanner } from "@/components/ui/ActiveRunBanner";
import { AppShell } from "@/components/ui/AppShell";
import { ButtonLink } from "@/components/ui/Button";
import { formatDate, formatRelative } from "@/components/ui/format";
import { GenerationPanel } from "@/components/ui/GenerationPanel";
import { Eyebrow, Heading, Panel } from "@/components/ui/Panel";
import { RevisionTimeline } from "@/components/ui/RevisionTimeline";
import { RunHistory } from "@/components/ui/RunHistory";
import { StatusPill } from "@/components/ui/StatusPill";
import { tokens } from "@/components/ui/tokens";
import { asProjectId, toRunSummary, type GeneratedSite } from "@/lib/domain";
import { NotFoundError } from "@/lib/errors";
import {
  compareRevisionsAction,
  loadRunPageAction,
  restoreRevisionAction,
  retryRunAction,
} from "./actions";
import { hasModelProvider, resolveModelConfig } from "@/lib/server/ai/registry";
import { getContainer } from "@/lib/server/container";
import { getActiveRun, getProject, getSession, listRuns } from "@/lib/services";

export const metadata: Metadata = { title: "Project" };
export const dynamic = "force-dynamic";

/** A labelled fact in the header rail. */
/** `relative` marks a value computed from `Date.now()`.
 *
 * Those disagree between the server render and hydration whenever the two
 * straddle a boundary — "16 HOURS AGO" against "15" — which React reports as a
 * hydration error and recovers from by re-rendering the tree. The client's
 * value is the correct one, so the mismatch is suppressed rather than designed
 * around. */
function Meta({
  label,
  value,
  relative = false,
}: {
  label: string;
  value: string;
  relative?: boolean;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontFamily: tokens.mono,
          fontSize: 9,
          letterSpacing: ".14em",
          color: tokens.textFaint,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 13.5,
          color: tokens.text,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        suppressHydrationWarning={relative}
      >
        {value}
      </div>
    </div>
  );
}

const SOURCES: readonly { kind: string; body: string }[] = [
  { kind: "TEXT", body: "A sentence or a full brief. Combine it with any of the below." },
  { kind: "IMAGE", body: "A screenshot, a photo of a whiteboard, or a reference you like." },
  { kind: "PDF", body: "A brand guide or a deck. Layout and palette are read from it." },
  { kind: "VOICE", body: "An audio note, for when describing is faster than typing." },
];

/** Looks like something a browser could paint as a colour. Used only to decide
 *  whether to draw a swatch — a wrong guess costs a dot, not correctness. */
function isColour(value: string): boolean {
  return /^(#|rgb|hsl)/i.test(value.trim());
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ brief?: string }>;
}) {
  const { projectId } = await params;
  const { brief } = await searchParams;

  // Pages verify the session themselves; middleware is only a fast redirect.
  const session = await getSession();
  if (!session) notFound();

  // Another user's project is indistinguishable from one that does not exist.
  let project;
  try {
    project = await getProject(session, asProjectId(projectId));
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const revisions = await getContainer().revisions.listForProject(project.id);
  // Everything the pipeline records, finally on screen. The first page only —
  // the rest arrives through the cursor if someone asks for it, so opening a
  // project with three hundred runs costs the same as one with ten.
  const runPage = await listRuns(session, project.id);
  const runs = runPage.runs;
  // Read from the run row, not from anything this request started, so a build
  // in flight is visible after a reload or in a second tab.
  const activeRun = await getActiveRun(session, project.id);
  const current = project.currentRevisionId
    ? (revisions.find((r) => r.id === project.currentRevisionId) ?? revisions[0])
    : revisions[0];
  const site = current?.site as GeneratedSite | undefined;
  const paletteEntries = Object.entries(site?.tokens ?? {});

  // Resolved here rather than in the panel: the registry is server-only, and
  // the panel must not be able to claim a model was involved when none was.
  const modelConfig = resolveModelConfig();
  const engineMode = hasModelProvider() ? "model" : "demo";
  const modelLabel = modelConfig ? `${modelConfig.providerId} · ${modelConfig.modelId}` : null;

  return (
    <AppShell title={project.name} signedIn>
      <div style={{ display: "grid", gap: 22 }}>
        {/* ---- identity ---------------------------------------------- */}
        <header className="o-enter">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Eyebrow>Project</Eyebrow>
            <span style={{ flex: 1 }} />
            {/* The workspace is where the work happens; this page is the
                project's record. Primary, because opening the builder is what
                someone came here to do. */}
            <ButtonLink href={`/projects/${project.id}/builder`} size="sm">
              Open Builder →
            </ButtonLink>
            <ButtonLink href="/projects" variant="ghost" size="sm">
              ← All projects
            </ButtonLink>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
              marginTop: 16,
            }}
          >
            <Heading as="h1" size="xl" style={{ fontSize: 32 }}>
              {project.name}
            </Heading>
            <StatusPill status={project.status} />
          </div>

          {project.description && (
            <p
              style={{
                margin: "12px 0 0",
                fontSize: 15,
                lineHeight: 1.6,
                color: tokens.textMuted,
                maxWidth: 620,
              }}
            >
              {project.description}
            </p>
          )}

          <div
            className="r-meta"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0,1fr))",
              gap: 18,
              marginTop: 26,
              paddingTop: 20,
              borderTop: `1px solid ${tokens.borderSoft}`,
            }}
          >
            <Meta label="CREATED" value={formatDate(project.createdAt)} />
            <Meta label="LAST CHANGE" value={formatRelative(project.updatedAt)} relative />
            <Meta
              label="REVISIONS"
              value={revisions.length === 0 ? "None yet" : String(revisions.length)}
            />
            <Meta label="PAGES" value={site ? String(site.pages.length) : "—"} />
          </div>
        </header>

        {activeRun && (
          <div className="o-enter" style={{ animationDelay: "50ms" }}>
            <ActiveRunBanner
              status={activeRun.status}
              prompt={activeRun.prompt}
              startedAt={activeRun.startedAt}
              leaseExpiresAt={activeRun.leaseExpiresAt}
            />
          </div>
        )}

        {/* ---- the primary action ------------------------------------ */}
        <div className="o-enter" style={{ animationDelay: "70ms" }}>
          <GenerationPanel
            projectId={project.id}
            hasRevision={Boolean(current)}
            mode={engineMode}
            modelLabel={modelLabel}
            initialBrief={brief ?? ""}
          />
        </div>

        {/* Before the first build the page would otherwise be one input and a
            lot of space. What the engine accepts is the useful thing to say
            there, and it stops being useful once a site exists. */}
        {!site && (
          <Panel enter delay={140}>
            <Eyebrow tone="muted">What you can feed it</Eyebrow>
            <p
              style={{
                margin: "14px 0 0",
                fontSize: 14,
                lineHeight: 1.6,
                color: tokens.textMuted,
                maxWidth: 560,
              }}
            >
              Inputs combine. A photo of a sketch plus one sentence of context
              produces a better first pass than either on its own.
            </p>
            <div
              className="r-sources"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0,1fr))",
                gap: 12,
                marginTop: 20,
              }}
            >
              {SOURCES.map((source) => (
                <div
                  key={source.kind}
                  style={{
                    padding: "15px 16px",
                    borderRadius: 13,
                    border: `1px solid ${tokens.borderSoft}`,
                    background: "rgba(255,255,255,.02)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: tokens.mono,
                      fontSize: 9.5,
                      letterSpacing: ".16em",
                      color: "rgba(124,230,255,.72)",
                    }}
                  >
                    {source.kind}
                  </div>
                  <p style={{ margin: "9px 0 0", fontSize: 13, lineHeight: 1.55, color: tokens.textMuted }}>
                    {source.body}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* ---- the generated site ------------------------------------ */}
        {site && current && (
          <Panel enter delay={140} lit>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              {/* Deliberately not "Live preview". This is the revision's
                  frozen HTML rendered same-origin — a still. The *live*
                  preview is the Builder's, which materialises the files and
                  serves them from a real runtime on its own origin. Calling
                  both "live" would present a snapshot as a running site. */}
              <Eyebrow>Snapshot</Eyebrow>
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: tokens.mono, fontSize: 10, letterSpacing: ".12em", color: tokens.textFaint }}>
                {site.pages.length} PAGE{site.pages.length === 1 ? "" : "S"}
              </span>
              <ButtonLink href={`/projects/${project.id}/builder`} variant="ghost" size="sm">
                Open live preview →
              </ButtonLink>
            </div>

            <nav
              aria-label="Generated pages"
              style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0 14px" }}
            >
              {site.pages.map((page) => (
                <a
                  key={page.path}
                  href={`/api/demo/preview/${current.id}?path=${encodeURIComponent(page.path)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="o-chip"
                  style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}
                >
                  {/* The title says what the page is; the path says where it
                      lives. The chips used to show only the path. */}
                  <span>{page.title}</span>
                  <span style={{ fontFamily: tokens.mono, fontSize: 9.5, opacity: 0.62 }}>
                    {page.path}
                  </span>
                </a>
              ))}
            </nav>

            {/* Sandboxed: generated markup is untrusted content, even when
                this build produced it. */}
            <iframe
              title="Snapshot of the generated site"
              src={`/api/demo/preview/${current.id}`}
              sandbox=""
              style={{
                width: "100%",
                height: 470,
                border: `1px solid ${tokens.border}`,
                borderRadius: 14,
                background: "#06080e",
                display: "block",
              }}
            />
          </Panel>
        )}

        {/* ---- build history ----------------------------------------- */}
        {runs.length > 0 && (
          <Panel enter delay={175}>
            <RunHistory
              projectId={project.id}
              initial={{
                runs: runs.map(toRunSummary),
                nextCursor: runPage.nextCursor,
                hasMore: runPage.hasMore,
              }}
              loadPage={loadRunPageAction}
              onRetry={retryRunAction}
            />
          </Panel>
        )}

        {/* ---- revisions and design tokens --------------------------- */}
        {revisions.length > 0 && (
          <div
            className="r-detail o-enter"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) minmax(0,360px)",
              gap: 16,
              alignItems: "start",
              animationDelay: "210ms",
            }}
          >
            <Panel>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <Eyebrow>History</Eyebrow>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: tokens.mono, fontSize: 10, letterSpacing: ".12em", color: tokens.textFaint }}>
                  NOTHING OVERWRITTEN
                </span>
              </div>
              <div style={{ marginTop: 20 }}>
                <RevisionTimeline
                  revisions={revisions}
                  compareAction={compareRevisionsAction}
                  currentId={current?.id}
                  projectId={project.id}
                  restoreAction={restoreRevisionAction}
                />
              </div>
            </Panel>

            {paletteEntries.length > 0 && (
              <Panel>
                {/* Progressive disclosure: the tokens matter when you are
                    asking why a revision looks the way it does, and are noise
                    the rest of the time. <details> keeps that a one-click
                    question with no JavaScript. */}
                <details>
                  <summary
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      cursor: "pointer",
                      listStyle: "none",
                    }}
                  >
                    <Eyebrow>Design tokens</Eyebrow>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontFamily: tokens.mono, fontSize: 10, color: tokens.textFaint }}>
                      {paletteEntries.length}
                    </span>
                  </summary>

                  <p style={{ margin: "14px 0 0", fontSize: 13, lineHeight: 1.6, color: tokens.textMuted }}>
                    Carried forward into every revision, so a change to the copy
                    does not quietly restyle the site.
                  </p>

                  <ul
                    style={{
                      display: "grid",
                      gap: 8,
                      margin: "16px 0 0",
                      padding: 0,
                      listStyle: "none",
                    }}
                  >
                    {paletteEntries.map(([key, value]) => (
                      <li
                        key={key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "9px 11px",
                          borderRadius: 10,
                          border: `1px solid ${tokens.borderSoft}`,
                          background: "rgba(255,255,255,.02)",
                          minWidth: 0,
                        }}
                      >
                        {isColour(value) && (
                          <span
                            aria-hidden
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: 5,
                              flexShrink: 0,
                              background: value,
                              border: "1px solid rgba(255,255,255,.18)",
                            }}
                          />
                        )}
                        <span
                          style={{
                            fontFamily: tokens.mono,
                            fontSize: 9.5,
                            letterSpacing: ".1em",
                            textTransform: "uppercase",
                            color: tokens.textFaint,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {key}
                        </span>
                        <span style={{ flex: 1 }} />
                        <span
                          style={{
                            fontFamily: tokens.mono,
                            fontSize: 11,
                            color: tokens.text,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            minWidth: 0,
                          }}
                          title={value}
                        >
                          {value}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </Panel>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
