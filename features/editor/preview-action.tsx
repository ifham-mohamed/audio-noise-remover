"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PreviewSurface } from "@/features/editor/preview-surface";
import { startPreviewWorker, type PreviewWorkerSession } from "@/features/preview/preview-worker-client";
import { previewJobEnvelopeSchema, previewJobMatches, type PreviewEvent, type PreviewJob } from "@/shared/contracts/preview";
import type { MediaMetadata } from "@/shared/contracts/media";
import type { ProcessingProfile } from "@/shared/contracts/processing";

async function command(jobId: string, body: unknown) {
  const response = await fetch(`/api/preview-jobs/${jobId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const envelope = previewJobEnvelopeSchema.parse(await response.json());
  if (!response.ok || !envelope.data) throw new Error(envelope.error?.message ?? "The local preview update could not be saved.");
  return envelope.data;
}

export function PreviewAction({ media, profile, currentTimeSeconds, file, onPreviewCreated }: { media: MediaMetadata; profile: ProcessingProfile; currentTimeSeconds: number; file?: File; onPreviewCreated?: (job: PreviewJob) => void }) {
  const [job, setJob] = useState<PreviewJob>();
  const [error, setError] = useState<string>();
  const [preparing, setPreparing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const worker = useRef<PreviewWorkerSession | undefined>(undefined);
  const activeJobId = useRef<string | undefined>(undefined);
  const cancelCommand = useRef<Promise<PreviewJob> | undefined>(undefined);
  const preparingRef = useRef(false);
  useEffect(() => () => {
    const session = worker.current;
    const jobId = activeJobId.current;
    if (!session || !jobId) return;
    // The coordinator must enter cancelling before the worker can report its
    // cleanup-complete terminal event, including when this component unmounts.
    const pending = command(jobId, { command: "cancel" });
    cancelCommand.current = pending;
    void session.cancel();
    void pending.catch(() => undefined);
  }, []);
  const invalidProfile = !profile || profile.mediaRef !== media.sourceRef;
  const stale = !!job && !previewJobMatches(job, profile, currentTimeSeconds, media.durationSeconds);

  async function relay(event: PreviewEvent) {
    try {
      if (event.type === "cancelled" && cancelCommand.current) await cancelCommand.current;
      const updated = await command(event.jobId, { command: "event", event }); setJob(updated); onPreviewCreated?.(updated); return true;
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "A preview update was rejected."); return false; }
  }

  async function createPreview() {
    if (preparingRef.current || job && ["queued", "running", "cancelling"].includes(job.state)) return;
    if (!file) { setError("Select the original local file again to run a preview."); return; }
    preparingRef.current = true;
    setPreparing(true); setError(undefined);
    try {
      const response = await fetch("/api/preview-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ media, profile, currentTimeSeconds }) });
      const envelope = previewJobEnvelopeSchema.parse(await response.json());
      if (!response.ok || !envelope.data) throw new Error(envelope.error?.message ?? "A local preview could not be queued.");
      activeJobId.current = envelope.data.id;
      cancelCommand.current = undefined;
      setJob(envelope.data); onPreviewCreated?.(envelope.data);
      worker.current = startPreviewWorker(envelope.data, file, relay);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not prepare this preview. Check the media and profile settings and try again."); }
    finally { preparingRef.current = false; setPreparing(false); }
  }

  async function retryPreview() {
    if (preparingRef.current || !job || !file || !["failed", "cancelled"].includes(job.state)) return;
    preparingRef.current = true;
    setPreparing(true); setError(undefined);
    try {
      const next = await command(job.id, { command: "retry" });
      activeJobId.current = next.id;
      cancelCommand.current = undefined;
      setJob(next); onPreviewCreated?.(next);
      worker.current = startPreviewWorker(next, file, relay);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "This preview could not be retried."); }
    finally { preparingRef.current = false; setPreparing(false); }
  }

  async function cancelPreview() {
    if (!job || !worker.current || cancelling) return;
    setCancelling(true);
    const session = worker.current;
    const pending = command(job.id, { command: "cancel" });
    cancelCommand.current = pending;
    const stopped = session.cancel();
    try {
      const updated = await pending; setJob(updated); onPreviewCreated?.(updated);
      await stopped;
      if (worker.current === session) worker.current = undefined;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The preview could not be cancelled."); }
    finally { setCancelling(false); }
  }

  return <section className="mt-8 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-5" aria-labelledby="preview-action-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--secondary)]">Experimental local preview</p><h2 id="preview-action-title" className="mt-1 text-xl font-semibold">Try a short preview</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Runs up to 30 seconds around the playhead. Only noise removal has an experimental preview adapter; turn off voice clarity, loudness normalization, and echo reduction in the enhancement stages above. The model has not passed the production quality gate.</p></div>
      <div className="flex gap-2"><Button type="button" aria-describedby="preview-experimental-note" onClick={() => void createPreview()} disabled={preparing || cancelling || !!job && ["queued", "running", "cancelling"].includes(job.state) || invalidProfile || !file || !Number.isFinite(media.durationSeconds) || media.durationSeconds <= 0} className="min-h-11">{preparing ? "Preparing preview…" : "Preview"}</Button>
        {job && ["queued", "running"].includes(job.state) && <Button type="button" variant="outline" onClick={() => void cancelPreview()} disabled={cancelling}>{cancelling ? "Cancelling…" : "Cancel preview"}</Button>}</div>
    </div>
    <p id="preview-experimental-note" className="mt-2 text-xs text-[var(--muted-foreground)]">Experimental noise-removal preview. Your local source remains unchanged.</p>
    {preparing && <p className="mt-3 text-sm text-[var(--muted-foreground)]" role="status">Preparing local preview. Media bytes stay in the browser worker.</p>}
    {error && <p className="mt-4 text-sm text-rose-200" role="alert">{error}</p>}
    {job && <PreviewSurface job={job} stale={stale} cancelling={cancelling} onRetry={() => void retryPreview()} />}
  </section>;
}
