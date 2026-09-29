"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { finalJobEnvelopeSchema, type FinalJob } from "@/shared/contracts/final-job";
import { cancelFinalWorker, FinalJobRunner, hasActiveFinalWorker } from "@/features/editor/final-job-runner";

function elapsedLabel(milliseconds: number) { const seconds = Math.floor(milliseconds / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
function stateLabel(job: FinalJob, stageLabel?: string) { if (job.state === "queued") return "Final processing queued"; if (job.state === "running") return `${stageLabel ?? "Final processing"} is in progress.`; if (job.state === "cancelling") return "Cancelling final processing. Waiting for the local worker to stop."; if (job.state === "cancelled") return "Final processing cancelled. No final output was retained."; if (job.state === "failed") return `Final processing failed${job.failure ? `: ${job.failure.message}` : ""}`; return "Final processing succeeded"; }
function visibleState(job: FinalJob) { if (job.state === "queued") return "Waiting to start"; if (job.state === "running") return "Processing"; if (job.state === "cancelling") return "Cancelling"; if (job.state === "cancelled") return "Cancelled"; if (job.state === "failed") return "Failed"; return "Complete"; }

export function FinalJobView({ id }: { id: string }) {
  const [job, setJob] = useState<FinalJob>(); const [error, setError] = useState<string>(); const [cancelError, setCancelError] = useState<string>(); const [cancelPending, setCancelPending] = useState(false); const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true; let requestInFlight = false;
    const refresh = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try { const response = await fetch(`/api/final-jobs/${id}`, { cache: "no-store" }); const envelope = finalJobEnvelopeSchema.parse(await response.json()); if (!response.ok || !envelope.data) throw new Error(envelope.error?.message ?? "This local processing attempt is unavailable."); if (alive) { setJob(envelope.data); setError(undefined); } }
      catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : "This local processing attempt is unavailable."); }
      finally { requestInFlight = false; }
    };
    void refresh(); const poll = window.setInterval(() => void refresh(), 1500); const clock = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => { alive = false; window.clearInterval(poll); window.clearInterval(clock); };
  }, [id]);
  const elapsed = job && job.state === "running" ? job.elapsedMs + Math.max(0, Date.now() - Date.parse(job.updatedAt)) : job?.elapsedMs ?? 0;
  void tick;
  if (error && !job) return <section className="mt-8 rounded-[var(--radius-lg)] border border-rose-300/30 bg-[var(--surface-raised)] p-5" role="alert"><h2 className="text-xl font-semibold">Processing status unavailable</h2><p className="mt-3 text-sm leading-6">{error}</p><Link className="mt-4 inline-flex min-h-11 items-center text-sm underline" href="/">Return to the editor</Link></section>;
  if (!job) return <p className="mt-8" role="status">Loading local processing status…</p>;
  const currentJob = job;
  const currentStage = currentJob.enabledStages.find((stage) => stage.id === currentJob.phase);
  const elapsedText = elapsedLabel(elapsed);
  async function cancel() {
    if (cancelPending) return;
    setCancelPending(true); setCancelError(undefined);
    try { await cancelFinalWorker(currentJob.id); }
    catch (cause) { setCancelError(cause instanceof Error ? cause.message : "Cancellation could not be confirmed. Processing may still be active."); }
    finally { setCancelPending(false); }
  }
  return <section className="mt-8 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-5" aria-labelledby="final-job-title">
    <FinalJobRunner job={job} />
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">Final attempt · {job.id.slice(0, 8)}</p><h2 id="final-job-title" className="mt-1 text-xl font-semibold">{job.media.sourceName}</h2>
    <p className="mt-3 text-sm">Status: <span className="font-medium">{visibleState(job)}</span></p>
    {job.state === "running" && hasActiveFinalWorker(job.id) && <button type="button" onClick={() => void cancel()} disabled={cancelPending} className="mt-3 inline-flex min-h-11 items-center rounded-md border border-[var(--border)] px-4 text-sm font-medium hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60">{cancelPending ? "Requesting cancellation…" : "Cancel processing"}</button>}
    {job.state === "running" && !hasActiveFinalWorker(job.id) && <p className="mt-3 text-sm text-amber-200" role="status">The worker is not active in this tab. Check its saved status before starting another attempt.</p>}
    {job.state === "cancelling" && <><p className="mt-3 text-sm" role="status">Stopping the local worker and clearing temporary data…</p>{hasActiveFinalWorker(job.id) && <button type="button" onClick={() => void cancel()} disabled={cancelPending} className="mt-2 inline-flex min-h-11 items-center rounded-md border border-[var(--border)] px-4 text-sm font-medium hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60">{cancelPending ? "Confirming cancellation…" : "Retry cancellation confirmation"}</button>}</>}
    {cancelError && <p className="mt-3 text-sm text-amber-200" role="alert">{cancelError} The app has not marked this attempt cancelled.</p>}
    {job.state === "running" && <><p className="mt-2 text-sm">Stage: {currentStage?.label ?? "Preparing"} · Elapsed: {elapsedText}</p>{job.progress !== undefined ? <><label htmlFor="final-progress" className="mt-4 block text-sm">Overall stage progress: {Math.round(job.progress * 100)}%</label><progress id="final-progress" className="mt-2 h-2 w-full accent-[var(--primary)]" aria-label="Final processing progress" aria-valuetext={`${Math.round(job.progress * 100)} percent`} value={job.progress} max={1} /></> : <p className="mt-3 text-sm text-[var(--muted-foreground)]">Progress is not available for this step.</p>}</>}
    {job.state === "queued" && <p className="mt-2 text-sm text-[var(--muted-foreground)]">Waiting for a local processing worker. No output is available yet.</p>}
    {job.state === "failed" && job.failure && <div className="mt-4 rounded-md border border-amber-300/40 bg-amber-300/10 p-4"><p className="text-sm">{job.failure.message}</p><p className="mt-2 text-sm">Your original remains unchanged, and no successful output is available.</p><Link href={job.failure.action === "settings" ? "/settings" : job.failure.action === "effects" ? "/#effects" : "/settings#diagnostics"} className="mt-2 inline-flex min-h-11 items-center text-sm underline">{job.failure.action === "settings" ? "Open settings" : job.failure.action === "effects" ? "Review effects" : "Open local diagnostics"}</Link></div>}
    {job.state === "succeeded" && job.output && <div className="mt-3 rounded-md border border-amber-300/40 bg-amber-300/10 p-4"><p className="text-sm font-semibold">Experimental output validated locally</p><p className="mt-1 text-sm">{job.output.fileName} · {Math.round(job.output.sizeBytes / 1024)} KB · {Math.round(job.output.durationSeconds)} seconds</p><p className="mt-1 text-xs">This DPDFNet-based result is experimental and not production-qualified.</p></div>}
    <p className="sr-only" role="status" aria-live="polite">{stateLabel(job, currentStage?.label)}</p>
    {error && <p className="mt-3 text-sm text-amber-200" role="status">The latest status refresh failed. Showing the last saved job state. {error}</p>}
    <p className="mt-4 text-xs text-[var(--muted-foreground)]">Stages: {job.enabledStages.map((stage) => stage.label).join(" · ") || "No enhancement stages enabled"}. Your media remains local.</p>
    <Link href="/" className="mt-4 inline-flex min-h-11 items-center text-sm text-[var(--primary)] underline">Return to the editor</Link>
  </section>;
}
