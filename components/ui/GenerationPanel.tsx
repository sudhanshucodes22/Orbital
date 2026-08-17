"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  pollGenerationAction,
  prepareUploadAction,
  startGenerationAction,
  type GenerateState,
} from "@/app/(product)/projects/[projectId]/actions";
import { Button } from "./Button";
import { Eyebrow, Heading, Panel } from "./Panel";
import { tokens } from "./tokens";

type Attachment = { name: string; kind: string; storageKey: string; mimeType: string; byteSize: number };

const KIND_FOR_MIME = (mime: string): string =>
  mime === "application/pdf" ? "pdf" : mime.startsWith("audio/") ? "voice" : "image";

/** One-click briefs. The build set is deliberately different in kind — a
 *  sentence, a mood, a structure — so the examples read as a range of valid
 *  inputs rather than one template with the nouns swapped. The revise set is
 *  phrased as instructions, because that is what a revision is. */
const BUILD_EXAMPLES: readonly string[] = [
  "A neighbourhood bakery with a daily menu and a wholesale enquiry page.",
  "A two-person law practice. Serious, restrained, mostly text.",
  "A climbing gym: class timetable, membership tiers, and a day-pass CTA.",
];

const REVISE_EXAMPLES: readonly string[] = [
  "Make the hero darker and cut the subheading in half.",
  "Add a testimonials section above the footer.",
  "Use a warmer palette throughout — less blue.",
];

export function GenerationPanel({
  projectId,
  hasRevision,
  mode,
  modelLabel,
  initialBrief = "",
  onDone,
}: {
  projectId: string;
  hasRevision: boolean;
  /** Which engine will answer. Resolved on the server and passed down, so the
   *  panel never claims output came from a model that was not involved. */
  mode: "demo" | "model";
  /** Provider and model, when one is configured. */
  modelLabel?: string | null;
  /** Seeded from the starter a user picked on the projects list. It is a
   *  suggestion in a text field, not a stored input — editing or clearing it
   *  is the expected case. */
  initialBrief?: string;
  onDone?: () => void;
}) {
  const [state, setState] = useState<GenerateState>({ error: null, jobId: null });
  const [brief, setBrief] = useState(initialBrief);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<{ status: string; message: string }[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const attach = useCallback(async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        const kind = KIND_FOR_MIME(file.type) as "image" | "pdf" | "voice";
        const prepared = await prepareUploadAction({
          kind,
          mimeType: file.type,
          byteSize: file.size,
        });
        if ("error" in prepared) {
          setState({ error: prepared.error, jobId: null });
          continue;
        }
        const res = await fetch(prepared.uploadUrl, { method: "PUT", body: file });
        if (!res.ok) {
          setState({ error: `Upload failed for ${file.name}.`, jobId: null });
          continue;
        }
        setFiles((prev) => [
          ...prev,
          { name: file.name, kind, storageKey: prepared.storageKey, mimeType: file.type, byteSize: file.size },
        ]);
      }
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }, []);

  async function submit() {
    setBusy(true);
    setEvents([]);
    setStatus(null);
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("brief", brief);
    for (const f of files) {
      fd.append("upload", JSON.stringify({
        kind: f.kind, storageKey: f.storageKey, mimeType: f.mimeType, byteSize: f.byteSize,
      }));
    }
    const next = await startGenerationAction(state, fd);
    setState(next);
    setBusy(false);
  }

  // Poll while a job is in flight. The engine derives its stage from elapsed
  // time, so polling is what advances it as well as what reports it.
  useEffect(() => {
    if (!state.jobId) return;
    let stop = false;
    const tick = async () => {
      const job = await pollGenerationAction(state.jobId!);
      if (stop || !job) return;
      setEvents(job.events);
      setStatus(job.status);
      if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
        // The panel turns into "describe a change" once a build lands, so
        // leaving the brief in the box would offer the text that just ran as
        // the next instruction. A failed job keeps it — that text is the
        // thing worth retrying.
        if (job.status === "succeeded") {
          setBrief("");
          setFiles([]);
        }
        onDone?.();
        // The page is a Server Component; refreshing re-runs it so the new
        // revision, preview and history appear without a manual reload.
        router.refresh();
        return;
      }
      setTimeout(tick, 600);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [state.jobId, onDone, router]);

  // Derived rather than stored: setting it from inside the polling effect
  // would trigger a cascading render on every tick.
  const running =
    Boolean(state.jobId) &&
    status !== "succeeded" &&
    status !== "failed" &&
    status !== "cancelled";
  const disabled = busy || running || (!brief.trim() && files.length === 0);

  /* The pipeline reports its lifecycle state, so the button says what is
   * actually happening rather than "Building…" for every stage. */
  const runningLabel =
    status === "queued"
      ? "Queued…"
      : status === "validating"
        ? "Validating…"
        : "Building…";

  return (
    <Panel accent lit style={{ padding: "26px 24px 28px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Eyebrow>{hasRevision ? "Revise" : "Build"}</Eyebrow>
        <span style={{ flex: 1 }} />
        {running && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontFamily: tokens.mono,
              fontSize: 9.5,
              letterSpacing: ".14em",
              color: "rgba(214,204,255,.95)",
            }}
          >
            <span
              className="o-dot o-dot--live"
              style={{ background: tokens.violet, color: tokens.violet }}
              aria-hidden
            />
            {(status ?? "queued").toUpperCase()}
          </span>
        )}
      </div>

      <Heading size="lg" style={{ marginTop: 14, fontSize: 23 }}>
        {hasRevision ? "Describe a change" : "Describe or show what you want"}
      </Heading>

      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={3}
        aria-label={hasRevision ? "Describe a change" : "Describe the site you want"}
        placeholder={hasRevision ? "Make the hero darker…" : "A landing page for an architecture studio…"}
        className="o-field"
        style={{ marginTop: 18, fontSize: 14.5, lineHeight: 1.6, resize: "vertical" }}
      />

      {/* Hidden once there is text: the chips are for an empty field, and
          keeping them visible invites clobbering what was just typed. */}
      {!brief.trim() && (
        <div style={{ marginTop: 14 }}>
          <span
            style={{
              display: "block",
              marginBottom: 9,
              fontFamily: tokens.mono,
              fontSize: 9.5,
              letterSpacing: ".14em",
              color: tokens.textFaint,
            }}
          >
            {hasRevision ? "OR TRY A CHANGE" : "OR TRY ONE OF THESE"}
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(hasRevision ? REVISE_EXAMPLES : BUILD_EXAMPLES).map((example) => (
              <button
                key={example}
                type="button"
                className="o-chip"
                onClick={() => setBrief(example)}
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          marginTop: 18,
          paddingTop: 18,
          borderTop: `1px solid ${tokens.borderSoft}`,
        }}
      >
        <input
          ref={fileInput}
          id="attachments"
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,application/pdf,audio/webm,audio/mpeg,audio/wav"
          onChange={(e) => attach(e.target.files)}
          className="o-file"
        />
        <label htmlFor="attachments" className="o-btn o-btn--ghost o-btn--sm">
          <span aria-hidden>+</span>
          Attach image, PDF or audio
        </label>

        <span style={{ flex: 1 }} />

        <Button
          type="button"
          variant="primary"
          onClick={submit}
          disabled={disabled}
          busy={busy || running}
        >
          {running ? runningLabel : hasRevision ? "Apply change" : "Generate site"}
          {!running && <span aria-hidden>→</span>}
        </Button>
      </div>

      {files.length > 0 && (
        <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {files.map((f) => (
            <li
              key={f.storageKey}
              style={{
                fontFamily: tokens.mono,
                fontSize: 10,
                letterSpacing: ".06em",
                padding: "6px 11px",
                borderRadius: 999,
                border: `1px solid ${tokens.borderAccent}`,
                background: tokens.accentSoft,
                color: "rgba(196,236,255,.92)",
              }}
            >
              {f.kind.toUpperCase()} · {f.name}
            </li>
          ))}
        </ul>
      )}

      {state.error && (
        <p
          role="alert"
          style={{
            margin: "16px 0 0",
            padding: "11px 13px",
            borderRadius: 11,
            border: "1px solid rgba(255,150,140,.35)",
            background: "rgba(255,150,140,.08)",
            fontSize: 13.5,
            color: "rgba(255,196,190,.95)",
          }}
        >
          {state.error}
        </p>
      )}

      {events.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${tokens.borderSoft}` }}>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }} aria-live="polite">
            {events.map((e, i) => {
              const current = i === events.length - 1;
              return (
                <li
                  key={`${e.status}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontFamily: tokens.mono,
                    fontSize: 11,
                    color: current ? "rgba(196,236,255,.95)" : tokens.textFaint,
                  }}
                >
                  <span
                    className={`o-dot${current && running ? " o-dot--live" : ""}`}
                    style={{
                      background: current ? tokens.accent : "rgba(233,235,242,.28)",
                      color: tokens.accent,
                    }}
                    aria-hidden
                  />
                  {e.message}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p style={{ margin: "20px 0 0", fontSize: 12, lineHeight: 1.55, color: tokens.textFaint }}>
        {mode === "model" ? (
          <>
            Generated by {modelLabel ?? "the configured model"}. The plan and every
            file operation are recorded on the run, so you can see exactly what changed.
          </>
        ) : (
          <>
            Local demo engine: deterministic sample output, not AI. It exercises the
            real job, event and revision pipeline so the workflow can be seen end to end.
          </>
        )}
      </p>
    </Panel>
  );
}
