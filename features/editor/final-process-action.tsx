"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createFinalJobRequestSchema, finalJobEnvelopeSchema } from "@/shared/contracts/final-job";
import type { MediaMetadata } from "@/shared/contracts/media";
import type { ProcessingProfile } from "@/shared/contracts/processing";

export function FinalProcessAction({ media, profile, fileAvailable, canExecuteFinal = false }: { media: MediaMetadata; profile: ProcessingProfile; fileAvailable: boolean; canExecuteFinal?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ code: string; message: string }>();
  const valid = createFinalJobRequestSchema.safeParse({ media, profile }).success;
  async function start() {
    if (pending || !valid || !fileAvailable || !canExecuteFinal) return;
    setPending(true); setError(undefined);
    try {
      const response = await fetch("/api/final-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ media, profile }), cache: "no-store" });
      const envelope = finalJobEnvelopeSchema.parse(await response.json());
      if (!response.ok || !envelope.data) { setError(envelope.error ?? { code: "FINAL_JOB_UNAVAILABLE", message: "Final processing could not be started locally." }); return; }
      router.push(`/processing/${envelope.data.id}`);
    } catch {
      setError({ code: "FINAL_JOB_UNAVAILABLE", message: "Final processing could not be started locally. Your source remains unchanged; check local diagnostics and try again." });
    } finally { setPending(false); }
  }
  return <section className="mt-8 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-5" aria-labelledby="final-process-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">Final processing</p><h2 id="final-process-title" className="mt-1 text-xl font-semibold">Create an enhanced output</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">An experimental local-only export is approved, but it will be labeled experimental and not production-qualified. Your file stays in this browser.</p></div><Button type="button" onClick={() => void start()} disabled={pending || !valid || !fileAvailable || !canExecuteFinal} className="min-h-11">{pending ? "Starting…" : "Process"}</Button></div>
    {!canExecuteFinal && <p className="mt-3 text-sm text-[var(--muted-foreground)]" role="status">Process is unavailable because this build has no verified full-file final executor and output path. The pinned experimental adapter currently runs bounded previews only; no final output will be created.</p>}
    {!fileAvailable && <p className="mt-3 text-sm" role="status">Select the original local file again before starting final processing.</p>}
    {!valid && <p className="mt-3 text-sm text-amber-200" role="alert">Review the media, enabled stages, and output target before processing.</p>}
    {error && <div className="mt-4 rounded-md border border-amber-300/40 bg-amber-300/10 p-4" role="alert"><p className="text-sm font-medium">{error.code === "MODEL_UNAVAILABLE" ? "Final processing is not ready" : "Couldn’t start final processing"}</p><p className="mt-1 text-sm leading-6">{error.message}</p><a href="/settings#diagnostics" className="mt-2 inline-flex min-h-11 items-center text-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">Open local diagnostics</a></div>}
    <p className="mt-3 text-xs text-[var(--muted-foreground)]">The original remains unchanged. A preview is not a final output.</p>
  </section>;
}
