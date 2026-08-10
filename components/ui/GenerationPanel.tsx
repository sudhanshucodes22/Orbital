"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  pollGenerationAction,
  prepareUploadAction,
  startGenerationAction,
  type GenerateState,
} from "@/app/(product)/projects/[projectId]/actions";
import { Eyebrow, Panel } from "./Panel";
import { tokens } from "./tokens";

type Attachment = { name: string; kind: string; storageKey: string; mimeType: string; byteSize: number };

const KIND_FOR_MIME = (mime: string): string =>
  mime === "application/pdf" ? "pdf" : mime.startsWith("audio/") ? "voice" : "image";

export function GenerationPanel({
  projectId,
  hasRevision,
  onDone,
}: {
  projectId: string;
  hasRevision: boolean;
  onDone?: () => void;
}) {
  const [state, setState] = useState<GenerateState>({ error: null, jobId: null });
  const [brief, setBrief] = useState("");
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

  return (
    <Panel>
      <Eyebrow>{hasRevision ? "Revise" : "Build"}</Eyebrow>
      <h2
        style={{
          margin: "14px 0 0",
          fontFamily: tokens.display,
          fontWeight: 500,
          fontSize: 22,
          letterSpacing: "-.02em",
        }}
      >
        {hasRevision ? "Describe a change" : "Describe or show what you want"}
      </h2>

      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={3}
        placeholder={hasRevision ? "Make the hero darker…" : "A landing page for an architecture studio…"}
        style={{
          width: "100%",
          marginTop: 16,
          padding: "12px 14px",
          borderRadius: 10,
          border: `1px solid ${tokens.border}`,
          background: "rgba(255,255,255,.03)",
          color: tokens.text,
          fontFamily: tokens.body,
          fontSize: 14.5,
          resize: "vertical",
        }}
      />

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,application/pdf,audio/webm,audio/mpeg,audio/wav"
          onChange={(e) => attach(e.target.files)}
          style={{ fontSize: 12.5, color: tokens.textMuted, maxWidth: 260 }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled}
          style={{
            padding: "11px 22px",
            borderRadius: 999,
            border: "none",
            fontFamily: tokens.body,
            fontSize: 14,
            fontWeight: 500,
            color: "#04060c",
            background: "linear-gradient(180deg,#cdf3ff,#7ad6ff)",
            cursor: busy || running ? "progress" : "pointer",
            opacity: disabled ? 0.55 : 1,
          }}
        >
          {running ? "Building…" : hasRevision ? "Apply change" : "Generate site"}
        </button>
      </div>

      {files.length > 0 && (
        <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {files.map((f) => (
            <li
              key={f.storageKey}
              style={{
                fontFamily: tokens.mono,
                fontSize: 10.5,
                padding: "6px 10px",
                borderRadius: 999,
                border: `1px solid ${tokens.borderSoft}`,
                color: "rgba(196,236,255,.9)",
              }}
            >
              {f.kind} · {f.name}
            </li>
          ))}
        </ul>
      )}

      {state.error && (
        <p role="alert" style={{ margin: "14px 0 0", fontSize: 13.5, color: "rgba(255,196,190,.95)" }}>
          {state.error}
        </p>
      )}

      {events.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${tokens.borderSoft}` }}>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }} aria-live="polite">
            {events.map((e, i) => (
              <li
                key={`${e.status}-${i}`}
                style={{
                  fontFamily: tokens.mono,
                  fontSize: 11,
                  color: i === events.length - 1 ? "rgba(196,236,255,.95)" : tokens.textFaint,
                }}
              >
                {i === events.length - 1 ? "▶" : "·"} {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p style={{ margin: "18px 0 0", fontSize: 12, lineHeight: 1.55, color: tokens.textFaint }}>
        Local demo engine: deterministic sample output, not AI. It exercises the
        real job, event and revision pipeline so the workflow can be seen end to end.
      </p>
    </Panel>
  );
}
