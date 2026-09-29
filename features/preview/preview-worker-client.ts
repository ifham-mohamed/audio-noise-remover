import { previewEventSchema, type PreviewEvent, type PreviewJob } from "@/shared/contracts/preview";
import { getPreviewAudioStreamIndex } from "@/features/preview/preview-worker-utils";
import { removePreviewArtifact, retainPreviewArtifact } from "@/features/preview/preview-artifact-store";

export type PreviewWorkerSession = { cancel: () => Promise<void> };
type PreviewWorkerSuccessMessage = { artifactBlob?: unknown; artifactSource?: unknown };

function artifactHandoffFailure(event: Extract<PreviewEvent, { type: "succeeded" }>): PreviewEvent {
  return { type: "failed", jobId: event.jobId, sequence: event.sequence, elapsedMs: event.elapsedMs, failure: { code: "PROCESSING_FAILED", message: "The enhanced preview could not be validated or retained locally. No playable preview was published.", action: "retry" } };
}

export function startPreviewWorker(job: PreviewJob, file: File, onEvent: (event: PreviewEvent) => Promise<boolean | void>): PreviewWorkerSession {
  let worker: Worker;
  try { worker = new Worker(new URL("./preview-worker.ts", import.meta.url), { type: "module", name: `preview-${job.id}` }); }
  catch {
    const event = previewEventSchema.parse({ type: "failed", jobId: job.id, sequence: 1, elapsedMs: 0, failure: { code: "RUNTIME_UNAVAILABLE", message: "The local preview worker could not start. Open diagnostics and try again.", action: "diagnostics" } });
    void onEvent(event);
    return { cancel: async () => undefined };
  }
  let sequence = 0;
  let terminalReceived = false;
  let cancelRequested = false;
  let disposed = false;
  let relay = Promise.resolve();
  const done = new Promise<void>((resolve) => {
    worker.onmessage = (message: MessageEvent<unknown>) => {
      const parsed = previewEventSchema.safeParse(message.data);
      if (terminalReceived || !parsed.success || parsed.data.jobId !== job.id || parsed.data.sequence !== sequence + 1) return;
      sequence = parsed.data.sequence;
      terminalReceived = parsed.data.type !== "progress";
      const event = parsed.data;
      relay = relay.then(async () => {
        if (cancelRequested && event.type === "progress") return;
        let acceptedEvent: PreviewEvent = event;
        let retainedArtifactId: string | undefined;
        if (event.type === "succeeded") {
          const handoff = message.data as PreviewWorkerSuccessMessage;
          if (!(handoff.artifactBlob instanceof Blob) || handoff.artifactSource !== "enhancement-adapter") {
            acceptedEvent = artifactHandoffFailure(event);
          } else {
            try {
              await retainPreviewArtifact(event.artifact, handoff.artifactBlob);
              retainedArtifactId = event.artifact.id;
            } catch {
              await removePreviewArtifact(event.artifact.id).catch(() => undefined);
              acceptedEvent = artifactHandoffFailure(event);
            }
          }
        }
        let accepted: boolean | void;
        try {
          accepted = await onEvent(acceptedEvent);
        } catch {
          accepted = false;
        }
        if (retainedArtifactId && accepted === false) await removePreviewArtifact(retainedArtifactId).catch(() => undefined);
      }).catch(() => undefined);
      if (terminalReceived) void relay.finally(() => { disposed = true; worker.terminate(); resolve(); });
    };
    worker.onerror = () => {
      if (terminalReceived) return;
      const event = previewEventSchema.parse({ type: "failed", jobId: job.id, sequence: sequence + 1, elapsedMs: 0, failure: { code: "RUNTIME_UNAVAILABLE", message: "The local preview worker could not start. Open diagnostics and try again.", action: "diagnostics" } });
      terminalReceived = true;
      relay = relay.then(async () => { await onEvent(event); }).catch(() => undefined);
      void relay.finally(() => { disposed = true; worker.terminate(); resolve(); });
    };
  });
  try {
    worker.postMessage({ type: "start", jobId: job.id, file, range: job.range, audioStreamIndex: getPreviewAudioStreamIndex(job), enabledStages: job.profile.stages.filter((stage) => stage.enabled) });
  } catch {
    // A failed structured clone or browser resource limit must settle the
    // already-created coordinator job rather than leave it queued forever.
    worker.onerror?.(new ErrorEvent("error"));
  }
  return { cancel: async () => {
    if (!cancelRequested && !terminalReceived) {
      cancelRequested = true;
      try { worker.postMessage({ type: "cancel" }); }
      catch { worker.onerror?.(new ErrorEvent("error")); }
    }
    await done;
    if (!disposed) worker.terminate();
  } };
}
