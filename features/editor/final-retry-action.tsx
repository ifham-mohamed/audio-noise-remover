"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finalJobEnvelopeSchema } from "@/shared/contracts/final-job";
import type { FinalJob } from "@/shared/contracts/final-job";
import { openFinalSource, removeFinalSource, saveFinalSource } from "@/features/final/final-artifact-store";
import { inspectWavChannelCount } from "@/features/final/final-worker-utils";

export function FinalRetryAction({ job }: { job: FinalJob }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function retry() {
    if (pending || !["failed", "cancelled"].includes(job.state)) return;
    setPending(true); setError(undefined);
    const clientAttemptId = crypto.randomUUID();
    let sourceSaved = false;
    let requestSent = false;
    try {
      const source = await openFinalSource(job.id);
      if (!source) throw new Error("The original file is no longer retained in this browser. Return to the editor and select it again.");
      if (source.size !== job.media.sizeBytes || source.name !== job.media.sourceName) throw new Error("The retained original no longer matches this attempt. Return to the editor and select the original file again.");
      inspectWavChannelCount(new Uint8Array(await source.slice(0, Math.min(source.size, 1024 * 1024)).arrayBuffer()));
      await saveFinalSource(clientAttemptId, source);
      sourceSaved = true;
      requestSent = true;
      const response = await fetch("/api/final-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ media: job.media, profile: job.profile, clientAttemptId, retryOfJobId: job.id }), cache: "no-store" });
      const envelope = finalJobEnvelopeSchema.parse(await response.json());
      if (!response.ok || !envelope.data) {
        await removeFinalSource(clientAttemptId);
        setError(envelope.error?.message ?? "The new retry attempt could not be started.");
        return;
      }
      router.push(`/processing/${envelope.data.id}`);
    } catch (cause) {
      if (!requestSent && sourceSaved) await removeFinalSource(clientAttemptId).catch(() => undefined);
      setError(cause instanceof Error ? cause.message : requestSent ? "The retry request could not be confirmed. Check local history before trying again." : "The local source could not be prepared for retry.");
    } finally { setPending(false); }
  }

  return <div className="mt-4">
    <button type="button" onClick={() => void retry()} disabled={pending} className="inline-flex min-h-11 items-center rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60">{pending ? "Starting new attempt…" : "Retry as a new attempt"}</button>
    {error && <p className="mt-3 text-sm text-amber-200" role="alert">{error}</p>}
  </div>;
}
