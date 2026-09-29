"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PreviewSurface } from "@/features/editor/preview-surface";
import { previewJobEnvelopeSchema, previewJobMatches, type PreviewJob } from "@/shared/contracts/preview";
import type { MediaMetadata } from "@/shared/contracts/media";
import type { ProcessingProfile } from "@/shared/contracts/processing";

export function PreviewAction({ media, profile, currentTimeSeconds, onPreviewCreated }: { media: MediaMetadata; profile: ProcessingProfile; currentTimeSeconds: number; onPreviewCreated?: (job: PreviewJob) => void }) {
  const [job, setJob] = useState<PreviewJob>();
  const [error, setError] = useState<string>();
  const [preparing, setPreparing] = useState(false);
  const invalidProfile = !profile || profile.mediaRef !== media.sourceRef;
  const stale = !!job && !previewJobMatches(job, profile, currentTimeSeconds, media.durationSeconds);

  async function createPreview() {
    setPreparing(true);
    try {
      const response = await fetch("/api/preview-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ media, profile, currentTimeSeconds }) });
      const envelope = previewJobEnvelopeSchema.parse(await response.json());
      if (!response.ok || !envelope.data) throw new Error(envelope.error?.message ?? "A local preview request could not be prepared.");
      setJob(envelope.data);
      onPreviewCreated?.(envelope.data);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not prepare this preview. Check the media and profile settings and try again.");
    } finally {
      setPreparing(false);
    }
  }

  return <section className="mt-8 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-5" aria-labelledby="preview-action-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--secondary)]">Evaluate your settings</p><h2 id="preview-action-title" className="mt-1 text-xl font-semibold">Try a short preview</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Creates a local preview request for up to 30 seconds around the playhead using your current profile.</p></div>
      <Button type="button" onClick={() => void createPreview()} disabled={preparing || invalidProfile || !Number.isFinite(media.durationSeconds) || media.durationSeconds <= 0} className="min-h-11">{preparing ? "Preparing preview…" : "Preview"}</Button>
    </div>
    {preparing && <p className="mt-3 text-sm text-[var(--muted-foreground)]" role="status">Preparing a local preview request. No media bytes are sent.</p>}
    {error && <p className="mt-4 text-sm text-rose-200" role="alert">{error}</p>}
    {job && <PreviewSurface job={job} stale={stale} />}
  </section>;
}
