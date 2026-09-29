import { previewEventSchema, type PreviewEvent, type PreviewJob } from "@/shared/contracts/preview";
import { getPreviewAudioStreamIndex } from "@/features/preview/preview-worker-utils";

export type PreviewWorkerSession = { cancel: () => Promise<void> };
export function startPreviewWorker(job: PreviewJob, file: File, onEvent: (event: PreviewEvent) => Promise<void>): PreviewWorkerSession {
  let worker: Worker;
  try { worker = new Worker(new URL("./preview-worker.ts", import.meta.url), { type: "module", name: `preview-${job.id}` }); }
  catch {
    const event = previewEventSchema.parse({ type: "failed", jobId: job.id, sequence: 1, elapsedMs: 0, failure: { code: "RUNTIME_UNAVAILABLE", message: "The local preview worker could not start. Open diagnostics and try again.", action: "diagnostics" } });
    void onEvent(event);
    return { cancel: async () => undefined };
  }
  let sequence = 0;
  let terminalReceived = false;
  let disposed = false;
  let relay = Promise.resolve();
  const done = new Promise<void>((resolve) => {
    worker.onmessage = (message: MessageEvent<unknown>) => {
      const parsed = previewEventSchema.safeParse(message.data);
      if (terminalReceived || !parsed.success || parsed.data.jobId !== job.id || parsed.data.sequence !== sequence + 1) return;
      sequence = parsed.data.sequence;
      terminalReceived = parsed.data.type !== "progress";
      relay = relay.then(() => onEvent(parsed.data)).catch(() => undefined);
      if (terminalReceived) void relay.finally(() => { disposed = true; worker.terminate(); resolve(); });
    };
    worker.onerror = () => {
      if (terminalReceived) return;
      const event = previewEventSchema.parse({ type: "failed", jobId: job.id, sequence: sequence + 1, elapsedMs: 0, failure: { code: "RUNTIME_UNAVAILABLE", message: "The local preview worker could not start. Open diagnostics and try again.", action: "diagnostics" } });
      terminalReceived = true;
      relay = relay.then(() => onEvent(event)).catch(() => undefined);
      void relay.finally(() => { disposed = true; worker.terminate(); resolve(); });
    };
  });
  worker.postMessage({ type: "start", jobId: job.id, file, range: job.range, audioStreamIndex: getPreviewAudioStreamIndex(job), enabledStages: job.profile.stages.filter((stage) => stage.enabled).map((stage) => stage.id) });
  return { cancel: async () => { if (!terminalReceived) worker.postMessage({ type: "cancel" }); await done; if (!disposed) worker.terminate(); } };
}
