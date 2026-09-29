"use client";

import { useEffect, useRef } from "react";
import { openFinalSource, removeFinalOutput, retainFinalOutput } from "@/features/final/final-artifact-store";
import { finalJobEnvelopeSchema, finalJobEventSchema, type FinalJob } from "@/shared/contracts/final-job";

type WorkerProgress = { type: "progress"; jobId: string; sequence: number; elapsedMs: number; phase: string; stageId: string; progress: number };
type WorkerFailure = { type: "failed"; jobId: string; sequence: number; elapsedMs: number; failure: { code: "MODEL_UNAVAILABLE" | "PROCESSING_FAILED" | "RESOURCE_EXHAUSTED"; message: string; action?: "settings" | "diagnostics" | "effects" } };
type WorkerSuccess = { type: "succeeded"; jobId: string; sequence: number; elapsedMs: number; artifact: { artifactId: string; blob: Blob; fileName: string; mimeType: "audio/wav"; sizeBytes: number; durationSeconds: number; mediaValidated: true; experimental: true } };
type WorkerMessage = WorkerProgress | WorkerFailure | WorkerSuccess;
type ActiveFinalWorker = { cancel(): Promise<void> };
const activeFinalWorkers = new Map<string, ActiveFinalWorker>();

export async function cancelFinalWorker(jobId: string): Promise<void> {
  const active = activeFinalWorkers.get(jobId);
  if (!active) throw new Error("The local processing worker is not active in this tab. Refresh its status before trying again.");
  await active.cancel();
}

export function hasActiveFinalWorker(jobId: string): boolean { return activeFinalWorkers.has(jobId); }

async function postEvent(id: string, event: unknown) {
  const response = await fetch(`/api/final-jobs/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: "event", event }), cache: "no-store" });
  const envelope = finalJobEnvelopeSchema.parse(await response.json());
  if (!response.ok || !envelope.data) throw new Error(envelope.error?.message ?? "The local final-job status could not be saved.");
}

async function postUnexpectedWorkerFailure(jobId: string, message: string) {
  try {
    const response = await fetch(`/api/final-jobs/${jobId}`, { cache: "no-store" });
    const current = finalJobEnvelopeSchema.parse(await response.json()).data;
    if (!response.ok || !current || ["succeeded", "failed", "cancelled"].includes(current.state)) return;
    await postEvent(jobId, { type: "failed", jobId, sequence: current.sequence + 1, elapsedMs: current.elapsedMs, failure: { code: "PROCESSING_FAILED", message, action: "diagnostics" } });
  } catch { /* Startup reconciliation will recover any job whose local status store could not be reached. */ }
}

async function removeUnpublishedArtifact(jobId: string, artifactId: string) {
  try {
    const response = await fetch(`/api/final-jobs/${jobId}`, { cache: "no-store" });
    const job = finalJobEnvelopeSchema.parse(await response.json()).data;
    if (job?.state !== "succeeded" || job.output?.artifactId !== artifactId) await removeFinalOutput(artifactId);
  } catch { /* Preserve the local artifact if job status is unreachable; reconcile storage later rather than risk deleting a committed success. */ }
}

export function FinalJobRunner({ job }: { job: FinalJob }) {
  const started = useRef(false);
  const noiseStage = job.profile.stages.find((stage) => stage.id === "noise-removal" && stage.enabled);
  const intensity = noiseStage && "intensity" in noiseStage.parameters ? noiseStage.parameters.intensity : 0;
  useEffect(() => {
    if (job.state !== "queued" || started.current) return;
    started.current = true;
    let terminal = false;
    let worker: Worker | undefined;
    let eventQueue = Promise.resolve();
    let retainedArtifactId: string | undefined;
    let cancellationRequested = false;
    let workerTerminatedForCancellation = false;
    let cancellationJob: FinalJob | undefined;
    let cancellationActionPending = false;
    const suppressedMessages: WorkerMessage[] = [];
    const unregister = () => { if (activeFinalWorkers.get(job.id)?.cancel === cancel) activeFinalWorkers.delete(job.id); };
    const cancel = async () => {
      if (cancellationActionPending || (terminal && !workerTerminatedForCancellation)) return;
      cancellationActionPending = true;
      try {
        if (!workerTerminatedForCancellation) {
          cancellationRequested = true;
          await eventQueue;
          try {
            const response = await fetch(`/api/final-jobs/${job.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: "cancel" }), cache: "no-store" });
            const envelope = finalJobEnvelopeSchema.parse(await response.json());
            if (!response.ok || !envelope.data) throw new Error(envelope.error?.message ?? "Cancellation could not be confirmed. Processing remains active.");
            cancellationJob = envelope.data;
          } catch (cause) {
            cancellationRequested = false;
            suppressedMessages.splice(0).forEach(enqueueMessage);
            throw cause;
          }
          if (cancellationJob.state !== "cancelling") { cancellationRequested = false; suppressedMessages.splice(0).forEach(enqueueMessage); return; }
          worker?.terminate();
          terminal = true;
          workerTerminatedForCancellation = true;
        }
        const statusResponse = await fetch(`/api/final-jobs/${job.id}`, { cache: "no-store" });
        const current = finalJobEnvelopeSchema.parse(await statusResponse.json()).data;
        if (!statusResponse.ok || !current) throw new Error("The worker has stopped, but cancellation confirmation is unavailable. Retry confirming cancellation.");
        if (current.state === "cancelled") { unregister(); return; }
        if (current.state !== "cancelling") throw new Error("The worker has stopped, but the final job is no longer in the expected cancellation state.");
        cancellationJob = current;
        await postEvent(job.id, { type: "cancelled", jobId: job.id, sequence: current.sequence + 1, elapsedMs: current.elapsedMs });
        unregister();
      } finally {
        cancellationActionPending = false;
      }
    };
    function enqueueMessage(data: WorkerMessage) {
      eventQueue = eventQueue.then(async () => {
        if (terminal || cancellationRequested) return;
        if (data.type === "progress") {
          await postEvent(job.id, finalJobEventSchema.parse(data));
          return;
        }
        if (data.type === "failed") {
          terminal = true;
          unregister();
          await postEvent(job.id, finalJobEventSchema.parse(data));
          return;
        }
        const stored = await retainFinalOutput(data.artifact.artifactId, data.artifact.blob, { fileName: data.artifact.fileName, mimeType: data.artifact.mimeType, durationSeconds: data.artifact.durationSeconds });
        retainedArtifactId = stored.artifactId;
        await postEvent(job.id, finalJobEventSchema.parse({ type: "succeeded", jobId: job.id, sequence: data.sequence, elapsedMs: data.elapsedMs, output: { artifactId: stored.artifactId, fileName: stored.fileName, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, durationSeconds: stored.durationSeconds, mediaValidated: true, experimental: true } }));
        terminal = true;
        unregister();
      }).catch(async () => {
        if (cancellationRequested) return;
        terminal = true;
        unregister();
        if (retainedArtifactId) await removeUnpublishedArtifact(job.id, retainedArtifactId);
        await postUnexpectedWorkerFailure(job.id, "The local enhanced artifact could not be validated or retained. No successful output is available; your original remains unchanged.");
      });
    }
    void (async () => {
      try {
        const file = await openFinalSource(job.id);
        if (!file) throw new Error("The original local WAV is no longer available in this browser. Select it again before retrying.");
        worker = new Worker(new URL("../final/final-worker.ts", import.meta.url), { type: "module", name: `final-${job.id}` });
        activeFinalWorkers.set(job.id, { cancel });
        worker.onmessage = (message: MessageEvent<WorkerMessage>) => {
          const data = message.data;
          if (cancellationRequested) suppressedMessages.push(data); else enqueueMessage(data);
        };
        worker.onerror = () => {
          if (terminal || cancellationRequested) return;
          terminal = true;
          unregister();
          void eventQueue.then(() => postUnexpectedWorkerFailure(job.id, "The local final worker stopped unexpectedly. Temporary output was not retained; your original remains unchanged."));
        };
        worker.postMessage({ type: "start", jobId: job.id, file, sourceName: job.media.sourceName, sourceSizeBytes: job.media.sizeBytes, sourceDurationSeconds: job.media.durationSeconds, fileName: job.profile.output.destination.targetName, intensity });
      } catch (cause) {
        if (terminal) return;
        terminal = true;
        unregister();
        await postEvent(job.id, { type: "failed", jobId: job.id, sequence: job.sequence + 1, elapsedMs: job.elapsedMs, failure: { code: "UNSUPPORTED_MEDIA", message: cause instanceof Error ? cause.message : "The source file is unavailable locally.", action: "diagnostics" } }).catch(() => undefined);
      }
    })();
  }, [job.id, job.media.sourceRef, job.profile.output.destination.targetName, intensity]);
  return null;
}
